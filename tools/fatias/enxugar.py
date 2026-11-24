# tira de cada fatia o miolo que a fatia de cima sempre cobre (a de cima é desenhada até ~4 px deslocada);
# mantém uma margem de 6 px. Salva a folha em WebP.
import json, numpy as np
from PIL import Image
from scipy import ndimage
meta = json.load(open('meta.json')); R = 6
for key, m in meta.items():
    sh = np.array(Image.open(f'{key}_fatias.png')); w, h, n = m['w'], m['h'], m['n']
    sl = [sh[i * h:(i + 1) * h].copy() for i in range(n)]
    for i in range(n - 1):
        up = sl[i + 1][:, :, 3] > 200
        cover = ndimage.binary_erosion(up, iterations=R)
        sl[i][cover] = 0
    out = np.concatenate(sl, 0)
    Image.fromarray(out, 'RGBA').save(f'{key}_fatias.webp', 'WEBP', quality=88, method=6)
    import os; print(key, os.path.getsize(f'{key}_fatias.png') // 1024, '->', os.path.getsize(f'{key}_fatias.webp') // 1024, 'KB')
