# Fatiador genérico por pontos: espalha pontos coloridos (textura + luz) pela superfície do modelo e monta
#  - 4 vistas laterais (esquerda, direita, frente, trás) e
#  - as fatias de cima (superfície mais alta abaixo de cada altura de corte), com a borda pintada pela lateral.
# Aguenta escaneamentos de milhões de triângulos (tudo vetorizado em numpy).
import json, os, io, sys, numpy as np
from PIL import Image
from scipy import ndimage
PPM, DZ, SS = 80, 0.05, 2
BAND = 4 * SS

def load(path):
    j = json.load(open(path)); d = os.path.dirname(path)
    bins = [open(os.path.join(d, b['uri']), 'rb').read() for b in j['buffers']]
    def bv(i):
        v = j['bufferViews'][i]; b = bins[v.get('buffer', 0)]; o = v.get('byteOffset', 0); return b[o:o + v['byteLength']], v.get('byteStride')
    def acc(i):
        a = j['accessors'][i]; data, st = bv(a['bufferView'])
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        dt = np.dtype({5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[a['componentType']]); off = a.get('byteOffset', 0)
        if st and st != dt.itemsize * n: arr = np.ndarray((a['count'], n), dtype=dt, buffer=data, offset=off, strides=(st, dt.itemsize))
        else: arr = np.frombuffer(data, dtype=dt, count=a['count'] * n, offset=off).reshape(-1, n)
        return np.array(arr, dtype=float if dt.kind == 'f' else np.int64)
    cache = {}
    def image(ti):
        if ti in cache: return cache[ti]
        img = j['images'][j['textures'][ti]['source']]
        if 'uri' in img: im = Image.open(os.path.join(d, img['uri']))
        else: data, _ = bv(img['bufferView']); im = Image.open(io.BytesIO(data))
        im = im.convert('RGB'); im.thumbnail((2048, 2048)); cache[ti] = np.asarray(im).astype(np.float32); return cache[ti]
    def material(mi):
        if mi is None: return np.full((2, 2, 3), 170.0), np.ones(3), False
        m = j['materials'][mi]; p = m.get('pbrMetallicRoughness', {}); nm = (m.get('name') or '').lower()
        fac = np.array((p.get('baseColorFactor') or [1, 1, 1, 1])[:3], dtype=float)
        glass = m.get('alphaMode') == 'BLEND' or 'glass' in nm or 'window' in nm or 'vidro' in nm
        if 'baseColorTexture' in p: return image(p['baseColorTexture']['index']), fac, glass
        return np.full((2, 2, 3), 255.0), fac, glass
    def nmat(n):
        if 'matrix' in n: return np.array(n['matrix']).reshape(4, 4).T
        M = np.eye(4)
        if 'scale' in n: M = np.diag(list(n['scale']) + [1]) @ M
        if 'rotation' in n:
            x, y, z, w = n['rotation']
            R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
            T = np.eye(4); T[:3, :3] = R; M = T @ M
        if 'translation' in n: T = np.eye(4); T[:3, 3] = n['translation']; M = T @ M
        return M
    prims = []
    def walk(ni, P):
        n = j['nodes'][ni]; M = P @ nmat(n)
        nm = (n.get('name') or '').lower()
        if nm.startswith('plane') or 'ground' in nm or 'shadow' in nm or 'floor' in nm: return   # chão/sombra do modelo
        if 'mesh' in n:
            for p in j['meshes'][n['mesh']]['primitives']:
                if p.get('mode', 4) != 4: continue
                V = acc(p['attributes']['POSITION']); V = (np.c_[V, np.ones(len(V))] @ M.T)[:, :3]
                UV = acc(p['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in p['attributes'] else np.zeros((len(V), 2))
                I = acc(p['indices']).reshape(-1, 3) if 'indices' in p else np.arange(len(V)).reshape(-1, 3)
                prims.append((V, UV, I) + material(p.get('material')))
        for c in n.get('children', []): walk(c, M)
    for r in j['scenes'][j.get('scene', 0)]['nodes']: walk(r, np.eye(4))
    return prims

def orient(prims, length):
    """glTF Y-cima -> Z-cima, eixo comprido em X, tamanho real, no chão, capô (lado mais baixo) para +X"""
    allV = np.vstack([np.c_[p[0][:, 0], -p[0][:, 2], p[0][:, 1]] for p in prims])
    xy = allV[:, :2] - allV[:, :2].mean(0); w, E = np.linalg.eigh(np.cov(xy.T)); ax = E[:, np.argmax(w)]; a = -np.arctan2(ax[1], ax[0])
    R2 = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    T = lambda V: np.c_[(np.c_[V[:, 0], -V[:, 2]] @ R2.T), V[:, 1]]
    allV = T(np.vstack([p[0] for p in prims])); lo, hi = allV.min(0), allV.max(0); k = length / (hi[0] - lo[0])
    off = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]])
    allV = (allV - off) * k
    flip = allV[allV[:, 0] > length * 0.3, 2].mean() > allV[allV[:, 0] < -length * 0.3, 2].mean()
    def f(V):
        V = (T(V) - off) * k
        if flip: V[:, :2] *= -1
        return V
    return f

def sample(prims, f, dens):
    L = np.array([-0.45, 0.35, 0.82]); L /= np.linalg.norm(L); out = []
    for V, UV, I, tex, fac, glass in prims:
        V = f(V); A, B, C = V[I[:, 0]], V[I[:, 1]], V[I[:, 2]]
        nr = np.cross(B - A, C - A); area = np.linalg.norm(nr, axis=1) / 2; nr /= (2 * area[:, None] + 1e-12)
        n = np.minimum(np.ceil(area * dens).astype(int) + 1, 4000); t = np.repeat(np.arange(len(I)), n)
        r1 = np.sqrt(np.random.rand(len(t))); r2 = np.random.rand(len(t)); w0 = 1 - r1; w1 = r1 * (1 - r2); w2 = r1 * r2
        P = A[t] * w0[:, None] + B[t] * w1[:, None] + C[t] * w2[:, None]
        if glass: col = np.tile([38.0, 48.0, 58.0], (len(t), 1))
        else:
            uv = (UV[I[t, 0]] * w0[:, None] + UV[I[t, 1]] * w1[:, None] + UV[I[t, 2]] * w2[:, None]) % 1
            th, tw = tex.shape[:2]; col = tex[(uv[:, 1] * (th - 1)).astype(int), (uv[:, 0] * (tw - 1)).astype(int)] * fac
        col = col * (0.38 + 0.72 * np.abs(nr[t] @ L))[:, None]
        out.append((P, col))
    P = np.vstack([o[0] for o in out]); Cc = np.vstack([o[1] for o in out]); return P, Cc

def splat(px, py, depth, col, W, H, sign=1):
    ok = (px >= 0) & (px < W) & (py >= 0) & (py < H); px, py, depth, col = px[ok], py[ok], depth[ok], col[ok]
    o = np.argsort(sign * depth); img = np.zeros((H, W, 4)); img[py[o], px[o], :3] = col[o]; img[py[o], px[o], 3] = 255
    return fill(img)

def fill(img, it=2):
    a = img[:, :, 3] > 0
    if not a.any(): return img
    m = ndimage.binary_fill_holes(ndimage.binary_closing(a, iterations=it)) | a
    _, (iy, ix) = ndimage.distance_transform_edt(~a, return_indices=True)
    hole = m & ~a; img[hole, :3] = img[iy[hole], ix[hole], :3]; img[hole, 3] = 255; return img

def build(path, length, recolor=None, seed=1):
    np.random.seed(seed)
    prims = load(path); f = orient(prims, length); s = PPM * SS
    P, C = sample(prims, f, s * s * 4.0)
    if recolor: C = recolor(C)
    lo, hi = P.min(0), P.max(0); pad = 0.05
    W = int(np.ceil((hi[0] - lo[0] + 2 * pad) * PPM)); H = int(np.ceil((hi[1] - lo[1] + 2 * pad) * PPM)); SW, SH = W * SS, H * SS
    HZ = int(np.ceil((hi[2] + pad) * s))
    X = ((P[:, 0] - lo[0] + pad) * s).astype(int); Y = ((hi[1] + pad - P[:, 1]) * s).astype(int); Z = ((hi[2] + pad - P[:, 2]) * s).astype(int)
    side = {'+y': splat(X, Z, P[:, 1], C, SW, HZ, +1), '-y': splat(X, Z, P[:, 1], C, SW, HZ, -1),
            '+x': splat(SH - 1 - Y, Z, P[:, 0], C, SH, HZ, +1), '-x': splat(SH - 1 - Y, Z, P[:, 0], C, SH, HZ, -1)}
    o = np.argsort(P[:, 2]); X, Y, Pz, Co = X[o], Y[o], P[o, 2], C[o]
    ok = (X >= 0) & (X < SW) & (Y >= 0) & (Y < SH); X, Y, Pz, Co = X[ok], Y[ok], Pz[ok], Co[ok]
    nsl = int(np.ceil(hi[2] / DZ)); out = []
    for k in range(nsl):
        cut = (k + 1) * DZ; m = Pz <= cut + 1e-6
        img = np.zeros((SH, SW, 4)); img[Y[m], X[m], :3] = Co[m]; img[Y[m], X[m], 3] = 255; img = fill(img)
        mask = img[:, :, 3] > 0
        band = mask & ~ndimage.binary_erosion(mask, iterations=BAND)
        gy, gx = np.gradient(ndimage.gaussian_filter(ndimage.distance_transform_edt(mask), 2))
        by, bx = np.nonzero(band); nx, ny = -gx[by, bx], -gy[by, bx]
        zrow = min(max(int(round((hi[2] + pad - cut + DZ / 2) * s)), 0), HZ - 1)
        horiz = np.abs(nx) >= np.abs(ny)
        for sel, key in ((horiz & (nx > 0), '+x'), (horiz & (nx <= 0), '-x'), (~horiz & (ny > 0), '-y'), (~horiz & (ny <= 0), '+y')):
            simg = side[key]; hc = (SH - 1 - by[sel]) if key in ('+x', '-x') else bx[sel]
            hc = np.clip(hc, 0, simg.shape[1] - 1); good = simg[zrow, hc, 3] > 0
            idx = np.nonzero(sel)[0][good]; img[by[idx], bx[idx], :3] = simg[zrow, hc[good], :3]
        out.append(Image.fromarray(np.clip(img, 0, 255).astype('uint8'), 'RGBA').resize((W, H), Image.LANCZOS))
    info = dict(w=W, h=H, n=nsl, ppm=PPM, dz=DZ, cx=round(float(0 - lo[0] + pad) * PPM, 1), cy=round(float(hi[1] + pad) * PPM, 1),
                fw=round(float(hi[0] - lo[0]), 3), fd=round(float(hi[1] - lo[1]), 3), hz=round(float(hi[2]), 3))
    return out, info, side

def save(key, out, info, R=6, dst='/home/claude/fatias'):
    sl = [np.array(im) for im in out]
    for i in range(len(sl) - 1):
        cover = ndimage.binary_erosion(sl[i + 1][:, :, 3] > 200, iterations=R); sl[i][cover] = 0
    Image.fromarray(np.concatenate(sl, 0), 'RGBA').save(f'{dst}/{key}_fatias.webp', 'WEBP', quality=88, method=6)
    meta = json.load(open(f'{dst}/meta.json')); meta[key] = info; json.dump(meta, open(f'{dst}/meta.json', 'w'))
    print(key, info['n'], 'fatias', os.path.getsize(f'{dst}/{key}_fatias.webp') // 1024, 'KB')
