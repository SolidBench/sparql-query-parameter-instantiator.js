import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import type * as seedrandom from 'seedrandom';
import { IEntityLogits } from '../QuerySequenceTemplateProvider';

export interface IProbabilities<T> {
  probability: number;
  entity: T;
}

export function logNormalRoundedUp(rng: seedrandom.PRNG, mean: number, stdev: number): number {
  return Math.ceil(logNormal(rng, mean, stdev));
}

export function logNormal(rng: seedrandom.PRNG, mean: number, stdev: number): number {
  const z = gaussianRandom(rng, mean, stdev);
  return Math.exp(z);
}

export function calculateExpectedMeanLogNormal(mean: number, stdev: number): number {
  return Math.exp(mean + 0.5 * (stdev ** 2));
}

export function gaussianRandom(rng: seedrandom.PRNG, mean: number, stdev: number): number {
  const u = 1 - rng();
  const v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return z * stdev + mean;
}

export function sampleRandom<T>(rng: seedrandom.PRNG, array: T[]): T {
  return array[Math.floor(rng() * array.length)];
}

export function sampleProbability<T>(rng: seedrandom.PRNG, probabilities: IProbabilities<T>[]): T {
  const r = rng();
  let cumulative = 0;
  for (const item of probabilities) {
    cumulative += item.probability;
    if (r < cumulative) {
      return item.entity;
    }
  }
  throw new Error('Failed sampling, likely due to probabilities not summing to 1.');
}

export function sampleHit(rng: seedrandom.PRNG, probabilityHit: number): boolean {
  return rng() < probabilityHit;
}

export function randomIntFromInterval(rng: seedrandom.PRNG, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1) + min);
}


export function sampleVariableTerm(
  variable: string,
  user: string, 
  nSamples: number,
  variableProbabilities: Record<string, Record<string, IEntityLogits[]>>,
  DF: DataFactory,
  rng: seedrandom.PRNG
): RDF.Term[] {
  if (Object.keys(variableProbabilities[variable]).length <= nSamples) {
    throw new Error('Trying to sample more values than there are elements');
  }
  const probabilities = variableProbabilities[variable];
  if (!probabilities) {
    throw new Error(`No probabilities found for variable '${variable}'`);
  }
  const logits = probabilities[user];
  if (!logits) {
    throw new Error(`No logits found for user '${user}' for variable '${variable}'`);
  }
  const sampled: string[] = [];
  while (sampled.length < nSamples) {
    const newSample = sampleTerm(logits, rng);
    if (!sampled.includes(newSample)) {
      sampled.push(newSample);
    }
  }
  return sampled.map(sample => DF.namedNode(sample));
}

export function sampleTerm(logits: IEntityLogits[], rng: seedrandom.PRNG): string {
  const r = rng();
  let cumulative = 0;

  for (const item of logits) {
    cumulative += item.similarity;
    if (r < cumulative) {
      return item.entity;
    }
  }
  throw new Error('Failed sampling, likely due to probabilities not summing to 1.');
}