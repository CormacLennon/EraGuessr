import type { MapDate, Precision } from './era.ts'

export const ROUNDS_PER_DAY = 5

export interface FeatureCollection {
  type: 'FeatureCollection'
  features: { type: 'Feature'; properties: Record<string, unknown>; geometry: unknown }[]
}

export interface RoundMap {
  polities: FeatureCollection // filled areas: { name, fill }
  groups: FeatureCollection // umbrella polities drawn as outlines over their members, e.g. the Holy Roman Empire: { name }
  labels: FeatureCollection // label points: { name, kind: 'polity' | 'group', rank }
}

export interface Round {
  precision: Precision
  answer: MapDate
  map: RoundMap
}

// One file per play day in data/puzzles/<YYYY-MM-DD>.json, the same for every player.
// Contains the answers, so it is never served as-is.
export interface DailyPuzzle {
  day: string
  sources: string[]
  minYear: number
  maxYear: number
  rounds: Round[]
}
