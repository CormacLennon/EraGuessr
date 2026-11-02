// Month-level border dates only exist in open data from about 1886 (CShapes / OpenHistoricalMap).
// Earlier maps, and any map built from a year-only source such as Cliopatria, ask for the year only.
export const MONTH_PRECISION_FROM_YEAR = 1886

export type Precision = 'year' | 'month'

export interface MapDate {
  year: number
  month?: number // 1-12, present only for month-precision dates
}

export function precisionFor(year: number, sourceHasMonths: boolean): Precision {
  return sourceHasMonths && year >= MONTH_PRECISION_FROM_YEAR ? 'month' : 'year'
}

// Signed difference in the round's own unit (years or months): positive means the answer is later than the guess.
function difference(target: MapDate, guess: MapDate, precision: Precision): number {
  if (precision === 'year') return target.year - guess.year
  return (target.year - guess.year) * 12 + (target.month ?? 1) - (guess.month ?? 1)
}

export type Direction = 'correct' | 'earlier' | 'later'

export interface Score {
  direction: Direction
  off: number // in years or months, matching the round's precision
  points: number // 0-1000
}

const POINTS_HALF_LIFE_YEARS = 50

export function score(target: MapDate, guess: MapDate, precision: Precision): Score {
  const diff = difference(target, guess, precision)
  const offYears = precision === 'year' ? Math.abs(diff) : Math.abs(diff) / 12
  return {
    direction: diff === 0 ? 'correct' : diff < 0 ? 'earlier' : 'later',
    off: Math.abs(diff),
    points: Math.round(1000 * 0.5 ** (offYears / POINTS_HALF_LIFE_YEARS)),
  }
}
