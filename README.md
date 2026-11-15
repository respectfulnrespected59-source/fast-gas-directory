# Fast Gas - Nationwide Dispensary Directory

A nationwide cannabis dispensary directory concept. Search any US ZIP code, see
the state program that applies, and filter clearly-labelled sample listings
across all 50 states and D.C.

Static site. No backend, no build step.

## What is real and what is not

This distinction is load-bearing - it is why the site can demonstrate real
behaviour without putting words in a real business's mouth.

| Data | Status |
|---|---|
| ZIP prefix to state | **Real.** Public USPS three-digit prefix allocation (`ZIP3_RANGES`). |
| Cities, ZIPs, coordinates | **Real.** 59 metros across 40 states. |
| State program status + regulator | **Real, but a snapshot.** Stamped `DATA_AS_OF`; laws change. Not legal advice. |
| Dispensary names, ratings, hours, addresses | **Fictional.** Deterministically generated from a seed. |

States with low-THC/CBD-only programs or no program carry **no listings at
all** - that is the correct answer, not a search failure, and the UI says so
explicitly rather than showing a bare empty grid.

## Layout

```
index.html            entry document; the SVG sprite (gold bong mark) lives here
assets/tokens.css     palette, type scale, spacing, the gold-glow shadow
assets/styles.css     components
assets/data.js        ZIP ranges, state programs, metros, listing generator
assets/app.js         one state object, one update() repaint
assets/favicon.svg
render.yaml           Render blueprint + security headers
build-single.mjs      flattens everything into dist/quantus-app.html
```

## Run it locally

Module scripts need a real origin - `file://` will not work.

```sh
python -m http.server 8877
# http://127.0.0.1:8877/
```

## Single-file build

```sh
node build-single.mjs      # -> dist/quantus-app.html
```

The multi-file site is the source of truth. The flattener strips `export` from
`data.js`, strips the import block from `app.js`, and concatenates both into one
IIFE, so the two forms cannot drift. Re-run it after any change.

Note: the single-file build necessarily relaxes its CSP to allow inline script
and style. The deployed multi-file site does not - every script and style is an
external file, which is why there are no inline `style=` attributes anywhere.

## Swapping in real listings

Replace `buildListings()` in `assets/data.js`. Everything downstream reads only
the shape it returns:

```js
{
  id, name, city, state, stateName, zip, street,
  lat, lng, rating, reviews,
  access: "rec" | "med" | "both",
  program: "rec" | "med",
  hours: { open, close },        // minutes from local midnight
  services: [], categories: [],
  priceTier, delivery, verified
}
```

If you do swap in real businesses, update the FAQ and the detail-dialog note -
both currently state plainly that the listings are fictional.

## Deploy

Render blueprint (`render.yaml`): static site, publish path `.`, no build
command. The blueprint sets CSP, HSTS, `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`.

## Tests

`tests/fg-probe.mjs` drives the running site with Playwright: 31 checks
covering console cleanliness, ZIP resolution, the no-program path,
medical-only invariants, chip-count/result-total agreement, best-match
precedence, the detail dialog, and horizontal overflow at 1440 and 390.

```sh
python -m http.server 8877                 # serve the site
node tests/fg-probe.mjs                    # test localhost
FG_URL=https://fast-gas-directory.onrender.com/ node tests/fg-probe.mjs
```

Needs Playwright on the path. Screenshots land in `dist/` (git-ignored).

### Ranking

`bestMatch()` in `assets/app.js` is a precedence chain, not a weighted sum:

> open now > half-mile distance band > text match > rating > verified > name

Proximity strictly outranks star rating, for the case where someone needs
somewhere open right now rather than the best-reviewed place across town. A
weighted sum could not express that - any decaying distance curve flattens
far enough out that a `verified` bonus plus a rating edge out-votes it, so
farther shops climbed above nearer ones. Rating is never consulted until
distance has tied. The half-mile band is what stops a 50-foot difference from
outranking a whole star.

## 21+

Concept site. No sales, carts or payments. Not legal advice.
