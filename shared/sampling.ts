// Picks puzzle years skewed towards the present, since recent maps are more familiar to players.
//
// Percentage of picks per century, 1st to 21st, hand-tuned: rising towards the present, with extra weight on
// the Middle Ages (8th-14th centuries), and the 21st cut to 1% because borders have barely changed since 2000,
// so those maps all look alike. Years within a century are equally likely.
export const CENTURY_WEIGHTS = [
  2.0, 2.1, 2.1, 2.2, 2.3, // 1st-5th
  2.4, 2.5, 4.9, 5.0, 5.2, // 6th-10th
  5.2, 5.4, 5.6, 5.8, 5, // 11th-15th
  5.7, 5.5, 6.6, 8.7, 14.8, // 16th-20th
  1.0, // 21st (2001 on)
]

const centuryOf = (year: number) => Math.min(Math.ceil(year / 100), CENTURY_WEIGHTS.length) - 1
const yearsIn = (century: number, latestYear: number) =>
  century === CENTURY_WEIGHTS.length - 1 ? latestYear - century * 100 : 100

// Maps a uniform draw u in [0, 1) to a year in [from, to], weighted as above. A narrower range keeps the same
// relative weights, e.g. from 1886 on the 20th century stays far more likely than the 21st.
export function weightedYear(u: number, from: number, to: number): number {
  const weight = (year: number) => CENTURY_WEIGHTS[centuryOf(year)] / yearsIn(centuryOf(year), to)
  let total = 0
  for (let year = from; year <= to; year++) total += weight(year)
  let remaining = u * total
  for (let year = from; year <= to; year++) {
    remaining -= weight(year)
    if (remaining < 0) return year
  }
  return to
}
