---
type: resource
status: active
area: creative
sub-area: brand
created: 2026-08-19
updated: 2026-08-19
tags: [topic/brand, project/captionato, resource/brand-guidelines]
---

# Captionato — Brand Kit

> **One calm brand, assembled like a pin kit.**
> Motto: **Stay soft. Ship sharp.**

This is the source-of-truth for the Captionato identity. It exists in two synced forms:

1. **These notes** — the working reference, here in the vault.
2. **The shareable web page** — [`site/index.html`](site/index.html) (open in a browser). Same guidelines, built to show the brand off. Send this link when someone asks "what's your brand?" Toggle **light / dark** in the top-right — brand colors stay fixed, only the ground flips.

**World:** *The Enamel Badge.* Every brand element is treated as a collectible, precisely-spec'd enamel pin. Cute on the outside, caliper-precise on the inside. The capybara leads.

**Temperament:** warm, friendly, unbothered, quietly precise — a capybara. Calm, kind, never in a hurry, but the specs are exact.

---

## Plate 01 · The Mark  `CAP-MRK`

A single calm capybara, rendered as a domed hard-enamel pin (red field, brass keyline).

- **Primary mark:** the capybara enamel pin (red plate + brass rim). Use where the badge can be shown in full color.
- **Single-color mark:** the capybara knockout — works in Ink, Ember Red, or reversed (cream on a dark ground). Adapts to any background because the eyes/nose are true knockouts.
- **Wordmark lockup:** the mark + "Captionato" set in Bricolage Grotesque 800, tight tracking.
- **Clear space:** keep a margin of at least `x` on all sides, where `x` = the height of the mark's ear. Never crowd it.

**Do:** give the pin room to breathe and keep it upright. A calm capy is a centered capy.
**Don't:** stretch, tilt hard, recolor the fur, or drop the brass rim. The pin is one fixed object.

> Mascot is authored SVG (in `site/index.html`, symbols `#capyPin` and `#capyGlyph`). Wide loaf head, tiny ears, dominant blunt nose — that broad nose is what makes it read *capybara* and not *bear*. Keep that proportion in any redraw.

---

## Plate 02 · Palette  `CAP-CLR`

Two colors carry the brand; three keep it warm. **Red leads, ink grounds, brass is the metal you earn.**

| Role | Name | Hex | Use |
|---|---|---|---|
| Signal | **Ember Red** | `#D6362B` | Primary actions, the mark's field, one bold accent per view. |
| Ground/structure | **Ink** | `#141110` | Warm near-black. Body text, structure, the dark "felt board" sections. |
| Metal accent | **Brass** | `#C6A24E` | Keyline rims and small marks only. Precious — never a large fill. |
| Default ground | **Paper Cream** | `#F1E7D6` | The backing card. Warm, matte, easy on the eyes. |
| Secondary warmth | **Capy Brown** | `#9A6A45` | The fur. Quiet dividers and the friendly hand of the brand. |

Support tones (derived, for depth): Ember Deep `#AC281F`, Brass Bright `#E6C877`, Ink-2 `#2A2320`, Cream Hi `#FAF3E6`.
Warm secondary text: `#6A584A` on cream, `#B8A894` on ink (both ≥4.5:1). **Never neutral gray** — tint from the warm palette.

**Strategy:** cream is the default ground; punctuate with dark felt sections so the enamel pins pop. Red is a signal, not a wash.

---

## Plate 03 · Typeface Kit  `CAP-TYP`

Three faces, three jobs. All free on Google Fonts.

| # | Role | Face | Job | Weights |
|---|---|---|---|---|
| 01 | **Display** | Bricolage Grotesque | Headlines, wordmark, the loud moments. Set bold + tight (`-0.04em`). | 600 / 700 / 800 |
| 02 | **Text** | Hanken Grotesk | Everything you actually read. Friendly, roomy, professional. | 400 / 500 / 600 |
| 03 | **Type** | Courier Prime | The typewriter. Specs, codes, labels, catalog numbers, small print. | 400 / 700 |

- Body measure 65–75 characters. Display capped around 6rem.
- Monospace is for **specs and codes**, not decoration.

---

## Plate 04 · Voice  `CAP-VOX`

Talk like the capybara looks: calm, kind, and never in a hurry. **Warm first, clever second.** Say the true thing plainly, add one small kindness, and stop.

- **Calm** — no hype, no urgency, no exclamation pile-ups.
- **Kind** — assume the reader is smart and having a normal day.
- **Precise** — short words, real numbers, name the thing.
- **Playful** — one wink per page, earned, never forced.

**We say:** "Saved. Take your time — it'll be here when you get back."
**Not this:** "SUCCESS!! 🚀 Your changes have been saved instantly!!!"

---

## Plate 05 · In the Wild  `CAP-APP`

The same pin, pulled off the card and worn everywhere Captionato shows up.

- **App icon** — cream capybara knockout on an Ember Red rounded-square tile.
- **Profile avatar** — capybara on Capy Brown inside a brass ring.
- **Sticker sheet** — the pin, a color chip, and single-color marks as a set.
- **Product UI** — mark + wordmark in the bar; Ember Red primary buttons; monospace status chips (Live / Draft).

---

## Plate 06 · Favicon & Social  `CAP-ICO`

- **Favicon:** cream capybara knockout on an Ember Red tile — reads at 16px. `assets/favicon.svg` (+ `favicon-32/192/512.png`, `apple-touch-icon.png`).
- **Social / Open Graph card:** `assets/og-image.png` (1200×630) — capy pin + wordmark + motto on cream with a brass keyline. Wired into the page `<head>` (og + twitter meta).

## Plate 07 · Stickers & Merch  `CAP-MRCH`

- **Print-ready sticker sheet:** `assets/stickers/sticker-sheet.png` — the enamel pin, single-color marks (circles + squares), and a wordmark strip, drawn as die-cut stickers.
- **Merch:** tee and tote mockups on the page; drop the single-color mark on anything (it's one flat color, prints cheap).

## Plate 08 · Email Signature  `CAP-SIG`

- **File:** `email-signature.html` — table-based, so it survives every mail client. Uses Arial + a raster mark by necessity (clients strip web fonts/SVG).
- **To use:** host the mark PNG (`assets/email-mark-128.png`) somewhere public, update the `<img src>`, edit name/links, then copy-paste into your signature editor.

## Plate 09 · The Asset Kit  `CAP-DL`

All exports live under `site/assets/`. The page's last plate is a download index linking every file.

| Group | Files |
|---|---|
| **Marks** | `marks/capybara-pin.svg` · `marks/capybara-mark-{ink,ember,cream}.svg` · transparent PNGs: `capybara-pin-{256,512}.png`, `capybara-mark-{ink,ember,cream}-512.png` (+256 for ink/ember) |
| **Icons** | `favicon.svg` · `favicon-32/192/512.png` · `apple-touch-icon.png` |
| **Social / Stickers** | `og-image.png` · `stickers/sticker-sheet.png` |
| **Email** | `../email-signature.html` · `email-mark-128.png` |

> The single-color marks (`capybara-mark-*.svg`) have true transparent knockouts for the eyes and nose, so they sit on any background. These are the everyday workhorses — the enamel pin is for hero moments. To regenerate the PNGs, re-run the render sources in `assets/_render/`.

---

## Reusing the brand in a project

Copy the **`starter/`** folder into any new project — it's the portable, self-contained unit:

```
starter/
├─ tokens.css          all colors, type, radii, shadows (light + dark, --cap- prefixed)
├─ marks/              logo, single-color marks, favicon (SVG)
├─ preview.html        open to see it working + copy component snippets
└─ USING-THE-KIT.md    quickstart
```

**Rule:** copy the *starter*, never the whole kit. If the brand changes, update it here and re-copy. Build UI with the semantic tokens (`--cap-bg`, `--cap-surface`, `--cap-text`, `--cap-accent`) so dark mode flips for free. For hosted apps, better still: host `tokens.css` + `marks/` on captionato.tech and link them, so updates propagate everywhere.

## Provenance

- Direction: **The Enamel Badge** (Impeccable new-work roll, seed `6a87a8ad`, grounded candidate #6), user-confirmed 2026-08-19.
- Build: code-led standalone page, self-contained `site/index.html`.
- Voice, motto ("Stay soft. Ship sharp."), and all example copy are **drafts** — swap freely; only the name, colors, three-font structure, and capybara are fixed brand truth (see [[PRODUCT]]).

_Related: [[_Creative]]_
