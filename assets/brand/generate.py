#!/usr/bin/env python3
"""
Generate every AgileFlow brand asset from the source mark.

Usage: python3 assets/brand/generate.py --font /path/to/Inter.ttf
(Inter variable font: https://github.com/google/fonts/tree/main/ofl/inter)

The identity is achromatic: black foundation, silver brand color, white.
"""
import argparse
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BRAND = os.path.join(ROOT, 'assets', 'brand')

# Palette
CORE_BLACK = (9, 9, 11)        # #09090B
GRAPHITE = (24, 24, 27)        # #18181B
CHARCOAL = (39, 39, 42)        # #27272A
STEEL = (113, 113, 122)        # #71717A
SILVER = (191, 195, 201)       # #BFC3C9  brand color
OFF_WHITE = (244, 244, 245)    # #F4F4F5
WHITE = (255, 255, 255)        # #FFFFFF

TAGLINE = 'Portable workflows for coding agents'


def load_mark() -> Image.Image:
    src = Image.open(os.path.join(BRAND, 'agileflow-mark-source.png')).convert('RGBA')
    # Drop the near-invisible halo (alpha < 8) and crop to the visible mark.
    r, g, b, a = src.split()
    a = a.point(lambda v: 0 if v < 8 else v)
    src = Image.merge('RGBA', (r, g, b, a))
    return src.crop(a.getbbox())


def load_wordmark() -> Image.Image:
    """Metallic mark + wordmark lockup (README banner, social preview)."""
    src = Image.open(os.path.join(BRAND, 'agileflow-wordmark-source.png')).convert('RGBA')
    r, g, b, a = src.split()
    a = a.point(lambda v: 0 if v < 8 else v)
    src = Image.merge('RGBA', (r, g, b, a))
    return src.crop(a.getbbox())


def square(mark: Image.Image, size: int, fill: float, background=None) -> Image.Image:
    canvas = Image.new('RGBA', (size, size), background + (255,) if background else (0, 0, 0, 0))
    scale = fill * size / max(mark.size)
    m = mark.resize((round(mark.width * scale), round(mark.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return canvas


def font(path: str, size: int, weight: str) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(path, size)
    f.set_variation_by_name(weight)
    return f


def lockup(mark: Image.Image, font_path: str, height: int, text_color, background=None) -> Image.Image:
    """Mark + wordmark on one line. `height` is the mark height."""
    m = mark.resize((round(mark.width * height / mark.height), height), Image.LANCZOS)
    f = font(font_path, round(height * 0.62), 'SemiBold')
    probe = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
    l, t, r, b = probe.textbbox((0, 0), 'AgileFlow', font=f)
    gap = round(height * 0.32)
    pad = round(height * 0.08)
    w = pad + m.width + gap + (r - l) + pad
    h = height + 2 * pad
    canvas = Image.new('RGBA', (w, h), background + (255,) if background else (0, 0, 0, 0))
    canvas.alpha_composite(m, (pad, pad))
    d = ImageDraw.Draw(canvas)
    d.text((pad + m.width + gap - l, pad + (height - (b - t)) // 2 - t), 'AgileFlow', font=f, fill=text_color)
    return canvas


def card(mark: Image.Image, font_path: str, size, mark_height: int, wordmark: Image.Image | None = None) -> Image.Image:
    """Near-black card with the lockup (or the metallic wordmark), tagline, and a thin silver rule."""
    w, h = size
    canvas = Image.new('RGBA', size, CORE_BLACK + (255,))
    d = ImageDraw.Draw(canvas)
    # Subtle vertical graphite gradient.
    for y in range(h):
        t = y / (h - 1)
        c = tuple(round(CORE_BLACK[i] + (GRAPHITE[i] - CORE_BLACK[i]) * (1 - abs(0.5 - t) * 2) * 0.6) for i in range(3))
        d.line([(0, y), (w, y)], fill=c + (255,))
    if wordmark is not None:
        wh = round(mark_height * 1.1)
        lk = wordmark.resize((round(wordmark.width * wh / wordmark.height), wh), Image.LANCZOS)
    else:
        lk = lockup(mark, font_path, mark_height, WHITE)
    tag_font = font(font_path, round(mark_height * 0.26), 'Regular')
    tl, tt, tr, tb = d.textbbox((0, 0), TAGLINE, font=tag_font)
    total_h = lk.height + round(mark_height * 0.28) + (tb - tt)
    top = (h - total_h) // 2
    canvas.alpha_composite(lk, ((w - lk.width) // 2, top))
    ty = top + lk.height + round(mark_height * 0.28)
    d.text(((w - (tr - tl)) // 2 - tl, ty - tt), TAGLINE, font=tag_font, fill=SILVER)
    # Thin silver hairline frame.
    inset = max(2, round(min(w, h) * 0.02))
    d.rounded_rectangle([inset, inset, w - inset - 1, h - inset - 1], radius=inset * 2, outline=CHARCOAL, width=2)
    return canvas


def save(img: Image.Image, *rel: str, mode: str = 'RGBA') -> None:
    path = os.path.join(ROOT, *rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = img if mode == 'RGBA' else img.convert(mode)
    out.save(path, optimize=True)
    print(f'wrote {os.path.relpath(path, ROOT)} {img.size}')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--font', required=True, help='Inter variable TTF')
    args = ap.parse_args()
    mark = load_mark()
    wordmark = load_wordmark()

    # Masters
    save(square(mark, 1024, 0.88), 'assets', 'brand', 'agileflow-mark.png')
    save(square(mark, 1024, 0.66, CORE_BLACK), 'assets', 'brand', 'agileflow-mark-on-black.png')
    save(lockup(mark, args.font, 256, WHITE), 'assets', 'brand', 'agileflow-lockup-dark.png')
    save(lockup(mark, args.font, 256, CORE_BLACK), 'assets', 'brand', 'agileflow-lockup-light.png')

    # Repository
    save(square(mark, 512, 0.88), 'assets', 'logo.png')
    save(card(mark, args.font, (1280, 400), 140, wordmark), 'assets', 'banner.png', mode='RGB')
    save(card(mark, args.font, (1280, 640), 180, wordmark), 'assets', 'social-preview.png', mode='RGB')

    # Sites: icons on a near-black tile so the metallic mark reads everywhere.
    for app in ('website', 'docs'):
        pub = ('apps', app, 'public')
        save(lockup(mark, args.font, 96, WHITE), *pub, 'brand', 'agileflow-lockup-dark.png')
        save(lockup(mark, args.font, 96, CORE_BLACK), *pub, 'brand', 'agileflow-lockup-light.png')
        save(square(mark, 512, 0.88), *pub, 'brand', 'agileflow-mark.png')
        save(card(mark, args.font, (1200, 630), 170), *pub, 'og.png', mode='RGB')
        save(card(mark, args.font, (1280, 640), 180), *pub, 'banner.png', mode='RGB')
        save(square(mark, 180, 0.66, CORE_BLACK), *pub, 'apple-touch-icon.png', mode='RGB')
        save(square(mark, 32, 0.8, CORE_BLACK), *pub, 'favicon-32x32.png')
        save(square(mark, 16, 0.84, CORE_BLACK), *pub, 'favicon-16x16.png')
        ico = square(mark, 256, 0.8, CORE_BLACK)
        ico_path = os.path.join(ROOT, *pub, 'favicon.ico')
        ico.save(ico_path, sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
        print(f'wrote {os.path.relpath(ico_path, ROOT)}')
    for size in (192, 512):
        save(square(mark, size, 0.66, CORE_BLACK), 'apps', 'docs', 'public', f'android-chrome-{size}x{size}.png', mode='RGB')
    save(square(mark, 512, 0.88), 'apps', 'docs', 'public', 'logo.png')


if __name__ == '__main__':
    main()
