"""Genera el logo de iocrino y los iconos de Android (resources/android/res).
Uso: python3 scripts/iconos.py  (necesita Pillow). Las pantallas de arranque usan los
tamaños de la plantilla de Capacitor, así que hay que haber hecho antes «npm run android»."""
from PIL import Image, ImageDraw
import math, os, glob

BG = (31, 35, 43, 255); TEAL = (92, 203, 187, 255); WHITE = (255, 255, 255, 255)

def drop_poly(cx, cy, r, d, n=200):
    sb = r / d; cb = math.sqrt(1 - sb * sb)
    t1 = (cx + r * cb, cy - r * sb); t2 = (cx - r * cb, cy - r * sb)
    a1 = math.atan2(t1[1] - cy, t1[0] - cx); a2 = math.atan2(t2[1] - cy, t2[0] - cx)
    if a2 < a1: a2 += 2 * math.pi
    pts = [(cx, cy - d)]
    for i in range(n + 1):
        a = a1 + (a2 - a1) * i / n; pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

def logo(size, bg=None, scale=1.0, drop=TEAL, stem=WHITE, shape='square'):
    S = 4; W = size * S
    im = Image.new('RGBA', (W, W), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    if bg:
        if shape == 'circle': dr.ellipse([0, 0, W - 1, W - 1], fill=bg)
        elif shape == 'rounded': dr.rounded_rectangle([0, 0, W - 1, W - 1], radius=int(W * 0.22), fill=bg)
        else: dr.rectangle([0, 0, W, W], fill=bg)
    k = W / 1024 * scale; c = W / 2
    P = lambda x, y: (c + (x - 512) * k, c + (y - 480) * k)
    dr.polygon([P(x, y) for x, y in drop_poly(512, 330, 112, 232)], fill=drop)   # el punto de la «i»: una gota
    x0, y0 = P(440, 498); x1, y1 = P(584, 860)
    dr.rounded_rectangle([x0, y0, x1, y1], radius=int(72 * k), fill=stem)        # el palo de la «i»
    return im.resize((size, size), Image.LANCZOS)

if __name__ == '__main__':
    out = 'resources/android/res'
    for dn, f in {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}.items():
        d = f'{out}/mipmap-{dn}'; os.makedirs(d, exist_ok=True)
        logo(int(48 * f), BG, 0.80, shape='rounded').save(f'{d}/ic_launcher.png')
        logo(int(48 * f), BG, 0.80, shape='circle').save(f'{d}/ic_launcher_round.png')
        logo(int(108 * f), None, 0.56).save(f'{d}/ic_launcher_foreground.png')
        n = f'{out}/drawable-{dn}'; os.makedirs(n, exist_ok=True)
        logo(int(24 * f), None, 1.1, drop=WHITE, stem=WHITE).save(f'{n}/ic_stat_iocrino.png')
    for p in glob.glob('android/app/src/main/res/drawable*/splash.png'):
        w, h = Image.open(p).size; rel = p.split('res/')[1]
        os.makedirs(f'{out}/' + os.path.dirname(rel), exist_ok=True)
        im = Image.new('RGBA', (w, h), BG); m = int(min(w, h) * 0.34); L = logo(m, None, 1.0)
        im.paste(L, ((w - m) // 2, (h - m) // 2), L); im.convert('RGB').save(f'{out}/{rel}')
    os.makedirs(f'{out}/values', exist_ok=True)
    open(f'{out}/values/ic_launcher_background.xml', 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1F232B</color>\n</resources>\n')
    logo(512, BG, 0.80, shape='rounded').save('resources/icono-512.png')
    print('iconos generados')
