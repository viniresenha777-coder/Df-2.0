# Fatias com laterais de verdade: miolo de cada fatia = vista de cima abaixo do corte; borda (faixa de alguns px)
# = cor da vista lateral (esquerda/direita/frente/trás) na altura do corte.
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, '/tmp/evt'); from render import load
sys.path.insert(0, '/home/claude/fatias'); from fatiar import prep, SRC, PPM, DZ, LEN
SS = 2; BAND = 4 * SS        # faixa da borda que recebe a cor da lateral (px na resolução final x SS)

def frags(V, UV, I, tex, ua, va, da, scale, off_u, off_v, flip_v, lam):
    """rasteriza projetando no plano (ua, va); devolve pixels, profundidade (eixo da) e cor"""
    U = (V[:, ua] - off_u) * scale; Vv = (off_v - V[:, va]) * scale if flip_v else (V[:, va] - off_v) * scale
    D = V[:, da]; th, tw = tex.shape[:2]; P, Z, C = [], [], []
    for k in range(len(I)):
        i0, i1, i2 = I[k]; x = U[[i0, i1, i2]]; y = Vv[[i0, i1, i2]]
        x0, x1 = int(np.floor(x.min())), int(np.ceil(x.max())); y0, y1 = int(np.floor(y.min())), int(np.ceil(y.max()))
        den = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
        if abs(den) < 1e-9 or x1 < x0 or y1 < y0: continue
        px, py = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((y[1] - y[2]) * (px - x[2]) + (x[2] - x[1]) * (py - y[2])) / den
        w1 = ((y[2] - y[0]) * (px - x[2]) + (x[0] - x[2]) * (py - y[2])) / den; w2 = 1 - w0 - w1
        m = (w0 >= -1e-3) & (w1 >= -1e-3) & (w2 >= -1e-3)
        if not m.any(): continue
        z = (w0 * D[i0] + w1 * D[i1] + w2 * D[i2])[m]
        u = ((w0 * UV[i0, 0] + w1 * UV[i1, 0] + w2 * UV[i2, 0]) % 1)[m]; v = ((w0 * UV[i0, 1] + w1 * UV[i1, 1] + w2 * UV[i2, 1]) % 1)[m]
        P.append(np.c_[px[m].astype(int), py[m].astype(int)]); Z.append(z); C.append(tex[(v * (th - 1)).astype(int), (u * (tw - 1)).astype(int)] * lam[k])
    return np.concatenate(P), np.concatenate(Z), np.concatenate(C)

def zimage(P, Z, C, W, H, sign):
    """imagem com o fragmento mais próximo do observador (maior sign*Z)"""
    img = np.zeros((H, W, 3)); has = np.zeros((H, W), bool)
    ok = (P[:, 0] >= 0) & (P[:, 0] < W) & (P[:, 1] >= 0) & (P[:, 1] < H)
    P, Z, C = P[ok], Z[ok], C[ok]; o = np.argsort(sign * Z)
    img[P[o, 1], P[o, 0]] = C[o]; has[P[o, 1], P[o, 0]] = True
    return img, has

def build(tri):
    V, UV, I, tex = tri; V = prep(V.copy())
    lo, hi = V.min(0), V.max(0); pad = 0.05; s = PPM * SS
    W = int(np.ceil((hi[0] - lo[0] + 2 * pad) * PPM)); H = int(np.ceil((hi[1] - lo[1] + 2 * pad) * PPM))
    SW, SH = W * SS, H * SS; HZ = int(np.ceil((hi[2] + pad) * s))
    v1 = V[I[:, 1]] - V[I[:, 0]]; v2 = V[I[:, 2]] - V[I[:, 0]]; nr = np.cross(v1, v2); nr /= np.linalg.norm(nr, axis=1, keepdims=True) + 1e-12
    Lt = np.array([-0.45, 0.35, 0.82]); Lt /= np.linalg.norm(Lt)
    lam = 0.38 + 0.72 * np.abs(nr @ Lt)
    # vista de cima: todos os fragmentos (x, y, z)
    Pt, Zt, Ct = frags(V, UV, I, tex, 0, 1, 2, s, lo[0] - pad, hi[1] + pad, True, lam)
    o = np.argsort(Zt); Pt, Zt, Ct = Pt[o], Zt[o], Ct[o]
    # vistas laterais (coordenadas: x ou y no horizontal, z no vertical, de cima para baixo)
    side = {}
    side['+y'] = zimage(*frags(V, UV, I, tex, 0, 2, 1, s, lo[0] - pad, hi[2] + pad, True, lam), SW, HZ, +1)   # lado esquerdo (y+)
    side['-y'] = zimage(*frags(V, UV, I, tex, 0, 2, 1, s, lo[0] - pad, hi[2] + pad, True, lam), SW, HZ, -1)   # lado direito (y-)
    side['+x'] = zimage(*frags(V, UV, I, tex, 1, 2, 0, s, -(hi[1] + pad), hi[2] + pad, True, lam) if False else frags(V, UV, I, tex, 1, 2, 0, s, lo[1] - pad, hi[2] + pad, True, lam), SH, HZ, +1)
    side['-x'] = zimage(*frags(V, UV, I, tex, 1, 2, 0, s, lo[1] - pad, hi[2] + pad, True, lam), SH, HZ, -1)
    nsl = int(np.ceil(hi[2] / DZ)); out = []
    for k in range(nsl):
        cut = (k + 1) * DZ
        m = Zt <= cut + 1e-6
        img = np.zeros((SH, SW, 4)); img[Pt[m, 1], Pt[m, 0], :3] = Ct[m]; img[Pt[m, 1], Pt[m, 0], 3] = 255
        mask = img[:, :, 3] > 0
        mask = ndimage.binary_closing(mask, iterations=2); mask = ndimage.binary_fill_holes(mask)
        inner = ndimage.binary_erosion(mask, iterations=BAND)
        band = mask & ~inner
        # direção para fora em cada pixel da borda: gradiente da distância até fora
        dist = ndimage.distance_transform_edt(mask)
        gy, gx = np.gradient(ndimage.gaussian_filter(dist, 2))
        by, bx = np.nonzero(band)
        zrow = int(round((hi[2] + pad - cut + DZ / 2) * s)); zrow = min(max(zrow, 0), HZ - 1)
        nx, ny = -gx[by, bx], -gy[by, bx]          # aponta para fora
        col = np.zeros((len(by), 3)); got = np.zeros(len(by), bool)
        # imagem: y da tela cresce para -y do mundo. ny>0 na tela = lado y- do mundo
        horiz = np.abs(nx) >= np.abs(ny)
        for sel, key, coord in ((horiz & (nx > 0), '+x', by), (horiz & (nx <= 0), '-x', by), (~horiz & (ny > 0), '-y', bx), (~horiz & (ny <= 0), '+y', bx)):
            simg, shas = side[key]
            if key in ('+x', '-x'):
                cc = (SH - 1 - coord[sel]) if False else coord[sel]
                # vista frontal: horizontal = y do mundo crescente; na fatia, linha da tela r = (hi_y+pad - y)*s -> y-index = SH-1-r
                hcoord = SH - 1 - cc
            else:
                hcoord = coord[sel]
            ok = shas[zrow, np.clip(hcoord, 0, simg.shape[1] - 1)]
            c = simg[zrow, np.clip(hcoord, 0, simg.shape[1] - 1)]
            idx = np.nonzero(sel)[0]; col[idx[ok]] = c[ok]; got[idx[ok]] = True
        img[by[got], bx[got], :3] = col[got]; img[by[got], bx[got], 3] = 255
        img[mask & (img[:, :, 3] == 0), 3] = 0
        im = Image.fromarray(np.clip(img, 0, 255).astype('uint8'), 'RGBA').resize((W, H), Image.LANCZOS)
        out.append(im)
    info = dict(w=W, h=H, n=nsl, ppm=PPM, dz=DZ, cx=round(float(0 - lo[0] + pad) * PPM, 1), cy=round(float(hi[1] + pad) * PPM, 1),
                fw=round(float(hi[0] - lo[0]), 3), fd=round(float(hi[1] - lo[1]), 3), hz=round(float(hi[2]), 3))
    return out, info

if __name__ == '__main__':
    tris = load(SRC); names = {0: 'car_3', 1: 'car_2', 2: 'car_1', 3: 'car_0'}; meta = {}
    for i, t in enumerate(tris):
        sl, info = build(t)
        sheet = Image.new('RGBA', (info['w'], info['h'] * info['n']))
        for k, im in enumerate(sl): sheet.paste(im, (0, k * info['h']))
        sheet.save(f'/home/claude/fatias/{names[i]}_fatias.png', optimize=True); meta[names[i]] = info; print(names[i], info['n'])
    json.dump(meta, open('/home/claude/fatias/meta.json', 'w'))
