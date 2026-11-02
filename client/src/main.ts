import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'
import { AttributionControl, Map as MapLibreMap, NavigationControl, type GeoJSONSource, type GeoJSONSourceSpecification } from 'maplibre-gl'

type Precision = 'year' | 'month'
type MapData = GeoJSONSourceSpecification['data']

interface MapDate {
  year: number
  month?: number
}

interface DailyResponse {
  day: string
  minYear: number
  maxYear: number
  rounds: { precision: Precision; map: { polities: MapData; groups: MapData; labels: MapData } }[]
}

interface RoundResult {
  guess: MapDate
  answer: MapDate
  direction: 'correct' | 'earlier' | 'later'
  off: number
  points: number
}

const EMPTY: MapData = { type: 'FeatureCollection', features: [] }

const monthName = (month: number) => new Date(2000, month - 1).toLocaleString('en', { month: 'long' })
const formatDate = (d: MapDate) => (d.month ? `${monthName(d.month)} ${d.year}` : `${d.year}`)

const SHARE_URL = 'www.EraGuessr.com'

// Rating by points (0-1000). With the 50-year scoring half-life these are roughly within
// 8, 37, 87 and 166 years of the answer.
const RATINGS = [
  { minPoints: 900, emoji: '🧠' },
  { minPoints: 600, emoji: '🤓' },
  { minPoints: 300, emoji: '🆗' },
  { minPoints: 100, emoji: '🫪' },
  { minPoints: 0, emoji: '💩' },
]

const ratingEmoji = (points: number) => RATINGS.find((r) => points >= r.minPoints)!.emoji

function shareText(results: RoundResult[], total: number): string {
  const points = results.reduce((sum, r) => sum + r.points, 0)
  return `${results.map((r) => ratingEmoji(r.points)).join('')}\nScore: ${points}/${total * 1000}\n${SHARE_URL}`
}

// Progress is kept only in this browser (no cookies, nothing sent to the server). Storage can be unavailable,
// e.g. in private windows, in which case the game still works but forgets progress on reload.
const storageKey = (day: string) => `eraguessr:${day}`

function loadResults(day: string): RoundResult[] {
  try {
    const saved = localStorage.getItem(storageKey(day))
    return saved ? (JSON.parse(saved) as RoundResult[]) : []
  } catch {
    return []
  }
}

function saveResults(day: string, results: RoundResult[]) {
  try {
    localStorage.setItem(storageKey(day), JSON.stringify(results))
  } catch {
    // Progress just won't survive a reload.
  }
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header>
  <h1>EraGuessr</h1>
  <p id="prompt">Loading today's maps…</p>
</header>
<main>
  <div id="map" aria-label="Historical world map"></div>
  <form id="guess" hidden>
    <label id="month-field">Month
      <select name="month">
        ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${monthName(i + 1)}</option>`).join('')}
      </select>
    </label>
    <label>Year (AD)
      <input name="year" type="number" required />
    </label>
    <button type="submit">Guess</button>
  </form>
  <p id="status" role="status"></p>
  <button id="next" type="button" hidden>Next map</button>
  <div id="share" hidden>
    <textarea id="share-text" readonly rows="3" aria-label="Your score to share"></textarea>
    <button id="share-button" type="button">Copy score</button>
    <span id="share-status" role="status"></span>
  </div>
  <ol id="history"></ol>
</main>
`

const prompt = document.querySelector<HTMLParagraphElement>('#prompt')!
const form = document.querySelector<HTMLFormElement>('#guess')!
const monthField = document.querySelector<HTMLLabelElement>('#month-field')!
const yearInput = form.querySelector<HTMLInputElement>('input[name=year]')!
const status = document.querySelector<HTMLParagraphElement>('#status')!
const nextButton = document.querySelector<HTMLButtonElement>('#next')!
const history = document.querySelector<HTMLOListElement>('#history')!
const share = document.querySelector<HTMLDivElement>('#share')!
const shareTextArea = document.querySelector<HTMLTextAreaElement>('#share-text')!
const shareStatus = document.querySelector<HTMLSpanElement>('#share-status')!

document.querySelector<HTMLButtonElement>('#share-button')!.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareTextArea.value)
    shareStatus.textContent = 'Copied!'
  } catch {
    // Clipboard access can be blocked (e.g. insecure context); leave the text selected to copy by hand.
    shareTextArea.select()
    shareStatus.textContent = 'Press Ctrl+C (or ⌘C) to copy'
  }
})

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`)
  return body as T
}

function createMap(): Promise<MapLibreMap> {
  const map = new MapLibreMap({
    container: 'map',
    center: [20, 30],
    zoom: 1,
    renderWorldCopies: false,
    attributionControl: false,
    style: {
      version: 8,
      // Self-hosted Noto Sans glyphs (SIL OFL); CJK falls back to the viewer's local fonts.
      glyphs: `${location.origin}/fonts/{fontstack}/{range}.pbf`,
      sources: {
        land: { type: 'geojson', data: '/land.geojson' },
        polities: { type: 'geojson', data: EMPTY },
        groups: { type: 'geojson', data: EMPTY },
        labels: { type: 'geojson', data: EMPTY },
      },
      layers: [
        { id: 'ocean', type: 'background', paint: { 'background-color': '#bcd3e0' } },
        { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#ece6d9' } },
        {
          id: 'polities',
          type: 'fill',
          source: 'polities',
          paint: { 'fill-color': ['to-color', ['get', 'fill'], '#ccc'], 'fill-opacity': 0.85 },
        },
        { id: 'borders', type: 'line', source: 'polities', paint: { 'line-color': '#5a4a3a', 'line-width': 0.6 } },
        // Umbrella polities such as the Holy Roman Empire, outlined around their member states.
        {
          id: 'groups',
          type: 'line',
          source: 'groups',
          paint: { 'line-color': '#7a1f1f', 'line-width': 2.2, 'line-dasharray': [3, 1.5] },
        },
        {
          id: 'labels',
          type: 'symbol',
          source: 'labels',
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular'],
            'text-size': ['match', ['get', 'kind'], 'group', 13, 11],
            'text-transform': ['match', ['get', 'kind'], 'group', 'uppercase', 'none'],
            'text-letter-spacing': ['match', ['get', 'kind'], 'group', 0.1, 0],
            'text-max-width': 8,
            'symbol-sort-key': ['get', 'rank'],
          },
          paint: {
            'text-color': ['match', ['get', 'kind'], 'group', '#7a1f1f', '#2b2118'],
            'text-halo-color': 'rgba(255, 255, 255, 0.8)',
            'text-halo-width': 1.2,
          },
        },
      ],
    },
  })
  map.addControl(new NavigationControl({ showCompass: false }))
  map.addControl(
    new AttributionControl({
      compact: false,
      customAttribution: [
        'Borders: <a href="https://github.com/Seshat-Global-History-Databank/cliopatria">Cliopatria</a> (Seshat), ' +
          '<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, simplified',
        'Borders since 1825: <a href="https://www.openhistoricalmap.org/">OpenHistoricalMap</a>',
        'Land: <a href="https://www.naturalearthdata.com/">Natural Earth</a>',
      ],
    }),
  )
  return new Promise((resolve) => map.on('load', () => resolve(map)))
}

function describe(result: RoundResult, precision: Precision): string {
  const unit = precision === 'month' ? 'month' : 'year'
  const miss = result.direction === 'correct'
    ? 'spot on!'
    : `${result.off} ${unit}${result.off === 1 ? '' : 's'} ${result.direction === 'later' ? 'too early' : 'too late'}`
  return `${ratingEmoji(result.points)} You said ${formatDate(result.guess)}, it was ${formatDate(result.answer)}: ${miss} +${result.points} points`
}

async function start() {
  const daily = await api<DailyResponse>('/api/daily')
  const results = loadResults(daily.day)
  const map = await createMap()
  const source = (id: string) => map.getSource<GeoJSONSource>(id)!
  const total = daily.rounds.length
  yearInput.min = String(daily.minYear)
  yearInput.max = String(daily.maxYear)

  const renderHistory = () =>
    history.replaceChildren(
      ...results.map((result, i) => {
        const item = document.createElement('li')
        item.textContent = describe(result, daily.rounds[i].precision)
        return item
      }),
    )

  const showRound = () => {
    const index = results.length
    renderHistory()
    nextButton.hidden = true
    if (index >= total) {
      const points = results.reduce((sum, r) => sum + r.points, 0)
      form.hidden = true
      prompt.textContent = `That's today's ${total} maps done.`
      status.textContent = `Total: ${points} of ${total * 1000} points. New maps tomorrow (UTC).`
      shareTextArea.value = shareText(results, total)
      share.hidden = false
      return
    }
    const { precision, map: layers } = daily.rounds[index]
    source('polities').setData(layers.polities)
    source('groups').setData(layers.groups)
    source('labels').setData(layers.labels)
    monthField.hidden = precision !== 'month'
    prompt.textContent = `Map ${index + 1} of ${total}: when is it from? ` +
      (precision === 'month' ? 'Guess the month and year' : 'Guess the year') +
      ` (${daily.minYear}–${daily.maxYear} AD). One guess per map.`
    status.textContent = ''
    form.reset()
    form.hidden = false
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const index = results.length
    const { precision } = daily.rounds[index]
    const data = new FormData(form)
    const guess: MapDate = { year: Number(data.get('year')) }
    if (precision === 'month') guess.month = Number(data.get('month'))
    try {
      const result = await api<Omit<RoundResult, 'guess'>>(`/api/daily/${daily.day}/${index}/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guess),
      })
      results.push({ ...result, guess })
      saveResults(daily.day, results)
      renderHistory()
      form.hidden = true
      status.textContent = describe(results[index], precision)
      nextButton.textContent = index + 1 < total ? 'Next map' : 'See total'
      nextButton.hidden = false
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Something went wrong'
    }
  })

  nextButton.addEventListener('click', showRound)
  showRound()
}

start().catch((error: unknown) => {
  prompt.textContent = error instanceof Error ? error.message : "Couldn't load today's maps"
})
