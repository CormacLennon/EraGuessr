import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'
import { AttributionControl, Map as MapLibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource, type GeoJSONSourceSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { score, type MapDate, type Precision, type Score } from '../../shared/era.ts'
import type { DailyPuzzle, FeatureCollection } from '../../shared/puzzle.ts'

type MapData = GeoJSONSourceSpecification['data']

interface RoundResult extends Score {
  guess: MapDate
  answer: MapDate
}

// MapLibre finds its worker relative to its own module, which a production build moves; point it at the copied file.
setWorkerUrl(workerUrl)

// Everything is served as static files next to index.html (GitHub Pages), so paths are relative to the page.
const asset = (path: string) => `${new URL(import.meta.env.BASE_URL, location.href).href}${path}`

const EMPTY: MapData = { type: 'FeatureCollection', features: [] }

const monthName = (month: number) => new Date(2000, month - 1).toLocaleString('en', { month: 'long' })
const formatDate = (d: MapDate) => (d.month ? `${monthName(d.month)} ${d.year}` : `${d.year}`)

const SHARE_URL = 'https://www.eraguessr.fun'

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

// Each app's own "share this text" link. encodeURIComponent rather than URLSearchParams, which writes spaces as
// "+" that mail and SMS apps show literally.
const query = (params: Record<string, string>) =>
  Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')
const SHARE_TARGETS: { name: string; link: (text: string) => string }[] = [
  { name: 'WhatsApp', link: (text) => `https://wa.me/?${query({ text })}` },
  // Telegram shows the url parameter itself, so drop the URL line from the text to avoid it appearing twice.
  {
    name: 'Telegram',
    link: (text) =>
      `https://t.me/share/url?${query({ url: `https://${SHARE_URL}`, text: text.replace(`\n${SHARE_URL}`, '') })}`,
  },
  { name: 'X', link: (text) => `https://x.com/intent/post?${query({ text })}` },
  { name: 'Messages', link: (text) => `sms:?&${query({ body: text })}` },
  { name: 'Email', link: (text) => `mailto:?${query({ subject: 'My EraGuessr score', body: text })}` },
]

function renderShareLinks(container: HTMLElement, text: string) {
  const links = SHARE_TARGETS.map(({ name, link }) => {
    const anchor = document.createElement('a')
    anchor.href = link(text)
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    anchor.textContent = name
    return anchor
  })
  // The device's own share sheet (phones, some desktop browsers) covers every other app.
  if (typeof navigator.share === 'function') {
    const more = document.createElement('button')
    more.type = 'button'
    more.textContent = 'More…'
    more.addEventListener('click', () => navigator.share({ text }).catch(() => {}))
    container.replaceChildren(...links, more)
  } else {
    container.replaceChildren(...links)
  }
}

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
<div id="map" aria-label="Historical world map"></div>
<header id="topbar" class="card">
  <h1>EraGuessr</h1>
  <span id="progress"></span>
  <button id="help" type="button" aria-label="How to play">?</button>
</header>
<section id="panel" class="card">
  <p id="prompt">Loading today's maps…</p>
  <form id="guess" hidden>
    <label id="month-field">Month
      <select name="month">
        ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${monthName(i + 1)}</option>`).join('')}
      </select>
    </label>
    <label>Year (AD)
      <input name="year" type="number" inputmode="numeric" required />
    </label>
    <button type="submit" class="primary">Guess</button>
  </form>
  <p id="status" role="status"></p>
  <button id="next" type="button" class="primary" hidden>Next map</button>
  <button id="show-results" type="button" class="primary" hidden>See your score</button>
</section>
<dialog id="intro" aria-labelledby="intro-title">
  <h2 id="intro-title">EraGuessr</h2>
  <p>Every day, everyone gets the same 5 world maps, each from a moment between 1 AD and 2024.</p>
  <ul>
    <li>Guess the year each map shows. More recent maps ask for the month too, and from 1886 on it counts.</li>
    <li>One guess per map. Up to 1,000 points each: the closer, the more you score.</li>
    <li>Zoom and pan to look for clues in the borders and names.</li>
    <li>New maps every day at midnight UTC.</li>
  </ul>
  <button id="intro-close" type="button" class="primary" autofocus>Play</button>
</dialog>
<dialog id="results" aria-labelledby="results-title">
  <h2 id="results-title">Today's score</h2>
  <p id="total"></p>
  <ol id="history"></ol>
  <textarea id="share-text" readonly rows="3" aria-label="Your score to share"></textarea>
  <div class="row">
    <button id="share-button" type="button" class="primary">Copy score</button>
    <span id="share-status" role="status"></span>
  </div>
  <nav id="share-links" aria-label="Share your score"></nav>
  <p class="muted">New maps tomorrow at midnight UTC.</p>
  <button id="results-close" type="button">Close</button>
</dialog>
`

const prompt = document.querySelector<HTMLParagraphElement>('#prompt')!
const progress = document.querySelector<HTMLSpanElement>('#progress')!
const form = document.querySelector<HTMLFormElement>('#guess')!
const monthField = document.querySelector<HTMLLabelElement>('#month-field')!
const yearInput = form.querySelector<HTMLInputElement>('input[name=year]')!
const status = document.querySelector<HTMLParagraphElement>('#status')!
const nextButton = document.querySelector<HTMLButtonElement>('#next')!
const showResultsButton = document.querySelector<HTMLButtonElement>('#show-results')!
const intro = document.querySelector<HTMLDialogElement>('#intro')!
const resultsDialog = document.querySelector<HTMLDialogElement>('#results')!
const totalScore = document.querySelector<HTMLParagraphElement>('#total')!
const history = document.querySelector<HTMLOListElement>('#history')!
const shareTextArea = document.querySelector<HTMLTextAreaElement>('#share-text')!
const shareStatus = document.querySelector<HTMLSpanElement>('#share-status')!
const shareLinks = document.querySelector<HTMLElement>('#share-links')!

// Dialogs close on their button, on Escape (built in) and on a tap outside them.
for (const dialog of [intro, resultsDialog]) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
}
document.querySelector<HTMLButtonElement>('#intro-close')!.addEventListener('click', () => intro.close())
document.querySelector<HTMLButtonElement>('#results-close')!.addEventListener('click', () => resultsDialog.close())
document.querySelector<HTMLButtonElement>('#help')!.addEventListener('click', () => intro.showModal())
showResultsButton.addEventListener('click', () => resultsDialog.showModal())

// Show the rules automatically only until the player has dismissed them once.
const INTRO_SEEN_KEY = 'eraguessr:intro-seen'
intro.addEventListener('close', () => {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1')
  } catch {
    // They'll just see the rules again next time.
  }
})
function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1'
  } catch {
    return false
  }
}
if (!introSeen()) intro.showModal()

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

const todayUtc = () => new Date().toISOString().slice(0, 10)

// Dev only (npm run dev): ?day=YYYY-MM-DD plays that day's puzzle, ?reset clears its saved progress first.
const devParams = new URLSearchParams(import.meta.env.DEV ? location.search : '')
const devDay = devParams.get('day')
const puzzleDay = () => (devDay && /^\d{4}-\d{2}-\d{2}$/.test(devDay) ? devDay : todayUtc())

// Puzzle files from before askMonth existed only asked for a month on month-scored rounds.
const asksMonth = (round: DailyPuzzle['rounds'][number]) => round.askMonth ?? round.precision === 'month'

// Today's puzzle file, built and published by the daily GitHub Action (see .github/workflows/deploy.yml).
async function loadPuzzle(): Promise<DailyPuzzle> {
  const response = await fetch(asset(`puzzles/${puzzleDay()}.json`), { cache: 'no-cache' })
  if (response.status === 404) throw new Error("Today's maps aren't out yet. Check back in a few minutes.")
  if (!response.ok) throw new Error(`Couldn't load today's maps (${response.status})`)
  return (await response.json()) as DailyPuzzle
}

// Whole numbers in range only; the input's min/max catch most of this, but not every browser enforces them.
function parseGuess(data: FormData, puzzle: DailyPuzzle, askMonth: boolean): MapDate {
  const year = Number(data.get('year'))
  if (!Number.isInteger(year) || year < puzzle.minYear || year > puzzle.maxYear) {
    throw new Error(`Enter a whole year from ${puzzle.minYear} to ${puzzle.maxYear}`)
  }
  if (!askMonth) return { year }
  const month = Number(data.get('month'))
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Pick a month')
  return { year, month }
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
      glyphs: asset('fonts/{fontstack}/{range}.pbf'),
      sources: {
        land: { type: 'geojson', data: asset('land.geojson') },
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
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
  // Top right with the zoom buttons, clear of the guess panel at the bottom.
  map.addControl(
    new AttributionControl({
      compact: true,
      customAttribution: [
        'Borders: <a href="https://github.com/Seshat-Global-History-Databank/cliopatria">Cliopatria</a> (Seshat), ' +
          '<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, simplified',
        'Borders since 1825: <a href="https://www.openhistoricalmap.org/">OpenHistoricalMap</a>',
        'Land: <a href="https://www.naturalearthdata.com/">Natural Earth</a>',
      ],
    }),
    'top-right',
  )
  return new Promise((resolve) =>
    map.on('load', () => {
      // Fit the inhabited world between the top bar and the guess panel, whatever the screen shape.
      map.fitBounds([[-170, -50], [180, 75]], { padding: { top: 70, bottom: 170, left: 10, right: 10 }, animate: false })
      // MapLibre opens the compact attribution at first; start it collapsed behind its (i) button.
      map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      resolve(map)
    }),
  )
}

function describe(result: RoundResult, precision: Precision): string {
  const unit = precision === 'month' ? 'month' : 'year'
  const miss = result.direction === 'correct'
    ? 'spot on!'
    : `${result.off} ${unit}${result.off === 1 ? '' : 's'} ${result.direction === 'later' ? 'too early' : 'too late'}`
  return `${ratingEmoji(result.points)} You said ${formatDate(result.guess)}, it was ${formatDate(result.answer)}: ${miss} +${result.points} points`
}

async function start() {
  const daily = await loadPuzzle()
  if (devParams.has('reset')) saveResults(daily.day, [])
  const results = loadResults(daily.day)
  const map = await createMap()
  const source = (id: string) => map.getSource<GeoJSONSource>(id)!
  const rounds = daily.rounds.length
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
    if (index >= rounds) {
      // The last map stays on screen behind the results popup.
      const points = results.reduce((sum, r) => sum + r.points, 0)
      form.hidden = true
      progress.textContent = 'Done'
      prompt.textContent = `That's today's ${rounds} maps done: ${points} of ${rounds * 1000} points.`
      status.textContent = ''
      totalScore.textContent = `${points} of ${rounds * 1000} points`
      shareTextArea.value = shareText(results, rounds)
      renderShareLinks(shareLinks, shareTextArea.value)
      showResultsButton.hidden = false
      if (!intro.open) resultsDialog.showModal()
      return
    }
    const round = daily.rounds[index]
    const { map: layers } = round
    // The puzzle file is plain GeoJSON; its shared type just leaves geometry untyped.
    const geojson = (layer: FeatureCollection) => layer as unknown as Exclude<MapData, string>
    source('polities').setData(geojson(layers.polities))
    source('groups').setData(geojson(layers.groups))
    source('labels').setData(geojson(layers.labels))
    monthField.hidden = !asksMonth(round)
    progress.textContent = `Map ${index + 1}/${rounds}`
    prompt.textContent = asksMonth(round) ? 'When is this map from? Guess the month and year.' : 'When is this map from? Guess the year.'
    status.textContent = ''
    form.reset()
    form.hidden = false
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const index = results.length
    const { precision, answer } = daily.rounds[index]
    const askMonth = asksMonth(daily.rounds[index])
    try {
      const guess = parseGuess(new FormData(form), daily, askMonth)
      results.push({ ...score(answer, guess, precision), guess, answer })
      saveResults(daily.day, results)
      renderHistory()
      form.hidden = true
      status.textContent = describe(results[index], precision)
      nextButton.textContent = index + 1 < rounds ? 'Next map' : 'See your score'
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
