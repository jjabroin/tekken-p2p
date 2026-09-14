"""Build 8 palette-swapped fighter atlases from CC0 'Angry Guy' sprites (by nemezes, OpenGameArt).

Usage: python3 tools/build_sprites.py
Input : /tmp sprite extraction dir (RAW_DIR)
Output: src/assets/chars/{char0..7}.png + atlas.json + portraits/portrait{i}.png + CREDITS.txt
"""
import colorsys
import json
import os
from collections import OrderedDict

from PIL import Image

RAW_DIR = '/var/folders/_1/hc09t4qn4y54npmjzcsf9w1m0000gn/T/opencode/sprites/raw'
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       'public', 'assets', 'chars')

# logical frame name -> source file
FRAMES = OrderedDict([
    ('idle0', 'idle_000.png'), ('idle1', 'idle_001.png'),
    ('idle2', 'idle_002.png'), ('idle3', 'idle_003.png'),
    ('walkf0', 'walk_000.png'), ('walkf1', 'walk_002.png'),
    ('walkf2', 'walk_004.png'), ('walkf3', 'walk_006.png'),
    ('walkb0', 'walkback_optional_000b.png'), ('walkb1', 'walkback_optional_002b.png'),
    ('walkb2', 'walkback_optional_004b.png'), ('walkb3', 'walkback_optional_006b.png'),
    ('jab0', 'punch_000.png'), ('jab1', 'punch_001.png'), ('jab2', 'punch_002.png'),
    ('jab3', 'punch_003.png'),
    ('cross0', 'punch2_000.png'), ('cross1', 'punch2_001.png'),
    ('cross2', 'punch2_002.png'), ('cross3', 'punch2_003.png'),
    ('lk0', 'kick_000.png'), ('lk1', 'kick_001.png'), ('lk2', 'kick_002.png'),
    ('rk0', 'kick_002.png'), ('rk1', 'kick_003.png'), ('rk2', 'kick_004.png'),
    ('rk3', 'kick_005.png'),
    ('hop0', 'jump_004.png'), ('hop1', 'kick_003.png'), ('hop2', 'kick_004.png'),
    ('up0', 'punch_001.png'), ('up1', 'punch2_002.png'),
    ('jump0', 'jump_002.png'), ('jump1', 'jump_004.png'), ('jump2', 'jump_006.png'),
    ('air0', 'jump_punch_002.png'), ('air1', 'jump_punch_003.png'),
    ('block', 'block_000.png'),
    ('down', 'landed_000.png'),
    ('win', 'idle_002.png'),
    ('rage0', 'punch2_002.png'), ('rage1', 'kick_005.png'),
])

CHARS = [
    dict(name='KAZUMA', style='미시마류 가라테',
         skin=(232, 176, 106), shirt=(242, 242, 242), pants=(42, 42, 58),
         hair=(24, 24, 24), shoes=(192, 32, 32)),
    dict(name='PAULO', style='파워 스트라이커',
         skin=(216, 154, 90), shirt=(192, 32, 32), pants=(42, 74, 138),
         hair=(232, 192, 32), shoes=(64, 32, 32)),
    dict(name='KINGU', style='루차 레슬러',
         skin=(176, 112, 48), shirt=(32, 64, 192), pants=(32, 64, 192),
         hair=(216, 160, 32), shoes=(216, 160, 32)),
    dict(name='SAKDA', style='무에타이',
         skin=(192, 128, 64), shirt=(192, 128, 64), pants=(192, 32, 32),
         hair=(16, 16, 16), shoes=(128, 16, 16)),
    dict(name='RICO', style='카포에이라',
         skin=(138, 90, 48), shirt=(232, 192, 32), pants=(242, 242, 242),
         hair=(16, 16, 16), shoes=(32, 160, 64)),
    dict(name='AYAME', style='쿠노이치',
         skin=(240, 200, 160), shirt=(96, 32, 128), pants=(32, 32, 46),
         hair=(16, 16, 24), shoes=(96, 32, 128)),
    dict(name='HEIJI', style='노장 가라테',
         skin=(216, 168, 120), shirt=(58, 58, 74), pants=(58, 58, 74),
         hair=(192, 192, 192), shoes=(32, 32, 32)),
    dict(name='JACKAL', style='격투 로봇',
         skin=(144, 152, 168), shirt=(80, 80, 94), pants=(48, 48, 56),
         hair=(192, 32, 32), shoes=(40, 40, 46)),
]


def lum(rgb):
    r, g, b = rgb
    return 0.299 * r + 0.587 * g + 0.114 * b


def slot_of(r, g, b):
    """Classify a source pixel into a recolor slot (or None to keep)."""
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    h *= 360
    if v < 0.22:
        return None  # outline: keep black
    if s < 0.12 and v > 0.88:
        return None  # eye white: keep
    if 45 <= h <= 68 and s > 0.6 and v > 0.75:
        return None  # angry yellow eyes: keep
    if 265 <= h <= 335 and s > 0.15:
        return 'shoes'  # purple shoes
    if 75 <= h <= 155 and s > 0.3:
        return 'shirt'  # green shirt
    if s < 0.22 and 0.55 <= v <= 0.95:
        return 'pants'  # gray pants
    if 8 <= h <= 45 and (s > 0.55 or v < 0.55):
        return 'hair'  # dark/saturated brown-orange hair
    if 15 <= h <= 48 and s > 0.2:
        return 'skin'  # tan skin
    return None


# Precompute slot LUT over all 24-bit colors? No — classify per unique color per frame.
def recolor(im, pal):
    im = im.convert('RGBA')
    px = list(im.getdata())
    uniq = {}
    out = []
    tgt_lum = {k: lum(v) for k, v in pal.items()}
    for p in px:
        r, g, b, a = p
        if a < 128:
            out.append(p)
            continue
        key = (r, g, b)
        if key not in uniq:
            slot = slot_of(r, g, b)
            if slot is None:
                uniq[key] = p
            else:
                t = pal[slot]
                ratio = lum((r, g, b)) / max(1, tgt_lum[slot])
                ratio = min(1.6, max(0.45, ratio))
                uniq[key] = (min(255, int(t[0] * ratio)),
                             min(255, int(t[1] * ratio)),
                             min(255, int(t[2] * ratio)), a)
        out.append(uniq[key])
    im2 = Image.new('RGBA', im.size)
    im2.putdata(out)
    return im2


def trim(im):
    bbox = im.getbbox()
    if not bbox:
        return im, (0, 0)
    l, t, r, b = bbox
    pad = 2
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.size[0], r + pad)
    b = min(im.size[1], b + pad)
    return im.crop((l, t, r, b)), (l, t, r, b)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(os.path.join(OUT_DIR, 'portraits'), exist_ok=True)

    # Load + trim base frames once
    base = OrderedDict()
    for name, fn in FRAMES.items():
        im = Image.open(os.path.join(RAW_DIR, fn)).convert('RGBA')
        t, box = trim(im)
        # anchor: feet bottom-center of bbox (before pad)
        l, tt, r, bb = box
        full = Image.open(os.path.join(RAW_DIR, fn)).convert('RGBA')
        fb = full.getbbox()
        ax = (fb[0] + fb[2]) / 2 - l  # from trimmed left
        ay = (t.size[1] - 1) - (fb[3] - 1 - tt)  # from trimmed bottom... feet=fb bottom
        ay = t.size[1] - (fb[3] - tt)
        base[name] = (t, {'ax': round(ax, 1), 'ay': round(ay, 1)})

    # Pack grid
    names = list(FRAMES.keys())
    cell = 128
    cols = 8
    rows = (len(names) + cols - 1) // cols

    atlas_meta = {'cell': cell, 'cols': cols, 'frames': {}}
    for idx, name in enumerate(names):
        cx, cy = (idx % cols) * cell, (idx // cols) * cell
        im, anch = base[name]
        atlas_meta['frames'][name] = {
            'x': cx, 'y': cy, 'w': im.size[0], 'h': im.size[1],
            'ax': anch['ax'], 'ay': anch['ay'],
        }

    for i, ch in enumerate(CHARS):
        pal = {k: ch[k] for k in ('skin', 'shirt', 'pants', 'hair', 'shoes')}
        sheet = Image.new('RGBA', (cols * cell, rows * cell), (0, 0, 0, 0))
        for idx, name in enumerate(names):
            im, _ = base[name]
            rc = recolor(im, pal)
            q = rc.quantize(colors=64, method=Image.FASTOCTREE).convert('RGBA')
            sheet.paste(q, ((idx % cols) * cell, (idx // cols) * cell), q)
        sheet.save(os.path.join(OUT_DIR, f'char{i}.png'), optimize=True)
        print('wrote char%d.png' % i)

        # portrait: head crop from idle0 (top-center), 2x nearest
        idle, _ = base['idle0']
        ridle = recolor(idle, pal)
        iw, ih = ridle.size
        px, py, pw, ph = iw // 2 - 22, 0, 44, 40
        por = ridle.crop((max(0, px), py, min(iw, px + pw), min(ih, py + ph)))
        por = por.resize((por.size[0] * 2, por.size[1] * 2), Image.NEAREST)
        por.save(os.path.join(OUT_DIR, 'portraits', f'portrait{i}.png'), optimize=True)

    with open(os.path.join(OUT_DIR, 'atlas.json'), 'w') as f:
        json.dump(atlas_meta, f)

    with open(os.path.join(OUT_DIR, 'CREDITS.txt'), 'w') as f:
        f.write(
            'Base sprites: "Angry Guy" by nemezes (OpenGameArt.org, CC0 2017).\n'
            'https://opengameart.org/content/angry-guy\n'
            '8 fighters are palette-swapped variants generated by tools/build_sprites.py.\n')
    print('done:', OUT_DIR)


if __name__ == '__main__':
    main()