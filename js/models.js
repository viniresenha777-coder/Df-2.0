"use strict";
// =====================================================================
//  Cenário 3D: modelos fotografados no Blender (tools/blender/props.py)
//  na mesma projeção do jogo (chão visto de cima, altura subindo na tela).
//  Cada área ganha caçambas, barris, ruínas, contêineres, corpos, barricadas...
//  Tudo é sorteado com uma semente própria, então a cidade continua a mesma.
// =====================================================================
const MODEL_K = 21;                // px do mundo por metro
const MODEL_IMG = {};
function modelOk(id) { return typeof PROP_SPR !== "undefined" && !!PROP_SPR[id]; }
function modelImg(id) {
  let im = MODEL_IMG[id];
  if (!im) { im = MODEL_IMG[id] = new Image(); im.onerror = () => { im.bad = true; }; im.src = `img/props/${id}.png`; }
  return im.complete && !im.bad && im.naturalWidth ? im : null;
}
// desenha o modelo com o centro do chão em (gx, gy); k = px por metro
function drawModel(id, gx, gy, k, filter) {
  const d = modelOk(id) && PROP_SPR[id], im = d && modelImg(id);
  if (!im) return false;
  k = k || MODEL_K;
  const s = k / d.ppm;
  // O refletor/poste worklight usa apenas a própria arte. A elipse
  // antiga simulava uma sombra enorme que parecia área de impacto.
  if (id !== "worklight") {
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ellipse(gx + 3, gy + 3, d.fw * k * 0.55, d.fd * k * 0.55);
  }
  if (filter) ctx.filter = filter;
  ctx.drawImage(im, gx - d.cx * s, gy - d.cy * s, d.w * s, d.h * s);
  if (filter) ctx.filter = "none";
  return true;
}
// retângulo no chão ocupado pelo modelo
function modelRect(id, gx, gy, k) {
  const d = PROP_SPR[id]; k = k || MODEL_K;
  return { x: gx - d.fw * k / 2, y: gy - d.fd * k / 2, w: d.fw * k, h: d.fd * k };
}
// carro: furgão blindado em parte dos carros (escolhido pela posição, sem mexer no sorteio do mapa)
function carModel(c) {
  if (c.model === undefined) {
    const h = (Math.floor(c.x * 7.13) * 73856093 ^ Math.floor(c.y * 3.71) * 19349663) >>> 0;
    c.model = h % 100 < 22 && modelOk("van") ? (c.vert ? "van_90" : "van") : null;
  }
  return c.model;
}
function drawCarModel(c) {
  const id = carModel(c); if (!id) return false;
  const d = PROP_SPR[id], k = Math.max(c.w, c.h) / Math.max(d.fw, d.fd);
  const f = lootSpotActive(c) ? LOOT_YELLOW_FILTER : c.burnt ? "brightness(0.35) sepia(0.5)" : c.wreck ? "brightness(0.6) saturate(0.5)" : null;
  if (!drawModel(id, c.x + c.w / 2, c.y + c.h / 2, k, f)) return false;
  if (lootSpotActive(c)) drawLootQuestion(c, c.x + c.w / 2, c.y - 11);
  return true;
}
function drawDumpsterModel(o) {
  const id = o.w >= o.h ? "dumpster" : "dumpster_90";
  if (!modelOk(id)) return false;
  const d = PROP_SPR[id], k = Math.max(o.w, o.h) / Math.max(d.fw, d.fd);
  if (!drawModel(id, o.x + o.w / 2, o.y + o.h / 2, k, lootSpotActive(o) ? LOOT_YELLOW_FILTER : o.opened ? "brightness(0.7)" : null)) return false;
  if (lootSpotActive(o)) drawLootQuestion(o, o.x + o.w / 2, o.y - 11);
  return true;
}

// móveis dos interiores que têm modelo 3D
const FURN_MODEL = {
  "Armário de armas": "rifle_locker", "Armário de evidências": "lockers", "Armário de suprimentos": "lockers", "Arquivo": "lockers",
  "Mesa": "table", "Bancada": "table", "Caixa de munição": "ammo_box", "Caixa militar": "ammo_box",
  "Armário médico": "med_cart", "Caixas": "woodbox", "Carrinho": "cart"
};

// ---------- Geração: decoração 3D da área ----------
const SCENERY = {
  street: ["barrel_red", "barrel_blue", "barrel_black", "barrel_yellow", "barrel_red", "propane", "fruitbox", "woodbox", "cart", "worklight"],
  bodies: ["deadbody", "deadbody_60", "bodybag"],
  ruins: ["ruin_a", "ruin_b", "ruin_c", "ruin_d", "ruin_e"],
  military: ["container", "container_90", "barrel_black", "barrel_yellow", "toolbox", "worklight", "propane"]
};
function addModel(wd, id, gx, gy, opt) {
  if (!modelOk(id)) return null;
  opt = opt || {};
  const k = opt.k || MODEL_K, r = modelRect(id, gx, gy, k);
  const m = 6;
  if (opt.check !== false && !free(wd, r.x, r.y, r.w, r.h, opt.margin != null ? opt.margin : m)) return null;
  // não cobre baús, lixeiras, portas nem corpos com itens
  if (wd.loot.query(r.x - 20, r.y - 20, r.x + r.w + 20, r.y + r.h + 20).some((o) => r.x - 20 < o.x + o.w && r.x + r.w + 20 > o.x && r.y - 20 < o.y + o.h && r.y + r.h + 20 > o.y)) return null;
  const o = { id, x: gx, y: gy, k, south: gy + r.h / 2 };
  wd.models.push(o);
  if (opt.solid !== false && r.w * r.h > 120) {
    if (id === "worklight") {
      // Contato somente com o pequeno pé central do refletor.
      // Não bloquear por todo o retângulo da imagem ou por sua sombra.
      const foot = Math.max(3, Math.min(4, k * 0.17));
      solid(wd, { x: gx - foot, y: gy - foot, w: foot * 2, h: foot * 2, kind: "model", id, low: false }, false);
    } else {
      solid(wd, { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4, kind: "model", id, low: !MODEL_TALL.has(id.replace(/_\d+$/, "")) }, false);
    }
  }
  return o;
}
// Modelos mais altos que o personagem: seguram tiros. O resto (barris, botijões, caixas, carrinho,
// barricada, corpos, caçamba, banco...) a bala passa por cima.
const MODEL_TALL = new Set(["van", "container", "tank", "watchtower", "transformer", "worklight", "busstop",
  "ruin_a", "ruin_b", "ruin_c", "ruin_d", "ruin_e"]);
function tryPlace(wd, id, a, R, tries, opt) {
  for (let t = 0; t < tries; t++) {
    const o = addModel(wd, id, a.x + R() * a.w, a.y + R() * a.h, opt);
    if (o) return o;
  }
  return null;
}
function inEdge(x, y) { return x < AREA_EDGE + 30 || y < AREA_EDGE + 30 || x > WORLD_W - AREA_EDGE - 30 || y > WORLD_H - AREA_EDGE - 30; }
function genScenery(wd) {
  wd.models = [];
  if (typeof PROP_SPR === "undefined") return;
  const R = mulberry((wd.cell.seed ^ 0x5eed1e) >>> 0), zone = wd.zone || 0;
  const [hy0, hy1] = H_STREETS[1], [vx0, vx1] = V_STREETS[1];
  // ruínas nos terrenos baldios (onde ficaram escombros)
  for (const p of wd.props) if (p.type === "rubble" && R() < 0.75) {
    const id = pick(SCENERY.ruins, R), d = PROP_SPR[id]; if (!d) continue;
    const k = Math.min(150 / d.fw, 120 / d.fd, 18);
    if (addModel(wd, id, p.x, p.y + 10, { k, margin: 4 })) p.hidden = true;
  }
  // barris, caixas e tralhas nas calçadas e nas ruas do meio
  const nStreet = 10 + Math.floor(R() * 8) + zone;
  for (let i = 0; i < nStreet; i++) for (let t = 0; t < 12; t++) {
    const horiz = R() < 0.5;
    const x = horiz ? AREA_EDGE + 40 + R() * (WORLD_W - 2 * AREA_EDGE - 80) : vx0 + 10 + R() * (vx1 - vx0 - 20);
    const y = horiz ? hy0 + 10 + R() * (hy1 - hy0 - 20) : AREA_EDGE + 40 + R() * (WORLD_H - 2 * AREA_EDGE - 80);
    if (inEdge(x, y)) continue;
    const id = pick(SCENERY.street, R);
    if (!addModel(wd, id, x, y)) continue;
    // às vezes um grupinho
    if (id.startsWith("barrel") && R() < 0.6) addModel(wd, pick(["barrel_red", "barrel_blue", "barrel_black"], R), x + 14 + R() * 6, y + (R() - 0.5) * 12);
    break;
  }
  // hidrantes e pontos de ônibus nas calçadas das quadras
  for (const b of wd.blocks) {
    if (b.kind === "outpost") continue;
    if (R() < 0.7) addModel(wd, "hydrant", b.x + 30 + R() * (b.w - 60), b.y + b.h - 10, { margin: 4, solid: false });
    if (b.kind === "com" && R() < 0.45) addModel(wd, "busstop", b.x + 80 + R() * (b.w - 160), b.y + b.h - 22, { margin: 2, solid: false });
    if (b.kind === "parking" && R() < 0.6) addModel(wd, pick(["dumpster", "container"], R), b.x + 60 + R() * (b.w - 120), b.y + 40, { margin: 4 });
  }
  // corpos espalhados pela rua (só cenário; os que têm itens continuam sendo os de antes)
  const nb = 2 + Math.floor(R() * 3) + Math.floor(zone / 3);
  for (let i = 0; i < nb; i++) for (let t = 0; t < 10; t++) {
    const x = AREA_EDGE + 50 + R() * (WORLD_W - 2 * AREA_EDGE - 100), y = AREA_EDGE + 50 + R() * (WORLD_H - 2 * AREA_EDGE - 100);
    if (blockAt(x, y, wd) && R() < 0.7) continue;
    if (addModel(wd, pick(SCENERY.bodies, R), x, y, { solid: false })) break;
  }
  // barricadas militares atravessadas nas ruas do meio (deixando passagem)
  const nbar = zone >= 2 ? 1 + Math.floor(R() * 3) : Math.floor(R() * 2);
  for (let i = 0; i < nbar; i++) {
    const horizSt = R() < 0.5;
    const x = horizSt ? AREA_EDGE + 120 + R() * (WORLD_W - 2 * AREA_EDGE - 240) : vx0 + 30 + R() * 30;
    const y = horizSt ? hy0 + 30 + R() * 30 : AREA_EDGE + 120 + R() * (WORLD_H - 2 * AREA_EDGE - 240);
    addModel(wd, horizSt ? "barricade_90" : "barricade", x, y);
  }
  // base segura: torres, contêineres e um blindado
  const op = wd.opBlock;
  if (op) {
    // só nas laterais: o meio fica livre entre o portão e a porta da base
    const side = (i) => ({ x: i ? op.x + op.w * 0.68 : op.x + 70, y: op.y + 70, w: op.w * 0.32 - 70, h: op.h - 140 });
    tryPlace(wd, "watchtower", side(0), R, 30, { margin: 4 });
    tryPlace(wd, "watchtower", side(1), R, 30, { margin: 4 });
    tryPlace(wd, "container_90", side(0), R, 30, { margin: 6 });
    tryPlace(wd, "container", side(1), R, 30, { margin: 6 });
    tryPlace(wd, "tank", side(R() < 0.5 ? 0 : 1), R, 30, { k: 15, margin: 6 });
    for (let i = 0; i < 6; i++) tryPlace(wd, pick(SCENERY.military, R), side(i % 2), R, 12);
  }
  // quadras especiais (delegacia/armaria): material militar no pátio
  for (const b of wd.blocks) if ((b.kind === "special" || b.kind === "parking") && R() < 0.8) {
    const a = { x: b.x + 50, y: b.y + 50, w: b.w - 100, h: b.h - 100 };
    for (let i = 0; i < 4; i++) tryPlace(wd, pick(SCENERY.military, R), a, R, 10);
    if (zone >= 2 && R() < 0.5) tryPlace(wd, R() < 0.5 ? "tank" : "tank_90", a, R, 15, { k: 15, margin: 6 });
  }
  wd.models.sort((a, b) => a.south - b.south);
}
