/*
 * Fetch REAL California licensed cannabis retailers from the state regulator.
 *
 *   node tools/fetch-ca.mjs
 *
 * Source: California Department of Cannabis Control, Cannabis Unified License
 * Search. Public record, no auth. This is the same API that powers
 * https://search.cannabis.ca.gov/ and it refreshes daily.
 *
 * Two traps this file exists to avoid:
 *
 *   1. pageSize SILENTLY CAPS AT 1000. Asking for 2000 returns 1000 with no
 *      error and no warning, so a naive "one big page" fetch loses two thirds
 *      of the data and looks like it worked. We paginate on hasNext and then
 *      assert the final count against the server's own totalCount.
 *
 *   2. The API has no ratings, hours or prices. Those fields are therefore
 *      ABSENT from the output rather than filled in. Inventing a rating for a
 *      real, named business is defamatory nonsense; an invented opening time
 *      sends someone to a locked door.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API = "https://as-dcc-pub-cann-w-p-002.azurewebsites.net";
const PAGE_SIZE = 1000; // the server's real ceiling
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Licence types that mean "a member of the public can buy cannabis here". */
const RETAIL_TYPES = [
  "Commercial -  Retailer",
  "Commercial -  Retailer - Non-Storefront",
  "Commercial -  Microbusiness",
];

const ACCESS_BY_DESIGNATION = {
  "Adult-Use": "rec",
  Medicinal: "med",
  "Adult-Use and Medicinal": "both",
};

const UNKNOWN = /^(data not available|n\/a|none)?$/i;
const clean = (v) => {
  const s = String(v ?? "").trim();
  return UNKNOWN.test(s) ? "" : s;
};

/** "HAYWARD" / "n hollywood" -> "Hayward" / "N Hollywood". */
function titleCase(s) {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Llc|Inc)\b/g, (m) => m.toUpperCase());
}

async function getPage(pageNumber) {
  const url =
    API +
    "/licenses/filteredSearch?pageNumber=" + pageNumber +
    "&pageSize=" + PAGE_SIZE +
    "&licenseStatus=Active";
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("DCC API " + res.status + " on page " + pageNumber);
  return res.json();
}

console.log("Fetching active California licences from the DCC...");

const all = [];
let page = 1;
let reportedTotal = null;
let refreshed = null;

for (;;) {
  const body = await getPage(page);
  const meta = body.metadata;
  reportedTotal = meta.totalCount;
  all.push(...body.data);
  if (body.data[0] && !refreshed) refreshed = body.data[0].dataRefreshedDate;
  console.log(
    "  page " + page + "/" + meta.totalPages +
    "  (+" + body.data.length + ", " + all.length + "/" + meta.totalCount + ")"
  );
  if (!meta.hasNext) break;
  page += 1;
  if (page > 100) throw new Error("Runaway pagination; aborting.");
}

// The whole point of trap #1: prove we got everything the server says exists.
if (all.length !== reportedTotal) {
  throw new Error(
    "Incomplete fetch: got " + all.length + " of " + reportedTotal +
    " active licences. Refusing to write a partial dataset."
  );
}
console.log("Fetched " + all.length + " active licences (server agrees).");

const retail = all.filter((r) => RETAIL_TYPES.includes(r.licenseType));
console.log("Of those, " + retail.length + " are retail licences.");

const listings = [];
const skipped = { noName: 0, addressWithheld: 0, noZip: 0 };

for (const r of retail) {
  const name = clean(r.businessDbaName) || clean(r.businessLegalName);
  const lat = Number(r.premiseLatitude);
  const lng = Number(r.premiseLongitude);
  const zip = clean(r.premiseZipCode).slice(0, 5);

  // A listing nobody can find or name is worse than no listing.
  if (!name) {
    skipped.noName += 1;
    continue;
  }
  // The state withholds some premise addresses entirely ("Not Published").
  // Those licences are real but unplaceable, so they are counted and
  // disclosed rather than silently dropped.
  const hasCoords =
    Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const city = titleCase(clean(r.premiseCity));
  if (!hasCoords && !city) {
    skipped.addressWithheld += 1;
    continue;
  }
  if (!/^\d{5}$/.test(zip)) {
    skipped.noZip += 1;
    continue;
  }

  const nonStorefront = r.licenseType.includes("Non-Storefront");

  listings.push({
    id: r.licenseNumber,
    name,
    legalName: clean(r.businessLegalName),
    city,
    state: clean(r.premiseState) || "CA",
    county: clean(r.premiseCounty),
    zip,
    street: clean(r.premiseStreetAddress),
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
    phone: clean(r.businessPhone),
    access: ACCESS_BY_DESIGNATION[clean(r.licenseDesignation)] || "rec",
    storefront: !nonStorefront,
    delivery: nonStorefront, // the only delivery fact the state actually asserts
    licenseType: r.licenseType.replace(/Commercial -\s+/, ""),
    expires: (r.expirationDate || "").slice(0, 10),
  });
}

console.log("Skipped:", JSON.stringify(skipped));
console.log("Writing " + listings.length + " real retailers.");

listings.sort(
  (a, b) =>
    a.state.localeCompare(b.state) ||
    a.city.localeCompare(b.city) ||
    a.name.localeCompare(b.name)
);

mkdirSync(join(root, "assets", "data"), { recursive: true });
const out = {
  source: "California Department of Cannabis Control - Cannabis Unified License Search",
  sourceUrl: "https://search.cannabis.ca.gov/",
  licenseNote: "Public record. Active retail licences only.",
  dataRefreshedDate: refreshed,
  fetchedAt: new Date().toISOString(),
  count: listings.length,
  addressWithheldCount: skipped.addressWithheld,
  listings,
};
const target = join(root, "assets", "data", "ca.json");
const json = JSON.stringify(out);
writeFileSync(target, json, "utf8");
console.log("wrote " + target + " (" + (json.length / 1024).toFixed(0) + " kB)");

/* Sanity: the three the user named by hand must be present. */
const mustHave = [
  ["MMD Redwood City", "Redwood City"],
  ["Garden of Eden", "Hayward"],
  ["Flor", "Union City"],
];
for (const [name, city] of mustHave) {
  const hit = listings.find((l) => l.name === name && l.city === city);
  console.log(hit ? "  OK   " + name + ", " + city + " -> " + hit.id : "  MISS " + name + ", " + city);
}
