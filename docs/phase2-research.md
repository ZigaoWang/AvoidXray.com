# Phase 2 research: corrected mappings, with sources

Sourced corrections to the phase 2 mapping. **Supersedes the plan wherever they
conflict.** Six findings changed the migration; two of them prevented destroying
real data.

Every attribution has a source URL, carried into
`prisma/seed/manufacturer-attributions.json` so the phase 5 provenance backfill
can read them rather than the values landing bare.

---

## 1. There are two separate "Ilford" companies

The biggest finding. It invalidates the proposed `Ilford → Harman` parent edge.

- **Ilford Photo** is the trading name of **Harman Technology Ltd**, Mobberley
  UK. Makes HP5 Plus, Delta, Kentmere and Harman Phoenix. Formed 2005 by former
  managers of Ilford Imaging UK.
- **Ilford Imaging Europe GmbH** is a separate entity, Swiss in origin and now
  German. It **owns the Ilford trademark** and licenses it to Harman for the
  black and white products. It sells Ilfocolor colour film, single-use cameras
  and inkjet paper.

HP5 Plus and Ilfocolor are from different companies that both print ILFORD on
the box. Harman's licence explicitly does not extend to colour film.

**Applied:** no `parentBrandId` on Ilford. The relationship is a trademark
licence and it runs the opposite way from ownership: Ilford Imaging owns the
mark and Harman rents it. Recording it as ownership would invite exactly the
manufacturer inference the column must not support: true for HP5 Plus, false for
Ilfocolor. One `Ilford` brand row, since that is what appears on both boxes and
what users search; the distinction is carried per stock by
`manufacturedByBrandId`. Asserted by test 14 in `prisma/tests/constraints.sql`.

`Kentmere → Harman` **is** genuine ownership and stays. Harman acquired Kentmere
Photographic in 2007 and moved production to Mobberley.

- https://en.wikipedia.org/wiki/Ilford_Photo
- https://www.analog.cafe/r/harman-phoenix-200-vs-ilford-ilfocolor-400-md99
- https://dustygrain.com/ilfocolor-400-vintage-tone-news/

---

## 2. Do not merge the two Ilfocolor rows, different products

The plan treated them as a casing typo on one line. They are two films:

| | Ilfocolor 400 Plus Vintage Tone | Ilfocolor Vivid 400 |
|---|---|---|
| Exposures | 24 | 36 |
| Launched | Nov/Dec 2023 | later, reviewed 2026 |
| Look | muted warm, lower contrast, selective saturation | punchy, saturated, compared to Ektar 100 |

**Applied:** both rows kept. Rename row one to include "Vintage Tone" (part of
the actual product name and the thing that distinguishes them) and normalise
casing to `Ilfocolor` on both, per the manufacturer's own store. These are edits,
not merges.

Manufacturer for both: not officially disclosed; one analysis suggests ORWO. A
*historical* Ilfocolor 400 Plus sold in Italy around 2005 was made by Ferrania. That is
a different, discontinued product that must not be conflated with this one.

- https://ilfocolor.com/product/ilford-ilfocolor-vintage-tone-400-plus-24-exp/
- https://shootitwithfilm.com/ilfocolor-vivid-400-film-review/
- https://thedarkroom.com/film/ilfocolor-400-plus-vintage-tone/

---

## 3. Fujifilm 400 and Fujicolor 400: confirmed not to merge

Superia X-tra 400 was discontinued in all markets in 2024 and replaced by
Fujifilm 400, **contract manufactured by Kodak**, made in the USA. Fujicolor 400
is a separate regional product; Fuji's consumer 400 offerings are regionalised
and the US product is not the same as elsewhere.

Two rows, same brand, different manufacturers. That is precisely the distinction phase 2
exists to represent. The merge would have destroyed it.

- https://en.wikipedia.org/wiki/Fujifilm_Superia
- https://www.35mmc.com/11/07/2023/fujifilm-400-made-in-the-usa-vs-kodak-ultramax-400-the-same-or-different/
- https://www.analog.cafe/r/fujifilm-400-film-review-lm4s

---

## 4. Jam Camera is real, and it is Yes!Star

The description was a correct reading, not an invention. `Yes!Star 400 Jam Camera
(36)` is a reusable 135 camera pre-loaded with ISO 400 colour negative film.

**Applied:** `brandId = brand_yesstar`, not null. Corporate entity is Yestar
Healthcare Holdings, operating in Nanning via Guangxi Giant Star Medical
Equipment Co Ltd; both carried as brand aliases, which resolves the
`Yestar` / `Yes!Star` spelling mismatch.

- https://www.hkfilminglab.com/product/yesstar-200-jam-camera/
- https://www.thephoblographer.com/2024/08/05/a-new-compact-film-camera-by-yesstar-is-coming-soon/

---

## 5. Lucky Color 200 and 400 are genuinely Lucky-made

China Lucky Film coats these in Baoding, Hebei. Lucky Color 200 launched at the
Shanghai Image & Vision Expo in July 2025, the company's first colour film since
discontinuing its range in 2012, initial run around 10,000 rolls. Lucky Color 400
followed within roughly half a year.

Lucky was historically Kodak's OEM partner and Kodak took a stake in 2003, which
is where the doubt came from, but the current films are their own coating.

**Applied:** both `SAME_AS_BRAND`, not `UNKNOWN`.

- https://kosmofoto.com/2025/08/reflx-lab-shows-results-from-first-batch-of-new-lucky-color-200-film/
- https://www.35mmc.com/31/05/2026/lucky-color-400-5-frames-with-this-soon-to-be-released-film/
- https://reflxlab.com/blogs/news/lucky-color-film-2025-update

---

## 6. Orwo Wolfen NC400 is daylight balanced, and it is Orwo's own

Left null earlier because it was unsourced; now sourced, so it can be filled.
That is the intended cycle of null, then research, then a sourced fill. It is not a reversal. It
must still not be filled by inference from the other twenty C-41 rows.

Manufacturer is ORWO, still coating at the original Bitterfeld-Wolfen site, so
`SAME_AS_BRAND`.

**Complication:** NC400 carries no remjet and runs in **either C-41 or ECN-2**.
`process` is single-valued. Recorded as C-41, which is how it is sold for still
photography, with the ECN-2 compatibility noted in the description. This is the
first case arguing for `process` becoming a set rather than a scalar. Not
changed now.

- https://www.bhphotovideo.com/c/product/1783229-REG/orwo_nc400_16mm_100ft_400_iso_16mm_color.html
- https://www.ballardfilm.com/products/wolfen-nc400-color

---

## 7. `ManufacturerStatus` gains a fourth member: `ATTRIBUTED`

Several stocks have a manufacturer **widely reported by credible sources but
never officially confirmed**, because OEM and contract-coating arrangements are
routinely undisclosed. `UNKNOWN` throws that information away; `KNOWN` overstates
it. Same collapse we removed from `film_type`, one column over.

```
SAME_AS_BRAND | KNOWN | ATTRIBUTED | UNKNOWN
```

`ATTRIBUTED` requires `manufacturedByBrandId IS NOT NULL`, same CHECK as `KNOWN`.
Render as "reported as Kodak", never as a bare manufacturer name. This is the
single most useful thing the catalogue can offer that Lomography's cannot,
because "who actually makes this" is exactly what people argue about.

| Stock | Attributed to | Basis |
|---|---|---|
| Fujifilm 400 | Kodak | Wikipedia states it; independent analyses concur |
| Lomography Color Negative 400 | Kodak | long-standing consensus, never confirmed |
| Yes!Star 400 | Kodak | see below |

---

## 8. Yes!Star 400: two layers of rebrand

The most tangled row in the catalogue, and a good test of `parentStockId`.

Fujifilm relocated C200 and C400 production to China in 2024 with Yes!Star as the
production partner. FujiRumors reported the Yes!Star 400 launched alongside the
S1 camera is very likely rebranded Fujifilm C400. Separately, photos from the
facility led to informed speculation that it is a finishing operation cutting and
packaging Kodak master rolls rather than coating emulsion. A retailer listing
describes it as manufactured by an American film company and packaged in mainland
China.

**Applied:** Yes!Star brand, `ATTRIBUTED` to Kodak. Fujifilm C400 is the
intermediate product and is **not** a row in this catalogue, do not invent it.
Research item for phase 3's `parentStockId`.

- https://www.fujirumors.com/yesstar-s1-camera-to-be-launched-july-1-with-yesstar-400-film-rebranded-fujifilm-c400/
- https://petapixel.com/2024/06/24/fujifilm-set-to-restart-color-film-production-in-china-report/
- https://kosmofoto.com/2024/06/fujifilm-colour-films-china/

---

## Corrected film-side manufacturer table

| Stock | Brand | Status | Manufacturer |
|---|---|---|---|
| Ilford HP5 Plus 400 | Ilford | KNOWN | Harman |
| Kentmere Pan 400 | Kentmere | KNOWN | Harman |
| Harman Phoenix II 200 | Harman | SAME_AS_BRAND | Harman |
| Ilfocolor 400 Plus Vintage Tone | Ilford | UNKNOWN | ORWO suspected, unconfirmed |
| Ilfocolor Vivid 400 | Ilford | UNKNOWN | unconfirmed |
| Cinestill 800T | Cinestill | KNOWN | Kodak (respool of Vision3 500T) |
| Fujifilm 400 | Fujifilm | ATTRIBUTED | Kodak |
| Fujicolor 400 | Fujifilm | UNKNOWN | regional product, unconfirmed |
| Fujifilm Superia Premium 400 | Fujifilm | UNKNOWN | **not researched** |
| Yes!Star 400 | Yes!Star | ATTRIBUTED | Kodak |
| Lucky Color 200 | Lucky | SAME_AS_BRAND | China Lucky Film |
| Lucky Color 400 | Lucky | SAME_AS_BRAND | China Lucky Film |
| Orwo Wolfen NC400 | Orwo | SAME_AS_BRAND | ORWO, Bitterfeld-Wolfen |
| Lomography Color Negative 400 | Lomography | ATTRIBUTED | Kodak |
| LomoChrome Color '92 | Lomography | UNKNOWN | own formula claimed, coater undisclosed |
| Ferrania P30 | Ferrania | SAME_AS_BRAND | FILM Ferrania |
| All Kodak rows | Kodak | SAME_AS_BRAND | Kodak |

`Fujifilm Superia Premium 400` was **not researched** and must not be assumed.
`UNKNOWN` here records that nobody has checked, which is deliberately not the
same claim as in-house.

---

## Camera mapping: unchanged except row 5

`Jam Camera` → Yes!Star. Everything else stands. `Konica → null` holds: Konica
Minolta is a 2003 entity and the K-mini is a 1990 camera, so recording a merger
that postdates the product as ownership is the same overreach as manufacturer
inference. `Fujica → Fujifilm` is correct as ownership. `Kodak Snapic A1` stays
Kodak for brand; who builds it under licence is a different question and cameras
have no manufacturer column.
