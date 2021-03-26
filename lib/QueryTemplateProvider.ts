import * as fs from 'fs';
import type * as RDF from 'rdf-js';
import type { SparqlParser } from 'sparqljs';
import { Parser } from 'sparqljs';
import { QueryTemplate } from './QueryTemplate';
import type { IVariableTemplate } from './variable/IVariableTemplate';

/**
 * Constructs query templates based on a given template file, variables, and substitution parameters.
 */
export class QueryTemplateProvider {
  private readonly templateFilePath: string;
  private readonly destinationFilePath: string;
  private readonly variables: IVariableTemplate[];

  private readonly parser: SparqlParser;

  public constructor(
    templateFilePath: string,
    destinationFilePath: string,
    variables: IVariableTemplate[],
  ) {
    this.templateFilePath = templateFilePath;
    this.destinationFilePath = destinationFilePath;
    this.variables = variables;

    this.parser = new Parser();
  }

  /**
   * Create a new query template data object.
   */
  public async createTemplate(): Promise<QueryTemplate> {
    const sparqlString = await fs.promises.readFile(this.templateFilePath, 'utf8');
    const syntaxTree = this.parser.parse(sparqlString);
    const variableMappings: Record<string, RDF.Term[]> = {};
    for (const variableTemplate of this.variables) {
      const variableName = variableTemplate.getName();
      variableMappings[variableName] = (await variableTemplate.getSubstitutionProvider().getValues())
        .map(value => variableTemplate.createTerm(value));
    }
    return new QueryTemplate(syntaxTree, variableMappings);
  }

  /**
   * Serialize the given queries file contents.
   * @param queriesFile The contents of the queries file to serialize.
   */
  public async saveQueriesFile(queriesFile: string): Promise<void> {
    await fs.promises.writeFile(this.destinationFilePath, queriesFile, 'utf8');
  }
}

