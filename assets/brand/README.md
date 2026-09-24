# AgileFlow brand

An achromatic identity: black foundation, silver brand color, white. There is no accent color.

## Palette

| Role | Name | Hex |
| --- | --- | --- |
| Core black (foundation, backgrounds) | Near Black | `#09090B` |
| Surface | Graphite | `#18181B` |
| Elevated surface, borders | Charcoal | `#27272A` |
| Muted | Steel Gray | `#71717A` |
| **Brand color** | Metallic Silver | `#BFC3C9` |
| Secondary text | Off White | `#F4F4F5` |
| Primary text | White | `#FFFFFF` |

Metallic range for the mark and subtle gradients: `#FFFFFF` -> `#D9DCE1` -> `#A7ACB4` -> `#5F646C` -> `#18181B`.

Use `#A1A1AA` rather than `#71717A` for muted body text on `#09090B` so it keeps at least 4.5:1 contrast.

## Assets

| File | Use |
| --- | --- |
| `agileflow-mark-source.png` | Original mark (source of everything else) |
| `agileflow-mark.png` | Mark on transparent, 1024 px |
| `agileflow-mark-on-black.png` | Mark on a near-black tile (app icons, avatars) |
| `agileflow-lockup-dark.png` | Mark + white wordmark, for dark backgrounds |
| `agileflow-lockup-light.png` | Mark + near-black wordmark, for light backgrounds |
| `agileflow-wordmark-source.png` | Metallic mark + wordmark lockup (README banner, social preview) |
| `../banner.png`, `../social-preview.png` | README banner, GitHub social preview |

The wordmark is set in Inter SemiBold. Keep clear space around the mark of at least a quarter of its height, and do not recolor, outline, or add effects to it.

## Regenerate

```bash
curl -sL -o /tmp/Inter.ttf "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf"
python3 assets/brand/generate.py --font /tmp/Inter.ttf
```

This rewrites the files above plus the favicons, app icons, lockups, `og.png`, and `banner.png` in `apps/website/public` and `apps/docs/public`.
