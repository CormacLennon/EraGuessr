import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { gunzipSync } from 'node:zlib'
import { stripDates } from '../shared/labels.ts'

describe('stripDates', () => {
  it('removes bracketed, open-ended and trailing year ranges', () => {
    assert.equal(stripDates('Japan (1953-1968)'), 'Japan')
    assert.equal(stripDates('Ethiopia (1993-)'), 'Ethiopia')
    assert.equal(stripDates('Islamic Emirate of Afghanistan (1996–2001)'), 'Islamic Emirate of Afghanistan')
    assert.equal(stripDates('United Provinces of the Río de la Plata 1828-1831'), 'United Provinces of the Río de la Plata')
  })

  it('leaves other brackets and plain names alone', () => {
    assert.equal(stripDates('French Republic (Empire)'), 'French Republic (Empire)')
    assert.equal(stripDates('Đại Việt (Tây Sơn)'), 'Đại Việt (Tây Sơn)')
    assert.equal(stripDates('Kingdom of Kush'), 'Kingdom of Kush')
  })

  it('leaves no years in any name in the source data', async () => {
    for (const source of ['cliopatria', 'ohm']) {
      const data = JSON.parse(gunzipSync(await readFile(`data/source/${source}.simplified.geojson.gz`)).toString('utf8'))
      for (const { properties } of data.features as { properties: { Name: string } }[]) {
        assert.doesNotMatch(stripDates(properties.Name), /\d{3,4}/, `${source}: ${properties.Name}`)
      }
    }
  })
})
