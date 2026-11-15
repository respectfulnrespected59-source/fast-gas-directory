/*
 * FAST GAS - data layer.
 *
 * EVERYTHING HERE IS FACTUAL. There is no generated, sample or placeholder
 * business data anywhere in this file or in what it loads. An earlier version
 * of this app shipped invented listings; that was wrong for a directory, whose
 * entire job is to send a real person to a real door.
 *
 * Three kinds of fact:
 *
 *   1. ZIP3_RANGES - public USPS ZIP-prefix-to-state allocation.
 *   2. STATES      - cannabis programme status per state. A snapshot with a
 *                    named regulator; laws change, so every surface that
 *                    renders it carries the "confirm with your regulator"
 *                    caveat. Not legal advice.
 *   3. COVERAGE    - which states we hold real licensed-retailer data for,
 *                    where it came from, and when. States not listed here
 *                    report "not yet covered" rather than showing nothing and
 *                    letting you assume there is nothing there.
 *
 * Retailer records come from state regulators' public licence registers and
 * are fetched by the scripts in tools/. They carry NO ratings, opening hours
 * or prices, because regulators do not publish those and inventing them about
 * a named real business is not acceptable.
 */

export const ZIP3_RANGES = [
  [  5,   5, "NY"], [  6,   9, "PR"], [ 10,  27, "MA"], [ 28,  29, "RI"],
  [ 30,  38, "NH"], [ 39,  49, "ME"], [ 50,  59, "VT"], [ 60,  69, "CT"],
  [ 70,  89, "NJ"], [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"],
  [200, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"],
  [270, 289, "NC"], [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"],
  [350, 369, "AL"], [370, 385, "TN"], [386, 397, "MS"], [398, 399, "GA"],
  [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"], [480, 499, "MI"],
  [500, 528, "IA"], [530, 549, "WI"], [550, 567, "MN"], [570, 577, "SD"],
  [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"],
  [660, 679, "KS"], [680, 693, "NE"], [700, 714, "LA"], [716, 729, "AR"],
  [730, 749, "OK"], [750, 799, "TX"], [800, 816, "CO"], [820, 831, "WY"],
  [832, 838, "ID"], [840, 847, "UT"], [850, 865, "AZ"], [870, 884, "NM"],
  [885, 885, "TX"], [889, 898, "NV"], [900, 961, "CA"], [967, 968, "HI"],
  [970, 979, "OR"], [980, 994, "WA"], [995, 999, "AK"],
];

export function stateFromZip(zip) {
  if (!/^\d{5}$/.test(zip)) return null;
  const prefix = Number(zip.slice(0, 3));
  for (const [low, high, state] of ZIP3_RANGES) {
    if (prefix >= low && prefix <= high) return state;
  }
  return null;
}

export const STATES = [
  { code: "AL", name: "Alabama",          program: "med",  regulator: "Alabama Medical Cannabis Commission" },
  { code: "AK", name: "Alaska",           program: "rec",  regulator: "Alaska Alcohol & Marijuana Control Office" },
  { code: "AZ", name: "Arizona",          program: "rec",  regulator: "Arizona Dept. of Health Services" },
  { code: "AR", name: "Arkansas",         program: "med",  regulator: "Arkansas Dept. of Finance & Administration" },
  { code: "CA", name: "California",       program: "rec",  regulator: "California Dept. of Cannabis Control" },
  { code: "CO", name: "Colorado",         program: "rec",  regulator: "Colorado Marijuana Enforcement Division" },
  { code: "CT", name: "Connecticut",      program: "rec",  regulator: "Connecticut Dept. of Consumer Protection" },
  { code: "DE", name: "Delaware",         program: "rec",  regulator: "Delaware Office of the Marijuana Commissioner" },
  { code: "DC", name: "Washington, D.C.", program: "rec",  regulator: "D.C. Alcoholic Beverage & Cannabis Administration" },
  { code: "FL", name: "Florida",          program: "med",  regulator: "Florida Office of Medical Marijuana Use" },
  { code: "GA", name: "Georgia",          program: "cbd",  regulator: "Georgia Access to Medical Cannabis Commission" },
  { code: "HI", name: "Hawaii",           program: "med",  regulator: "Hawaii Dept. of Health" },
  { code: "ID", name: "Idaho",            program: "none", regulator: "No state cannabis program" },
  { code: "IL", name: "Illinois",         program: "rec",  regulator: "Illinois Dept. of Financial & Professional Regulation" },
  { code: "IN", name: "Indiana",          program: "cbd",  regulator: "Indiana - low-THC products only" },
  { code: "IA", name: "Iowa",             program: "cbd",  regulator: "Iowa Dept. of Health & Human Services" },
  { code: "KS", name: "Kansas",           program: "cbd",  regulator: "Kansas - low-THC products only" },
  { code: "KY", name: "Kentucky",         program: "med",  regulator: "Kentucky Office of Medical Cannabis" },
  { code: "LA", name: "Louisiana",        program: "med",  regulator: "Louisiana Dept. of Health" },
  { code: "ME", name: "Maine",            program: "rec",  regulator: "Maine Office of Cannabis Policy" },
  { code: "MD", name: "Maryland",         program: "rec",  regulator: "Maryland Cannabis Administration" },
  { code: "MA", name: "Massachusetts",    program: "rec",  regulator: "Massachusetts Cannabis Control Commission" },
  { code: "MI", name: "Michigan",         program: "rec",  regulator: "Michigan Cannabis Regulatory Agency" },
  { code: "MN", name: "Minnesota",        program: "rec",  regulator: "Minnesota Office of Cannabis Management" },
  { code: "MS", name: "Mississippi",      program: "med",  regulator: "Mississippi State Dept. of Health" },
  { code: "MO", name: "Missouri",         program: "rec",  regulator: "Missouri Division of Cannabis Regulation" },
  { code: "MT", name: "Montana",          program: "rec",  regulator: "Montana Cannabis Control Division" },
  { code: "NE", name: "Nebraska",         program: "med",  regulator: "Nebraska Medical Cannabis Commission" },
  { code: "NV", name: "Nevada",           program: "rec",  regulator: "Nevada Cannabis Compliance Board" },
  { code: "NH", name: "New Hampshire",    program: "med",  regulator: "New Hampshire Therapeutic Cannabis Program" },
  { code: "NJ", name: "New Jersey",       program: "rec",  regulator: "New Jersey Cannabis Regulatory Commission" },
  { code: "NM", name: "New Mexico",       program: "rec",  regulator: "New Mexico Cannabis Control Division" },
  { code: "NY", name: "New York",         program: "rec",  regulator: "New York Office of Cannabis Management" },
  { code: "NC", name: "North Carolina",   program: "cbd",  regulator: "North Carolina - low-THC products only" },
  { code: "ND", name: "North Dakota",     program: "med",  regulator: "North Dakota Dept. of Health & Human Services" },
  { code: "OH", name: "Ohio",             program: "rec",  regulator: "Ohio Division of Cannabis Control" },
  { code: "OK", name: "Oklahoma",         program: "med",  regulator: "Oklahoma Medical Marijuana Authority" },
  { code: "OR", name: "Oregon",           program: "rec",  regulator: "Oregon Liquor & Cannabis Commission" },
  { code: "PA", name: "Pennsylvania",     program: "med",  regulator: "Pennsylvania Dept. of Health" },
  { code: "RI", name: "Rhode Island",     program: "rec",  regulator: "Rhode Island Cannabis Control Commission" },
  { code: "SC", name: "South Carolina",   program: "cbd",  regulator: "South Carolina - low-THC products only" },
  { code: "SD", name: "South Dakota",     program: "med",  regulator: "South Dakota Dept. of Health" },
  { code: "TN", name: "Tennessee",        program: "cbd",  regulator: "Tennessee - low-THC products only" },
  { code: "TX", name: "Texas",            program: "cbd",  regulator: "Texas Compassionate Use Program" },
  { code: "UT", name: "Utah",             program: "med",  regulator: "Utah Dept. of Health & Human Services" },
  { code: "VT", name: "Vermont",          program: "rec",  regulator: "Vermont Cannabis Control Board" },
  { code: "VA", name: "Virginia",         program: "rec",  regulator: "Virginia Cannabis Control Authority" },
  { code: "WA", name: "Washington",       program: "rec",  regulator: "Washington State Liquor & Cannabis Board" },
  { code: "WV", name: "West Virginia",    program: "med",  regulator: "West Virginia Office of Medical Cannabis" },
  { code: "WI", name: "Wisconsin",        program: "cbd",  regulator: "Wisconsin - low-THC products only" },
  { code: "WY", name: "Wyoming",          program: "none", regulator: "No state cannabis program" },
];

export const STATE_BY_CODE = Object.fromEntries(STATES.map((s) => [s.code, s]));

export const PROGRAM_LABELS = {
  rec:  { short: "Adult-use",  long: "Adult-use + medical",     tone: "money" },
  med:  { short: "Medical",    long: "Medical patients only",   tone: "lavender" },
  cbd:  { short: "Low-THC",    long: "Low-THC / CBD only",      tone: "gold" },
  none: { short: "No program", long: "No public state program", tone: "muted" },
};

export const ACCESS_LABELS = {
  rec: "Adult-use 21+",
  med: "Medical patients only",
  both: "Adult-use + medical",
};

/*
 * States we hold verified retailer data for. Adding a state means writing a
 * fetcher in tools/, dropping its JSON in assets/data/, and adding one row
 * here. Nothing else in the app changes.
 */
export const COVERAGE = [
  {
    state: "CA",
    file: "assets/data/ca.json",
    source: "California Dept. of Cannabis Control",
    sourceUrl: "https://search.cannabis.ca.gov/",
  },
];

export const COVERED_STATES = new Set(COVERAGE.map((c) => c.state));

/**
 * Load every covered state's register.
 * A state whose file fails to load is reported, never silently treated as
 * empty - "no listings" and "we could not load the listings" are different
 * answers and must not look alike.
 */
export async function loadListings() {
  const listings = [];
  const sources = [];
  const errors = [];

  await Promise.all(
    COVERAGE.map(async (entry) => {
      try {
        const res = await fetch(entry.file, { cache: "no-cache" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const body = await res.json();
        listings.push(...body.listings);
        sources.push({
          state: entry.state,
          source: body.source || entry.source,
          sourceUrl: entry.sourceUrl,
          refreshed: (body.dataRefreshedDate || body.fetchedAt || "").slice(0, 10),
          count: body.count ?? body.listings.length,
          addressWithheldCount: body.addressWithheldCount || 0,
        });
      } catch (cause) {
        errors.push({ state: entry.state, message: String(cause.message || cause) });
      }
    })
  );

  return { listings, sources, errors };
}

/** Great-circle miles. */
export function haversineMiles(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 7917.5 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function centroid(items) {
  const placed = items.filter((l) => l.lat !== null && l.lng !== null);
  if (!placed.length) return null;
  const lat = placed.reduce((sum, l) => sum + l.lat, 0) / placed.length;
  const lng = placed.reduce((sum, l) => sum + l.lng, 0) / placed.length;
  return { lat, lng };
}

/**
 * Turn a ZIP into a point to measure distance from.
 *
 * Derived from the real retailer coordinates we already hold rather than from
 * a table of invented city centres: exact ZIP first, then the surrounding ZIP3
 * area, then the state. Returns null when we have nothing real to anchor on,
 * which the UI reports rather than guessing.
 */
export function anchorForZip(zip, listings) {
  if (!/^\d{5}$/.test(zip)) return null;

  const exact = centroid(listings.filter((l) => l.zip === zip));
  if (exact) return { ...exact, precision: "zip" };

  const prefix = zip.slice(0, 3);
  const near = centroid(listings.filter((l) => l.zip.startsWith(prefix)));
  if (near) return { ...near, precision: "area" };

  const code = stateFromZip(zip);
  const inState = centroid(listings.filter((l) => l.state === code));
  if (inState) return { ...inState, precision: "state" };

  return null;
}

/** Anchor for a named city, from that city's own retailers. */
export function anchorForCity(city, listings) {
  const lower = city.trim().toLowerCase();
  const hit = centroid(listings.filter((l) => l.city.toLowerCase() === lower));
  return hit ? { ...hit, precision: "city" } : null;
}
