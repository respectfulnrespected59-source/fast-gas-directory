/*
 * FAST GAS - directory behaviour.
 *
 * One state object drives every surface; all mutation goes through update().
 *
 * What a listing does and does NOT carry is the important thing here. Every
 * record is a real, currently-active retail licence from a state regulator, so
 * it has a name, an address, coordinates, a licence number and an expiry. It
 * has no rating, no opening hours and no prices, because regulators do not
 * publish those. The UI must never imply otherwise: an invented star rating
 * libels a real business and an invented opening time sends someone to a
 * locked door.
 */

import {
  STATES,
  STATE_BY_CODE,
  COVERAGE,
  COVERED_STATES,
  PROGRAM_LABELS,
  ACCESS_LABELS,
  loadListings,
  stateFromZip,
  anchorForZip,
  anchorForCity,
  haversineMiles,
} from "./data.js";

const PAGE_SIZE = 24;

let LISTINGS = [];
let SOURCES = [];
let LOAD_ERRORS = [];

const state = {
  query: "",
  filters: new Set(), // "rec" | "med" | "storefront" | "delivery"
  sort: "relevance",
  stateCode: null,
  anchor: null,
  limit: PAGE_SIZE,
};

/* --- helpers ------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function milesFromAnchor(listing) {
  if (!state.anchor || listing.lat === null || listing.lng === null) return null;
  return haversineMiles(state.anchor, listing);
}

function formatMiles(miles) {
  if (miles === null) return null;
  return miles < 10 ? miles.toFixed(1) + " mi" : Math.round(miles) + " mi";
}

/** (323) 645-7669 -> tel:+13236457669 */
function telHref(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return "tel:+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "tel:+" + digits;
  return null;
}

function mapsHref(listing) {
  const q = [listing.street, listing.city, listing.state, listing.zip]
    .filter(Boolean)
    .join(", ");
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}

/* --- filtering ----------------------------------------------------------- */
function inScope(listing) {
  if (state.stateCode && listing.state !== state.stateCode) return false;
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return (
    listing.name.toLowerCase().includes(q) ||
    (listing.legalName || "").toLowerCase().includes(q) ||
    listing.city.toLowerCase().includes(q) ||
    (listing.county || "").toLowerCase().includes(q) ||
    listing.state.toLowerCase() === q ||
    listing.zip.startsWith(q) ||
    listing.id.toLowerCase().includes(q) ||
    (listing.street || "").toLowerCase().includes(q)
  );
}

const FILTER_TESTS = {
  rec: (l) => l.access === "rec" || l.access === "both",
  med: (l) => l.access === "med" || l.access === "both",
  storefront: (l) => l.storefront,
  delivery: (l) => l.delivery,
};

function passesFilters(listing) {
  for (const key of state.filters) {
    const test = FILTER_TESTS[key];
    if (test && !test(listing)) return false;
  }
  return true;
}

/* --- ranking ------------------------------------------------------------- */
/*
 * Precedence chain, not a weighted sum. A sum lets any term be out-voted by a
 * coalition of the others, which is how a farther shop previously climbed
 * above a nearer one; strict precedence has to be ordered comparisons.
 *
 * Proximity outranks everything else once a location is known, because the
 * person searching needs the closest real door. Half-mile banding stops a
 * 50-foot difference from reordering the list.
 *
 * There is no "open now" tier any more: regulators do not publish opening
 * hours, so claiming to know them would be a lie.
 */
const BAND_MILES = 0.5;

const TEXT_WEIGHT = {
  zipExact: 120,
  zipPrefix: 60,
  cityExact: 70,
  cityPartial: 40,
  namePrefix: 30,
  namePartial: 15,
};

function textScore(listing) {
  const q = state.query.trim().toLowerCase();
  if (!q) return 0;
  let score = 0;

  if (listing.zip === q) score += TEXT_WEIGHT.zipExact;
  else if (listing.zip.startsWith(q)) score += TEXT_WEIGHT.zipPrefix;

  const city = listing.city.toLowerCase();
  if (city === q) score += TEXT_WEIGHT.cityExact;
  else if (city.includes(q)) score += TEXT_WEIGHT.cityPartial;

  const name = listing.name.toLowerCase();
  if (name.startsWith(q)) score += TEXT_WEIGHT.namePrefix;
  else if (name.includes(q)) score += TEXT_WEIGHT.namePartial;

  return score;
}

function distanceBand(listing) {
  const miles = milesFromAnchor(listing);
  return miles === null ? null : Math.round(miles / BAND_MILES);
}

function bestMatch(a, b) {
  // 1. a placed listing beats one whose address the state withholds
  const aBand = distanceBand(a);
  const bBand = distanceBand(b);
  if (state.anchor) {
    if ((aBand === null) !== (bBand === null)) return aBand === null ? 1 : -1;
    if (aBand !== null && bBand !== null && aBand !== bBand) return aBand - bBand;
  }
  // 2. how well the query matched
  const byText = textScore(b) - textScore(a);
  if (byText !== 0) return byText;
  // 3. stable, predictable last resort
  return a.city.localeCompare(b.city) || a.name.localeCompare(b.name);
}

const SORTERS = {
  relevance: bestMatch,
  distance: (a, b) => {
    const da = milesFromAnchor(a);
    const db = milesFromAnchor(b);
    if (da === null && db === null) return bestMatch(a, b);
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db || bestMatch(a, b);
  },
  name: (a, b) => a.name.localeCompare(b.name),
  city: (a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name),
};

function visibleListings() {
  const scoped = LISTINGS.filter(inScope);
  const filtered = scoped.filter(passesFilters);
  return { scoped, filtered: filtered.sort(SORTERS[state.sort] || bestMatch) };
}

/* --- cards --------------------------------------------------------------- */
function accessBadge(listing) {
  const cls = listing.access === "med" ? "badge badge--lav" : "badge badge--gold";
  return el("span", { class: cls, text: ACCESS_LABELS[listing.access] });
}

function buildCard(listing) {
  const miles = formatMiles(milesFromAnchor(listing));

  const card = el(
    "button",
    {
      class: "card",
      type: "button",
      dataset: { id: listing.id },
      "aria-label": listing.name + ", " + listing.city + ", " + listing.state + ". View licence details.",
    },
    [
      el("div", { class: "card-head" }, [
        el("h3", { text: listing.name }),
        miles && el("span", { class: "card-rating", text: miles }),
      ]),
      el("p", { class: "card-meta" }, [
        listing.street ? el("b", { text: listing.street }) : el("b", { text: "Address not published" }),
        el("br"),
        listing.city + ", " + listing.state + " " + listing.zip +
          (listing.county ? "  ·  " + listing.county + " County" : ""),
      ]),
      el("div", { class: "badges" }, [
        accessBadge(listing),
        listing.storefront
          ? el("span", { class: "badge badge--money", text: "Storefront" })
          : el("span", { class: "badge", text: "Delivery only" }),
        listing.delivery && listing.storefront && el("span", { class: "badge", text: "Delivery" }),
      ]),
      el("div", { class: "card-foot" }, [
        el("span", { class: "card-tags", text: "Licence " + listing.id }),
        el("span", { class: "card-cta" }, ["Details", el("span", { text: "→" })]),
      ]),
    ]
  );

  card.addEventListener("click", () => openDetail(listing));
  return card;
}

/* --- detail dialog ------------------------------------------------------- */
const dialog = $("detail");

function openDetail(listing) {
  const info = STATE_BY_CODE[listing.state];
  const miles = formatMiles(milesFromAnchor(listing));
  const src = SOURCES.find((s) => s.state === listing.state);

  $("detailName").textContent = listing.name;
  $("detailAddress").textContent =
    (listing.street ? listing.street + ", " : "") +
    listing.city + ", " + listing.state + " " + listing.zip +
    (miles ? "  ·  " + miles + " away" : "");

  const facts = el("dl", { class: "detail-grid" }, [
    el("div", {}, [el("dt", { text: "Licence number" }), el("dd", { text: listing.id })]),
    el("div", {}, [el("dt", { text: "Licence type" }), el("dd", { text: listing.licenseType })]),
    el("div", {}, [el("dt", { text: "Permits" }), el("dd", { text: ACCESS_LABELS[listing.access] })]),
    el("div", {}, [el("dt", { text: "Status" }), el("dd", { text: "Active" })]),
    listing.expires &&
      el("div", {}, [el("dt", { text: "Expires" }), el("dd", { text: listing.expires })]),
    listing.legalName &&
      el("div", {}, [el("dt", { text: "Legal name" }), el("dd", { text: listing.legalName })]),
  ]);

  const actions = el("div", { class: "badges detail-actions" }, [
    el("a", { class: "button button--sm", href: mapsHref(listing), target: "_blank", rel: "noopener noreferrer" },
      ["Directions"]),
    telHref(listing.phone) &&
      el("a", { class: "button button--sm button--ghost", href: telHref(listing.phone) }, [listing.phone]),
  ]);

  $("detailBody").replaceChildren(
    facts,
    el("div", { class: "detail-section" }, [el("h4", { text: "Go there" }), actions]),
    el("p", {
      class: "detail-note",
      text:
        "Licence record from the " + (src ? src.source : info.regulator) +
        (src && src.refreshed ? ", refreshed " + src.refreshed : "") +
        ". Fast Gas publishes no ratings, hours or prices because the regulator " +
        "does not publish them - call ahead to confirm opening times and stock. " +
        "A licence being active is not a guarantee the premises is currently trading.",
    })
  );

  if (typeof dialog.showModal === "function") dialog.showModal();
}

/* --- legality + coverage panel ------------------------------------------ */
function coverageFor(code) {
  return SOURCES.find((s) => s.state === code) || null;
}

function renderLegality() {
  const panel = $("legality");
  const flag = $("legalityFlag");
  const title = $("legalityTitle");
  const bodyText = $("legalityBody");
  const action = $("legalityAction");

  if (!state.stateCode) {
    panel.dataset.tone = "money";
    flag.textContent = "US";
    const names = SOURCES.map((s) => STATE_BY_CODE[s.state].name).join(", ");
    title.textContent = "Verified coverage: " + (names || "none loaded");
    bodyText.textContent =
      LISTINGS.length +
      " currently-licensed retailers, taken from state licence registers. " +
      "States outside that list are not yet covered - pick one to see its status.";
    action.hidden = true;
    return;
  }

  const info = STATE_BY_CODE[state.stateCode];
  const program = PROGRAM_LABELS[info.program];
  const src = coverageFor(info.code);
  panel.dataset.tone = program.tone;
  flag.textContent = info.code;
  title.textContent = info.name + " - " + program.long;

  if (info.program === "none") {
    bodyText.textContent =
      info.name + " has no public cannabis programme, so there are no licensed " +
      "retailers to list. " + info.regulator + ".";
  } else if (info.program === "cbd") {
    bodyText.textContent =
      info.name + " permits low-THC or CBD products only, not retail cannabis " +
      "dispensaries. Regulator: " + info.regulator + ".";
  } else if (src) {
    bodyText.textContent =
      "Verified from the " + src.source +
      (src.refreshed ? ", refreshed " + src.refreshed : "") + ". " +
      src.count + " active retail licences" +
      (src.addressWithheldCount
        ? ", plus " + src.addressWithheldCount + " whose premises address the state withholds from publication."
        : ".");
  } else {
    bodyText.textContent =
      info.name + " runs a " + program.long.toLowerCase() + " programme and has " +
      "licensed retailers, but Fast Gas does not cover it yet - we only publish " +
      "registers we have verified against the regulator (" + info.regulator + "). " +
      "Nothing is shown rather than something invented.";
  }

  action.hidden = false;
  action.textContent = "Clear state";
}

/* --- state grid ---------------------------------------------------------- */
function renderStateGrid() {
  const counts = LISTINGS.reduce((acc, l) => {
    acc[l.state] = (acc[l.state] || 0) + 1;
    return acc;
  }, {});

  const tiles = STATES.map((info) => {
    const count = counts[info.code] || 0;
    const program = PROGRAM_LABELS[info.program];
    const covered = COVERED_STATES.has(info.code);
    const retailState = info.program === "rec" || info.program === "med";

    let footer;
    if (count) footer = count.toLocaleString() + " listed";
    else if (retailState && !covered) footer = "Not covered yet";
    else footer = program.short;

    const tile = el(
      "button",
      {
        class: "state-tile" + (covered ? " state-tile--covered" : ""),
        type: "button",
        dataset: { program: info.program, code: info.code },
        "aria-label": info.name + ". " + program.long + ". " + footer + ".",
      },
      [
        el("em", { "aria-hidden": "true" }),
        el("b", { text: info.code }),
        el("span", { text: info.name }),
        el("small", { text: footer }),
      ]
    );
    tile.addEventListener("click", () => {
      state.stateCode = info.code;
      state.query = "";
      state.filters.clear();
      $("query").value = "";
      const inState = LISTINGS.filter((l) => l.state === info.code);
      state.anchor = inState.length ? anchorForCity(inState[0].city, LISTINGS) : null;
      state.sort = state.anchor ? "distance" : "relevance";
      $("sort").value = state.sort;
      state.limit = PAGE_SIZE;
      update();
      $("directory").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return tile;
  });

  $("stateGrid").replaceChildren(...tiles);
}

/* --- stats + sources ----------------------------------------------------- */
function renderStats() {
  $("statListings").textContent = LISTINGS.length.toLocaleString();
  $("statStates").textContent = String(SOURCES.length);
  $("statMetros").textContent = String(new Set(LISTINGS.map((l) => l.city + "|" + l.state)).size);
  $("statRec").textContent = String(STATES.filter((s) => s.program === "rec").length);
  const refreshed = SOURCES.map((s) => s.refreshed).filter(Boolean).sort().pop();
  $("asOf").textContent = refreshed || "-";
}

function renderHeroKey() {
  const rows = SOURCES.map((s) =>
    el("div", { class: "hero-key-row", dataset: { program: "rec" } }, [
      el("i", { "aria-hidden": "true" }),
      el("span", { text: STATE_BY_CODE[s.state].name + " - " + s.source }),
      el("b", { text: s.count.toLocaleString() }),
    ])
  );

  const pending = STATES.filter(
    (s) => (s.program === "rec" || s.program === "med") && !COVERED_STATES.has(s.code)
  ).length;

  rows.push(
    el("div", { class: "hero-key-row", dataset: { program: "none" } }, [
      el("i", { "aria-hidden": "true" }),
      el("span", { text: "States with retail, not yet covered" }),
      el("b", { text: String(pending) }),
    ])
  );

  $("heroKey").replaceChildren(
    el("div", { class: "hero-key-head", text: "Where the data comes from" }),
    ...rows
  );
}

/* --- repaint ------------------------------------------------------------- */
function update() {
  const { scoped, filtered } = visibleListings();

  document.querySelectorAll(".chip-count").forEach((node) => {
    const key = node.dataset.count;
    node.textContent = String(
      key === "all" ? scoped.length : scoped.filter(FILTER_TESTS[key]).length
    );
  });
  document.querySelectorAll(".chip").forEach((chip) => {
    const key = chip.dataset.filter;
    const on = key === "all" ? state.filters.size === 0 : state.filters.has(key);
    chip.setAttribute("aria-pressed", String(on));
  });

  renderLegality();

  const page = filtered.slice(0, state.limit);
  const results = $("results");

  if (!filtered.length) {
    const info = state.stateCode ? STATE_BY_CODE[state.stateCode] : null;
    let reason;
    if (info && (info.program === "none" || info.program === "cbd")) {
      reason =
        info.name + " has no licensed retail dispensaries, so this is the correct " +
        "answer rather than a search failure.";
    } else if (info && !COVERED_STATES.has(info.code)) {
      reason =
        info.name + " is not covered yet. It has licensed retailers; Fast Gas just " +
        "has not verified its register against " + info.regulator + " yet, and will " +
        "not invent listings to fill the gap.";
    } else {
      reason = "Nothing matches that combination. Try clearing a filter or widening the search.";
    }
    results.replaceChildren(
      el("div", { class: "empty" }, [
        el("h3", { text: "No listings here" }),
        el("p", { text: reason }),
      ])
    );
  } else {
    results.replaceChildren(...page.map(buildCard));
  }

  // Say what is actually on screen: a ZIP search shows the whole state
  // ordered by distance, and calling that "1,393 in California" hides the
  // fact that the top of the list is the nearest few.
  const nearNote = state.anchor
    ? "  ·  nearest first" + (page.length < filtered.length ? " (" + page.length + " shown)" : "")
    : page.length < filtered.length
      ? "  ·  showing " + page.length
      : "";
  $("resultCount").replaceChildren(
    el("b", { text: filtered.length.toLocaleString() }),
    document.createTextNode(
      " licensed retailer" + (filtered.length === 1 ? "" : "s") +
      (state.stateCode ? " in " + STATE_BY_CODE[state.stateCode].name : "") +
      nearNote
    )
  );

  const dirty = state.filters.size > 0 || state.query.trim() !== "" || state.stateCode !== null;
  $("resetFilters").hidden = !dirty;
  $("loadMore").hidden = page.length >= filtered.length;
}

/* --- search -------------------------------------------------------------- */
function resolveSearch(raw) {
  const value = raw.trim();
  if (!value) return { ok: false, message: "Enter a ZIP code, city or state." };

  if (/^\d+$/.test(value)) {
    if (value.length !== 5) {
      return { ok: false, message: "US ZIP codes are five digits. Try 94541." };
    }
    const code = stateFromZip(value);
    const info = code ? STATE_BY_CODE[code] : null;
    if (!info) {
      return { ok: false, message: value + " does not resolve to a US state or D.C." };
    }
    const anchor = anchorForZip(value, LISTINGS);
    const program = PROGRAM_LABELS[info.program];

    let message = value + " is in " + info.name + " - " + program.long + ".";
    if (!COVERED_STATES.has(code) && (info.program === "rec" || info.program === "med")) {
      message += " Not covered yet, so no listings are shown.";
    } else if (!anchor) {
      message += " No licensed retailers found near that ZIP.";
    }
    return { ok: true, stateCode: code, anchor, message };
  }

  const lower = value.toLowerCase();

  const cityAnchor = anchorForCity(value, LISTINGS);
  if (cityAnchor) {
    const match = LISTINGS.find((l) => l.city.toLowerCase() === lower);
    return {
      ok: true,
      stateCode: match.state,
      anchor: cityAnchor,
      query: match.city,
      message: match.city + ", " + match.state + " - " +
        LISTINGS.filter((l) => l.city.toLowerCase() === lower).length +
        " licensed retailers.",
    };
  }

  const info =
    STATES.find((s) => s.name.toLowerCase() === lower) ||
    STATES.find((s) => s.code.toLowerCase() === lower) ||
    STATES.find((s) => s.name.toLowerCase().startsWith(lower));
  if (info) {
    const inState = LISTINGS.filter((l) => l.state === info.code);
    return {
      ok: true,
      stateCode: info.code,
      anchor: inState.length ? anchorForCity(inState[0].city, LISTINGS) : null,
      message: info.name + " - " + PROGRAM_LABELS[info.program].long + ".",
    };
  }

  // Fall back to a plain text search over names and addresses.
  const hits = LISTINGS.filter((l) =>
    l.name.toLowerCase().includes(lower) || (l.street || "").toLowerCase().includes(lower));
  if (hits.length) {
    return {
      ok: true,
      stateCode: null,
      anchor: null,
      query: value,
      message: hits.length + " retailers match “" + value + "” by name or address.",
    };
  }

  return { ok: false, message: "No ZIP, city, state or retailer matched “" + value + "”." };
}

function applySearch(raw, resultNode, inputNode) {
  const outcome = resolveSearch(raw);
  resultNode.textContent = outcome.message;
  resultNode.classList.toggle("error", !outcome.ok);

  if (!outcome.ok) {
    if (inputNode) {
      inputNode.setAttribute("aria-invalid", "true");
      inputNode.focus();
    }
    return false;
  }

  if (inputNode) inputNode.removeAttribute("aria-invalid");
  state.stateCode = outcome.stateCode;
  state.anchor = outcome.anchor;
  state.query = outcome.query || "";
  state.sort = outcome.anchor ? "distance" : "relevance";
  state.limit = PAGE_SIZE;
  $("sort").value = state.sort;
  $("query").value = state.query;
  update();
  return true;
}

/* --- wiring -------------------------------------------------------------- */
function wireHero() {
  const form = $("heroForm");
  const input = $("heroQuery");
  const result = $("heroResult");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (applySearch(input.value, result, input)) {
      $("directory").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    result.textContent = "";
    result.classList.remove("error");
  });

  document.querySelectorAll("[data-example]").forEach((button) => {
    button.addEventListener("click", () => {
      input.value = button.dataset.example;
      form.requestSubmit();
    });
  });
}

function wireToolbar() {
  const query = $("query");
  let timer;
  query.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.query = query.value;
      state.limit = PAGE_SIZE;
      update();
    }, 160);
  });

  $("sort").addEventListener("change", (event) => {
    state.sort = event.target.value;
    if (state.sort === "distance" && !state.anchor) {
      const hero = $("heroResult");
      hero.textContent = "Nearest needs a location - search a ZIP or city first.";
      hero.classList.remove("error");
    }
    update();
  });

  $("chips").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    const key = chip.dataset.filter;
    if (key === "all") state.filters.clear();
    else if (state.filters.has(key)) state.filters.delete(key);
    else state.filters.add(key);
    state.limit = PAGE_SIZE;
    update();
  });

  $("resetFilters").addEventListener("click", () => {
    state.query = "";
    state.filters.clear();
    state.stateCode = null;
    state.anchor = null;
    state.sort = "relevance";
    state.limit = PAGE_SIZE;
    $("query").value = "";
    $("sort").value = "relevance";
    $("heroResult").textContent = "";
    $("heroResult").classList.remove("error");
    update();
  });

  $("legalityAction").addEventListener("click", () => {
    state.stateCode = null;
    state.anchor = null;
    state.sort = "relevance";
    $("sort").value = "relevance";
    state.limit = PAGE_SIZE;
    update();
  });

  $("loadMore").addEventListener("click", () => {
    state.limit += PAGE_SIZE;
    update();
  });
}

function wireNav() {
  const toggle = $("navToggle");
  const links = $("navLinks");
  const setOpen = (open) => {
    links.dataset.open = String(open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setOpen(links.dataset.open !== "true"));
  links.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

/* --- boot ---------------------------------------------------------------- */
async function boot() {
  $("resultCount").textContent = "Loading licence registers…";

  const loaded = await loadListings();
  LISTINGS = loaded.listings;
  SOURCES = loaded.sources;
  LOAD_ERRORS = loaded.errors;

  renderStats();
  renderHeroKey();
  renderStateGrid();
  wireHero();
  wireToolbar();
  wireNav();
  update();

  // A failed load must never read as "there is nothing here".
  if (LOAD_ERRORS.length) {
    const names = LOAD_ERRORS.map((e) => e.state).join(", ");
    $("results").prepend(
      el("div", { class: "empty" }, [
        el("h3", { text: "Could not load " + names }),
        el("p", {
          text:
            "The licence register for " + names + " failed to load (" +
            LOAD_ERRORS[0].message + "). This is a loading failure, not an empty " +
            "state - reload before concluding there are no retailers there.",
        }),
      ])
    );
  }
}

boot();
