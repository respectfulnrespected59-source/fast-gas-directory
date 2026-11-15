/*
 * Adversarial probe for the Fast Gas directory.
 * Each check is written to fail loudly if a feature only LOOKS present:
 * chip counts are cross-checked against rendered totals, the sprite mark is
 * measured AND screenshotted, and the "no results" path is asserted to carry
 * the honest reason rather than a generic failure message.
 */
import { chromium } from "playwright";

const URL = process.env.FG_URL || "http://127.0.0.1:8877/index.html";
const OUT = "C:/Users/respe/fast-gas-directory/dist";
const fails = [];

const ok = (cond, label, extra) => {
  console.log((cond ? "PASS  " : "FAIL  ") + label + (extra ? "   " + extra : ""));
  if (!cond) fails.push(label + " " + (extra || ""));
};
const tidy = (s) => String(s || "").replace(/\s+/g, " ").trim();

/**
 * Wait for the result grid to stop changing.
 * The ranking block used fixed timeouts and flaked once against the live site
 * (slower paint -> the DOM was read mid-repaint). Two identical consecutive
 * reads is a deterministic signal; a sleep is a guess.
 */
async function waitForStableGrid(page, tries = 24) {
  let prev = null;
  for (let i = 0; i < tries; i += 1) {
    const now = await page.evaluate(() =>
      [...document.querySelectorAll(".card h3")].map((h) => h.textContent).join("|"));
    if (now && now === prev) return now;
    prev = now;
    await page.waitForTimeout(250);
  }
  return prev;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const consoleErrors = [];
const failedReqs = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
page.on("requestfailed", (r) => {
  const f = r.failure();
  failedReqs.push(r.url() + " :: " + (f ? f.errorText : "unknown"));
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

ok(consoleErrors.length === 0, "no console errors", JSON.stringify(consoleErrors.slice(0, 3)));
ok(failedReqs.length === 0, "no failed requests", JSON.stringify(failedReqs.slice(0, 3)));

/* --- stats actually filled, not the em-dash placeholder --- */
const stats = await page.evaluate(() => ({
  listings: document.getElementById("statListings").textContent,
  states: document.getElementById("statStates").textContent,
  metros: document.getElementById("statMetros").textContent,
  rec: document.getElementById("statRec").textContent,
  asOf: document.getElementById("asOf").textContent,
}));
ok(/^\d+$/.test(stats.listings) && Number(stats.listings) > 100,
  "stats: listings numeric", JSON.stringify(stats));
ok(Number(stats.states) === 40, "stats: 40 states with listings", stats.states);
ok(Number(stats.rec) === 25, "stats: adult-use state count", stats.rec);
ok(stats.asOf.length > 4, "footer as-of stamped", stats.asOf);

/* --- state grid --- */
const tiles = await page.locator(".state-tile").count();
ok(tiles === 51, "state grid has 51 tiles (50 + DC)", String(tiles));

/* --- initial results --- */
const cards0 = await page.locator(".card").count();
const count0 = await page.locator("#resultCount").textContent();
ok(cards0 === 24, "first page renders 24 cards", String(cards0));
ok(/nationwide/.test(count0), "count line says nationwide", tidy(count0));

/* --- the bong mark actually resolved out of the sprite --- */
const markBox = await page.evaluate(() => {
  const use = document.querySelector(".logo-mark use");
  const r = use.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
ok(markBox.w > 20 && markBox.h > 20, "bong <use> resolved to a real box", JSON.stringify(markBox));
const markPng = await page.locator("header .logo-mark").screenshot();
ok(markPng.length > 600, "bong mark is painted, not blank", markPng.length + " bytes");

/* --- ZIP search: Oakland --- */
await page.fill("#heroQuery", "94607");
await page.click("#heroForm button[type=submit]");
await page.waitForTimeout(500);
const heroMsg = await page.locator("#heroResult").textContent();
ok(/California/.test(heroMsg) && /Oakland/.test(heroMsg),
  "ZIP 94607 -> California / Oakland", tidy(heroMsg));
const legality1 = await page.evaluate(() => ({
  tone: document.getElementById("legality").dataset.tone,
  flag: document.getElementById("legalityFlag").textContent,
  title: document.getElementById("legalityTitle").textContent,
}));
ok(legality1.flag === "CA" && /Adult-use/.test(legality1.title),
  "legality panel switched to CA", JSON.stringify(legality1));
const firstMeta = await page.locator(".card-meta").first().textContent();
ok(/mi away/.test(firstMeta), "distance shown after ZIP anchor", tidy(firstMeta).slice(0, 70));
const sortVal = await page.inputValue("#sort");
ok(sortVal === "distance", "sort auto-switched to nearest", sortVal);

/* --- the honest-empty case: Idaho has no program --- */
await page.fill("#heroQuery", "83701");
await page.click("#heroForm button[type=submit]");
await page.waitForTimeout(500);
const idahoHero = await page.locator("#heroResult").textContent();
const idahoEmpty = await page.locator(".empty p").textContent().catch(() => "");
const idahoLegal = await page.locator("#legalityBody").textContent();
ok(/Idaho/.test(idahoHero), "ZIP 83701 -> Idaho", tidy(idahoHero));
ok(/no legal retail dispensaries/.test(idahoEmpty) && /correct result/.test(idahoEmpty),
  "Idaho empty state explains WHY, not a search failure", tidy(idahoEmpty).slice(0, 90));
ok(/no public cannabis program/.test(idahoLegal), "Idaho legality text correct",
  tidy(idahoLegal).slice(0, 70));

/* --- a medical-only state must never show adult-use access --- */
await page.fill("#heroQuery", "Oklahoma");
await page.click("#heroForm button[type=submit]");
await page.waitForTimeout(500);
const medBadges = await page.locator(".card .badge--lav").count();
const okCards = await page.locator(".card").count();
ok(okCards > 0 && medBadges === okCards, "every Oklahoma card is Medical only",
  medBadges + "/" + okCards);

/* --- chip count must equal the rendered total --- */
await page.click("#resetFilters");
await page.waitForTimeout(300);
const deliveryLabel = await page.locator(".chip-count[data-count=delivery]").textContent();
await page.click(".chip[data-filter=delivery]");
await page.waitForTimeout(350);
const afterCount = await page.locator("#resultCount b").textContent();
ok(deliveryLabel === afterCount, "delivery chip count == result total",
  deliveryLabel + " vs " + afterCount);
const allDeliver = await page.evaluate(() =>
  [...document.querySelectorAll(".card")].every((c) => /Delivery/.test(c.textContent)));
ok(allDeliver, "every card under the delivery filter offers delivery");

/* --- best-match precedence: open > proximity band > text > rating --------
 * Asserted against the half-mile band the code actually specifies, not an
 * arbitrary mile tolerance: inside one band two shops are "equally close"
 * and quality is SUPPOSED to decide.
 */
await page.click("#resetFilters");
await page.waitForTimeout(300);
await page.fill("#heroQuery", "Chicago");
await page.click("#heroForm button[type=submit]");
await waitForStableGrid(page);
await page.selectOption("#sort", "relevance");
await waitForStableGrid(page);

const ranked = await page.evaluate(() =>
  [...document.querySelectorAll(".card")].map((c) => {
    const t = c.textContent;
    const mi = t.match(/([\d.]+)\s*mi away/);
    const st = t.match(/★\s*([\d.]+)/);
    const m = mi ? Number(mi[1]) : null;
    return {
      miles: m,
      band: m === null ? null : Math.round(m / 0.5),
      rating: st ? Number(st[1]) : null,
      open: /Open now/.test(t),
    };
  }));

ok(ranked.length > 2, "best match: enough rows to rank", String(ranked.length));

const lastOpenIdx = ranked.map((r) => r.open).lastIndexOf(true);
const firstClosedIdx = ranked.findIndex((r) => !r.open);
ok(firstClosedIdx === -1 || lastOpenIdx < firstClosedIdx,
  "best match: no closed listing ranks above an open one");

const bandInversions = [];
for (let a = 0; a < ranked.length; a += 1) {
  for (let b = a + 1; b < ranked.length; b += 1) {
    if (!ranked[a].open || !ranked[b].open) continue;
    if (ranked[a].band !== null && ranked[b].band !== null && ranked[b].band < ranked[a].band) {
      bandInversions.push(ranked[a].miles + "mi over " + ranked[b].miles + "mi");
    }
  }
}
ok(bandInversions.length === 0, "best match: never a farther band above a nearer one",
  bandInversions.slice(0, 3).join(" | "));

const proximityBeatsRating = ranked.some((a, i) =>
  ranked.slice(i + 1).some((b) =>
    a.open && b.open && a.band < b.band && a.rating < b.rating));
ok(proximityBeatsRating,
  "best match: a nearer LOWER-rated listing outranks a farther higher-rated one");

await page.click("#resetFilters");
await page.waitForTimeout(300);

/* --- detail dialog --- */
await page.locator(".card").first().click();
await page.waitForTimeout(400);
const dlg = await page.evaluate(() => {
  const d = document.getElementById("detail");
  const note = document.querySelector(".detail-note");
  return {
    open: d.open,
    name: document.getElementById("detailName").textContent,
    facts: d.querySelectorAll(".detail-grid > div").length,
    note: note ? note.textContent : "",
  };
});
ok(dlg.open === true, "dialog opened");
ok(dlg.facts === 6, "dialog shows 6 facts", String(dlg.facts));
ok(/Sample listing/.test(dlg.note) && /regulated by/.test(dlg.note),
  "dialog carries the sample-data + regulator note");
await page.keyboard.press("Escape");
await page.waitForTimeout(250);

/* --- no horizontal overflow @1440 --- */
const overflow1440 = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(overflow1440 <= 1, "no horizontal overflow @1440", String(overflow1440));

await page.screenshot({ path: OUT + "/shot-1440-top.png" });
await page.evaluate(() => document.getElementById("directory").scrollIntoView());
await page.waitForTimeout(700);
await page.screenshot({ path: OUT + "/shot-1440-directory.png" });
await page.evaluate(() => document.getElementById("states").scrollIntoView());
await page.waitForTimeout(700);
await page.screenshot({ path: OUT + "/shot-1440-states.png" });
await page.evaluate(() => document.getElementById("how").scrollIntoView());
await page.waitForTimeout(700);
await page.screenshot({ path: OUT + "/shot-1440-how.png" });

/* --- mobile --- */
await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);
const overflow390 = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(overflow390 <= 1, "no horizontal overflow @390", String(overflow390));
ok(await page.locator("#navToggle").isVisible(), "mobile nav toggle visible");
await page.screenshot({ path: OUT + "/shot-390-top.png" });

await browser.close();
console.log("\n" + (fails.length ? "FAILURES: " + fails.length : "ALL CHECKS PASSED"));
fails.forEach((f) => console.log("  - " + f));
process.exit(fails.length ? 1 : 0);
