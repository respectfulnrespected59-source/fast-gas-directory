/*
 * Probe for the real-data directory.
 * The sharpest checks here are the NEGATIVE ones: that no rating, opening
 * hour or price has crept back into a card. Those fields are the exact thing
 * this rebuild removed, and a regression would be invisible to a human
 * skimming the page but is a factual claim about a named business.
 */
import { chromium } from "playwright";

const URL = process.env.FG_URL || "http://127.0.0.1:8877/index.html";
const fails = [];
const ok = (c, label, extra) => {
  console.log((c ? "PASS  " : "FAIL  ") + label + (extra ? "   " + extra : ""));
  if (!c) fails.push(label + " " + (extra || ""));
};
const tidy = (s) => String(s || "").replace(/\s+/g, " ").trim();

async function stable(page) {
  let prev = null;
  for (let i = 0; i < 24; i += 1) {
    const now = await page.evaluate(() =>
      [...document.querySelectorAll(".card h3")].map((h) => h.textContent).join("|"));
    if (now && now === prev) return now;
    prev = now;
    await page.waitForTimeout(250);
  }
  return prev;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));

await page.goto(URL, { waitUntil: "networkidle" });
await stable(page);

ok(errs.length === 0, "no console errors", JSON.stringify(errs.slice(0, 2)));

const stats = await page.evaluate(() => ({
  listings: document.getElementById("statListings").textContent,
  states: document.getElementById("statStates").textContent,
  asOf: document.getElementById("asOf").textContent,
}));
const total = Number(stats.listings.replace(/,/g, ""));
ok(total > 1000, "real listings loaded", JSON.stringify(stats));
ok(/^\d{4}-\d{2}-\d{2}$/.test(stats.asOf), "refresh date is a real date", stats.asOf);

/* --- every card must carry a verifiable licence id --- */
const cards = await page.evaluate(() =>
  [...document.querySelectorAll(".card")].map((c) => ({
    name: c.querySelector("h3").textContent,
    text: c.textContent,
  })));
ok(cards.length === 24, "first page renders 24 cards", String(cards.length));
ok(cards.every((c) => /Licence [A-Z0-9-]+/.test(c.text)),
  "every card shows a licence number");

/* --- the negative checks: no invented signals --- */
const ratingLike = cards.filter((c) => /★|\b[0-5]\.\d\s*\/\s*5|\(\d+ reviews?\)/i.test(c.text));
ok(ratingLike.length === 0, "no star ratings on any card", ratingLike.map((c) => c.name).slice(0, 3).join(", "));
const hoursLike = cards.filter((c) => /open now|opens \d|closes \d|\d(am|pm)\b/i.test(c.text));
ok(hoursLike.length === 0, "no opening hours on any card", hoursLike.map((c) => c.name).slice(0, 3).join(", "));
const priceLike = cards.filter((c) => /\$\$?\$?(?![a-z])/i.test(c.text));
ok(priceLike.length === 0, "no price tiers on any card", priceLike.map((c) => c.name).slice(0, 3).join(", "));

/* --- the three retailers the user named by hand must be findable --- */
const mustFind = [
  ["Union City", "Flor"],
  ["Redwood City", "MMD Redwood City"],
  ["94541", "Garden of Eden"],
];
for (const [query, expected] of mustFind) {
  await page.fill("#heroQuery", query);
  await page.click("#heroForm button[type=submit]");
  await stable(page);
  const names = await page.evaluate(() =>
    [...document.querySelectorAll(".card h3")].map((h) => h.textContent));
  ok(names.includes(expected), `search "${query}" finds ${expected}`,
    names.slice(0, 4).join(" | "));
}

/* --- proximity still leads once a location is known --- */
await page.fill("#heroQuery", "94541");
await page.click("#heroForm button[type=submit]");
await stable(page);
await page.selectOption("#sort", "relevance");
await stable(page);
// Read the distance ELEMENT, never a regex over joined textContent. A card's
// text runs "0.2 mi21463 Foothill Blvd" with no separator, so /mi\b/ matches
// nothing, and the ordering assert below would then pass vacuously on [].
const miles = await page.evaluate(() =>
  [...document.querySelectorAll(".card .card-rating")]
    .map((n) => parseFloat(n.textContent))
    .filter((n) => Number.isFinite(n)));
const bands = miles.map((m) => Math.round(m / 0.5));
ok(miles.length > 5, "distances rendered after a ZIP search", String(miles.length));
ok(miles.length > 5 && bands.every((b, i) => i === 0 || b >= bands[i - 1]),
  "nearest-first ordering holds", miles.slice(0, 6).join(", "));

/* --- an uncovered state must say so, not look empty --- */
await page.fill("#heroQuery", "Oklahoma");
await page.click("#heroForm button[type=submit]");
await page.waitForTimeout(900);
const okText = tidy(await page.locator(".empty p").textContent().catch(() => ""));
ok(/not covered yet/i.test(okText) && /will\s+not invent/i.test(okText),
  "uncovered state explains the gap rather than showing a bare empty list",
  okText.slice(0, 90));

/* --- a no-programme state is a different answer again --- */
await page.fill("#heroQuery", "83701");
await page.click("#heroForm button[type=submit]");
await page.waitForTimeout(900);
const idText = tidy(await page.locator(".empty p").textContent().catch(() => ""));
ok(/no licensed retail dispensaries/i.test(idText),
  "no-programme state distinguished from uncovered", idText.slice(0, 80));

/* --- layout --- */
for (const [w, h, label] of [[1440, 1000, "1440"], [390, 844, "390"]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.reload({ waitUntil: "networkidle" });
  await stable(page);
  const of = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(of <= 1, "no horizontal overflow @" + label, String(of));
}

await browser.close();
console.log("\n" + (fails.length ? "FAILURES: " + fails.length : "ALL CHECKS PASSED"));
fails.forEach((f) => console.log("  - " + f));
process.exit(fails.length ? 1 : 0);
