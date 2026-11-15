/*
 * FAST GAS - nationwide dispensary directory data layer.
 *
 * Three kinds of data live here, and the difference matters:
 *
 *   1. ZIP3_RANGES   - real, public USPS ZIP-prefix-to-state allocations.
 *   2. STATES        - a cannabis-program status SNAPSHOT. Laws change; every
 *                      surface that renders this must carry the "confirm with
 *                      your state regulator" caveat. Never legal advice.
 *   3. METROS/LISTINGS - SAMPLE listings. Real cities, real ZIPs, FICTIONAL
 *                      businesses, generated deterministically from a seed.
 *                      Never fabricate a real dispensary's name or phone number.
 *
 * Swapping in a live feed means replacing buildListings() only. Everything
 * downstream reads the shape it returns.
 */

export const DATA_AS_OF = "November 2026";

/* ---------------------------------------------------------------------------
 * 1. ZIP prefix -> state. Public USPS allocation: [lowPrefix, highPrefix, state].
 * ------------------------------------------------------------------------- */
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

/* ---------------------------------------------------------------------------
 * 2. State program snapshot.
 *    program: "rec"  adult-use + medical
 *             "med"  medical patients only
 *             "cbd"  low-THC / CBD only
 *             "none" no public state program
 * ------------------------------------------------------------------------- */
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

/* ---------------------------------------------------------------------------
 * 3. Metros. Real cities / coordinates / ZIPs - the anchors sample listings
 *    hang off of. Only adult-use and medical states carry listings.
 * ------------------------------------------------------------------------- */
export const METROS = [
  { city: "Los Angeles",      state: "CA", lat: 34.052, lng: -118.244, zips: ["90012", "90026", "90028", "90046", "90291"], count: 6 },
  { city: "San Francisco",    state: "CA", lat: 37.775, lng: -122.419, zips: ["94102", "94103", "94110", "94117", "94122"], count: 5 },
  { city: "Oakland",          state: "CA", lat: 37.804, lng: -122.271, zips: ["94601", "94607", "94609", "94612"], count: 4 },
  { city: "San Diego",        state: "CA", lat: 32.716, lng: -117.161, zips: ["92101", "92104", "92109"], count: 4 },
  { city: "Sacramento",       state: "CA", lat: 38.582, lng: -121.494, zips: ["95814", "95816", "95818"], count: 3 },
  { city: "Denver",           state: "CO", lat: 39.739, lng: -104.990, zips: ["80202", "80205", "80211", "80218"], count: 5 },
  { city: "Colorado Springs", state: "CO", lat: 38.834, lng: -104.821, zips: ["80903", "80905"], count: 3 },
  { city: "Portland",         state: "OR", lat: 45.512, lng: -122.658, zips: ["97201", "97209", "97214", "97232"], count: 5 },
  { city: "Eugene",           state: "OR", lat: 44.052, lng: -123.087, zips: ["97401", "97402"], count: 3 },
  { city: "Seattle",          state: "WA", lat: 47.606, lng: -122.332, zips: ["98101", "98104", "98122", "98133"], count: 5 },
  { city: "Spokane",          state: "WA", lat: 47.659, lng: -117.425, zips: ["99201", "99202"], count: 3 },
  { city: "Las Vegas",        state: "NV", lat: 36.170, lng: -115.140, zips: ["89101", "89109", "89119", "89146"], count: 5 },
  { city: "Reno",             state: "NV", lat: 39.530, lng: -119.814, zips: ["89501", "89502"], count: 3 },
  { city: "Phoenix",          state: "AZ", lat: 33.448, lng: -112.074, zips: ["85003", "85006", "85012", "85016"], count: 5 },
  { city: "Mesa",             state: "AZ", lat: 33.415, lng: -111.831, zips: ["85201", "85210"], count: 2 },
  { city: "Tucson",           state: "AZ", lat: 32.222, lng: -110.974, zips: ["85701", "85705"], count: 3 },
  { city: "Chicago",          state: "IL", lat: 41.878, lng:  -87.630, zips: ["60601", "60607", "60614", "60622", "60647"], count: 6 },
  { city: "Detroit",          state: "MI", lat: 42.331, lng:  -83.046, zips: ["48201", "48207", "48226"], count: 4 },
  { city: "Ann Arbor",        state: "MI", lat: 42.281, lng:  -83.743, zips: ["48103", "48104"], count: 3 },
  { city: "Boston",           state: "MA", lat: 42.360, lng:  -71.059, zips: ["02108", "02116", "02118", "02130"], count: 4 },
  { city: "New York",         state: "NY", lat: 40.713, lng:  -74.006, zips: ["10001", "10011", "10013", "10019"], count: 6 },
  { city: "Brooklyn",         state: "NY", lat: 40.678, lng:  -73.944, zips: ["11201", "11216", "11222"], count: 4 },
  { city: "Newark",           state: "NJ", lat: 40.736, lng:  -74.172, zips: ["07102", "07103"], count: 3 },
  { city: "Jersey City",      state: "NJ", lat: 40.728, lng:  -74.078, zips: ["07302", "07306"], count: 3 },
  { city: "Baltimore",        state: "MD", lat: 39.290, lng:  -76.612, zips: ["21201", "21211", "21230"], count: 4 },
  { city: "Washington",       state: "DC", lat: 38.907, lng:  -77.037, zips: ["20001", "20009", "20010"], count: 3 },
  { city: "Minneapolis",      state: "MN", lat: 44.978, lng:  -93.265, zips: ["55401", "55408", "55414"], count: 3 },
  { city: "St. Louis",        state: "MO", lat: 38.627, lng:  -90.200, zips: ["63101", "63110", "63118"], count: 4 },
  { city: "Kansas City",      state: "MO", lat: 39.100, lng:  -94.579, zips: ["64108", "64111"], count: 3 },
  { city: "Columbus",         state: "OH", lat: 39.961, lng:  -82.999, zips: ["43201", "43206", "43215"], count: 4 },
  { city: "Cleveland",        state: "OH", lat: 41.505, lng:  -81.681, zips: ["44113", "44114"], count: 3 },
  { city: "Albuquerque",      state: "NM", lat: 35.085, lng: -106.651, zips: ["87102", "87106", "87110"], count: 4 },
  { city: "Hartford",         state: "CT", lat: 41.764, lng:  -72.685, zips: ["06103", "06106"], count: 3 },
  { city: "Providence",       state: "RI", lat: 41.824, lng:  -71.413, zips: ["02903", "02906"], count: 2 },
  { city: "Portland",         state: "ME", lat: 43.661, lng:  -70.255, zips: ["04101", "04102"], count: 3 },
  { city: "Burlington",       state: "VT", lat: 44.476, lng:  -73.212, zips: ["05401", "05403"], count: 2 },
  { city: "Anchorage",        state: "AK", lat: 61.218, lng: -149.900, zips: ["99501", "99503"], count: 3 },
  { city: "Billings",         state: "MT", lat: 45.783, lng: -108.501, zips: ["59101", "59102"], count: 2 },
  { city: "Richmond",         state: "VA", lat: 37.541, lng:  -77.436, zips: ["23219", "23220"], count: 2 },
  { city: "Wilmington",       state: "DE", lat: 39.746, lng:  -75.547, zips: ["19801", "19806"], count: 2 },
  { city: "Miami",            state: "FL", lat: 25.762, lng:  -80.192, zips: ["33101", "33127", "33139"], count: 4 },
  { city: "Orlando",          state: "FL", lat: 28.538, lng:  -81.379, zips: ["32801", "32803"], count: 3 },
  { city: "Tampa",            state: "FL", lat: 27.951, lng:  -82.457, zips: ["33602", "33606"], count: 3 },
  { city: "Oklahoma City",    state: "OK", lat: 35.468, lng:  -97.521, zips: ["73102", "73106"], count: 4 },
  { city: "Tulsa",            state: "OK", lat: 36.154, lng:  -95.993, zips: ["74103", "74104"], count: 3 },
  { city: "Philadelphia",     state: "PA", lat: 39.953, lng:  -75.165, zips: ["19102", "19123", "19147"], count: 4 },
  { city: "Pittsburgh",       state: "PA", lat: 40.441, lng:  -79.996, zips: ["15213", "15222"], count: 3 },
  { city: "New Orleans",      state: "LA", lat: 29.951, lng:  -90.072, zips: ["70112", "70130"], count: 2 },
  { city: "Little Rock",      state: "AR", lat: 34.747, lng:  -92.290, zips: ["72201", "72202"], count: 2 },
  { city: "Salt Lake City",   state: "UT", lat: 40.761, lng: -111.891, zips: ["84101", "84111"], count: 2 },
  { city: "Honolulu",         state: "HI", lat: 21.307, lng: -157.858, zips: ["96813", "96815"], count: 2 },
  { city: "Jackson",          state: "MS", lat: 32.299, lng:  -90.185, zips: ["39201", "39202"], count: 2 },
  { city: "Birmingham",       state: "AL", lat: 33.521, lng:  -86.802, zips: ["35203", "35205"], count: 2 },
  { city: "Louisville",       state: "KY", lat: 38.253, lng:  -85.758, zips: ["40202", "40204"], count: 2 },
  { city: "Charleston",       state: "WV", lat: 38.350, lng:  -81.633, zips: ["25301", "25302"], count: 2 },
  { city: "Manchester",       state: "NH", lat: 42.996, lng:  -71.455, zips: ["03101", "03104"], count: 2 },
  { city: "Fargo",            state: "ND", lat: 46.877, lng:  -96.790, zips: ["58102", "58103"], count: 2 },
  { city: "Sioux Falls",      state: "SD", lat: 43.550, lng:  -96.701, zips: ["57104", "57105"], count: 2 },
  { city: "Omaha",            state: "NE", lat: 41.257, lng:  -95.934, zips: ["68102", "68105"], count: 2 },
];

/* ---------------------------------------------------------------------------
 * Deterministic sample-listing generator.
 * mulberry32 keeps every reload identical, so a shared link shows the same
 * results to whoever opens it next.
 * ------------------------------------------------------------------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Golden Hour", "Verdant", "Lavender Lane", "High Noon", "Emerald Index",
  "Gilded Leaf", "Northstar", "Quiet Giant", "Green Sovereign", "Amber Room",
  "Violet Hour", "Low Key", "Field Notes", "Honest Gram", "Sun Grown",
  "Cold Press", "Terrace", "Mother Tongue", "Bright Side", "Common Good",
  "Third Coast", "Paper Crane", "Slow Burn", "Future Leaf", "Civic",
  "Lantern", "Salt & Soil", "Open Window", "Hazel & Gold", "Steady Hand",
];
const SECOND = [
  "Collective", "Dispensary", "Cannabis Co.", "Provisions", "Apothecary",
  "Society", "Supply", "Botanica", "Rooms", "Market",
];
const STREETS = [
  "Market St", "Oak Ave", "Cedar Blvd", "Mission St", "Union Ave", "Grand Blvd",
  "Franklin St", "Highland Ave", "Bay St", "Lincoln Way", "Alder St", "Jasper Ln",
];
const SERVICE_POOL = [
  "Delivery", "Curbside", "In-store pickup", "ADA accessible", "Walk-ins",
  "Online order", "Veteran discount", "First-time deal", "Cash + debit", "Lounge on site",
];
const CATEGORY_POOL = [
  "Flower", "Pre-rolls", "Edibles", "Vapes", "Concentrates", "Topicals",
  "Tinctures", "Seeds", "Beverages",
];

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

function pickSome(rand, list, n) {
  const copy = [...list];
  const out = [];
  for (let i = 0; i < n && copy.length; i += 1) {
    out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  }
  return out;
}

/** Hours in minutes-from-midnight, so "open now" is a real comparison. */
function makeHours(rand) {
  return {
    open: [8, 9, 10, 11][Math.floor(rand() * 4)] * 60,
    close: [19, 20, 21, 22, 23][Math.floor(rand() * 5)] * 60,
  };
}

export function buildListings() {
  const out = [];
  let id = 0;

  METROS.forEach((metro, metroIndex) => {
    const state = STATE_BY_CODE[metro.state];
    if (!state || state.program === "none" || state.program === "cbd") return;

    const rand = mulberry32(0x9e37 + metroIndex * 7919);
    const used = new Set();

    for (let i = 0; i < metro.count; i += 1) {
      let name = pick(rand, FIRST) + " " + pick(rand, SECOND);
      let guard = 0;
      while (used.has(name) && guard < 30) {
        name = pick(rand, FIRST) + " " + pick(rand, SECOND);
        guard += 1;
      }
      used.add(name);

      const services = pickSome(rand, SERVICE_POOL, 3 + Math.floor(rand() * 3));
      // A medical-only state cannot host adult-use walk-in retail.
      const access = state.program === "rec" ? (rand() > 0.72 ? "both" : "rec") : "med";

      id += 1;
      out.push({
        id: "fg-" + String(id).padStart(4, "0"),
        name,
        city: metro.city,
        state: metro.state,
        stateName: state.name,
        zip: pick(rand, metro.zips),
        street: 100 + Math.floor(rand() * 4800) + " " + pick(rand, STREETS),
        lat: metro.lat + (rand() - 0.5) * 0.14,
        lng: metro.lng + (rand() - 0.5) * 0.14,
        rating: Math.round((3.8 + rand() * 1.2) * 10) / 10,
        reviews: 40 + Math.floor(rand() * 900),
        access,
        program: state.program,
        hours: makeHours(rand),
        services,
        categories: pickSome(rand, CATEGORY_POOL, 4 + Math.floor(rand() * 4)),
        priceTier: ["$", "$$", "$$$"][Math.floor(rand() * 3)],
        delivery: services.includes("Delivery"),
        verified: rand() > 0.45,
      });
    }
  });

  return out;
}

/** Great-circle miles, for the "N mi away" line after a ZIP or city search. */
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

/** Nearest anchor for a ZIP: exact ZIP match first, then first metro in state. */
export function anchorForZip(zip) {
  const exact = METROS.find((m) => m.zips.includes(zip));
  if (exact) return exact;
  const state = stateFromZip(zip);
  if (!state) return null;
  const inState = METROS.filter((m) => m.state === state);
  return inState.length ? inState[0] : null;
}
