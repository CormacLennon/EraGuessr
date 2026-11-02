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
  precision: Precision // what the guess is scored on
  askMonth: boolean // whether the guess form asks for a month; true for some year-scored rounds too (see era.ts)
  answer: MapDate
  map: RoundMap
}

// One static file per play day, puzzles/<YYYY-MM-DD>.json, the same for every player. It includes the answers
// so the browser can score guesses: anyone determined can read them, which is fine for a casual daily game.
export interface DailyPuzzle {
  day: string
  sources: string[]
  minYear: number
  maxYear: number
  rounds: Round[]
}
