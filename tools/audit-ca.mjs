/**
 * Audit EVERY California listing against the LIVE state register - the
 * real-locations-only rule as a check that can fail.
 *
 *   node tools/audit-ca.mjs                       audit assets/data/ca.json
 *   node tools/audit-ca.mjs <file> --plant        add two known-bad records
 *                                                 (an invented shop, a real
 *                                                 one moved 2 km): MUST exit 1
 *
 * A listing passes only when the California DCC lists its licence as Active,
 * it is a retail licence, its expiry date has not passed (ours or the
 * register's), its street and ZIP match the register, and its pin sits within
 * 50 m of the state's own premise coordinates.
 *
 * Exit codes - the workflow tells drift from an outage by these:
 *   0  every listing passes (new shops may still be waiting - see new_shops)
 *   1  at least one listing failed: the directory is WRONG somewhere
 *   2  the audit could not run (register unreachable, partial, bad file)
 *
 * New retail licences that tools/fetch-ca.mjs WOULD list but the file does not
 * hold yet are reported as new_shops and do not fail: a missing shop makes the
 * directory incomplete, a stale one makes it wrong.
 *
 * In GitHub Actions it writes `failing` / `new_shops` to $GITHUB_OUTPUT (only
 * when the audit ran) and a table to $GITHUB_STEP_SUMMARY.
 */
import { appendFileSync, readFileSync } from "node:fs";

const API = "https://as-dcc-pub-cann-w-p-002.azurewebsites.net";
const PAGE_SIZE = 1000; // the server's real ceiling
const RETAIL_TYPES = [
  "Commercial -  Retailer",
  "Commercial -  Retailer - Non-Storefront",
  "Commercial -  Microbusiness",
];
const COORD_TOLERANCE_M = 50;
const CA_BOX = { latMin: 32.5, latMax: 42.1, lngMin: -124.5, lngMax: -114.1 };
const TODAY = new Date().toISOString().slice(0, 10);

// The same "unknown" reading as tools/fetch-ca.mjs.
const UNKNOWN = /^(data not available|n\/a|none)?$/i;
const clean = (v) => {
  const s = String(v ?? "").trim();
  return UNKNOWN.test(s) ? "" : s;
};

/**
 * Would tools/fetch-ca.mjs list this register record? Mirrors its skip rules
 * (no name, address withheld, no ZIP, lapsed expiry) so new_shops can only
 * count shops a refresh would actually add. Change both together.
 */
function wouldList(r) {
  if (!RETAIL_TYPES.includes(r.licenseType)) return false;
  if (!(clean(r.businessDbaName) || clean(r.businessLegalName))) return false;
  const lat = Number(r.premiseLatitude);
  const lng = Number(r.premiseLongitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  if (!hasCoords && !clean(r.premiseCity)) return false;
  if (!/^\d{5}$/.test(clean(r.premiseZipCode).slice(0, 5))) return false;
  const expires = String(r.expirationDate ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(expires) && expires < TODAY) return false;
  return true;
}

const norm = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ");

function meters(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function getPage(n) {
  const url = API + "/licenses/filteredSearch?pageNumber=" + n + "&pageSize=" + PAGE_SIZE + "&licenseStatus=Active";
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error("DCC API " + res.status + " on page " + n);
  return res.json();
}

async function loadRegister() {
  const register = [];
  let total = null;
  for (let n = 1; ; n++) {
    const body = await getPage(n);
    total = body.metadata.totalCount;
    register.push(...body.data);
    if (!body.metadata.hasNext) break;
    if (n > 100) throw new Error("Runaway pagination; aborting.");
  }
  // A partial register would turn real shops into false alarms.
  if (register.length !== total) throw new Error("Incomplete register: " + register.length + " of " + total);
  if (!register.length) throw new Error("The register returned no Active licences.");
  return register;
}

function problemsFor(r, byId) {
  const reg = byId.get(String(r.id).trim());
  if (!reg) return ["not Active in the register"];
  const found = [];
  if (!RETAIL_TYPES.includes(reg.licenseType)) found.push("not a retail licence (" + reg.licenseType + ")");
  const regExpires = String(reg.expirationDate ?? "").slice(0, 10);
  if (regExpires && regExpires < TODAY) found.push("register expiry passed " + regExpires);
  if (r.expires && r.expires < TODAY) found.push("our expiry passed " + r.expires);
  if (r.street && norm(r.street) !== norm(reg.premiseStreetAddress)) found.push("street is now " + reg.premiseStreetAddress);
  if (r.zip && norm(r.zip) !== norm(String(reg.premiseZipCode).slice(0, 5))) found.push("ZIP is now " + reg.premiseZipCode);
  if (r.lat != null) {
    if (r.lat < CA_BOX.latMin || r.lat > CA_BOX.latMax || r.lng < CA_BOX.lngMin || r.lng > CA_BOX.lngMax) found.push("pin outside California");
    const lat = Number(reg.premiseLatitude);
    const lng = Number(reg.premiseLongitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
      const off = meters(r.lat, r.lng, lat, lng);
      if (off > COORD_TOLERANCE_M) found.push("pin " + Math.round(off) + " m from the register");
    }
  }
  return found;
}

async function main() {
  const args = process.argv.slice(2);
  const plant = args.includes("--plant");
  const file = args.find((a) => !a.startsWith("--")) || "assets/data/ca.json";

  const listed = [...(JSON.parse(readFileSync(file, "utf8")).listings ?? [])];
  if (!listed.length) throw new Error("No listings in " + file + " - refusing to call an empty file clean.");
  if (plant) {
    const real = listed.find((r) => r.lat != null);
    if (!real) throw new Error("--plant needs at least one listing with coordinates.");
    listed.push({ id: "C10-9999999-LIC", name: "Planted Fake Shop", street: "1 Nowhere St", city: "Oakland", zip: "94612", lat: 37.8044, lng: -122.2712, expires: "2099-01-01", planted: "invented shop" });
    listed.push({ ...real, lat: real.lat + 0.02, planted: "real shop moved 2 km" });
  }

  const register = await loadRegister();
  const refreshed = register[0]?.dataRefreshedDate ?? "unknown";
  const byId = new Map(register.map((r) => [String(r.licenseNumber).trim(), r]));

  const failing = listed.map((r) => ({ r, why: problemsFor(r, byId) })).filter((x) => x.why.length);
  const listedIds = new Set(listed.map((r) => String(r.id).trim()));
  const newShops = register.filter((r) => wouldList(r) && !listedIds.has(String(r.licenseNumber).trim()));

  console.log("Register: " + register.length + " Active licences, refreshed " + refreshed);
  console.log("Listed:   " + listed.length + " (" + file + ")");
  console.log("Failing:  " + failing.length);
  for (const { r, why } of failing) console.log("  FAIL " + r.id + " " + r.name + " (" + r.city + "): " + why.join("; ") + (r.planted ? "  [planted: " + r.planted + "]" : ""));
  console.log("New shops not listed yet: " + newShops.length);
  for (const r of newShops) console.log("  NEW  " + r.licenseNumber + " " + (r.businessDbaName || r.businessLegalName) + " (" + r.premiseCity + ")");

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, "failing=" + failing.length + "\nnew_shops=" + newShops.length + "\n");
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = failing.map(({ r, why }) => "| " + cell(r.id) + " | " + cell(r.name) + " | " + cell(r.city) + " | " + cell(why.join("; ")) + " |");
    const newRows = newShops.map((r) => "| " + cell(r.licenseNumber) + " | " + cell(r.businessDbaName || r.businessLegalName) + " | " + cell(r.premiseCity) + " | new - not listed yet |");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      "### Licence audit (" + file + ")",
      "Register refreshed " + refreshed + " · " + listed.length + " listed · **" + failing.length + " failing** · " + newShops.length + " new",
      "",
      ...(rows.length + newRows.length ? ["| Licence | Name | City | Finding |", "|---|---|---|---|", ...rows, ...newRows] : ["Every listing matches the register."]),
      "",
    ].join("\n"));
  }
  return failing.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error("AUDIT COULD NOT RUN: " + (error?.message ?? error));
    process.exit(2);
  }
);
