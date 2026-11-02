import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CENTURY_WEIGHTS, weightedYear } from '../shared/sampling.ts'

// Evenly spaced draws stand in for random ones, so the test is exact and repeatable.
const SAMPLES = 100_000
const sample = (from: number, to: number) =>
  Array.from({ length: SAMPLES }, (_, i) => weightedYear((i + 0.5) / SAMPLES, from, to))
const share = (years: number[], test: (year: number) => boolean) => years.filter(test).length / years.length
const inCentury = (c: number) => (y: number) => y > (c - 1) * 100 && y <= c * 100

describe('weightedYear', () => {
  const years = sample(1, 2024)

  it('has weights that add up to 100%', () => {
    assert.equal(Math.round(CENTURY_WEIGHTS.reduce((a, b) => a + b, 0) * 10) / 10, 100)
  })

  it('stays within the range', () => {
    assert.ok(years.every((y) => y >= 1 && y <= 2024))
    assert.ok(sample(1886, 2024).every((y) => y >= 1886 && y <= 2024))
  })

  it('matches the century weights', () => {
    for (let c = 1; c <= 21; c++) {
      assert.ok(Math.abs(share(years, inCentury(c)) * 100 - CENTURY_WEIGHTS[c - 1]) < 0.05, `century ${c}`)
    }
  })

  it('favours the 20th century most and caps the 21st at 1%', () => {
    assert.equal(Math.max(...CENTURY_WEIGHTS), CENTURY_WEIGHTS[19])
    assert.ok(Math.abs(share(years, (y) => y > 2000) - 0.01) < 0.001)
  })

  it('gives the Middle Ages (8th-14th centuries) more than the early centuries', () => {
    assert.ok(Math.min(...CENTURY_WEIGHTS.slice(7, 14)) > Math.max(...CENTURY_WEIGHTS.slice(0, 7)))
  })

  it('keeps the 20th century far ahead of the 21st within a narrower range', () => {
    const modern = sample(1886, 2024)
    assert.ok(share(modern, inCentury(20)) > 5 * share(modern, (y) => y > 2000))
  })
})
