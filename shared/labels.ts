// Some OHM names carry their date range, e.g. "Japan (1953-1968)", "Ethiopia (1993-)" or
// "United Provinces of the Río de la Plata 1828-1831", which would give the answer away.
const YEAR_RANGE = String.raw`\d{3,4}\s*[-–—]\s*(?:\d{3,4})?`
const DATED_SUFFIX = new RegExp(String.raw`\s*(?:\(\s*${YEAR_RANGE}\s*\)|\s${YEAR_RANGE})\s*$`)

export const stripDates = (name: string) => name.replace(DATED_SUFFIX, '').trim()
