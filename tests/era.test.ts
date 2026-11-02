import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { asksForMonth, MONTH_PRECISION_FROM_YEAR, precisionFor, score, UNSCORED_MONTH_LEAD_YEARS } from '../shared/era.ts'

const CUTOFF = MONTH_PRECISION_FROM_YEAR
const FIRST_ASKED = CUTOFF - UNSCORED_MONTH_LEAD_YEARS

describe('month rules', () => {
  it('scores on the month only from the cutoff, and only with a month-precise source', () => {
    assert.equal(precisionFor(CUTOFF - 1, true), 'year')
    assert.equal(precisionFor(CUTOFF, true), 'month')
    assert.equal(precisionFor(2000, false), 'year')
  })

  it('asks for a month from 30 years before the cutoff, so the field does not give the era away', () => {
    assert.equal(asksForMonth(FIRST_ASKED - 1, true), false)
    assert.equal(asksForMonth(FIRST_ASKED, true), true)
    assert.equal(asksForMonth(CUTOFF - 1, true), true)
    assert.equal(asksForMonth(CUTOFF, true), true)
    assert.equal(asksForMonth(2000, false), false)
  })

  it('every month-scored year also asks for a month', () => {
    for (let year = 1; year <= 2024; year++) {
      if (precisionFor(year, true) === 'month') assert.ok(asksForMonth(year, true), `year ${year}`)
    }
  })
})

describe('score', () => {
  it('gives full points and "correct" for an exact year', () => {
    assert.deepEqual(score({ year: 1066 }, { year: 1066 }, 'year'), { direction: 'correct', off: 0, points: 1000 })
  })

  it('says "later" when the answer is after the guess, "earlier" when before', () => {
    assert.equal(score({ year: 1100 }, { year: 1000 }, 'year').direction, 'later')
    assert.equal(score({ year: 900 }, { year: 1000 }, 'year').direction, 'earlier')
  })

  it('halves the points every 50 years off', () => {
    assert.equal(score({ year: 1000 }, { year: 1050 }, 'year').points, 500)
    assert.equal(score({ year: 1000 }, { year: 1100 }, 'year').points, 250)
  })

  it('ignores the month on year-scored rounds (the unscored month question)', () => {
    assert.deepEqual(
      score({ year: 1870 }, { year: 1870, month: 7 }, 'year'),
      { direction: 'correct', off: 0, points: 1000 },
    )
  })

  it('counts months on month-scored rounds, across year boundaries', () => {
    const result = score({ year: 1901, month: 2 }, { year: 1900, month: 11 }, 'month')
    assert.equal(result.direction, 'later')
    assert.equal(result.off, 3)
    assert.ok(result.points > 990 && result.points < 1000)
  })
})
