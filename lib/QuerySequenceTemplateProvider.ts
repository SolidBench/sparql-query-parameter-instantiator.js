import * as fs from 'node:fs';
import type * as RDF from '@rdfjs/types';

// eslint-disable-next-line ts/no-require-imports
import seedrandom = require('seedrandom');
import type { Expression, SparqlParser, Triple } from 'sparqljs';
import { Parser } from 'sparqljs';
import { QuerySequenceTemplate } from './QuerySequenceTemplate';
import type { IVariableTemplate, RawTerm } from './variable/IVariableTemplate';

/**
 * Constructs query templates based on a given template file, variables, and substitution parameters.
 */
export class QuerySequenceTemplateProvider {
  private readonly templateFilePath: string;
  private readonly variables: IVariableTemplate[];
  // Name of query
  private readonly name: string;
  // What task this query belongs to
  public readonly queryTask: string;
  // What templates can occur after the current query template provider.
  private readonly nextTemplates: INextTemplate[];
  // File location for refinement patterns, if any
  private readonly refinementPatterns: IQueryRefinementPattern[] | undefined;
  private readonly minRefinementLength: number;
  private readonly maxRefinementLength: number;
  private readonly maxLogits: number;

  private readonly parser: SparqlParser;

  public constructor(
    templateFilePath: string,
    variables: IVariableTemplate[],
    name: string,
    queryTask: string,
    nextTemplateFilePath: INextTemplate[],
    minRefinementLength: number,
    maxRefinementLength: number,
    maxLogits: number,
    refinementPatternsFilePath?: string,
  ) {
    this.templateFilePath = templateFilePath;
    this.variables = variables;
    this.name = name;
    this.queryTask = queryTask;
    this.nextTemplates = nextTemplateFilePath;

    // If no probabilities are given, each template has equal probability of being selected next
    this.validateNextTemplateProbabilities(this.nextTemplates);
    if (!this.hasProbabilitiesDefined(this.nextTemplates)){
      this.nextTemplates.forEach(nextTemplate => nextTemplate.probability = 1 / this.nextTemplates.length);
    }

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
      if ('getValuesProbabilities' in substitutionProvider &&
        typeof substitutionProvider.getValuesProbabilities === 'function') {
        const logits = await substitutionProvider.getValuesProbabilities();
        // Apply the variable template to the entities in the logits
        for (const [ user, similarities ] of Object.entries(logits)) {
          for (const similarityObject of similarities) {
            similarityObject.entity = variableTemplate.createTerm(<RawTerm>similarityObject.entity).value;
          }
        }
        variableProbabilityMappings[variableName] = this.softMaxLogits(logits, temperature);
      }
    }
    return new QuerySequenceTemplate(
      syntaxTree,
      variableMappings,
      variableProbabilityMappings,
      rng,
      this.minRefinementLength,
      this.maxRefinementLength,
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

  /**
   * Ensures all nextTemplates are actual templates passed to the benchmark instantiator
   * @param providers all query template providers
   * @returns false if not all providers required by this template are present true else
   */
  public validateNextTemplateFilePaths(providers: QuerySequenceTemplateProvider[]): boolean {
    const allTemplates = new Set(providers.map(provider => provider.templateFilePath));
    for (const nextTemplate of this.nextTemplates) {
      if (!allTemplates.has(nextTemplate.template)) {
        return false;
      }
    }
    return true;
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
  private validateNextTemplateProbabilities(nextTemplates: INextTemplate[]){
    const hasProbability = nextTemplates.some(item => item.probability !== undefined);
    const hasNoProbability = nextTemplates.some(item => item.probability === undefined);
    if (hasProbability && hasNoProbability) {
      throw new Error(`Either all or none of the next templates for provider ${this.templateFilePath} must have a defined probability.`);
    }
    if (hasNoProbability){
      const sumProbability = nextTemplates.reduce((sum, curr) => sum + curr.probability!, 0);
      if ( sumProbability != 1){
        throw new Error(`Probabilities do not sum to 1 for provider ${this.templateFilePath}`);
      }
    }
  }

  private hasProbabilitiesDefined(nextTemplates: INextTemplate[]): boolean {
    return nextTemplates.some(item => item.probability !== undefined);
  }

  public getNextTemplateName(): INextTemplate[] {
    return this.nextTemplates;
  }

  public getTemplateName(): string {
    return this.name;
  }
}

export interface IEntityLogits {
  entity: string;
  similarity: number;
}

export interface INextTemplate {
  template: string,
  probability?: number,
}

export interface IBaseRefinementPattern {
  operation: 'addition' | 'removal';
  id: number;
  description: string;
  location: number;
}

// FILTER: uses Expression[]
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
