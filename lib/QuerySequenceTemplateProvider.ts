// IN this class we use the query template provider method. But instead of accepting any variable, we accept own class definition of variable that can deal with sequences.
// One version of variable is equal probability. Other is one where you have x acceptable substitutions and it cycles through and other is the cool one
// choosing according to probability (with or without repeats). A variable that allows sequences accepts either similarity subsitutionProvider, or namedNode one depending
// on the type of variable it is.

import * as fs from 'node:fs';
import type * as RDF from '@rdfjs/types';
import type { SparqlParser } from 'sparqljs';
import { Parser } from 'sparqljs';
import { QueryTemplate } from './QueryTemplate';
import type { IVariableTemplate } from './variable/IVariableTemplate';
import { QuerySequenceTemplate } from './QuerySequenceTemplate';
import { ISubstitutionProviderProbabilities } from './substitution/ISubstitutionProvider';

/**
 * Constructs query templates based on a given template file, variables, and substitution parameters.
 */
export class QuerySequenceTemplateProvider {
  public readonly templateFilePath: string;
  private readonly destinationFilePath: string;
  private readonly variables: IVariableTemplate[];
  // What task this query belongs to
  public readonly queryTask: string;
  // What templates can occur after the current query template provider.
  private readonly nextTemplateFilePath: Set<string>;

  private readonly parser: SparqlParser;

  public constructor(
    templateFilePath: string,
    destinationFilePath: string,
    variables: IVariableTemplate[],
    queryTask: string,
    nextTemplateFilePath: string[]
  ) {
    this.templateFilePath = templateFilePath;
    this.destinationFilePath = destinationFilePath;
    this.variables = variables;
    this.queryTask = queryTask;
    this.nextTemplateFilePath = new Set(nextTemplateFilePath);

    this.parser = new Parser();
  }

  /**
   * Create a new query template data object.
   */
  public async createTemplate(): Promise<QuerySequenceTemplate> {
    const sparqlString = await fs.promises.readFile(this.templateFilePath, 'utf8');
    const syntaxTree = this.parser.parse(sparqlString);
    const variableMappings: Record<string, RDF.Term[]> = {};
    for (const variableTemplate of this.variables) {
      const variableName = variableTemplate.getName();
      const substitutionProvider = variableTemplate.getSubstitutionProvider();
      if (!substitutionProvider) {
        throw new Error(`The variable template '${this.templateFilePath}' for '${variableName}' has no substitution provider configured`);
      }
      variableMappings[variableName] = (await substitutionProvider.getValues())
        .map(value => variableTemplate.createTerm(value));
      let logits = undefined;
      if (substitutionProvider.hasOwnProperty('getValuesProbabilities')){
          const logits = (await (<ISubstitutionProviderProbabilities>
            substitutionProvider).getValuesProbabilities()
        )
      }
    }
    return new QuerySequenceTemplate(syntaxTree, variableMappings);
  }

  /**
   * Ensures all nextTemplates are actual templates passed to the benchmark instantiator
   * @param providers all query template providers
   * @returns false if not all providers required by this template are present true else
   */
  public validateNextTemplateFilePaths(providers: QuerySequenceTemplateProvider[]){
    const allTemplates = new Set(providers.map(provider => provider.templateFilePath));
    for (const nextTemplate of this.nextTemplateFilePath){
      if (!allTemplates.has(nextTemplate)){
        return false
      }
    }
    return true
  }

  /**
   * Serialize the given queries file contents.
   * @param queriesFile The contents of the queries file to serialize.
   */
  public async saveQueriesFile(queriesFile: string): Promise<void> {
    await fs.promises.writeFile(this.destinationFilePath, queriesFile, 'utf8');
  }

  public getNextTemplatePath(){
    return this.nextTemplateFilePath;
  }
}
