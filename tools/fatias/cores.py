# troca a cor da PINTURA (faixa de tom da cor original), sem mexer em ferrugem, pneus e vidros
import numpy as np
def rgb2hsv(C):
    c = C / 255.0; mx = c.max(1); mn = c.min(1); d = mx - mn + 1e-9
    r, g, b = c[:, 0], c[:, 1], c[:, 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, (mx - mn) / (mx + 1e-9), 0); return h, s, mx
def hsv2rgb(h, s, v):
    c = v * s; x = c * (1 - np.abs((h / 60) % 2 - 1)); m = v - c; z = np.zeros_like(h); k = (h // 60).astype(int) % 6
    r = np.choose(k, [c, x, z, z, x, c]); g = np.choose(k, [x, c, c, x, z, z]); b = np.choose(k, [z, z, x, c, c, x])
    return np.stack([r + m, g + m, b + m], 1) * 255
def repaint(src_hue, dst_hue=None, sat=1.0, val=1.0, band=38, smin=0.12):
    def f(C):
        h, s, v = rgb2hsv(C)
        dh = np.abs((h - src_hue + 180) % 360 - 180); w = np.clip((band - dh) / 12, 0, 1) * np.clip((s - smin) / 0.08, 0, 1)
        nh = h if dst_hue is None else (h + (dst_hue - src_hue)) % 360
        ns = np.clip(s * sat, 0, 1); nv = np.clip(v * val, 0, 1)
        out = hsv2rgb(nh, ns, nv); return C * (1 - w[:, None]) + out * w[:, None]
    return f
