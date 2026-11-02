// Checks generated puzzle files. Run after `npm run puzzles:generate`; set PUZZLE_DIR to check another folder
// (CI checks client/dist/puzzles before deploying). Skips when there are no puzzle files.
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { asksForMonth, MONTH_PRECISION_FROM_YEAR, precisionFor } from '../shared/era.ts'
import { ROUNDS_PER_DAY, type DailyPuzzle } from '../shared/puzzle.ts'

const PUZZLE_DIR = process.env.PUZZLE_DIR ?? 'client/public/puzzles'
const OHM_FROM_YEAR = 1825 // matches scripts/generate-puzzles.ts

const files = await readdir(PUZZLE_DIR).then((names) => names.filter((n) => n.endsWith('.json')), () => [])

describe(`puzzle files in ${PUZZLE_DIR}`, { skip: files.length === 0 && 'no puzzle files generated' }, async () => {
  const puzzles = await Promise.all(
    files.map(async (name) => ({ name, puzzle: JSON.parse(await readFile(`${PUZZLE_DIR}/${name}`, 'utf8')) as DailyPuzzle })),
  )

  for (const { name, puzzle } of puzzles) {
    describe(name, () => {
      it('is for the day in its file name', () => assert.equal(`${puzzle.day}.json`, name))

      it(`has ${ROUNDS_PER_DAY} rounds with distinct years`, () => {
        assert.equal(puzzle.rounds.length, ROUNDS_PER_DAY)
        assert.equal(new Set(puzzle.rounds.map((r) => r.answer.year)).size, ROUNDS_PER_DAY)
      })

      it(`has at least one map from ${MONTH_PRECISION_FROM_YEAR} or later`, () => {
        assert.ok(puzzle.rounds.some((r) => r.answer.year >= MONTH_PRECISION_FROM_YEAR))
      })

      it('has answers in range with the right precision and month question', () => {
        for (const { answer, precision, askMonth } of puzzle.rounds) {
          assert.ok(answer.year >= puzzle.minYear && answer.year <= puzzle.maxYear, `year ${answer.year}`)
          const hasMonths = answer.year >= OHM_FROM_YEAR
          assert.equal(precision, precisionFor(answer.year, hasMonths), `precision for ${answer.year}`)
          assert.equal(askMonth, asksForMonth(answer.year, hasMonths), `askMonth for ${answer.year}`)
          assert.equal(answer.month !== undefined, precision === 'month', `answer month for ${answer.year}`)
          if (answer.month !== undefined) assert.ok(answer.month >= 1 && answer.month <= 12)
        }
      })

      it('has no years in its labels', () => {
        for (const { map } of puzzle.rounds) {
          for (const label of map.labels.features) assert.doesNotMatch(String(label.properties.name), /\d{3,4}/)
        }
      })

      it('has map layers with polities and a label each', () => {
        for (const { map } of puzzle.rounds) {
          assert.ok(map.polities.features.length >= 15)
          assert.ok(map.labels.features.length >= map.polities.features.length * 0.9)
        }
      })
    })
  }
})
