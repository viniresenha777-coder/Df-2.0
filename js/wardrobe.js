"use strict";
// Fronteira Morta — guarda-roupa de sobrevivencia.
// Itens cosmeticos independentes, com a geometria alinhada aos sprites existentes.
// Na fase inicial os 18 itens estao disponiveis para teste, sem custo ou atributos.
const CLOTHING_SETS = [
  { id: "civil", name: "Sobrevivente civil", jacket: ["Jaqueta verde de campo", "#526444", "#a36a44", "canvas"],
    pants: ["Calça jeans reforçada", "#36474b", "#84908e", "denim"],
    boots: ["Botas de trilha", "#71513b", "#c39a69", "leather"] },
  { id: "scav", name: "Catador", jacket: ["Moletom vermelho gasto", "#7a4040", "#b08b73", "worn"],
    pants: ["Cargo de catador", "#71684d", "#c3a26c", "canvas"],
    boots: ["Coturnos de sucata", "#454342", "#a18d70", "leather"] },
  { id: "militia", name: "Milícia", jacket: ["Casaco de vigia", "#344b60", "#a76c56", "reinforced"],
    pants: ["Calça tática escura", "#353a39", "#6c7776", "reinforced"],
    boots: ["Botas militares", "#282b2b", "#747b78", "leather"] },
  { id: "medic", name: "Socorrista", jacket: ["Casaco de socorrista", "#b9afa0", "#b75a56", "medical"],
    pants: ["Calça de paramédico", "#4a585b", "#a7a79d", "canvas"],
    boots: ["Botas impermeaveis", "#4b413a", "#aa9277", "leather"] },
  { id: "raider", name: "Invasor", jacket: ["Jaqueta de couro remendada", "#4b3539", "#a45248", "worn"],
    pants: ["Calça com joelheiras", "#383532", "#836b58", "reinforced"],
    boots: ["Botas de combate", "#333233", "#a07968", "leather"] },
  { id: "hunter", name: "Caçador", jacket: ["Casaco de cacador", "#726449", "#a49876", "canvas"],
    pants: ["Calça de rastreador", "#3e4d3b", "#85946b", "camo"],
    boots: ["Botas de couro", "#6b4a2e", "#b58c5c", "leather"] }
];
const CLOTHING_KINDS = ["jacket", "pants", "boots"];
const CLOTHING_LABELS = { jacket: "Jaqueta", pants: "Calça", boots: "Botas" };
const CLOTHING_ITEMS = [];
const CLOTHING_BY_ID = Object.create(null);
for (const set of CLOTHING_SETS) {
  for (const kind of CLOTHING_KINDS) {
    const info = set[kind];
    const item = { id: set.id + "_" + kind, kind, set: set.id, setName: set.name, name: info[0], color: info[1], accent: info[2], texture: info[3] };
    CLOTHING_ITEMS.push(item);
    CLOTHING_BY_ID[item.id] = item;
  }
}
// Modelos fornecidos pelo criador, ajustados à escala Male-High (1,826m).
// Os PNGs foram renderizados dos glTF originais; equipar usa a máscara animada.
const IMPORTED_CLOTHING = [
  { id: "multiforest_pants", kind: "pants", set: "f2505", setName: "Tático Multiforest", name: "Calça Tática 6 Bolsos Multiforest", color: "#a69a77", accent: "#566247", texture: "camo", icon: "img/clothing/calca_tatica.png" },
  { id: "bota_gltf_boots", kind: "boots", set: "bota", setName: "Botas de Sobrevivência", name: "Bota Tática Reforçada", color: "#50464e", accent: "#827581", texture: "leather", icon: "img/clothing/bota.png" }
];
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
    const jacket = clothingGet("jacket", equipment), pants = clothingGet("pants", equipment), boots = clothingGet("boots", equipment);
    const J = clothingColor(jacket ? jacket.color : skin.jacket);
    const P = clothingColor(pants ? pants.color : skin.pants);
    const B = boots && clothingColor(boots.color);
    const JA = jacket && clothingColor(jacket.accent), PA = pants && clothingColor(pants.accent);
    const frameW = portrait ? 240 : 128, frameH = portrait ? h : 128;
    const K = 1.7 / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (p[i + 3] < 8) continue;
      const mj = m[i] / 255, mp = m[i + 1] / 255;
      let b = 0;
      // Botas pretas sem canal na mascara original. Limita aos pes e aos
      // pixels ja existentes: nao colore terreno ou altera a hitbox.
      if (B && mj + mp < 0.09) {
        const fx = (x % frameW) / frameW, fy = (y % frameH) / frameH;
        const value = (p[i] + p[i + 1] + p[i + 2]) / 3;
        if (fy > (portrait ? 0.79 : 0.76) && fx > 0.27 && fx < 0.73 && value < 135) b = 0.76;
      }
      const amt = Math.min(1, mj + mp + b);
      if (amt < 0.015) continue;
      const jf = jacket ? clothingFabric(jacket.texture, x, y) : 1;
      const pf = pants ? clothingFabric(pants.texture, x, y) : 1;
      const bf = boots ? clothingFabric(boots.texture, x, y) : 1;
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
        const pv = Math.min(255, v * (P[ch] * (1 - pa) + (PA ? PA[ch] : P[ch]) * pa) * K * pf);
        const bv = B ? Math.min(255, v * B[ch] * K * bf * 1.28) : v;
        p[i + ch] = Math.min(255, Math.max(0, v * (1 - amt) + jv * mj + pv * mp + bv * b));
      }
    }
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
