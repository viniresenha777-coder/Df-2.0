# Fatias do carro para "sprite stacking": vista de cima, cada fatia = superfície mais alta ABAIXO da altura de corte.
# Empilhadas no jogo (uma por altura, na perspectiva da câmera), as bordas das fatias formam as laterais do carro.
import sys, json, numpy as np
from PIL import Image
sys.path.insert(0, '/tmp/evt'); from render import load
SRC = '/mnt/user-data/uploads/fronteiraMorta_src/cars/zhiguli_soviet_cars/scene.gltf'
PPM = 80          # pixels por metro (o jogo mostra até ~90 px/m com nitidez máxima)
DZ = 0.05         # espessura da fatia (m) = 1 unidade do mundo (20 por metro)
LEN = 4.1         # comprimento do carro (m), como no cars.py
SS = 2            # supersample

def prep(V):
    V = np.c_[V[:, 0], -V[:, 2], V[:, 1]]           # glTF Y-cima -> Z-cima
    xy = V[:, :2] - V[:, :2].mean(0)
    w, E = np.linalg.eigh(np.cov(xy.T)); ax = E[:, np.argmax(w)]; a = -np.arctan2(ax[1], ax[0])
    R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]]); V[:, :2] = V[:, :2] @ R.T
    lo, hi = V.min(0), V.max(0); k = LEN / (hi[0] - lo[0])
    V = (V - [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]]) * k
    front = V[V[:, 0] > LEN * 0.3, 2].mean(); back = V[V[:, 0] < -LEN * 0.3, 2].mean()
    if front > back: V[:, :2] *= -1                  # capô (lado mais baixo) para +X: frente para a direita
    return V

def slices(tri):
    V, UV, I, tex = tri
    V = prep(V.copy())
    lo, hi = V.min(0), V.max(0)
    pad = 0.05
    W = int(np.ceil((hi[0] - lo[0] + 2 * pad) * PPM)); H = int(np.ceil((hi[1] - lo[1] + 2 * pad) * PPM))
    SW, SH = W * SS, H * SS
    X = (V[:, 0] - lo[0] + pad) * PPM * SS; Y = (hi[1] + pad - V[:, 1]) * PPM * SS; Z = V[:, 2]
    th, tw = tex.shape[:2]
    v1 = V[I[:, 1]] - V[I[:, 0]]; v2 = V[I[:, 2]] - V[I[:, 0]]; nr = np.cross(v1, v2); nr /= np.linalg.norm(nr, axis=1, keepdims=True) + 1e-12
    L = np.array([-0.45, 0.35, 0.82]); L /= np.linalg.norm(L)
    lam = 0.38 + 0.72 * np.abs(nr @ L)                # laterais (normal horizontal) saem mais escuras
    # rasteriza uma vez guardando todos os fragmentos (pixel, z, cor); depois cada corte escolhe o mais alto abaixo dele
    frags_p, frags_z, frags_c = [], [], []
    for k in range(len(I)):
        i0, i1, i2 = I[k]; x = X[[i0, i1, i2]]; y = Y[[i0, i1, i2]]
        x0, x1 = max(int(np.floor(x.min())), 0), min(int(np.ceil(x.max())), SW - 1)
        y0, y1 = max(int(np.floor(y.min())), 0), min(int(np.ceil(y.max())), SH - 1)
        if x1 < x0 or y1 < y0: continue
        den = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
        if abs(den) < 1e-9:      # triângulo de lado (parede vertical): rasteriza como linha grossa
            continue
        px, py = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((y[1] - y[2]) * (px - x[2]) + (x[2] - x[1]) * (py - y[2])) / den
        w1 = ((y[2] - y[0]) * (px - x[2]) + (x[0] - x[2]) * (py - y[2])) / den; w2 = 1 - w0 - w1
        m = (w0 >= -1e-3) & (w1 >= -1e-3) & (w2 >= -1e-3)
        if not m.any(): continue
        z = (w0 * Z[i0] + w1 * Z[i1] + w2 * Z[i2])[m]
        u = ((w0 * UV[i0, 0] + w1 * UV[i1, 0] + w2 * UV[i2, 0]) % 1)[m]; v = ((w0 * UV[i0, 1] + w1 * UV[i1, 1] + w2 * UV[i2, 1]) % 1)[m]
        col = tex[(v * (th - 1)).astype(int), (u * (tw - 1)).astype(int)] * lam[k]
        frags_p.append((py[m].astype(int)) * SW + px[m].astype(int)); frags_z.append(z); frags_c.append(col)
    P = np.concatenate(frags_p); Zf = np.concatenate(frags_z); C = np.concatenate(frags_c)
    order = np.argsort(Zf); P, Zf, C = P[order], Zf[order], C[order]
    nsl = int(np.ceil(hi[2] / DZ)); out = []
    for s in range(nsl):
        cut = (s + 1) * DZ
        m = Zf <= cut + 1e-6
        img = np.zeros((SH * SW, 4))
        # em ordem crescente de z: o último escrito em cada pixel é o mais alto abaixo do corte
        img[P[m], :3] = C[m]; img[P[m], 3] = 255
        im = Image.fromarray(np.clip(img.reshape(SH, SW, 4), 0, 255).astype('uint8'), 'RGBA').resize((W, H), Image.LANCZOS)
        out.append(im)
    info = dict(w=W, h=H, n=nsl, ppm=PPM, dz=DZ, cx=round((0 - lo[0] + pad) * PPM, 1), cy=round((hi[1] + pad - 0) * PPM, 1),
                fw=round(hi[0] - lo[0], 3), fd=round(hi[1] - lo[1], 3), hz=round(hi[2], 3))
    return out, info

if __name__ == '__main__':
    tris = load(SRC)       # ordem: cinza, azul, verde, vermelho
    names = {0: 'car_3', 1: 'car_2', 2: 'car_1', 3: 'car_0'}   # car_0 vermelho, car_1 verde, car_2 azul, car_3 cinza (cars.py)
    meta = {}
    for i, t in enumerate(tris):
        sl, info = slices(t)
        sheet = Image.new('RGBA', (info['w'], info['h'] * info['n']))
        for s, im in enumerate(sl): sheet.paste(im, (0, s * info['h']))
        sheet.save(f'/home/claude/fatias/{names[i]}_fatias.png', optimize=True)
        meta[names[i]] = info; print(names[i], info)
    json.dump(meta, open('/home/claude/fatias/meta.json', 'w'))
