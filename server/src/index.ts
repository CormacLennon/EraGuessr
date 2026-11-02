// Daily puzzle API. Stateless: every player gets the same maps each UTC day, and nothing about players is stored.
//   GET  /api/daily                     today's maps, without answers
//   POST /api/daily/:day/:round/guess   { year, month? } -> score and answer for that round
// Players' progress lives in their own browser; the server only hides answers until a guess is made.
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { score, type MapDate } from './era.ts'
import type { DailyPuzzle } from './puzzle.ts'

const PORT = Number(process.env.PORT ?? 8787)
const PUZZLE_DIR = process.env.PUZZLE_DIR ?? join(import.meta.dirname, '../../data/puzzles')
const MAX_BODY_BYTES = 1024

const puzzleCache = new Map<string, DailyPuzzle>()

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const today = () => new Date().toISOString().slice(0, 10)

function secondsUntilUtcMidnight(): number {
  const now = new Date()
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return Math.max(1, Math.floor((midnight - now.getTime()) / 1000))
}

async function loadPuzzle(day: string): Promise<DailyPuzzle> {
  let puzzle = puzzleCache.get(day)
  if (!puzzle) {
    try {
      puzzle = JSON.parse(await readFile(`${PUZZLE_DIR}/${day}.json`, 'utf8')) as DailyPuzzle
    } catch {
      throw new HttpError(404, 'No puzzle for that day')
    }
    puzzleCache.set(day, puzzle)
  }
  return puzzle
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Expected JSON')
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Body too large')
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

// Reject anything that isn't exactly the expected shape; no coercion.
function parseGuess(body: unknown, puzzle: DailyPuzzle, precision: 'year' | 'month'): MapDate {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Invalid guess')
  const { year, month, ...rest } = body as Record<string, unknown>
  if (Object.keys(rest).length > 0) throw new HttpError(400, 'Invalid guess')
  if (!Number.isInteger(year) || (year as number) < puzzle.minYear || (year as number) > puzzle.maxYear) {
    throw new HttpError(400, `Year must be a whole number from ${puzzle.minYear} to ${puzzle.maxYear}`)
  }
  if (precision === 'year') {
    if (month !== undefined) throw new HttpError(400, 'This map takes a year only')
    return { year: year as number }
  }
  if (!Number.isInteger(month) || (month as number) < 1 || (month as number) > 12) {
    throw new HttpError(400, 'Month must be a whole number from 1 to 12')
  }
  return { year: year as number, month: month as number }
}

function send(req: IncomingMessage, res: ServerResponse, status: number, body: unknown, cacheControl = 'no-store') {
  let payload: Buffer = Buffer.from(JSON.stringify(body))
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': cacheControl, Vary: 'Accept-Encoding' }
  if (payload.length > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
    payload = gzipSync(payload)
    headers['Content-Encoding'] = 'gzip'
  }
  res.writeHead(status, headers)
  res.end(payload)
}

const GUESS_PATH = /^\/api\/daily\/(\d{4}-\d{2}-\d{2})\/(\d)\/guess$/

async function handle(req: IncomingMessage, res: ServerResponse) {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname

  if (req.method === 'GET' && path === '/api/daily') {
    const puzzle = await loadPuzzle(today())
    return send(req, res, 200, {
      day: puzzle.day,
      minYear: puzzle.minYear,
      maxYear: puzzle.maxYear,
      rounds: puzzle.rounds.map(({ precision, map }) => ({ precision, map })),
      // Short cache, never past UTC midnight, so regenerated puzzles reach players quickly.
    }, `public, max-age=${Math.min(300, secondsUntilUtcMidnight())}`)
  }

  const guessMatch = GUESS_PATH.exec(path)
  if (req.method === 'POST' && guessMatch) {
    const [, day, roundText] = guessMatch
    // Past days stay playable (e.g. a player who started before midnight); future answers stay hidden.
    if (day > today()) throw new HttpError(404, 'No puzzle for that day')
    const puzzle = await loadPuzzle(day)
    const round = puzzle.rounds[Number(roundText)]
    if (!round) throw new HttpError(404, 'No such round')
    const guess = parseGuess(await readJson(req), puzzle, round.precision)
    return send(req, res, 200, { ...score(round.answer, guess, round.precision), answer: round.answer })
  }

  throw new HttpError(404, 'Not found')
}

createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    if (error instanceof HttpError) return send(req, res, error.status, { error: error.message })
    console.error('Unhandled error:', error instanceof Error ? error.message : 'unknown')
    send(req, res, 500, { error: 'Something went wrong' })
  })
}).listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`))
