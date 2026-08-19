# Using the Captionato Starter

Copy this whole `starter/` folder into any new project. That's it — you now have the brand.

```
starter/
├─ tokens.css          ← all colors, type, radii, shadows (light + dark)
├─ marks/              ← the logo, single-color marks, favicon (SVG)
├─ preview.html        ← open this to see everything working + copy snippets
└─ USING-THE-KIT.md    ← you are here
```

**Golden rule:** copy *this starter*, never the full brand kit. If the brand ever changes, update it in `Captionato-Brand/` and re-copy the starter. One source of truth.

---

## 1. Add the tokens

```html
<link rel="stylesheet" href="tokens.css" />
```
or in CSS/JS build: `@import "tokens.css";`

## 2. Set the base

```css
body {
  background: var(--cap-bg);
  color: var(--cap-text);
  font-family: var(--cap-font-text);
}
h1, h2, h3 {
  font-family: var(--cap-font-display);
  font-weight: 800;
  letter-spacing: var(--cap-display-tracking); /* headlines are always tight */
}
code, .spec { font-family: var(--cap-font-mono); }
```

**Use the semantic tokens** (`--cap-bg`, `--cap-surface`, `--cap-text`, `--cap-text-2`, `--cap-line`, `--cap-accent`) for UI — they flip automatically in dark mode. Use the raw brand tokens (`--cap-ember`, `--cap-brass`…) only when you specifically want that exact color.

## 3. Dark mode

Set it on the root element:

```html
<html data-theme="dark">   <!-- or "light" -->
```
Toggle in one line:
```js
const r = document.documentElement;
r.setAttribute('data-theme', r.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
// (persist with localStorage if you like)
```
`tokens.css` also follows the OS theme automatically until you set `data-theme` yourself. Delete that `@media (prefers-color-scheme)` block in tokens.css if you only want an explicit toggle.

## 4. The mark

```html
<img src="marks/capybara-mark-ember.svg" alt="Captionato" width="40" height="40" />
```
- `capybara-mark-{ink,ember,cream}.svg` — single-color marks; eyes/nose are **transparent knockouts**, so they sit on any background. These are the everyday workhorses.
- `capybara-pin.svg` — the full enamel pin, for hero moments.
- `favicon.svg` — cream capy on a red tile; wire it as `<link rel="icon" href="marks/favicon.svg" type="image/svg+xml">`.

Need raster/PNG? They live in the main kit at `../site/assets/marks/`.

## 5. Ready-made snippets

Open **`preview.html`** in a browser — it renders the palette, type, buttons, badges, and a dark board, all from `tokens.css`. View source to copy any component (button, badge, card, board).

---

## Keep it on-brand (the short list)

- **One signal.** Ember Red leads exactly one moment per view. Everything else is warm neutral.
- **Precious brass.** Brass is a thin keyline metal — never a fill or background.
- **Browned neutrals.** No pure white, no cold gray. Every neutral is warmed (that's why `--cap-text-2` is `#6a584a`, not gray).
- **Warm shadows.** Shadows are tinted toward ink or ember, never neutral gray. Use the `--cap-shadow-*` tokens.
- **Tight display, mono = metadata.** Headlines always tightly tracked; the mono face is only for codes, specs, and labels — never body copy.
- **Don't redraw the capy wrong.** Keep the wide loaf head, tiny ear nubs, and dominant blunt muzzle. Rounding the head or raising the ears turns it into a bear.
- **Voice:** warm first, clever second. Calm, kind, precise, one wink per page. Motto: *Stay soft. Ship sharp.*

Full guidelines: `../_Captionato-Brand.md` (vault) or `../site/index.html` (web). System of record: `DESIGN.md` at the vault root.
