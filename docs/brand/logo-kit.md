---
last_updated: 2026-11-03
status: active
---

# Deepfy logo kit — Imaging Ring

Approved mark: **Concept C · Imaging Ring** (open concentric scan arcs + focal dot).
Not the D-letter variants.

## Brand colours

| Role | Hex | Use |
|------|-----|-----|
| Primary | `#0F766E` | Default colour mark / wordmark |
| Accent | `#2DD4BF` | Focal-dot highlight (optional) |
| Black | `#000000` | One-colour on light |
| White | `#FFFFFF` | One-colour on dark |

Wordmark: **Inter SemiBold** (outlined as paths in lockups).

## SVG (`svg/`)

### Symbol (square 256)
| File | Notes |
|------|--------|
| `deepfy-symbol.svg` | Master, black filled outlines |
| `deepfy-symbol-color.svg` | Primary `#0F766E` |
| `deepfy-symbol-color-accent.svg` | Primary rings + accent focus dot |
| `deepfy-symbol-white.svg` | For dark backgrounds |
| `deepfy-symbol-currentColor.svg` | Inherits CSS `color` |
| `deepfy-symbol-black.svg` / `*-mono-0f766e.svg` | Export one-colours |
| `deepfy-symbol-square.svg` | Padded avatar master |
| `deepfy-symbol-favicon.svg` / `*-app-icon.svg` | Tab / app tile |

### Small (16–32 px)
Use these under ~32 px instead of the full dual-ring:
| File | Notes |
|------|--------|
| `deepfy-symbol-small.svg` | Single heavier ring + larger focus |
| `deepfy-symbol-small-color.svg` | Primary |
| `deepfy-symbol-small-color-accent.svg` | Primary + accent focus |
| `deepfy-symbol-small-white.svg` | Dark backgrounds |
| `deepfy-symbol-small-currentColor.svg` | CSS `color` |

### Horizontal lockup (mark + “Deepfy”)
| File | Notes |
|------|--------|
| `deepfy-horizontal.svg` | Black |
| `deepfy-horizontal-color.svg` | Primary |
| `deepfy-horizontal-color-accent.svg` | Primary + accent focus |
| `deepfy-horizontal-white.svg` | Dark backgrounds |
| `deepfy-horizontal-currentColor.svg` | CSS `color` |
| `deepfy-horizontal-black.svg` / `*-mono-0f766e.svg` | Export one-colours |

## PNG (`png/`)

- Symbol: `*-512.png`, `*-180.png` (black / white / mono / color / color-accent / square / app-icon / favicon)
- Lockup: `deepfy-horizontal-*-1200.png`
- Social: `deepfy-og-1200x630.png` (light), `deepfy-og-1200x630-dark.png`

## Web / PWA (`web/`)

`favicon.ico`, `favicon-16/32/48.png`, `favicon.svg`, `apple-touch-icon.png`,
`icon-192.png`, `icon-512.png`, `maskable-512.png`, `site.webmanifest`, `head-snippet.html`.

Paste `head-snippet.html` into your document `<head>`, and host the listed files at site root (or adjust paths).

## Usage notes

1. Prefer **SVG** everywhere; fall back to PNG when needed.
2. Below ~32 px UI icons, use **`deepfy-symbol-small*`**.
3. On photos or busy grounds, prefer the solid primary or a white plate behind the mark.
4. `currentColor` variants: set CSS `color` on the parent; fill follows.
5. Do not re-stroke or add drop shadows to the master paths.
6. Clear space: keep ≥ 1× focus-dot diameter around the mark.

## Clear-space / minimum size

- Symbol minimum: **16 px** (small master) / **24 px** (full dual-ring)
- Lockup minimum height: **24 px**

## 本项目约定（2026-11-03）

- 全站所有尺寸统一用**双环**（`src/ui/Logo.tsx`），不使用 kit 里的单环小尺寸版 `deepfy-symbol-small*`。
- 应用图标（`app/icon.svg`、`apple-icon.png`、`favicon.ico`、`public/icon-*.png`、`maskable-512.png`）按双环重新生成：青绿底 + 白色双环；favicon 的标志放大到 80% 以保证 16px 下两道环仍可分辨。
