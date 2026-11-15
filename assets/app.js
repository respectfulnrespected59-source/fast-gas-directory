/*
 * FAST GAS - directory behaviour.
 *
 * One state object drives every surface. Any mutation goes through update(),
 * which re-derives the visible set and repaints. No component owns its own
 * copy of the truth, so the result count, chip counts, legality panel and
 * grid cannot disagree with each other.
 */

import {
  STATES,
  STATE_BY_CODE,
  METROS,
  PROGRAM_LABELS,
  DATA_AS_OF,
  buildListings,
  stateFromZip,
  anchorForZip,
  haversineMiles,
} from "./data.js";

const LISTINGS = buildListings();
const PAGE_SIZE = 24;

/* --- state --------------------------------------------------------------- */
const state = {
  query: "",
  filters: new Set(),   // "rec" | "med" | "delivery" | "open" | "verified" | "ada"
  sort: "relevance",
  stateCode: null,      // set by a state tile or a resolved search
  anchor: null,         // { city, state, lat, lng } for distance sorting
  limit: PAGE_SIZE,
};

/* --- tiny DOM helpers ---------------------------------------------------- */
const $ = (id) => document.getElementById(id);

/**
 * Build an element. Text always goes through textContent, never innerHTML,
 * so a listing name could never be interpreted as markup.
 */
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

/* --- formatting ---------------------------------------------------------- */
function formatTime(minutes) {
  const h24 = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return h12 + ":" + mm + " " + suffix;
}

/** Minutes since local midnight - the basis for "open now". */
function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function isOpenNow(listing) {
  const t = nowMinutes();
  return t >= listing.hours.open && t < listing.hours.close;
}

function milesFromAnchor(listing) {
  if (!state.anchor) return null;
  return haversineMiles(state.anchor, listing);
}

function formatMiles(miles) {
  if (miles === null) return null;
  return miles < 10 ? miles.toFixed(1) + " mi" : Math.round(miles) + " mi";
}

/* --- filtering ----------------------------------------------------------- */
/** Scope = query + selected state. Chip counts are measured against this. */
function inScope(listing) {
  if (state.stateCode && listing.state !== state.stateCode) return false;
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return (
    listing.name.toLowerCase().includes(q) ||
    listing.city.toLowerCase().includes(q) ||
    listing.state.toLowerCase() === q ||
    listing.stateName.toLowerCase().includes(q) ||
    listing.zip.startsWith(q) ||
    listing.categories.some((c) => c.toLowerCase().includes(q))
  );
}

const FILTER_TESTS = {
  rec: (l) => l.access === "rec" || l.access === "both",
  med: (l) => l.access === "med" || l.access === "both",
  delivery: (l) => l.delivery,
  open: (l) => isOpenNow(l),
  verified: (l) => l.verified,
  ada: (l) => l.services.includes("ADA accessible"),
};

function passesFilters(listing) {
  for (const key of state.filters) {
    const test = FILTER_TESTS[key];
    if (test && !test(listing)) return false;
  }
  return true;
}

/* --- relevance ----------------------------------------------------------- */
/*
 * "Best match" is a PRECEDENCE CHAIN, not a weighted sum.
 *
 * This started life as a sum of weights, and that could not express the rule
 * the directory actually needs. In a sum, every term can be out-voted by a
 * coalition of the others: at 3.6 vs 4.5 miles a hyperbolic proximity curve
 * differs by only ~6 points, which a "verified" bonus plus a rating edge
 * beats outright - so a farther shop climbed above a nearer one. Retuning the
 * constants only pushes that failure further out, because any decaying curve
 * flattens. Strict precedence has to be expressed as ordered comparisons.
 *
 * The order, for someone who needs somewhere NOW:
 *
 *   1. Open now beats closed. A closed counter cannot help in an urgent
 *      moment, however near it is.
 *   2. Nearer beats farther, measured in half-mile bands. Banding is what
 *      stops a 50-foot difference from outranking a whole star: inside the
 *      same band the two shops are "equally close" and quality decides.
 *   3. Then how well the text matched (an exact ZIP is the strongest signal
 *      a searcher can give).
 *   4. Only then rating, verification, and name.
 *
 * Rating is never consulted until distance has already tied, so no star count
 * can lift a farther shop above a nearer one. With no anchor (nothing searched
 * yet) step 2 is skipped and quality does the separating, which is the right
 * behaviour for browsing.
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

/** How well a listing answers the typed query. Distance plays no part here. */
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

/** Half-mile band, or null when nothing has been searched yet. */
function distanceBand(listing) {
  const miles = milesFromAnchor(listing);
  return miles === null ? null : Math.round(miles / BAND_MILES);
}

function bestMatch(a, b) {
  // 1. open beats closed, always
  const aOpen = isOpenNow(a);
  const bOpen = isOpenNow(b);
  if (aOpen !== bOpen) return aOpen ? -1 : 1;

  // 2. nearer band beats farther band
  const aBand = distanceBand(a);
  const bBand = distanceBand(b);
  if (aBand !== null && bBand !== null && aBand !== bBand) return aBand - bBand;

  // 3. how well the query matched
  const byText = textScore(b) - textScore(a);
  if (byText !== 0) return byText;

  // 4. quality, only now that everything above has tied
  return (
    b.rating - a.rating ||
    Number(b.verified) - Number(a.verified) ||
    a.name.localeCompare(b.name)
  );
}

const SORTERS = {
  relevance: bestMatch,
  rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
  name: (a, b) => a.name.localeCompare(b.name),
  // Raw distance, ignoring opening hours - the one sort that answers
  // "what is physically closest" without any judgement mixed in.
  distance: (a, b) => {
    const da = milesFromAnchor(a);
    const db = milesFromAnchor(b);
    if (da === null || db === null) return bestMatch(a, b);
    return da - db || bestMatch(a, b);
  },
};

function visibleListings() {
  const scoped = LISTINGS.filter(inScope);
  const filtered = scoped.filter(passesFilters);
  return { scoped, filtered: filtered.sort(SORTERS[state.sort] || SORTERS.relevance) };
}

/* --- rendering: cards ---------------------------------------------------- */
function programBadge(listing) {
  if (listing.access === "med") {
    return el("span", { class: "badge badge--lav", text: "Medical only" });
  }
  if (listing.access === "both") {
    return el("span", { class: "badge badge--gold", text: "Adult-use + medical" });
  }
  return el("span", { class: "badge badge--gold", text: "Adult-use 21+" });
}

function openBadge(listing) {
  if (isOpenNow(listing)) {
    return el("span", { class: "badge badge--money" }, [
      el("i", { class: "dot" }),
      "Open now",
    ]);
  }
  return el("span", {
    class: "badge badge--off",
    text: "Opens " + formatTime(listing.hours.open),
  });
}

function buildCard(listing) {
  const miles = formatMiles(milesFromAnchor(listing));

  const card = el(
    "button",
    {
      class: "card",
      type: "button",
      dataset: { id: listing.id },
      "aria-label": listing.name + ", " + listing.city + ", " + listing.state + ". View details.",
    },
    [
      el("div", { class: "card-head" }, [
        el("h3", { text: listing.name }),
        el("span", { class: "card-rating" }, [
          "★ " + listing.rating.toFixed(1),
          el("small", { text: "(" + listing.reviews + ")" }),
        ]),
      ]),
      el("p", { class: "card-meta" }, [
        el("b", { text: listing.city + ", " + listing.state + " " + listing.zip }),
        miles ? "  ·  " + miles + " away" : "",
        el("br"),
        listing.street + "  ·  " + listing.priceTier,
      ]),
      el("div", { class: "badges" }, [
        programBadge(listing),
        openBadge(listing),
        listing.delivery && el("span", { class: "badge", text: "Delivery" }),
        listing.verified && el("span", { class: "badge badge--gold", text: "Verified" }),
      ]),
      el("div", { class: "card-foot" }, [
        el("span", { class: "card-tags", text: listing.categories.slice(0, 3).join(" / ") }),
        el("span", { class: "card-cta" }, ["Details", el("span", { text: "→" })]),
      ]),
    ]
  );

  card.addEventListener("click", () => openDetail(listing));
  return card;
}

/* --- rendering: detail dialog ------------------------------------------- */
const dialog = $("detail");

function openDetail(listing) {
  const program = PROGRAM_LABELS[listing.program];
  const miles = formatMiles(milesFromAnchor(listing));
  const stateInfo = STATE_BY_CODE[listing.state];

  $("detailName").textContent = listing.name;
  $("detailAddress").textContent =
    listing.street + ", " + listing.city + ", " + listing.state + " " + listing.zip +
    (miles ? "  ·  " + miles + " away" : "");

  const facts = el("dl", { class: "detail-grid" }, [
    el("div", {}, [el("dt", { text: "Program" }), el("dd", { text: program.long })]),
    el("div", {}, [
      el("dt", { text: "Hours today" }),
      el("dd", { text: formatTime(listing.hours.open) + " - " + formatTime(listing.hours.close) }),
    ]),
    el("div", {}, [
      el("dt", { text: "Status" }),
      el("dd", { text: isOpenNow(listing) ? "Open now" : "Closed" }),
    ]),
    el("div", {}, [
      el("dt", { text: "Rating" }),
      el("dd", { text: listing.rating.toFixed(1) + " / 5  (" + listing.reviews + " reviews)" }),
    ]),
    el("div", {}, [el("dt", { text: "Price" }), el("dd", { text: listing.priceTier })]),
    el("div", {}, [
      el("dt", { text: "Verification" }),
      el("dd", { text: listing.verified ? "Verified listing" : "Unverified" }),
    ]),
  ]);

  $("detailBody").replaceChildren(
    facts,
    el("div", { class: "detail-section" }, [
      el("h4", { text: "Services" }),
      el("div", { class: "badges" },
        listing.services.map((s) => el("span", { class: "badge", text: s }))),
    ]),
    el("div", { class: "detail-section" }, [
      el("h4", { text: "Categories" }),
      el("div", { class: "badges" },
        listing.categories.map((c) => el("span", { class: "badge badge--gold", text: c }))),
    ]),
    el("p", {
      class: "detail-note",
      text:
        "Sample listing. " + listing.stateName + " is regulated by the " +
        stateInfo.regulator + ". Status snapshot " + DATA_AS_OF +
        " - confirm current rules and licences with the regulator. " +
        "Nothing here is an offer to sell.",
    })
  );

  if (typeof dialog.showModal === "function") dialog.showModal();
}

/* --- rendering: legality panel ------------------------------------------ */
function countStatesWithListings() {
  return new Set(LISTINGS.map((l) => l.state)).size;
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
    title.textContent = "Nationwide view";
    bodyText.textContent =
      "Showing every sample listing across " + countStatesWithListings() +
      " states. Search a ZIP or pick a state to see the program that applies there.";
    action.hidden = true;
    return;
  }

  const info = STATE_BY_CODE[state.stateCode];
  const program = PROGRAM_LABELS[info.program];
  panel.dataset.tone = program.tone;
  flag.textContent = info.code;
  title.textContent = info.name + " - " + program.long;

  const hasListings = LISTINGS.some((l) => l.state === info.code);
  if (info.program === "none") {
    bodyText.textContent =
      info.name + " has no public cannabis program, so there are no legal retail " +
      "dispensaries to list. " + info.regulator + ". Snapshot " + DATA_AS_OF +
      " - verify before you travel.";
  } else if (info.program === "cbd") {
    bodyText.textContent =
      info.name + " permits low-THC or CBD products only - not retail cannabis " +
      "dispensaries. Regulator: " + info.regulator + ". Snapshot " + DATA_AS_OF +
      " - verify before you travel.";
  } else if (!hasListings) {
    bodyText.textContent =
      info.name + " runs a " + program.long.toLowerCase() + " program, but this " +
      "concept dataset carries no sample metros there yet. Regulator: " + info.regulator + ".";
  } else {
    bodyText.textContent =
      program.long + ". Regulator: " + info.regulator + ". Snapshot " + DATA_AS_OF +
      " - confirm current rules with the regulator.";
  }

  action.hidden = false;
  action.textContent = "Clear state";
}

/* --- rendering: state grid ---------------------------------------------- */
function renderStateGrid() {
  const counts = LISTINGS.reduce((acc, l) => {
    acc[l.state] = (acc[l.state] || 0) + 1;
    return acc;
  }, {});

  const tiles = STATES.map((info) => {
    const count = counts[info.code] || 0;
    const program = PROGRAM_LABELS[info.program];
    const tile = el(
      "button",
      {
        class: "state-tile",
        type: "button",
        dataset: { program: info.program, code: info.code },
        "aria-label": info.name + ". " + program.long + ". " + count + " sample listings.",
      },
      [
        el("em", { "aria-hidden": "true" }),
        el("b", { text: info.code }),
        el("span", { text: info.name }),
        el("small", { text: count ? count + " listings" : program.short }),
      ]
    );
    tile.addEventListener("click", () => {
      state.stateCode = info.code;
      state.query = "";
      state.filters.clear();
      $("query").value = "";
      const metro = METROS.find((m) => m.state === info.code);
      state.anchor = metro || null;
      state.sort = metro ? "distance" : "relevance";
      $("sort").value = state.sort;
      state.limit = PAGE_SIZE;
      update();
      $("directory").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return tile;
  });

  $("stateGrid").replaceChildren(...tiles);
}

/* --- rendering: stats + ticker ------------------------------------------ */
function renderStats() {
  $("statListings").textContent = String(LISTINGS.length);
  $("statStates").textContent = String(countStatesWithListings());
  $("statMetros").textContent = String(
    new Set(LISTINGS.map((l) => l.city + "|" + l.state)).size
  );
  $("statRec").textContent = String(STATES.filter((s) => s.program === "rec").length);
  $("asOf").textContent = DATA_AS_OF;
}

function renderTicker() {
  const cities = [...new Set(LISTINGS.map((l) => l.city + ", " + l.state))];
  const run = () => {
    const span = el("span");
    cities.forEach((city) => {
      span.append(document.createTextNode(city + " "));
      span.append(el("b", { text: "✦" }));
      span.append(document.createTextNode(" "));
    });
    return span;
  };
  // Two identical runs: the marquee translates -50%, so the seam is invisible.
  $("ticker").replaceChildren(run(), run());
}

/* --- rendering: hero colour key ----------------------------------------- */
/*
 * The key is derived from STATES, never typed by hand - so the counts in the
 * hero can never drift away from the state grid further down the page.
 */
function renderHeroKey() {
  const order = ["rec", "med", "cbd", "none"];
  const counts = STATES.reduce((acc, s) => {
    acc[s.program] = (acc[s.program] || 0) + 1;
    return acc;
  }, {});

  const rows = order.map((key) =>
    el("div", { class: "hero-key-row", dataset: { program: key } }, [
      el("i", { "aria-hidden": "true" }),
      el("span", { text: PROGRAM_LABELS[key].long }),
      el("b", { text: (counts[key] || 0) + " states" }),
    ])
  );

  $("heroKey").replaceChildren(
    el("div", { class: "hero-key-head", text: "What the colours mean" }),
    ...rows
  );
}

/* --- the single repaint -------------------------------------------------- */
function update() {
  const { scoped, filtered } = visibleListings();

  // Chip counts measure the scope, so each label tells you what it would yield.
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
    const reason =
      info && (info.program === "none" || info.program === "cbd")
        ? info.name + " has no legal retail dispensaries to list, so this is the " +
          "correct result rather than a search failure."
        : "Nothing matches that combination. Try clearing a filter or widening the search.";
    results.replaceChildren(
      el("div", { class: "empty" }, [
        el("h3", { text: "No listings here" }),
        el("p", { text: reason }),
      ])
    );
  } else {
    results.replaceChildren(...page.map(buildCard));
  }

  $("resultCount").replaceChildren(
    el("b", { text: String(filtered.length) }),
    document.createTextNode(
      " listing" + (filtered.length === 1 ? "" : "s") +
      (state.stateCode ? " in " + STATE_BY_CODE[state.stateCode].name : " nationwide") +
      (page.length < filtered.length ? "  ·  showing " + page.length : "")
    )
  );

  const dirty = state.filters.size > 0 || state.query.trim() !== "" || state.stateCode !== null;
  $("resetFilters").hidden = !dirty;
  $("loadMore").hidden = page.length >= filtered.length;
}

/* --- search resolution --------------------------------------------------- */
/**
 * One text box, three kinds of answer: a ZIP, a city, or a state. Resolving
 * in that order matters - "10011" must never be read as a city name.
 */
function resolveSearch(raw) {
  const value = raw.trim();
  if (!value) return { ok: false, message: "Enter a ZIP code, city or state." };

  // 1. ZIP
  if (/^\d+$/.test(value)) {
    if (value.length !== 5) {
      return { ok: false, message: "US ZIP codes are five digits. Try 94607." };
    }
    const code = stateFromZip(value);
    const info = code ? STATE_BY_CODE[code] : null;
    if (!info) {
      return {
        ok: false,
        message: value + " does not resolve to one of the 50 states or D.C.",
      };
    }
    const anchor = anchorForZip(value);
    const program = PROGRAM_LABELS[info.program];
    return {
      ok: true,
      stateCode: code,
      anchor,
      message:
        value + " is in " + info.name + " - " + program.long + "." +
        (anchor ? " Nearest sample metro: " + anchor.city + "." : " No sample metros in this state."),
    };
  }

  const lower = value.toLowerCase();

  // 2. City
  const metro =
    METROS.find((m) => m.city.toLowerCase() === lower) ||
    METROS.find((m) => m.city.toLowerCase().startsWith(lower));
  if (metro) {
    const info = STATE_BY_CODE[metro.state];
    return {
      ok: true,
      stateCode: metro.state,
      anchor: metro,
      query: metro.city,
      message: metro.city + ", " + metro.state + " - " + PROGRAM_LABELS[info.program].long + ".",
    };
  }

  // 3. State, by name or two-letter code
  const info =
    STATES.find((s) => s.name.toLowerCase() === lower) ||
    STATES.find((s) => s.code.toLowerCase() === lower) ||
    STATES.find((s) => s.name.toLowerCase().startsWith(lower));
  if (info) {
    const anchor = METROS.find((m) => m.state === info.code) || null;
    return {
      ok: true,
      stateCode: info.code,
      anchor,
      message: info.name + " - " + PROGRAM_LABELS[info.program].long + ".",
    };
  }

  return { ok: false, message: 'No ZIP, city or state matched "' + value + '".' };
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

  const reset = () => {
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
  };

  $("resetFilters").addEventListener("click", reset);
  // The legality panel's action clears the state selection only.
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

function wireSignup() {
  const form = $("signupForm");
  const email = $("email");
  const zip = $("signupZip");
  const zipState = $("signupState");
  const ageCheck = $("ageCheck");
  const result = $("signupResult");

  // Live ZIP -> state readout, using the same lookup the directory uses, so
  // the form can never disagree with the search.
  zip.addEventListener("input", () => {
    zip.value = zip.value.replace(/\D/g, "").slice(0, 5);
    zip.removeAttribute("aria-invalid");
    const code = zip.value.length === 5 ? stateFromZip(zip.value) : null;
    const info = code ? STATE_BY_CODE[code] : null;
    zipState.value = info ? info.code + " - " + PROGRAM_LABELS[info.program].short : "";
  });

  email.addEventListener("input", () => email.removeAttribute("aria-invalid"));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    result.classList.remove("error");

    const fail = (message, node) => {
      result.textContent = message;
      result.classList.add("error");
      if (node) {
        node.setAttribute("aria-invalid", "true");
        node.focus();
      }
    };

    if (!email.value.trim() || !email.validity.valid) {
      return fail("Enter a valid email address.", email);
    }
    if (!/^\d{5}$/.test(zip.value)) {
      return fail("Enter a valid five-digit US ZIP code.", zip);
    }
    if (!STATE_BY_CODE[stateFromZip(zip.value)]) {
      return fail(zip.value + " does not resolve to a US state or D.C.", zip);
    }
    if (!ageCheck.checked) {
      result.textContent = "Please confirm you are 21 or older.";
      result.classList.add("error");
      ageCheck.focus();
      return;
    }

    result.textContent =
      "Demo complete. Nothing was sent, subscribed or stored - there is no backend to send it to.";
    form.reset();
    zipState.value = "";
    email.removeAttribute("aria-invalid");
    zip.removeAttribute("aria-invalid");
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
renderStats();
renderHeroKey();
renderTicker();
renderStateGrid();
wireHero();
wireToolbar();
wireSignup();
wireNav();
update();
