// IN this class we use the query template provider method. But instead of accepting any variable,
// we accept own class definition of variable that can deal with sequences.
// One version of variable is equal probability. Other is one where you have x acceptable substitutions and it cycles through and other is the cool one
// choosing according to probability (with or without repeats).
// A variable that allows sequences accepts either similarity subsitutionProvider, or namedNode one depending
// on the type of variable it is.

import * as fs from 'node:fs';
import type * as RDF from '@rdfjs/types';
import seedrandom = require('seedrandom');
import type { Expression, SparqlParser } from 'sparqljs';
import { Parser } from 'sparqljs';
import { QuerySequenceTemplate } from './QuerySequenceTemplate';
import type { IVariableTemplate } from './variable/IVariableTemplate';

/**
 * Constructs query templates based on a given template file, variables, and substitution parameters.
 */
export class QuerySequenceTemplateProvider {
  private readonly templateFilePath: string;
  private readonly destinationFilePath: string;
  private readonly variables: IVariableTemplate[];
  // Name of query
  private readonly name: string;
  // What task this query belongs to
  public readonly queryTask: string;
  // What templates can occur after the current query template provider.
  private readonly nextTemplateNames: Set<string>;
  // File location for refinement patterns, if any
  private readonly refinementPatterns: IQueryRefinementPattern[] | undefined;

  private readonly parser: SparqlParser;

  public constructor(
    templateFilePath: string,
    destinationFilePath: string,
    variables: IVariableTemplate[],
    name: string,
    queryTask: string,
    nextTemplateFilePath: string[],
    refinementPatternsFilePath?: string,
  ) {
    this.templateFilePath = templateFilePath;
    this.destinationFilePath = destinationFilePath;
    this.variables = variables;
    this.name = name;
    this.queryTask = queryTask;
    this.nextTemplateNames = new Set(nextTemplateFilePath);
    this.refinementPatterns = this.parseRefinementFile(refinementPatternsFilePath);

    this.parser = new Parser();
  }

  /**
   * Create a new query template data object.
   */
  public async createTemplate(rng: seedrandom.PRNG, temperature: number): Promise<QuerySequenceTemplate> {
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
            similarityObject.entity = variableTemplate.createTerm(similarityObject.entity).value;
          }
        }
        variableProbabilityMappings[variableName] = this.softMaxLogits(logits, temperature);
      }
    }
    return new QuerySequenceTemplate(syntaxTree, variableMappings, variableProbabilityMappings, rng, this.refinementPatterns);
  }

  public parseRefinementFile(file: string | undefined) {
    if (!file) {
      return;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const json: IQueryRefinementPattern[] = JSON.parse(raw);
    return json;
  }

  /**
   * Ensures all nextTemplates are actual templates passed to the benchmark instantiator
   * @param providers all query template providers
   * @returns false if not all providers required by this template are present true else
   */
  public validateNextTemplateFilePaths(providers: QuerySequenceTemplateProvider[]) {
    const allTemplates = new Set(providers.map(provider => provider.templateFilePath));
    for (const nextTemplate of this.nextTemplateNames) {
      if (!allTemplates.has(nextTemplate)) {
        return false;
      }
    }
    return true;
  }

  public softMaxLogits(logits: Record<string, IEntityLogits[]>, temperature = 1) {
    const softMaxedLogits: Record<string, IEntityLogits[]> = {};
    for (const [ user, logitsUser ] of Object.entries(logits)) {
      const logitEntities = logitsUser.map(x => x.entity);
      const logitValues = logitsUser.map(x => x.similarity);
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
    const max = Math.max(...scaled); // For numerical stability
    const exps = scaled.map(v => Math.exp(v - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map(v => v / sum);
  }

  public getNextTemplateName() {
    return this.nextTemplateNames;
  }

  public getTemplateName() {
    return this.name;
  }
}

export interface IEntityLogits {
  entity: string;
  similarity: number;
}

// export interface IQueryRefinementPattern {
//   /**
//    * Operation type of the refinement pattern.
//    */
//   type: 'OPTIONAL' | 'FILTER' | 'UNION' | 'QUERY';
//   /**
//    * Operation to be performed, such as addition or removal of triple pattern in a block.
//    */
//   operation: 'addition' | 'removal';
//   /**
//    * Description of the refinement pattern.
//    */
//   description: string;
//   /**
//    * Target triple pattern(s) of the refinement pattern
//    */
//   target: ITargetTriplePattern[] | Expression[];
//   /**
//    * Optional index where the triple pattern should be added or removed.
//    */
//   location?: number;
// }

export interface ITargetTriplePattern {
  subject: string;
  predicate: string;
  object: string;
}

interface BaseRefinementPattern {
  operation: 'addition' | 'removal';
  description: string;
  location?: number;
}

// FILTER: uses Expression[]
export interface FilterRefinementPattern extends BaseRefinementPattern {
  type: 'FILTER';
  target: Expression[];
}

// All other types: use ITargetTriplePattern[]
export interface OtherRefinementPattern extends BaseRefinementPattern {
  type: 'OPTIONAL' | 'UNION' | 'QUERY';
  target: ITargetTriplePattern[];
}

export type IQueryRefinementPattern =
  | FilterRefinementPattern
  | OtherRefinementPattern;

export interface ITargetTriplePattern {
  subject: string;
  predicate: string;
  object: string;
}
