import type * as RDF from '@rdfjs/types';
import type { Expression, Triple } from 'sparqljs';

import type { QuerySequenceTemplate } from '../QuerySequenceTemplate';

export interface IProbabilities<T> {
  entity: T;
  probability: number;
}

export interface IQuerySession extends IQuerySessionMetadata {
  templates: IQuerySequenceElementTemplate[];
  ended: boolean;
}

export interface IQuerySessionMetadata {
  task: string;
  sessionLength: number;
  sessionId: number;
}

export interface IQuerySequenceElementTemplate {
  task: string;
  name: string;
  nextFilePaths: INextTemplate[];
  template: QuerySequenceTemplate;
}

export interface IQuerySequenceElementMetadata {
  session: IQuerySessionMetadata;
  template: string;
  nOpenSessions: number;
  refinementMetadata: Record<string, any>;
}

export interface IQuerySequenceMetadata {
  user: IUserMetadata;
  sequenceElements: IQuerySequenceElementMetadata[];
  sequenceLength: number;
}

export interface IUserMetadata {
  user: string;
  transitionProbability: number;
}

export interface IEntityLogits {
  entity: string;
  similarity: number;
}

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
