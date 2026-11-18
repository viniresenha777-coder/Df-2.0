"use strict";
// Fronteira Morta — guarda-roupa de sobrevivencia.
// Itens cosmeticos independentes, com a geometria alinhada aos sprites existentes.
// Na fase inicial os 18 itens estao disponiveis para teste, sem custo ou atributos.
// Sistema de roupas em reconstrução: sem peças por enquanto (a aba Roupas continua, vazia).
const CLOTHING_SETS = [];
const CLOTHING_KINDS = ["jacket", "pants", "boots", "hat", "mask", "pack"];
const CLOTHING_LABELS = { jacket: "Jaqueta", pants: "Calça", boots: "Botas", hat: "Chapéu", mask: "Máscara", pack: "Mochila" };
const CLOTHING_ITEMS = [];
const CLOTHING_BY_ID = Object.create(null);
for (const set of CLOTHING_SETS) {
  for (const kind of ["jacket", "pants", "boots"]) {
    const info = set[kind];
    const item = { id: set.id + "_" + kind, kind, set: set.id, setName: set.name, name: info[0], color: info[1], accent: info[2], texture: info[3] };
    CLOTHING_ITEMS.push(item);
    CLOTHING_BY_ID[item.id] = item;
  }
}
// Roupas 3D: modelos enviados pelo criador, vestidos no corpo do personagem no Blender
// (fronteiraMorta_src/blender/player.py, wear_list) e presos ao esqueleto: giram e andam junto.
// layer = camada img/gear/<layer>_<pose>.png e img/portrait_<layer>.png desenhada por cima do corpo;
// icon = foto da própria peça. Peças 3D não pintam o corpo (a camada já tem a cor do modelo).
// versão das imagens do personagem (corpo, camadas, retrato, fotos): troca quando o personagem é renderizado de novo
const CHAR_V = "?v=steve04";
const W3D = (id, kind, layer, name, setName) => ({ id, kind, set: "3d", setName, name, layer, icon: `img/clothing/${layer}.png${CHAR_V}`, color: "#6a6658", accent: "#8a8672", texture: "canvas" });
const IMPORTED_CLOTHING = [];
// camada 3D da peça equipada (ou null)
function clothingLayer(kind, equipment) { const it = clothingGet(kind, equipment); return it && it.layer ? it.layer : null; }
// peça que pinta o corpo (as 3D não pintam)
function clothingTintItem(kind, equipment) { const it = clothingGet(kind, equipment); return it && !it.layer ? it : null; }
for (const item of IMPORTED_CLOTHING) {
  CLOTHING_ITEMS.push(item);
  CLOTHING_BY_ID[item.id] = item;
}
function clothingClean(src) {
  const clean = { jacket: null, pants: null, boots: null };
  for (const kind of CLOTHING_KINDS) {
    const id = src && typeof src[kind] === "string" ? src[kind] : null;
    if (id && CLOTHING_BY_ID[id] && CLOTHING_BY_ID[id].kind === kind) clean[kind] = id;
  }
  return clean;
}
function clothingGet(kind, equipment) {
  const equipped = equipment || (typeof save !== "undefined" ? save.clothing : null);
  return CLOTHING_BY_ID[equipped && equipped[kind]] || null;
}
function clothingKey(equipment) {
  const e = equipment || (typeof save !== "undefined" ? save.clothing : null) || {};
  return CLOTHING_KINDS.map(k => e[k] || "-").join(":");
}
function clothingColor(hex) {
  const n = parseInt((hex || "#888888").replace("#", ""), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Texturas discretas preservam o sombreamento original dos personagens e nao
// mudam o volume, a pose, o centro dos pes ou os pontos de empunhadura.
const CLOTHING_FABRICS = Object.create(null);
function clothingFabricPixels(path) {
  let entry = CLOTHING_FABRICS[path];
  if (!entry) {
    const im = new Image();
    entry = CLOTHING_FABRICS[path] = { im, data: null };
    im.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
        const g = c.getContext("2d"); g.drawImage(im, 0, 0);
        entry.data = g.getImageData(0, 0, c.width, c.height);
        if (typeof PSHEET !== "undefined") { PSHEET.tintKey = ""; PSHEET.tinted = {}; }
        if (typeof PORTRAIT !== "undefined") PORTRAIT.key = "";
        if (typeof REMOTE_PLAYER_SHEETS !== "undefined") REMOTE_PLAYER_SHEETS.clear();
      } catch (err) { entry.data = null; }
    };
    im.src = path;
  }
  return entry.data;
}
function clothingFabric(texture, x, y) {
  const n = ((Math.imul((x | 0) + 31, 92821) ^ Math.imul((y | 0) + 19, 68917)) >>> 0) % 19;
  const fiber = 0.95 + n / 190;
  if (texture === "denim") return fiber * (((x + 2 * y) % 9) < 2 ? 0.9 : 1);
  if (texture === "reinforced") return fiber * ((Math.floor(x / 9) % 5 === 0) ? 0.91 : 1);
  if (texture === "camo") return fiber * ((((Math.floor(x / 11) * 7 + Math.floor(y / 8) * 13) % 7) < 2) ? 0.79 : 1.04);
  if (texture === "medical") return fiber * ((x % 17 < 2) ? 0.96 : 1);
  if (texture === "worn") return fiber * ((n < 3) ? 0.75 : 1);
  if (texture === "leather") return fiber * 0.97;
  return fiber;
}
function wardrobeFindPantHems(maskData, sheetWidth, ox, oy, fw, fh, portrait) {
  if (!maskData) return [];
  const yStart = Math.floor(fh * (portrait ? 0.65 : 0.57));
  const left = Math.floor(fw * 0.16), right = Math.ceil(fw * 0.84);
  const eligible = new Uint8Array(fw * fh);
  for (let y = yStart; y < fh; y++) for (let x = left; x < right; x++) {
    const i = ((oy + y) * sheetWidth + ox + x) * 4;
    if (maskData[i + 1] > 90 && maskData[i] < 85 && maskData[i + 3] > 30)
      eligible[y * fw + x] = 1;
  }
  const seen = new Uint8Array(fw * fh), queue = new Int32Array(fw * fh), comps = [];
  for (let y = yStart; y < fh; y++) for (let x = left; x < right; x++) {
    const start = y * fw + x;
    if (!eligible[start] || seen[start]) continue;
    let head = 0, tail = 1, x0 = fw, x1 = 0, y0 = fh, y1 = 0;
    queue[0] = start; seen[start] = 1;
    while (head < tail) {
      const p = queue[head++], px = p % fw, py = Math.floor(p / fw);
      x0 = Math.min(x0, px); x1 = Math.max(x1, px);
      y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = px + dx, ny = py + dy;
        if (nx < left || nx >= right || ny < yStart || ny >= fh) continue;
        const n = ny * fw + nx;
        if (eligible[n] && !seen[n]) {seen[n] = 1; queue[tail++] = n;}
      }
    }
    const compWidth = x1 - x0 + 1;
    if (tail < (portrait ? 45 : 5) || compWidth > fw * (portrait ? 0.30 : 0.36) ||
        y1 < fh * (portrait ? 0.74 : 0.61)) continue;
    let total = 0, count = 0, minX = fw, maxX = 0;
    for (let yy = Math.max(y0, y1 - (portrait ? 6 : 2)); yy <= y1; yy++)
      for (let xx = x0; xx <= x1; xx++) {
        if (!eligible[yy * fw + xx]) continue;
        total += xx; count++; minX = Math.min(minX, xx); maxX = Math.max(maxX, xx);
      }
    if (!count) continue;
    comps.push({cx: total / count, hemY: y1, hemWidth: maxX - minX + 1, area: tail});
  }
  // A máscara separa as pernas; se elas se cruzarem, conservamos o pé
  // original naquele quadro em vez de colar botas soltas em locais errados.
  return comps.sort((a,b)=>b.area-a.area).slice(0,2).sort((a,b)=>a.cx-b.cx);
}

function wardrobeFindOriginalFoot(base, maskData, sw, ox, oy, fw, fh, hem, portrait) {
  const radius = Math.max(portrait ? 15 : 6,
    Math.min(portrait ? 24 : 12, hem.hemWidth * (portrait ? 1.05 : 1.3) + 5));
  const x0 = Math.max(0, Math.floor(hem.cx - radius));
  const x1 = Math.min(fw - 1, Math.ceil(hem.cx + radius));
  const y0 = Math.max(0, hem.hemY - (portrait ? 4 : 2));
  const y1 = Math.min(fh - 1, hem.hemY + (portrait ? 38 : 17));
  const pixel = (x,y) => {
    const i = ((oy + y) * sw + ox + x) * 4;
    if (base[i + 3] < 20 ||
        (maskData && (maskData[i] > 65 || maskData[i + 1] > 65))) return false;
    const r = base[i], g = base[i + 1], b = base[i + 2];
    return (r+g+b) < 3 * 181 && Math.max(r,g,b)-Math.min(r,g,b) < 69;
  };
  const visited = new Uint8Array(fw * fh), queue = new Int32Array(fw * fh);
  let best = null, bestScore = -1e9;
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const seed = yy * fw + xx;
    if (visited[seed] || !pixel(xx, yy)) continue;
    let h = 0, t = 1, minX = xx, maxX = xx, minY = yy, maxY = yy;
    visited[seed] = 1; queue[0] = seed;
    while (h < t) {
      const p = queue[h++], px = p % fw, py = Math.floor(p / fw);
      minX = Math.min(minX,px); maxX = Math.max(maxX,px);
      minY = Math.min(minY,py); maxY = Math.max(maxY,py);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = px+dx, ny = py+dy;
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const ni = ny * fw + nx;
        if (!visited[ni] && pixel(nx,ny)) {visited[ni] = 1; queue[t++] = ni;}
      }
    }
    const bw = maxX-minX+1, bh=maxY-minY+1;
    if (t < (portrait ? 14 : 3) || maxY < hem.hemY + (portrait ? 1 : 0) ||
        bw > (portrait ? 37 : 21) || bh > (portrait ? 38 : 22)) continue;
    const score = t * 0.85 + maxY * 0.45 - Math.abs((minX+maxX)*0.5 - hem.cx)*2.4;
    if (score > bestScore) {
      bestScore = score;
      best = {x0:minX,x1:maxX,y0:minY,y1:maxY,hemX:hem.cx,hemY:hem.hemY};
    }
  }
  return best;
}

// A bota funciona como a calça: recolorimos somente pixels que já existem
// no personagem, identificando os calçados na região em que a calça termina.
// Não usamos drawImage de uma bota extra, não movemos os pés nem alteramos alfa.
function wardrobeTintBoots(pixels, mask, w, h, boots, portrait) {
  if (!boots) return 0;
  const fw = portrait ? 240 : 128, fh = portrait ? h : 128;
  if (!w || !h || w % fw || h % fh) return 0;
  const color = clothingColor(boots.color), accent = clothingColor(boots.accent);
  let tinted = 0;
  for (let row = 0; row < h / fh; row++) for (let col = 0; col < w / fw; col++) {
    const ox = col * fw, oy = row * fh;
    const hems = wardrobeFindPantHems(mask, w, ox, oy, fw, fh, portrait);
    const used = [];
    for (const hem of hems) {
      const foot = wardrobeFindOriginalFoot(pixels, mask, w, ox, oy, fw, fh, hem, portrait);
      if (!foot) continue;
      if (used.some(old => Math.abs(old.x0 - foot.x0) < 2 && Math.abs(old.y0 - foot.y0) < 2)) continue;
      used.push(foot);
      // Borda de 1 pixel para incluir a costura clara do modelo antigo.
      for (let y = Math.max(0, foot.y0 - 1); y <= Math.min(fh - 1, foot.y1 + 1); y++) {
        for (let x = Math.max(0, foot.x0 - 1); x <= Math.min(fw - 1, foot.x1 + 1); x++) {
          const i = ((oy + y) * w + ox + x) * 4;
          if (pixels[i + 3] < 20 || mask[i] > 65 || mask[i + 1] > 65) continue;
          const lum = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
          const spread = Math.max(pixels[i], pixels[i + 1], pixels[i + 2])
                       - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
          if (lum > 200 || spread > 80) continue;
          const roughness = clothingFabric(boots.texture, ox + x, oy + y);
          const lighting = Math.max(0.55, Math.min(1.45, 0.50 + lum / 125));
          // Sola e costuras sutis respeitam a forma atual do pé.
          const sole = y >= foot.y1 - (portrait ? 2 : 0);
          const seam = !sole && y <= foot.y0 + (portrait ? 3 : 1)
                    && (Math.floor(x / (portrait ? 4 : 2)) % 3 === 0);
          for (let ch = 0; ch < 3; ch++) {
            const material = sole ? color[ch] * 0.55 :
              seam ? color[ch] * 0.78 + accent[ch] * 0.22 : color[ch];
            pixels[i + ch] = Math.min(255, material * lighting * roughness * 0.87 + pixels[i + ch] * 0.13);
          }
          tinted++;
        }
      }
    }
  }
  return tinted;
}

// Pinta os canais da mascara 3D existente: vermelho=tronco/mangas,
// verde=calca. As botas usam a parte escura inferior do sprite, sem
// redimensionar o corpo. Funciona nas 5 poses e no retrato giratorio.
function clothingTintCanvas(base, mask, skin, equipment, portrait) {
  const w = base.naturalWidth || base.width, h = base.naturalHeight || base.height;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(base, 0, 0);
  if (!mask || !(mask.naturalWidth || mask.width)) return c;
  try {
    const mCanvas = document.createElement("canvas"); mCanvas.width = w; mCanvas.height = h;
    const mg = mCanvas.getContext("2d", { willReadFrequently: true });
    mg.drawImage(mask, 0, 0);
    const m = mg.getImageData(0, 0, w, h).data, image = g.getImageData(0, 0, w, h), p = image.data;
    const jacket = clothingTintItem("jacket", equipment), pants = clothingTintItem("pants", equipment), boots = clothingTintItem("boots", equipment);
    const J = clothingColor(jacket ? jacket.color : skin.jacket);
    const P = clothingColor(pants ? pants.color : skin.pants);
    const JA = jacket && clothingColor(jacket.accent), PA = pants && clothingColor(pants.accent);
    const multiforest = pants && pants.texture === "multiforest"
      ? clothingFabricPixels("img/clothing/multiforest_fabric.png") : null;
    const frameW = portrait ? 240 : 128, frameH = portrait ? h : 128;
    const K = 1.7 / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (p[i + 3] < 8) continue;
      const mj = m[i] / 255, mp = m[i + 1] / 255;
      const amt = Math.min(1, mj + mp);
      if (amt < 0.015) continue;
      const jf = jacket ? clothingFabric(jacket.texture, x, y) : 1;
      const pf = pants ? clothingFabric(pants.texture, x, y) : 1;
      const xf = (x % frameW) / frameW, yf = (y % frameH) / frameH;
      const front = portrait || (Math.floor(y / frameH) % 8 === 4);
      // Faixas, remendos, painéis de joelho e identificação de socorrista.
      // As marcas respeitam os canais da máscara e acompanham os 64 quadros.
      let ja = 0, pa = 0;
      if (jacket && mj > 0.15) {
        if (jacket.texture === "medical" && front &&
            xf > 0.48 && xf < 0.56 && yf > 0.34 && yf < 0.42 &&
            (Math.abs(xf - 0.52) < 0.014 || Math.abs(yf - 0.38) < 0.013)) ja = 0.85;
        else if (jacket.texture === "reinforced" && yf > 0.40 && yf < 0.45 &&
            ((xf > 0.27 && xf < 0.35) || (xf > 0.65 && xf < 0.73))) ja = 0.58;
        else if (jacket.texture === "canvas" && yf > 0.38 && yf < 0.42 &&
            ((xf > 0.29 && xf < 0.36) || (xf > 0.64 && xf < 0.71))) ja = 0.33;
        else if (jacket.texture === "worn" && ((Math.floor(x / 7) + Math.floor(y / 11)) % 17 === 0)) ja = 0.38;
      }
      if (pants && mp > 0.15) {
        if (pants.texture === "reinforced" && yf > 0.64 && yf < 0.72 &&
            ((xf > 0.34 && xf < 0.46) || (xf > 0.54 && xf < 0.66))) pa = 0.35;
        if (pants.texture === "camo" && (Math.floor(x / 9) * 3 + Math.floor(y / 13)) % 7 < 2) pa = 0.30;
      }
      for (let ch = 0; ch < 3; ch++) {
        const v = p[i + ch];
        const jv = Math.min(255, v * (J[ch] * (1 - ja) + (JA ? JA[ch] : J[ch]) * ja) * K * jf);
        let pv;
        if (multiforest && mp > 0.01) {
          const tx = Math.floor(x * (portrait ? 1.4 : 2.0)) % multiforest.width;
          const ty = Math.floor(y * (portrait ? 1.4 : 2.0)) % multiforest.height;
          const sample = multiforest.data[(ty * multiforest.width + tx) * 4 + ch];
          pv = Math.min(255, v * sample * K * 0.92);
        } else {
          pv = Math.min(255, v * (P[ch] * (1 - pa) + (PA ? PA[ch] : P[ch]) * pa) * K * pf);
        }
        p[i + ch] = Math.min(255, Math.max(0, v * (1 - amt) + jv * mj + pv * mp));
      }
    }
    // Mesmo tratamento da calça: modificar apenas a textura dos calçados existentes.
    // Os pixels alpha são mantidos: silhueta, dimensão e posição permanecem originais.
    if (boots) wardrobeTintBoots(p, m, w, h, boots, !!portrait);
    g.putImageData(image, 0, 0);
  } catch (error) {
    // Em canvas protegido ou imagem incompleta, conserva a arte original.
    return c;
  }
  return c;
}
const CLOTHING_PNG_CACHE = Object.create(null);
function drawClothingIcon(item, x, y, w, h) {
  if (!item) return;
  if (item.icon) {
    let im = CLOTHING_PNG_CACHE[item.icon];
    if (!im) {
      im = new Image();
      im.src = item.icon;
      CLOTHING_PNG_CACHE[item.icon] = im;
    }
    if (im.complete && im.naturalWidth > 0) {
      const scale = Math.min((w - 5) / im.naturalWidth, (h - 4) / im.naturalHeight);
      const dw = im.naturalWidth * scale, dh = im.naturalHeight * scale;
      ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      return;
    }
  }
  const k = Math.min(w, h) / 60;
  ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(k, k);
  ctx.fillStyle = item.color; ctx.strokeStyle = item.accent; ctx.lineWidth = 2;
  if (item.kind === "jacket") {
    ctx.fillRect(-13, -19, 26, 37);
    ctx.fillRect(-22, -16, 9, 30); ctx.fillRect(13, -16, 9, 30);
    ctx.strokeRect(-13, -19, 26, 37); ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 18); ctx.stroke();
    ctx.fillStyle = item.accent; ctx.fillRect(-10, 7, 6, 5); ctx.fillRect(4, 7, 6, 5);
  } else if (item.kind === "pants") {
    ctx.fillRect(-14, -18, 28, 9); ctx.fillRect(-13, -10, 12, 31); ctx.fillRect(1, -10, 12, 31);
    ctx.strokeRect(-13, -10, 12, 31); ctx.strokeRect(1, -10, 12, 31);
    ctx.fillStyle = item.accent; ctx.fillRect(-13, 1, 12, 4); ctx.fillRect(1, 1, 12, 4);
  } else {
    for (const d of [-1, 1]) {
      ctx.save(); ctx.translate(11 * d, 0); ctx.scale(d, 1);
      ctx.fillRect(-7, -14, 12, 24); ctx.fillRect(-7, 8, 21, 8);
      ctx.fillStyle = item.accent; ctx.fillRect(-8, 15, 24, 3);
      ctx.restore();
    }
  }
  ctx.restore();
}
