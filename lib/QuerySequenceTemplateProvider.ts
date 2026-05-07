import * as fs from 'node:fs';
import type * as RDF from '@rdfjs/types';

import type * as seedrandom from 'seedrandom';
import type { Expression, SparqlParser, Triple } from 'sparqljs';
import { Parser } from 'sparqljs';
import { QuerySequenceTemplate } from './QuerySequenceTemplate';
import type { IEntityLogits, ISubstitutionProviderProbabilities } from './substitution/ISubstitutionProvider';
import type { IValueTransformer } from './valuetransformer/IValueTransformer';
import type { IVariableTemplate, RawTerm } from './variable/IVariableTemplate';

/**
 * Constructs query templates based on a given template file, variables, and substitution parameters.
 */
export class QuerySequenceTemplateProvider {
  private readonly templateFilePath: string;
  private readonly variables: IVariableTemplate[];
  // Name of query
  public readonly name: string;
  // What task this query belongs to
  public readonly queryTask: string;
  // Mapping from variable to be instantiated to the type of variable (defined in config)
  public readonly instantiationVariableTypeMap: Record<string, string>;
  // Mapping from output query variable usable for next query instantiation to the type
  // of instantiator
  public readonly outputVariableTypeMap: Record<string, string>;

  // What templates can follow this template in a sequence
  private readonly nextTemplates: INextTemplate[];

  private readonly iriTransformer?: IValueTransformer;

  // File location for refinement patterns, if any
  private readonly refinementPatterns: IQueryRefinementPattern[] | undefined;
  private readonly minRefinementLength: number;
  private readonly maxRefinementLength: number;
  private readonly maxLogits: number;

  private readonly parser: SparqlParser;

  /**
   * @param templateFilePath - Path to the SPARQL template file
   * @param variables - Collection of variable definitions for instantiation
   * @param name - Unique identifier for the template
   * @param queryTask - Description of the specific query objective
   * @param instantiationVariableTypeMap - Mapping from instantiation variable
   * in template to the type of instantiation @range {json}
   * @param outputVariableTypeMap - Mapping from variable in output of the
   * template to the type of entity @range {json}
   * @param nextTemplates - Identifiers of valid subsequent templates in a sequence
   * @param minRefinementLength - Minimum number of refinement steps allowed
   * @param maxRefinementLength - Maximum number of refinement steps allowed
   * @param maxLogits - Upper bound for logit values in selection logic
   * @param iriTransformer - Optional utility to transform IRIs during instantiation
   * @param refinementPatternsFilePath - Path to optional refinement pattern definitions
   * @param nextTemplateProbabilities - Probability of selecting each next template @range {float}
   */
  public constructor(
    templateFilePath: string,
    variables: IVariableTemplate[],
    name: string,
    queryTask: string,
    instantiationVariableTypeMap: Record<string, string>,
    outputVariableTypeMap: Record<string, string>,
    nextTemplates: string[],
    minRefinementLength: number,
    maxRefinementLength: number,
    maxLogits: number,
    iriTransformer?: IValueTransformer,
    refinementPatternsFilePath?: string,
    nextTemplateProbabilities?: number[],
  ) {
    this.templateFilePath = templateFilePath;
    this.variables = variables;

    this.name = name;
    this.queryTask = queryTask;
    this.instantiationVariableTypeMap = instantiationVariableTypeMap;
    this.outputVariableTypeMap = outputVariableTypeMap;

    // Validate input json from config to be a valid nextTemplate interface with valid probability values
    this.nextTemplates = this.validateNextTemplates(nextTemplates, nextTemplateProbabilities);

    this.iriTransformer = iriTransformer;

    this.refinementPatterns = this.parseRefinementFile(refinementPatternsFilePath);
    this.minRefinementLength = minRefinementLength;
    this.maxRefinementLength = maxRefinementLength;
    this.maxLogits = maxLogits;

    this.parser = new Parser();
  }

  /**
   * Create a new query template data object.
   */
  public async createTemplate(
    rng: seedrandom.PRNG,
    temperature: number,
  ): Promise<QuerySequenceTemplate> {
    const sparqlString = await fs.promises.readFile(this.templateFilePath, 'utf8');
    const syntaxTree = this.parser.parse(sparqlString);

    const variableMappings: Record<string, RDF.Term[]> = {};
    const variableProbabilityMappings: Record<string, Record<string, IEntityLogits[]>> = {};

    for (const variableTemplate of this.variables) {
      const variableName = variableTemplate.getName();
      const substitutionProvider = variableTemplate.getSubstitutionProvider();

      if (!substitutionProvider) {
        throw new Error(`The variable template '${this.templateFilePath}' for '${variableName}' has no substitution provider configured`);
      }

      variableMappings[variableName] = (await substitutionProvider.getValues())
        .map(value => variableTemplate.createTerm(value));

      // If we're passed a substitutionProvider of type ISubstitutionProviderProbabilities
      // we use those to map variables to instantiation values
      if ('getValuesProbabilities' in substitutionProvider &&
        typeof substitutionProvider.getValuesProbabilities === 'function') {
        const logits = await (<ISubstitutionProviderProbabilities>substitutionProvider).getValuesProbabilities();

        // Apply the variable template to the entities in the logits
        for (const [ , similarities ] of Object.entries(logits)) {
          for (const similarityObject of similarities) {
            similarityObject.entity = variableTemplate.createTerm(<RawTerm>similarityObject.entity).value;
          }
        }
        variableProbabilityMappings[variableName] = this.softMaxLogits(logits, temperature);
      }
    }

    return new QuerySequenceTemplate(
      this.name,
      syntaxTree,
      variableMappings,
      variableProbabilityMappings,
      this.instantiationVariableTypeMap,
      this.outputVariableTypeMap,
      rng,
      this.minRefinementLength,
      this.maxRefinementLength,
      this.iriTransformer,
      this.refinementPatterns,
    );
  }

  public parseRefinementFile(file: string | undefined): IQueryRefinementPattern[] | undefined {
    if (!file) {
      return;
    }
    // eslint-disable-next-line no-sync
    const raw = fs.readFileSync(file, 'utf8');
    const json: IQueryRefinementPattern[] = JSON.parse(raw);
    return json;
  }

  public softMaxLogits(logits: Record<string, IEntityLogits[]>, temperature = 1): Record<string, IEntityLogits[]> {
    const softMaxedLogits: Record<string, IEntityLogits[]> = {};

    for (const [ user, logitsUser ] of Object.entries(logits)) {
      const slicedLogitsUser = logitsUser.slice(0, this.maxLogits);

      const logitEntities = slicedLogitsUser.map(x => x.entity);
      const logitValues = slicedLogitsUser.map(x => x.similarity);

      const probabilities = this.softmax(logitValues, temperature);

      const userProbabilities: IEntityLogits[] = [];
      for (const [ i, probability ] of probabilities.entries()) {
        userProbabilities.push({
          entity: logitEntities[i],
          similarity: probability,
        });
      }
      softMaxedLogits[user] = userProbabilities;
    }
    return softMaxedLogits;
  }

  public softmax(values: number[], temperature = 1): number[] {
    if (temperature <= 0) {
      throw new Error('Temperature must be greater than 0.');
    }

    const scaled = values.map(v => v / temperature);
    const max = Math.max(...scaled);
    const exps = scaled.map(v => Math.exp(v - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map(v => v / sum);
  }

  private validateNextTemplates(
    nextTemplates: string[],
    nextTemplateProbabilities?: number[],
  ): INextTemplate[] {
    if (nextTemplateProbabilities && nextTemplates.length !== nextTemplateProbabilities.length) {
      throw new Error(`Unequal number of nextTemplates and nextTemplateProbabilities in ${this.name}`);
    }
    if (nextTemplates.length === 0) {
      return [];
    }
    return nextTemplates.map((template, i) => ({
      template,
      probability: nextTemplateProbabilities ? nextTemplateProbabilities[i] : 1 / nextTemplates.length,
    }));
  }

  public getNextTemplates(): INextTemplate[] {
    return this.nextTemplates;
  }

  public getTemplateName(): string {
    return this.name;
  }
}

export type { IEntityLogits } from './substitution/ISubstitutionProvider';

export interface INextTemplate {
  template: string;
  probability?: number;
}

export interface IBaseRefinementPattern {
  operation: 'addition' | 'removal';
  id: number;
  description: string;
  location: number;
}

export interface IFilterRefinementPattern extends IBaseRefinementPattern {
  type: 'FILTER';
  target: Expression[];
  useVariableMapping?: boolean;
}

export interface ISubRefinementPattern extends IBaseRefinementPattern {
  type: 'SUB';
  target: ITargetTriplePatternVariable | RDF.Variable;
}

export interface IUnionRefinementPattern extends IBaseRefinementPattern {
  type: 'UNION';
  target: [(Triple | ITargetTriplePattern)[], (Triple | ITargetTriplePattern)[]];
}

export interface IOtherRefinementPattern extends IBaseRefinementPattern {
  type: 'OPTIONAL' | 'BGP';
  target: (Triple | ITargetTriplePattern)[];
}

export type IQueryRefinementPattern =
  | ISubRefinementPattern
  | IFilterRefinementPattern
  | IUnionRefinementPattern
  | IOtherRefinementPattern;

export interface ITargetTriplePattern {
  subject: ITargetTriplePatternTerm;
  predicate: ITargetTriplePatternTerm;
  object: ITargetTriplePatternTerm;
}

export interface ITargetTriplePatternVariable
  extends ITargetTriplePatternTerm {
  termType: 'variable';
}

export interface ITargetTriplePatternTerm {
  value: string;
  termType: 'variable' | 'literal' | 'namedNode';
}
