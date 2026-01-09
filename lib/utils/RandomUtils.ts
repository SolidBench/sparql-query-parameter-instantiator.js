import type * as seedrandom from 'seedrandom';

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
