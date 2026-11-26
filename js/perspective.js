"use strict";
// =====================================================================
//  Câmera aérea inclinada (top-down 3/4, ~55°, rotação fixa) seguindo
//  o jogador. Tudo que tem altura (prédios, árvores, postes) é projetado:
//   · um pouco para longe do centro da tela (a câmera está alta), e
//   · "para cima" na tela (a câmera está inclinada, olhando para o norte),
//  por isso aparece a parede da frente (sul) dos prédios.
//  Também cuida do personagem com spritesheet de 8 direções e da
//  atmosfera (cone da lanterna, neblina azulada e vinheta).
// =====================================================================
const CAM_H = 1100;        // altura da câmera (px do mundo): perspectiva radial
let LEAN = 1.0;            // inclinação: quanto o alto "sobe" na tela por px de altura (1,0 = 45°, como no Dead Frontier; antes 0,5)
// Como no Dead Frontier: atrás de um prédio (o telhado ia cobrir você), a câmera sobe e fica quase
// vertical (LEAN perto de 0), em transição suave; ao sair de trás do prédio, volta à inclinação normal.
const LEAN_BASE = 1.0, LEAN_TOP = 0.05;
const FLASH_GLOW = {};   // brilho da lanterna (canvas reaproveitado)

function playerBehindBuilding() {
  if (game.inside || !world || !world.buildings) return false;
  for (const b of world.buildings) {
    if (player.x < b.x - 16 || player.x > b.x + b.w + 16 || player.y > b.y + 8) continue;
    if (b.y - player.y < bHeight(b) * LEAN_BASE * 1.2 + 36) return true;   // dentro da faixa que o telhado cobre
  }
  return false;
}
function camLeanTick(dt) {
  const target = playerBehindBuilding() ? LEAN_TOP : LEAN_BASE;
  LEAN += (target - LEAN) * Math.min(1, dt / 260);
  if (Math.abs(target - LEAN) < 0.002) LEAN = target;
}
const PERSPECTIVE = true;

function eye() { return { x: cam.x + W / 2, y: cam.y + H / 2 }; }
function projK(h) { return CAM_H / (CAM_H - h); }
// ponto (x, y) a uma altura h, visto pela câmera
function proj(x, y, h, e) { const k = projK(h); return { x: e.x + (x - e.x) * k, y: e.y + (y - e.y) * k - h * LEAN }; }

function bHeight(b) {
  // ~1,6x mais altos que antes (30 + 34/andar): o personagem não fica mais quase do tamanho de uma casa
  if (b.safe) return 110;
  if (b.type === "guarita" || b.noDoor) return 60;
  const f = buildingFloors(b);
  return b.landmark ? 64 + f * 60 : 46 + f * 54;
}
function bFloorsVis(b) { return b.safe ? 2 : b.noDoor ? 1 : buildingFloors(b); }
// telha laranja para os telhados inclinados (cada casa com um tom)
const ROOF_TILE = ["#a75b45", "#95503b", "#8b4d42", "#987057", "#a56a4b", "#765750", "#855744"];
function roofColor(b) { return b.roofCol || (b.roofCol = ROOF_TILE[Math.floor(bHash(b, 3) * ROOF_TILE.length)]); }

// chão do prédio (sombra, base e porta): desenhado junto com a rua
function drawBuildingGround(b) {
  const h = bHeight(b);
  ctx.fillStyle = "rgba(0,0,0,0.38)"; ctx.fillRect(b.x + 6, b.y - h * 0.18, b.w + h * 0.14, b.h + h * 0.18);
  ctx.fillStyle = shade(b.color, -0.55); ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  drawDoor(b);
}

// Parede projetada: reboco gasto, cantoneiras, caixilhos, vidro e tábuas.
// A geometria continua a mesma (não altera hitboxes nem portas).
function drawWall(b, ax, ay, bx, by, h, e, tone) {
  const p0 = proj(ax, ay, 0, e), p1 = proj(bx, by, 0, e), p2 = proj(bx, by, h, e), p3 = proj(ax, ay, h, e);
  poly([[p0.x, p0.y], [p1.x, p1.y], [p2.x, p2.y], [p3.x, p3.y]], shade(b.color, tone));
  ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p3.x, p3.y); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  const house = b.type === "casa";
  const floors = bFloorsVis(b), len = Math.hypot(bx - ax, by - ay), fh = h / (floors + 0.35);
  const nW = Math.max(1, Math.floor(len / (house ? 66 : 46))), night = isNight();
  const at = (t, hh) => proj(ax + (bx - ax) * t, ay + (by - ay) * t, hh, e);
  if (house) {
    // Alicerce escuro + molduras nas quinas, contrastando com o reboco.
    const f0 = at(0, 0), f1 = at(1, 0), f2 = at(1, 8), f3 = at(0, 8);
    poly([[f0.x, f0.y], [f1.x, f1.y], [f2.x, f2.y], [f3.x, f3.y]], shade(b.color, -0.54));
    ctx.strokeStyle = "rgba(230,198,151,0.29)"; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const t of [0.025, 0.975]) {
      const a = at(t, 8), c = at(t, h - 3);
      ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y);
    }
    ctx.stroke();
    // Reboco com juntas e goteiras finas; mantém-se legível em zoom distante.
    for (let n = 1; n < 6; n++) {
      const hh = 7 + (h - 14) * n / 6;
      const a = at(0.02, hh), c = at(0.98, hh);
      ctx.strokeStyle = n % 2 ? "rgba(20,18,14,0.11)" : "rgba(232,218,183,0.09)";
      ctx.lineWidth = n % 2 ? 1 : 0.8;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const seed = bHash(b, 410 + i), t = 0.04 + 0.90 * seed;
      const y = 6 + (h - 14) * bHash(b, 460 + i);
      const a = at(t, y), c = at(t + 0.018, y - (3 + 7 * bHash(b, 490 + i)));
      ctx.strokeStyle = "rgba(29,25,24,0.14)"; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
    // Friso de argamassa logo abaixo dos beirais.
    const a = at(0, h - 3), c = at(1, h - 3);
    ctx.strokeStyle = "rgba(14,12,12,0.58)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    ctx.strokeStyle = "rgba(218,193,157,0.4)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 2); ctx.lineTo(c.x, c.y - 2); ctx.stroke();
  }
  for (let f = 0; f < floors; f++) {
    if (f > 0) {
      const l0 = at(0, f * fh), l1 = at(1, f * fh);
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath(); ctx.moveTo(l0.x, l0.y); ctx.lineTo(l1.x, l1.y); ctx.stroke();
    }
    const h0 = f * fh + fh * 0.32, h1 = f * fh + fh * 0.78;
    for (let i = 0; i < nW; i++) {
      const t0 = (i + 0.27) / nW, t1 = (i + 0.73) / nW;
      const q0 = at(t0, h0), q1 = at(t1, h0), q2 = at(t1, h1), q3 = at(t0, h1);
      const lit = night && bHash(b, f * 31 + i + 7) < (house ? 0.30 : 0.22);
      const pane = lit ? "rgba(251,188,92,0.92)" : night ? "rgba(21,29,39,0.94)" : "rgba(44,65,76,0.88)";
      if (house) {
        // Reentrância escura e moldura aparente.
        ctx.strokeStyle = "rgba(19,17,17,0.78)"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q3.x, q3.y); ctx.closePath(); ctx.stroke();
      }
      poly([[q0.x, q0.y], [q1.x, q1.y], [q2.x, q2.y], [q3.x, q3.y]], pane);
      if (house) {
        const mid = (t0 + t1) / 2, m0 = at(mid, h0), m1 = at(mid, h1);
        ctx.strokeStyle = "rgba(144,128,107,0.86)"; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(m0.x, m0.y); ctx.lineTo(m1.x, m1.y);
        const mid0 = at(t0, (h0 + h1) / 2), mid1 = at(t1, (h0 + h1) / 2);
        ctx.moveTo(mid0.x, mid0.y); ctx.lineTo(mid1.x, mid1.y); ctx.stroke();
        ctx.strokeStyle = "rgba(202,221,217,0.26)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(q3.x + 2, q3.y + 2); ctx.lineTo(q2.x - 3, q2.y - 3); ctx.stroke();
        // Peitoril de concreto projeta pequena sombra abaixo da janela.
        const sill0 = at(t0 - 0.025 / nW, h0 - 2), sill1 = at(t1 + 0.025 / nW, h0 - 2);
        ctx.strokeStyle = "rgba(18,17,16,0.5)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(sill0.x, sill0.y + 2); ctx.lineTo(sill1.x, sill1.y + 2); ctx.stroke();
        ctx.strokeStyle = "rgba(194,182,161,0.75)"; ctx.lineWidth = 1.7;
        ctx.beginPath(); ctx.moveTo(sill0.x, sill0.y); ctx.lineTo(sill1.x, sill1.y); ctx.stroke();
        // Algumas janelas estão protegidas com tábuas tortas.
        if (bHash(b, 130 + f * 37 + i) < 0.17) {
          ctx.strokeStyle = "rgba(74,52,37,0.97)"; ctx.lineWidth = 4.5;
          ctx.beginPath(); ctx.moveTo(q0.x - 2, q0.y - 2); ctx.lineTo(q2.x + 2, q2.y + 2); ctx.stroke();
          ctx.strokeStyle = "rgba(155,112,67,0.8)"; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(q0.x - 2, q0.y - 4); ctx.lineTo(q2.x + 2, q2.y); ctx.stroke();
        } else if (bHash(b, 205 + f * 37 + i) < 0.24) {
          // Trincas pontuais, mantendo as janelas reconhecíveis.
          const center = at(mid, (h0 + h1) / 2);
          ctx.strokeStyle = "rgba(208,228,239,0.5)"; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(center.x - 4, center.y - 5); ctx.lineTo(center.x + 2, center.y + 1);
          ctx.lineTo(center.x - 1, center.y + 6); ctx.stroke();
        }
      }
    }
  }
}

// paredes viradas para a câmera + telhado lá em cima
function drawBuildingTall(b, e) {
  const h = bHeight(b), x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
  // a parede aparece quando o topo dela "entra" em relação à base (vista pela câmera)
  const seen = (mx, my, nx, ny) => { const t = proj(mx, my, h, e); return (t.x - mx) * nx + (t.y - my) * ny < 0; };
  // você atrás do prédio: ele fica transparente para não te esconder
  const r0 = proj(x0, y0, h, e), r1 = proj(x1, y1, h, e), py = player.y - 20;
  const behind = player.x > Math.min(r0.x, x0) - 10 && player.x < Math.max(r1.x, x1) + 10 && py > Math.min(r0.y, y0) - 10 && player.y < y0 + 6;
  ctx.save(); if (behind) ctx.globalAlpha = 0.38;
  if (seen((x0 + x1) / 2, y0, 0, -1)) drawWall(b, x0, y0, x1, y0, h, e, -0.05);   // norte
  if (seen((x0 + x1) / 2, y1, 0, 1)) drawWall(b, x0, y1, x1, y1, h, e, -0.3);     // sul (frente)
  if (seen(x0, (y0 + y1) / 2, -1, 0)) drawWall(b, x0, y0, x0, y1, h, e, -0.18);   // oeste
  if (seen(x1, (y0 + y1) / 2, 1, 0)) drawWall(b, x1, y0, x1, y1, h, e, -0.4);     // leste
  // telhado: o mesmo desenho de antes, levado para a altura h pela câmera
  const k = projK(h);
  ctx.save(); ctx.translate(e.x, e.y - h * LEAN); ctx.scale(k, k); ctx.translate(-e.x, -e.y);
  if (b.roof === "pitched") drawPitched(b); else drawFlat(b);
  ctx.restore();
  ctx.restore();
}

function drawLampTall(l, e) {
  // Haste vertical ligada apenas à base: sem deslocamento visual
  // semelhante a uma sombra longa sobre o asfalto.
  const height = l.big ? 53 : 40, topY = l.y - height;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "#292c2c"; ctx.lineWidth = l.big ? 4 : 3;
  ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x, topY); ctx.stroke();
  ctx.strokeStyle = "#666b6e"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(l.x - 1, l.y - 2); ctx.lineTo(l.x - 1, topY + 2); ctx.stroke();
  ctx.fillStyle = "#3b4042"; circle(l.x, topY, l.big ? 6 : 4.5);
  ctx.fillStyle = "#fff0b9"; circle(l.x, topY, l.big ? 3.5 : 2.5);
  // Brilho da lâmpada acesa, inclusive no modo 2D.
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(l.x, topY, 0, l.x, topY, l.big ? 29 : 23);
  glow.addColorStop(0, "rgba(255,245,194,0.84)");
  glow.addColorStop(0.18, "rgba(255,219,130,0.40)");
  glow.addColorStop(1, "rgba(255,190,100,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(l.x, topY, l.big ? 29 : 23, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// pinta de trás (norte) para a frente (sul) pela linha do chão de cada coisa:
// quem está na frente de um prédio aparece por cima da parede; quem está atrás fica escondido
function drawSortedScene() {
  const e = eye(), list = [];
  for (const b of world.buildings) if (!b.hidden && inView(b.x - 140, b.y - 40, b.w + 280, b.h + 260)) list.push({ y: b.y + b.h, f: () => drawBuildingTall(b, e) });
  if (typeof estruturasNaCena === "function") estruturasNaCena(list);
  for (const l of world.lamps) if (inView(l.x - 80, l.y - 120, 160, 200)) list.push({ y: l.y, f: () => drawLampTall(l, e) });
  // cenário 3D, furgões e caçambas (ordenados pela beirada de baixo, como os prédios)
  for (const m of world.models || []) if (!m.bodyReplacement &&
      inView(m.x - 160, m.y - 220, 320, 300))
    list.push({ y: m.south, f: () => drawModel(m.id, m.x, m.y, m.k) });
  for (const c of world.cars) if (carModel(c) && inView(c.x - 20, c.y - 60, c.w + 40, c.h + 80)) list.push({ y: c.y + c.h, f: () => drawCarModel(c) });
  if (modelOk("dumpster")) for (const o of world.loot.query(cam.x - 60, cam.y - 60, cam.x + W + 60, cam.y + H + 100)) if (o.kind === "dumpster") list.push({ y: o.y + o.h, f: () => { if (!drawDumpsterModel(o)) drawLootObj(o); } });
  for (const g of world.guards || []) if (inView(g.x - 32, g.y - 75, 64, 115)) list.push({ y: g.y + 0.2, f: () => drawBaseGuard(g) });
  for (const z of Zs()) if (inView(z.x - 60, z.y - 120, 120, 160)) list.push({ y: z.y, f: () => { drawZombie(z); drawZombieExtra(z); } });
  const es = game.escort;
  if (es && !game.over) list.push({ y: es.y, f: () => drawSurvivor(es.x, es.y, es.ang, es.walk, es.moving) });
  // Jogadores de outras contas: mesmos setores e ruas, ordenados pela profundidade.
  for (const online of fmSocial.inSector()) {
    if (inView(online.x - 60, online.y - 100, 120, 160))
      list.push({ y: online.y + 0.4, f: () => drawOnlinePlayer(online) });
  }
  if (!game.over) list.push({ y: player.y + 0.5, f: () => { if (!drawPlayerSprite()) drawPlayer(); } });
  list.sort((a, b) => a.y - b.y);
  for (const it of list) it.f();
}
// (compatibilidade) só prédios e postes
function drawTall() {
  if (game.inside) return;
  const e = eye();
  for (const l of world.lamps) if (inView(l.x - 80, l.y - 120, 160, 200)) drawLampTall(l, e);
  const list = world.buildings.filter((b) => inView(b.x - 140, b.y - 40, b.w + 280, b.h + 260));
  list.sort((a, b) => a.y + a.h - (b.y + b.h));
  for (const b of list) drawBuildingTall(b, e);
}

// copas das árvores lá em cima, com tronco ligando ao chão
function drawCanopiesP() {
  const e = eye();
  for (const t of world.trees) {
    if (!inView(t.x - t.r * 2.5, t.y - t.r * 3.5, t.r * 5, t.r * 6)) continue;
    const th = 48 + t.r * 1.2, k = projK(th), c = proj(t.x, t.y, th, e);
    const under = Math.hypot(player.x - c.x, player.y - c.y) < t.r * k * 1.05;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(0,0,0,0.28)"; circle(t.x + 8, t.y + 4, t.r * 0.95);
    ctx.strokeStyle = "#3a2a1a"; ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + (c.x - t.x) * 0.7, t.y + (c.y - t.y) * 0.7); ctx.stroke();
    ctx.globalAlpha = under ? 0.38 : 0.96;
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(k, k);
    const base = t.tone < 0.5 ? "#26401f" : "#2e4524";
    ctx.fillStyle = base; circle(0, 0, t.r * 0.9);
    ctx.fillStyle = shade(base, 0.12); for (const l of t.lobes) circle(l.dx, l.dy, l.r);
    ctx.fillStyle = shade(base, 0.3); for (const l of t.lobes) circle(l.dx - l.r * 0.25, l.dy - l.r * 0.25, l.r * 0.45);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------- Personagem: uma spritesheet por pose de arma (8 direções × 8 quadros, 128 px) ----------
// O corpo vem sem arma; cada arma do jogo é desenhada nas mãos usando os pontos de
// SPRITE_POSES (empunhadura, eixo da arma, mãos e lanterna), gerados em tools/gerar_variantes.py.
const PSHEET = { ok: false, cell: 128, size: 88, footY: 0.82, stride: 15.3, sheets: {}, masks: {}, tinted: {}, tintKey: "" };
const POSES = ["longa", "pesada", "pistola", "melee", "punhos", "lancachamas", "m249"];
(function loadPlayerSheets() {
  let n = 0;
  const done = () => { if (++n === POSES.length * 2) PSHEET.ok = true; };
  for (const pose of POSES) {
    const im = new Image(); im.onload = done; im.src = `img/player_${pose}.png${CHAR_V}`; PSHEET.sheets[pose] = im;
    const mk = new Image(); mk.onload = done; mk.onerror = done; mk.src = `img/player_${pose}_mask.png${CHAR_V}`; PSHEET.masks[pose] = mk;
  }
})();

// ---------- Roupa e equipamento do jogador 3D (Male-low fotografado no Blender) ----------
// O corpo vem com a roupa em cinza; a máscara diz onde é jaqueta (vermelho) e calça (verde).
// Cada personagem (SKINS) pinta a roupa com as suas cores. Colete, mochila e acessórios
// de cabeça são camadas separadas (mesmas 8 direções x 8 quadros) desenhadas por cima.
const VEST_GEAR = ["vest0", "vest1", "vest2", "vest3", "vest4", "vest5", "vest6", "vest7", "vest8", "vest9"];
const SKIN_GEAR = [[], ["headset"], ["shemagh"], ["helmet2"], [], ["balaclava"], ["gasmask"], ["helmet", "ballistic"], ["balaclava", "ballistic"]];
const GEAR_IMG = {};
function gearImg(id, pose) {
  const k = id + "_" + pose;
  let im = GEAR_IMG[k];
  if (!im) { im = GEAR_IMG[k] = new Image(); im.onerror = () => { im.bad = true; }; im.src = `img/gear/${k}.png${CHAR_V}`; }
  if (!(im.complete && !im.bad && im.naturalWidth)) return null;
  const tint = gearTint(id);
  return tint ? tintedImg(im, k, tint) : im;
}
// capas 3D: todas usam a capa de pano, que vem em cinza e é pintada com a cor de cada capa (CAPES)
const CAPE_GEAR = CAPES.map((c) => (c.color ? "cape_cloak" : null));
function gearTint(id) {
  if (id !== "cape_cloak") return null;
  const cp = CAPES[save.cape | 0];
  return cp && cp.color ? cp.color : null;
}
const TINT_CACHE = {};
function tintedImg(im, key, hex) {
  const ck = key + hex;
  if (TINT_CACHE[ck]) return TINT_CACHE[ck];
  const w = im.naturalWidth, h = im.naturalHeight, c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  try {
    const img = g.getImageData(0, 0, w, h), d = img.data, C = hexRgb(hex), K = 1.7 / 255;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.min(255, d[i + ch] * C[ch] * K);
    }
    g.putImageData(img, 0, 0);
  } catch (e) { /* aberto direto do disco: fica sem pintar */ }
  return (TINT_CACHE[ck] = c);
}
// armas com modelo 3D na mão (camada img/gear/<m>_<pose>.png, já com o corpo escondendo o que fica atrás);
// f = filtro de cor para as versões especiais. As outras armas continuam com o desenho 2D.
const PISTOL_FWD = 4;            // quanto as pistolas avançam na mão (px na tela)
const WEAPON_3D = {
  ak47: { m: "w_ak" }, ak_ouro: { m: "w_fm_ak_ouro", grip: 0.36, heldView: true },
  m4: { m: "w_m4" }, baioneta: { m: "w_m4" }, fal: { m: "w_fal" }, scar: { m: "w_scar" },
  uzi: { m: "w_uzi" }, vector: { m: "w_vector" }, m249: { m: "w_m249" },
  // MP5 e P90 não tinham modelo: usam o da Vector (P90 esverdeada), em vez do desenho 2D solto da mão
  mp5: { m: "w_vector", f: "grayscale(0.6) brightness(0.9)" }, p90: { m: "w_vector", f: "hue-rotate(60deg) saturate(0.8)" },
  minigun: { m: "w_minigun" }, minigun_inf: { m: "w_fm_minigun_inf_hd", grip: 0.3, heldView: true },
  canoduplo: { m: "w_canoduplo" },
  // grip: arma com arte própria na mão (img/weapons/<m>_held.png quando heldView), segurada nesse ponto do comprimento
  choque: { m: "w_fm_mks50", grip: 0.22, heldView: true }, trovao: { m: "w_fm_trovao_hd", grip: 0.3, heldView: true, poseLayer: true, glow: "w_fm_trovao_luz" },
  pistolalamina: { m: "w_fm_presa", grip: 0.15, heldView: true }, escopeta: { m: "w_fm_escopeta", grip: 0.29, heldView: true },
  incendiaria: { m: "w_fm_incendiaria_hd", grip: 0.23, heldView: true },
  spas: { m: "w_spas" }, aa12: { m: "w_aa12" },
  caca: { m: "w_caca" }, sniper: { m: "w_sniper" }, barrett: { m: "w_barrett" },
  pistola: { m: "w_fm_pistola", grip: 0.24, heldView: true, poseLayer: true }, glock: { m: "w_fm_glock", grip: 0.24, heldView: true },
  silenciada: { m: "w_fm_vp9", grip: 0.23, heldView: true }, colt: { m: "w_fm_colt", grip: 0.23, heldView: true, poseLayer: true }, deagle: { m: "w_deagle" },
  revolver: { m: "w_peacemaker" }, revolver_orn: { m: "w_peacemaker", f: "sepia(0.8) saturate(2.2) brightness(1.1)" },
  katana: { m: "w_katana" }, katana_dragao: { m: "w_fm_katana_dragao", grip: 0.13, heldView: true },
  lamina: { m: "w_fm_lamina", grip: 0.1, heldView: true },
  espada: { m: "w_espada" }, espadafogo: { m: "w_glory" },
  marreta: { m: "w_marreta" }, machado: { m: "w_machado" }, faca: { m: "w_utility", grip: 0.26 }, facao: { m: "w_ps1_machete", grip: 0.17 }, serra: { m: "w_serra" },
  lancachamas: { m: "w_flamer" },
  // evento de Natal (modelos 3D enviados pelo criador, fotografados de lado)
  pistola_natal: { m: "w_fm_pistola_natal" }, dose: { m: "w_fm_dose", grip: 0.27, heldView: true },
};
// foto de cada arma 3D para a loja e o inventário (img/weapons/<m>.png: de lado, cano para a direita)
const WEAPON_ICON = {};
function weaponIcon(d, heldView = false) {
  const w = WEAPON_3D[d.id];
  if (!w) return null;
  const key = w.m + (heldView && w.heldView ? "_held" : "");
  let im = WEAPON_ICON[key];
  if (!im) { im = WEAPON_ICON[key] = new Image(); im.onerror = () => { im.bad = true; }; im.src = `img/weapons/${key}.png`; }
  return im.bad || !im.complete || !im.naturalWidth ? null : im;
}
function weapon3dImg(w, pose) { const d = w && WEAPON_3D[w.id]; return d && (d.poseLayer || d.grip == null) ? gearImg(d.m, pose) : null; }
function hexRgb(h) { const n = parseInt((h || "#808080").slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
// pinta a roupa cinza com as cores do personagem escolhido (uma vez por troca de personagem)
function tintedSheet(pose) {
  const skin = SKINS[save.skin] || SKINS[0];
  const key = save.skin + "|" + clothingKey(save.clothing);
  if (PSHEET.tintKey !== key) { PSHEET.tinted = {}; PSHEET.tintKey = key; }
  if (PSHEET.tinted[pose]) return PSHEET.tinted[pose];
  const base = PSHEET.sheets[pose], mask = PSHEET.masks[pose];
  if (!mask || !mask.naturalWidth) return (PSHEET.tinted[pose] = base);
  return (PSHEET.tinted[pose] = clothingTintCanvas(base, mask, skin, save.clothing, false));
}
// camadas de equipamento visíveis agora (colete, mochila e o acessório do personagem)
// acessórios de cabeça que vêm com o personagem e que uma peça do guarda-roupa substitui
const STEVE_ONLY = true;
const SKIN_HAT_IDS = ["helmet", "helmet2", "headset"], SKIN_MASK_IDS = ["balaclava", "gasmask", "ballistic", "shemagh"];
function playerGear() {
  // personagem único (Mixamo/Character Creator) só com a roupa dele: sem camadas de roupa/colete/mochila/acessório
  // enquanto o sistema de roupas é refeito; só a capa 3D da aba Roupas (as listas abaixo continuam para a reconstrução)
  const wear = (k) => (typeof clothingLayer === "function" ? clothingLayer(k) : null);
  if (STEVE_ONLY) {
    // máscara + capa com capuz: camada da máscara já recortada pelo capuz (gear/<máscara>_capuz_<pose>.png)
    const cape = wear("cape"), mask = wear("mask");
    // moletom (jaqueta 3D) por baixo da capa e da máscara
    // colete vestido (Natalino): sem calça equipada, a calça cargo vai por baixo e cobre o quadril
    const suit = vestWearLayer(), pants = wear("pants") || (suit ? "cl_pants_cargo" : null);
    return [wear("boots"), pants, wear("jacket"), suit, cape, mask && cape === "cape_hood" ? mask + "_capuz" : mask].filter(Boolean);
  }
  const list = [];
  const hat = wear("hat"), mask = wear("mask");
  for (const k of ["pants", "boots", "jacket"]) if (wear(k)) list.push(wear(k));
  if (save.vest >= 0 && VEST_GEAR[save.vest]) list.push(VEST_GEAR[save.vest]);
  list.push(wear("pack") || "pack");
  if (CAPE_GEAR[save.cape | 0]) list.push(CAPE_GEAR[save.cape | 0]);
  for (const id of SKIN_GEAR[save.skin] || []) {
    if ((hat && SKIN_HAT_IDS.includes(id)) || (mask && SKIN_MASK_IDS.includes(id))) continue;
    list.push(id);
  }
  if (mask) list.push(mask);
  if (hat) list.push(hat);
  return list;
}
// ordem das camadas: calça e botas embaixo de tudo; de frente a capa vai primeiro (fica atrás); de
// lado/costas o colete vai antes, depois a capa por cima dele e a mochila por cima da capa. Cabeça por último.
function gearOrder(list, back) {
  const rank = (id) => id.startsWith("cl_boots") ? -2 : id.startsWith("cl_pants") ? -1 : id.startsWith("cl_jacket") || id.startsWith("cl_moletom") ? -0.5 : id.startsWith("cl_colete") ? -0.25 : id.startsWith("cape") ? (back ? 1 : 0) :
    id.startsWith("vest") ? (back ? 0 : 1) : id === "pack" || id.startsWith("cl_pack") ? 2 : 3;
  return list.slice().sort((a, b) => rank(a) - rank(b));
}
// qual pose de braços cada arma usa
function weaponPose(w) {
  if (!w || w.fists) return "punhos";
  if (w.dual) return "punhos";                         // duas armas: pose de punhos, uma arma em cada mão
  if (w.look === "chainsaw") return "pesada";
  if (w.melee) return "melee";
  if (w.look === "pistol" || w.look === "revolver") return "pistola";
  if (w.look === "flamer") return "lancachamas";     // pose só do lança-chamas (mão esquerda na barra lateral)
  if (w.look === "lmg") return "m249";               // pose só da M249 (mão no punho, indicador no gatilho)
  if (w.look === "minigun") return "pesada";
  return "longa";
}
// tamanho de verdade (metros) de cada tipo de arma, para ficar proporcional ao corpo
const WEAPON_M = { pistol: 0.24, revolver: 0.27, smg: 0.5, ar: 0.82, rifle: 1.0, shotgun: 0.95, lmg: 1.0, minigun: 1.0, flamer: 0.9,
  crossbow: 0.72, knife: 0.32, machete: 0.58, katana: 0.98, sword: 0.92, bat: 0.82, axe: 0.78, hammer: 0.82, chainsaw: 0.9 };
function weaponMeters(w) { return WEAPON_M[w.look] || (w.melee ? 0.6 : 0.85); }

function useSpriteChar() { return PSHEET.ok && typeof SPRITE_POSES !== "undefined" && !save.classicChar && !game.over; }
function sheetRow(vx, vy) { const a = Math.atan2(vx, -vy); return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; }
function angDelta(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
// Oito poses discretas: a direção visual deve trocar no MESMO quadro
// da mira. Antes havia um atraso de rotação e histerese que fazia o
// jogador olhar para um lado enquanto as balas saíam para outro.
function spriteTick(dt) {
  const p = player;
  p.dispAng = p.angle;
  p.sRow = sheetRow(Math.cos(p.angle), Math.sin(p.angle));
  if (p.moving) p.stepDist = (p.stepDist || 0) + (p.lastSp || 0) * dt / 16.67;
  const pose = weaponPose(curW());
  if (poseHasTwist(pose)) dualTwistTick(pose);        // tronco gira até 90° com as pernas paradas (todas as poses renderizadas)
  else { p.legRow = null; TW.suf = pickTwistSuffix(pose); }
}
// ---------- Armas duplas: tronco gira até 90° com as pernas paradas ----------
// Variantes da pose punhos com o tronco torcido de 15 em 15° (geradas no Blender com --twist, quadril e pernas
// parados). As pernas ficam numa das 8 direções; o tronco escolhe a variante mais perto da mira. Quando a mira
// passa de 90° para um dos lados, as pernas viram para a direção da mira e o tronco recomeça do meio.
const DUAL_TW = [-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90];   // graus na tela (+ = horário)
function dualSuf(deg) { return deg === 0 ? "" : (deg > 0 ? "_tm" : "_tp") + Math.abs(deg); }
function dualReady(key) {
  const im = PSHEET.sheets[key], mk = PSHEET.masks[key];
  return !!(im && im.complete && im.naturalWidth && mk && mk.complete && mk.naturalWidth && SPRITE_POSES[key]);
}
// peça do tronco (capa, colete, moletom, máscara...) cuja camada nesse ângulo não existe (a imagem deu erro)
function torsoLayerMissing(key, waitForLayer = false) {
  for (const id of playerGear()) {
    if (/^cl_(boots|pants)/.test(id)) continue;      // pernas não giram: usam a camada normal
    const layer = gearImg(id, key);                   // pede a imagem (carrega sob demanda)
    const im = GEAR_IMG[id + "_" + key];
    if ((im && im.bad) || (waitForLayer && !layer)) return true;
  }
  return false;
}
// pose com alguma variante de tronco torcido já gerada (os pontos vêm no SPRITE_POSES)
const TW_HAS = {};
function poseHasTwist(pose) {
  if (TW_HAS[pose] == null) TW_HAS[pose] = DUAL_TW.some((d) => d && SPRITE_POSES[pose + dualSuf(d)]);
  return TW_HAS[pose];
}
function dualTwistTick(pose = "punhos") {
  const p = player, aim = p.angle, aimRow = p.sRow, w = curW();
  const fixedGrip = !!WEAPON_3D[w.id]?.poseLayer;
  if (p.legRow == null) p.legRow = p.sRow;
  let legAng = -Math.PI / 2 + p.legRow * Math.PI / 4, d = angDelta(legAng, aim);
  if (Math.abs(d) > Math.PI / 2 + 0.13) {           // passou de 90°: as pernas viram e o tronco recomeça
    p.legRow = sheetRow(Math.cos(aim), Math.sin(aim));
    legAng = -Math.PI / 2 + p.legRow * Math.PI / 4; d = angDelta(legAng, aim);
  }
  p.sRow = p.legRow;
  // variante cujo eixo dos braços (a→b do quadro renderizado) fica mais perto da mira
  const col = spriteFrame();
  let best = "", bestE = Infinity;
  for (const deg of DUAL_TW) {
    const suf = dualSuf(deg);
    if (suf) {
      if (!SPRITE_POSES[pose + suf]) continue;         // ângulo ainda não renderizado
      ensureTwistSheet(pose + suf); if (!dualReady(pose + suf)) continue;
      if (torsoLayerMissing(pose + suf, fixedGrip)) continue;
      if (fixedGrip && !weapon3dImg(w, pose + suf)) continue;
    }
    const a = twistBaseAngle(pose + suf, p.legRow, col);
    const e = a == null ? Infinity : Math.abs(angDelta(a, aim));
    if (e < bestE) { bestE = e; best = suf; }
  }
  TW.suf = best;
  if (fixedGrip && !best && bestE > Math.PI / 8) p.sRow = aimRow;
}
// ---------- Tronco girando com a mira ----------
// Além das 8 direções, cada pose tem variantes com o tronco torcido 15° para cada lado (_tm15 / _tp15),
// geradas no Blender (--twist). A variante escolhida é a que deixa a arma apontando mais perto da mira,
// então a arma só gira o resto (no máximo ~7,5°). As variantes carregam sob demanda, sem travar o jogo.
const TW = { suf: "" };
const TWIST_SUFS = [];   // desligado: a torção de 15° quase não muda o eixo da arma (2–3°); variantes ficam em out/twist_*
function ensureTwistSheet(key) {
  if (PSHEET.sheets[key]) return;
  const im = new Image(); im.src = `img/player_${key}.png${CHAR_V}`; PSHEET.sheets[key] = im;
  const mk = new Image(); mk.src = `img/player_${key}_mask.png${CHAR_V}`; PSHEET.masks[key] = mk;
}
function twistBaseAngle(pose, row, col) {
  const set = SPRITE_POSES[pose], info = set && set[row] && set[row][col];
  return info ? Math.atan2(info.b[1] - info.a[1], info.b[0] - info.a[0]) : null;
}
// a variante só é usada quando o corpo, a máscara e as camadas de roupa/arma dela já carregaram
function twistReady(key, w) {
  const im = PSHEET.sheets[key], mk = PSHEET.masks[key];
  if (!(im && im.complete && im.naturalWidth && mk && mk.complete && mk.naturalWidth) || !SPRITE_POSES[key]) return false;
  for (const id of playerGear()) if (!gearImg(id, key)) return false;
  const d = w && WEAPON_3D[w.id];
  return !(d && !gearImg(d.m, key));
}
function pickTwistSuffix(pose) {
  const p = player, row = p.sRow | 0, col = spriteFrame(), aim = p.angle, w = curW();
  let best = "", bestD = Infinity;
  const b0 = twistBaseAngle(pose, row, col);
  if (b0 != null) bestD = Math.abs(angDelta(b0, aim));
  for (const suf of TWIST_SUFS) {
    ensureTwistSheet(pose + suf);
    if (!twistReady(pose + suf, w)) continue;
    const a = twistBaseAngle(pose + suf, row, col);
    if (a == null) continue;
    const d = Math.abs(angDelta(a, aim));
    if (d < bestD) { bestD = d; best = suf; }
  }
  return best;
}
function spriteFrame() { const p = player; return p.moving ? Math.floor((p.stepDist || 0) / PSHEET.stride) % 8 : 1; }
function spriteOrigin() { const S = PSHEET.size; return { x: player.x - S / 2, y: player.y + 6 - S * PSHEET.footY }; }
// ponto do quadro atual (px de 0 a 128) -> mundo
function posePt(key, pose) {
  pose = pose || weaponPose(curW()) + TW.suf;
  const o = spriteOrigin(), k = PSHEET.size / PSHEET.cell, pt = SPRITE_POSES[pose][player.sRow | 0][spriteFrame()][key];
  return { x: o.x + pt[0] * k, y: o.y + pt[1] * k };
}
// A posição do cano usa a empunhadura da spritesheet, porém o
// ângulo vem EXCLUSIVAMENTE da direção do personagem. Isso evita o
// tiro inverter ao colocar o cursor atrás ou próximo da empunhadura.
function gunGripAndLength(w) {
  const pose = weaponPose(w) + TW.suf, a = posePt("a", pose), b = posePt("b", pose);
  return { x: a.x, y: a.y, length: Math.hypot(b.x - a.x, b.y - a.y) * weaponMeters(w) };
}
function updateWeaponAim() {
  // Nunca calcular novamente a direção a partir do cano ou da mão.
  // A origem continua no cano; a direção é sempre a do corpo/mouse,
  // estabilizada pela zona morta aplicada no movimento.
  player.gunAngle = player.angle;
}
// duas armas (uma em cada mão): escala da arma e ponta do cano de cada mão
const DUAL_SCALE = 0.8;
// Com armas duplas as armas ficam paradas nas mãos, apontando para a frente do tronco (que gira: dualTwistTick).
function dualTwist(pose) {
  // direção dos braços NESTE quadro (eixo a→b da pose renderizada): a arma fica presa às mãos
  const A = posePt("a", pose), B = posePt("b", pose), base = Math.atan2(B.y - A.y, B.x - A.x);
  const c = posePt("c", pose);
  return { base, d: 0, px: c.x, py: c.y };
}
function twistPt(pt, t) {
  const s = Math.sin(t.d), co = Math.cos(t.d), dx = pt.x - t.px, dy = pt.y - t.py;
  return { x: t.px + dx * co - dy * s, y: t.py + dx * s + dy * co };
}
function dualLenPx(w, pose) {
  const A = posePt("a", pose), B = posePt("b", pose);
  return Math.hypot(B.x - A.x, B.y - A.y) * weaponMeters(w) * DUAL_SCALE;
}
const THUNDER_MUZZLES = {"longa":[[[51.34,18.73],[49.82,18.33],[48.04,17.02],[47.82,17.32],[48.64,18.92],[50.62,18.34],[51.94,16.94],[52.34,17.33]],[[89.4,23.49],[88.2,22.09],[87.1,19.69],[86.8,19.69],[87.21,21.89],[88.41,22.79],[89.51,22.29],[89.81,22.51]],[[111.33,47.97],[111.14,46.17],[111.14,43.66],[111.14,43.37],[111.33,45.77],[111.04,47.07],[111.04,46.68],[111.04,47.47]],[[105.54,78.05],[106.84,76.75],[107.94,74.64],[108.24,74.64],[107.44,76.55],[105.95,77.16],[104.85,76.66],[104.55,77.06]],[[75.63,96.04],[77.15,95.92],[78.93,94.42],[79.15,94.72],[78.33,96.04],[76.35,95.84],[75.03,94.15],[74.63,94.35]],[[39.61,91.45],[40.81,92.43],[41.91,91.83],[42.21,92.33],[41.8,93.05],[40.6,91.85],[39.5,89.55],[39.2,89.55]],[[16.65,67.05],[16.84,68.15],[16.84,68.14],[16.84,68.55],[16.65,69.25],[16.94,67.46],[16.94,64.76],[16.94,64.85]],[[22.45,36.89],[21.15,37.49],[20.05,36.89],[19.75,37.68],[20.55,38.39],[22.03,37.29],[23.13,34.99],[23.43,34.99]]],"longa_tm15":[[[61.95,17.07],[60.44,16.67],[58.65,15.17],[58.25,15.47],[59.25,17.07],[61.05,16.97],[62.55,15.57],[62.95,15.77]],[[97.41,28.13],[96.21,26.73],[95.11,24.33],[94.81,24.62],[95.51,26.53],[96.71,27.24],[97.81,26.74],[98.11,27.14]],[[112.2,55.86],[112.3,54.06],[112.3,51.36],[112.3,51.26],[112.2,53.66],[112.2,54.96],[111.91,54.57],[112.2,55.36]],[[98.83,84.02],[99.85,82.62],[101.13,80.5],[101.43,80.32],[100.73,82.42],[99.43,83.03],[98.33,82.53],[98.03,82.93]],[[65.01,96.03],[66.53,96.01],[68.31,94.51],[68.71,94.53],[67.71,96.03],[65.91,95.64],[64.41,94.24],[64.01,94.44]],[[31.6,85.47],[32.8,86.17],[33.9,85.57],[34.2,86.07],[33.5,86.78],[32.3,85.58],[31.2,83.28],[30.9,83.28]],[[15.78,57.48],[15.68,58.87],[15.68,58.57],[15.68,58.98],[15.78,59.97],[15.78,58.18],[16.07,55.48],[15.78,55.28]],[[29.45,29.47],[28.15,30.17],[26.86,29.28],[26.56,30.07],[27.26,31.07],[28.56,29.68],[29.66,27.38],[29.96,27.57]]],"longa_tm30":[[[73.77,18.01],[71.97,17.61],[70.47,16.11],[70.07,16.41],[71.07,18.01],[72.58,17.72],[74.37,16.32],[74.77,16.71]],[[104.85,35.4],[103.65,34.29],[102.84,31.89],[102.25,31.89],[102.95,34.09],[104.15,34.52],[105.25,34.02],[105.55,34.7]],[[110.96,65.36],[111.25,63.84],[111.25,61.04],[111.25,60.76],[110.96,63.16],[111.15,64.46],[111.15,64.07],[111.15,64.86]],[[89.78,90.2],[90.98,88.9],[92.08,86.5],[92.38,86.5],[91.68,88.41],[90.38,89.02],[89.28,88.52],[88.98,89.21]],[[53.2,95.47],[55,95.17],[56.5,93.67],[56.9,93.97],[55.9,95.47],[54.38,95.09],[52.6,93.59],[52.2,93.79]],[[23.13,77.93],[24.33,78.63],[25.14,78.03],[25.73,78.82],[25.03,79.53],[23.83,78.15],[22.73,76.03],[22.43,75.75]],[[17.02,47.96],[16.73,49.06],[16.73,48.86],[16.73,49.46],[17.02,50.44],[16.83,48.66],[16.83,45.96],[16.83,45.86]],[[38.21,23.19],[37.01,23.79],[35.91,23.19],[35.61,23.69],[36.31,24.5],[37.61,23.59],[38.71,21.29],[39.01,21]]],"longa_tm45":[[[85.6,21.36],[84.09,20.96],[82.59,19.46],[82.19,19.76],[82.9,21.36],[84.89,21.26],[86.2,19.57],[86.6,19.77]],[[110.03,44.01],[108.83,43.08],[107.54,40.5],[107.24,40.5],[108.13,42.7],[109.04,43.31],[110.14,42.81],[110.44,43.5]],[[107.1,74.52],[107.2,72.72],[107.2,70.02],[107.2,69.92],[107.1,72.32],[107.1,73.34],[106.82,73.24],[107.1,73.74]],[[78.93,94.03],[80.42,92.92],[81.52,90.81],[81.82,90.62],[80.83,92.43],[79.82,93.33],[78.72,92.55],[78.42,93.23]],[[43.42,92.2],[44.93,91.9],[46.43,90.4],[46.83,90.7],[46.12,92.2],[44.13,91.81],[42.82,90.41],[42.42,90.61]],[[17.95,69.15],[19.15,69.85],[20.44,69.25],[20.74,70.04],[19.85,70.75],[18.65,69.55],[17.84,67.25],[17.54,67.25]],[[20.88,39.03],[20.79,40.13],[20.78,39.83],[20.79,40.53],[20.88,41.23],[20.88,39.44],[21.17,36.74],[20.88,36.64]],[[48.04,19.05],[46.55,19.65],[45.45,19.05],[45.15,19.55],[46.14,20.37],[47.15,19.45],[48.25,16.97],[48.55,16.87]]],"longa_tm60":[[[95.39,26.82],[93.69,26.42],[92.19,24.92],[91.69,25.22],[92.69,26.82],[94.2,26.72],[95.99,25.03],[96.39,25.23]],[[111.8,53.54],[110.89,52.43],[109.6,50.03],[109.49,50.03],[109.9,52.23],[111.1,52.84],[112.2,52.34],[112.5,52.84]],[[100.26,82.2],[100.55,80.69],[100.54,77.89],[100.55,77.6],[100.26,80],[100.45,81.02],[100.45,81.1],[100.45,81.42]],[[67.64,95.73],[68.65,94.61],[69.75,92.31],[70.05,92.31],[69.35,94.41],[68.34,95.03],[67.24,94.24],[66.94,94.93]],[[33.62,86.6],[35.32,86.3],[36.82,84.8],[37.32,85.28],[36.32,86.6],[34.81,86.4],[33.02,85],[32.62,85.2]],[[16.18,59.61],[17.09,60.49],[18.38,59.89],[18.49,60.21],[18.08,61.39],[16.88,60.01],[15.78,57.71],[15.48,57.89]],[[27.74,31.09],[27.45,32.19],[27.45,31.89],[27.45,32.49],[27.74,33.29],[27.55,31.5],[27.55,28.8],[27.55,28.89]],[[59.33,17.19],[58.32,18.07],[57.22,17.37],[56.92,17.97],[57.62,18.97],[58.63,17.87],[59.73,15.57],[60.03,15.29]]],"longa_tm75":[[[102.83,34.09],[101.13,33.69],[99.63,32.38],[99.13,32.68],[100.13,34.09],[101.83,33.99],[103.14,32.59],[103.83,32.79]],[[110.85,63.04],[109.65,61.93],[108.55,59.53],[108.25,59.82],[108.66,61.73],[109.86,62.34],[111.15,61.84],[111.26,62.53]],[[91.21,88.2],[91.5,86.69],[91.5,84.17],[91.5,83.89],[91.21,86.19],[91.4,87.49],[91.4,87.1],[91.21,87.6]],[[55.82,94.89],[57.12,93.77],[58.22,91.47],[58.52,91.47],[57.72,93.57],[56.52,94.19],[55.42,93.69],[55.12,94.09]],[[25.15,79.35],[26.85,79.05],[28.35,77.55],[28.85,77.85],[27.85,79.35],[26.15,78.96],[24.84,77.46],[24.15,77.95]],[[17.13,50.08],[18.33,50.78],[19.43,50.37],[19.73,50.68],[19.32,51.68],[18.12,50.48],[17.02,48.18],[16.72,48.18]],[[36.79,24.71],[36.5,25.81],[36.69,25.8],[36.5,26.4],[36.79,26.91],[36.79,25.41],[36.79,22.71],[36.79,22.61]],[[71.14,18.31],[69.84,19.01],[69.03,18.6],[68.73,18.91],[69.43,19.91],[70.44,18.81],[71.54,16.51],[71.84,16.22]]],"longa_tm90":[[[107.81,42.88],[106.11,42.48],[104.61,40.98],[104.11,41.28],[105.11,42.88],[106.81,42.78],[108.13,41.38],[108.53,41.58]],[[106.7,72.21],[105.5,71.1],[104.5,68.7],[104.2,68.51],[104.8,70.61],[106,71.51],[107.1,70.72],[107.4,71.22]],[[80.65,92.22],[80.65,90.71],[80.65,88.01],[80.65,87.91],[80.65,90.02],[80.83,91.03],[80.83,91.12],[80.83,91.43]],[[46.04,91.9],[47.05,90.6],[48.15,88.2],[48.45,88.2],[47.94,90.11],[46.74,90.91],[45.64,90.41],[45.34,90.62]],[[20.17,70.75],[22.15,70.45],[23.37,68.95],[23.87,68.96],[22.87,70.75],[21.17,70.36],[19.85,68.67],[19.45,69.16]],[[21.47,41.34],[22.67,41.75],[23.48,41.15],[23.78,41.94],[23.18,42.65],[21.98,41.55],[20.88,38.97],[20.58,39.15]],[[46.32,20.58],[46.32,21.87],[46.51,21.38],[46.32,22.27],[46.32,22.78],[46.61,21.28],[46.61,18.58],[46.61,18.67]],[[83.16,21.66],[81.96,22.26],[80.86,21.84],[80.56,22.44],[81.26,23.44],[82.75,22.34],[83.85,20.04],[84.15,19.76]]],"longa_tp15":[[[40.94,22.79],[39.14,22.68],[37.35,21.18],[37.14,21.48],[37.95,22.79],[39.94,22.69],[41.54,21.29],[41.94,21.49]],[[75.79,19.32],[74.59,17.92],[73.49,15.52],[73.19,15.62],[73.89,17.82],[74.9,18.72],[76,17.93],[76.3,18.62]],[[105.25,37.72],[105.06,35.92],[105.35,33.22],[105.06,33.12],[105.25,35.52],[105.25,36.63],[104.96,36.24],[105.25,37.03]],[[109.54,67.17],[110.84,65.58],[111.94,63.47],[112.24,63.47],[111.44,65.38],[110.14,66.28],[109.04,65.49],[108.55,66.18]],[[87.06,90.31],[88.86,90.01],[90.65,88.51],[90.86,88.81],[90.05,90.31],[88.06,89.92],[86.46,88.52],[86.06,88.72]],[[51.17,93.87],[52.37,94.57],[53.47,94.45],[53.77,94.76],[53.07,95.66],[52.06,94.27],[50.96,91.69],[50.66,91.87]],[[22.92,75.62],[22.92,77.01],[22.63,76.71],[22.92,77.6],[22.92,78.11],[23.02,76.22],[23.02,73.52],[23.02,73.42]],[[18.44,46.43],[17.14,47.32],[16.04,46.43],[16.03,47.22],[16.54,47.93],[17.84,46.83],[18.94,44.53],[19.43,44.43]]],"longa_tp30":[[[31.88,29.35],[30.08,28.95],[28.3,27.45],[28.08,27.75],[29.18,29.35],[31.17,28.97],[32.48,27.57],[32.88,27.77]],[[63.79,18.39],[62.78,16.99],[61.68,14.87],[61.38,14.87],[62.08,17.07],[63.38,17.97],[64.48,17.47],[64.78,17.69]],[[97.63,30.44],[97.63,28.64],[97.63,25.65],[97.63,25.84],[97.63,27.95],[97.63,29.35],[97.34,29.15],[97.63,29.75]],[[110.3,57.48],[111.6,56.08],[112.7,53.97],[113,53.78],[112.49,55.88],[111.19,56.78],[110.09,55.99],[109.6,56.49]],[[96.11,84.13],[97.91,84.02],[99.7,82.52],[99.91,82.82],[98.81,84.13],[96.82,83.74],[95.51,82.34],[95.11,82.73]],[[63.18,94.71],[64.19,95.41],[65.29,94.81],[65.59,95.6],[64.89,96.31],[63.59,95.11],[62.49,92.53],[62.19,92.53]],[[31.39,83.16],[31.39,84.26],[31.39,84.25],[31.39,84.85],[31.39,85.36],[31.39,83.76],[31.67,81.06],[31.39,80.67]],[[17.68,56.15],[16.38,56.85],[15.28,56.43],[14.98,56.75],[15.49,57.46],[16.79,56.55],[17.89,53.96],[18.38,53.96]]],"longa_tp45":[[[25.22,37.29],[23.42,36.89],[21.63,35.39],[21.23,35.69],[22.52,37.29],[24.32,36.91],[26.11,35.51],[26.22,35.71]],[[52.31,20.25],[51.3,18.85],[50.2,16.45],[49.9,16.45],[50.6,18.65],[51.9,19.55],[53,19.05],[53.3,19.45]],[[86.81,24.79],[86.81,23.18],[88.13,20.19],[86.81,20.38],[86.81,22.78],[86.81,23.89],[86.81,23.51],[86.81,24.29]],[[108.34,47.95],[109.83,46.55],[110.93,44.15],[111.23,44.43],[110.24,46.35],[108.94,47.25],[107.84,46.75],[107.54,47.15]],[[102.77,75.97],[104.57,75.86],[106.35,74.65],[106.75,74.66],[105.47,75.97],[103.67,75.87],[101.88,74.47],[101.77,74.67]],[[74.66,93.02],[75.67,93.72],[76.77,93.12],[77.07,93.62],[76.56,94.33],[75.07,92.95],[73.97,90.65],[73.67,90.83]],[[41.18,88.76],[41.18,89.86],[41.18,89.66],[41.18,90.26],[41.18,90.77],[41.18,88.88],[41.37,86.18],[41.37,86.08]],[[19.64,65.69],[18.34,66.39],[17.24,65.79],[17.23,66.29],[17.74,67],[19.23,65.8],[20.33,63.5],[20.63,63.5]]],"longa_tp60":[[[21.36,46.22],[19.56,46.11],[17.77,44.61],[17.37,44.91],[18.66,46.22],[20.46,46.12],[21.77,44.72],[22.17,44.92]],[[42.96,24.58],[41.48,23.18],[40.38,20.78],[40.08,20.88],[41.06,22.79],[42.36,23.69],[43.46,23.19],[43.48,23.59]],[[75.82,21.45],[75.82,19.83],[75.82,17.13],[75.82,17.03],[75.82,19.43],[75.82,20.55],[75.82,20.45],[75.82,20.95]],[[103.16,39.34],[104.65,37.94],[105.75,35.54],[106.05,35.64],[105.06,37.55],[104.05,38.45],[102.66,37.95],[102.65,38.35]],[[106.63,67.09],[108.43,66.98],[110.21,65.48],[110.62,65.78],[109.33,67.09],[107.53,66.71],[106.21,65.31],[105.81,65.51]],[[85.03,88.81],[86.52,89.7],[87.62,89.1],[87.92,89.41],[86.93,90.31],[85.92,88.92],[84.53,86.62],[84.52,86.62]],[[51.15,91.75],[51.15,93.14],[51.15,92.65],[51.15,93.54],[51.15,93.76],[51.15,92.16],[51.15,89.46],[51.15,89.36]],[[24.82,74],[23.52,75.17],[22.23,74.57],[21.93,75.07],[22.92,75.78],[24.41,74.4],[25.51,72.1],[25.81,72.28]]],"longa_tp75":[[[20.3,55.93],[18.5,55.63],[17,54.13],[16.5,54.43],[17.6,55.93],[19.4,55.83],[21.19,54.15],[21.59,54.35]],[[33.91,30.85],[32.61,29.45],[31.61,27.15],[31.31,27.15],[32.01,29.07],[33.31,29.97],[34.41,29.47],[34.71,29.87]],[[64.29,20.7],[64.29,18.9],[64.29,16.39],[64.29,16.29],[64.29,18.5],[64.29,19.8],[64.1,19.7],[64.29,20.2]],[[95.54,32.07],[97.03,30.67],[98.13,28.27],[98.43,28.37],[97.44,30.47],[96.24,31.18],[95.14,30.68],[94.84,31.08]],[[107.68,57.4],[109.48,57.29],[110.98,55.79],[111.48,56.09],[110.38,57.4],[108.58,57.3],[106.79,55.9],[106.39,56.1]],[[94.08,82.34],[95.57,83.52],[96.67,82.92],[96.68,83.23],[95.98,84.13],[94.68,82.74],[93.58,80.44],[93.28,80.15]],[[62.97,92.4],[62.97,93.79],[62.97,93.3],[62.97,93.9],[63.15,94.6],[63.15,92.81],[62.87,90.11],[63.15,89.91]],[[33.47,81.53],[32.17,82.42],[31.36,81.82],[31.06,82.13],[31.57,83.03],[33.06,81.65],[34.16,79.35],[34.46,79.53]]],"longa_tp90":[[[22.55,65.29],[20.75,65.18],[18.97,63.68],[18.75,63.98],[19.85,65.29],[21.84,65.09],[23.15,63.69],[23.55,63.89]],[[27.53,38.79],[26.05,37.39],[24.95,35.28],[24.65,35.09],[25.63,37.19],[26.93,38.09],[28.03,37.59],[28.05,37.81]],[[52.81,22.57],[52.81,20.95],[52.52,17.97],[52.81,18.15],[52.81,20.55],[52.62,21.67],[52.62,21.57],[52.62,22.07]],[[85.01,26.61],[87.53,25.21],[87.31,22.81],[87.61,22.91],[86.91,25.11],[85.71,26.01],[84.61,25.51],[84.31,25.91]],[[105.43,48.35],[107.23,47.76],[109.01,46.45],[109.23,46.75],[108.13,48.35],[106.14,47.77],[104.83,46.37],[104.43,46.76]],[[100.45,74.76],[101.94,75.46],[103.04,75.05],[103.34,75.36],[102.35,76.07],[101.05,75.16],[99.95,72.57],[99.65,72.57]],[[74.16,90.52],[74.16,91.62],[74.45,91.61],[74.16,92.21],[74.16,92.72],[74.35,91.12],[74.35,88.42],[74.35,88.03]],[[42.98,86.66],[41.49,87.65],[40.68,87.05],[40.38,87.55],[41.08,88.26],[42.28,87.06],[43.38,84.47],[43.68,84.66]]]};
function drawHeldGlow(d, pose, col, row, cell, x, y, size, flash) {
  if (!d?.glow) return;
  const layer = gearImg(d.glow, pose);
  if (!layer) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = flash ? 1 : 0.58 + Math.sin(performance.now() / 230) * 0.28;
  ctx.drawImage(layer, col * cell, row * cell, cell, cell, x, y, size, size);
  ctx.restore();
}
function muzzlePoint(recoil = player.flashT > 0 ? 2 : 0) {
  if (!useSpriteChar()) return null;
  const w = curW(); if (w.melee || w.fists) return null;
  if (w.thunder) {
    const pose = weaponPose(w) + TW.suf;
    const muzzle = THUNDER_MUZZLES[pose]?.[player.sRow | 0]?.[spriteFrame()];
    if (muzzle && weapon3dImg(w, pose)) {
      const origin = spriteOrigin(), scale = PSHEET.size / PSHEET.cell;
      return { x: origin.x + muzzle[0] * scale - Math.cos(player.angle) * recoil,
        y: origin.y + muzzle[1] * scale - Math.sin(player.angle) * recoil };
    }
  }
  if (w.dual) {
    const pose = weaponPose(w) + TW.suf, t = dualTwist(pose), H = twistPt(posePt(player.dualSide ? "hl" : "hr", pose), t);
    const a = t.base + t.d, L = dualLenPx(w, pose) * 0.72;
    return { x: H.x + Math.cos(a) * L, y: H.y + Math.sin(a) * L };
  }
  const grip = gunGripAndLength(w);
  const pose = weaponPose(w), fixedGrip = !!WEAPON_3D[w.id]?.poseLayer && !w.thunder;
  const a = fixedGrip ? twistBaseAngle(pose + TW.suf, player.sRow | 0, spriteFrame())
    : (Number.isFinite(player.gunAngle) ? player.gunAngle : player.angle);
  const L = grip.length + (!fixedGrip && pose === "pistola" ? PISTOL_FWD : 0);
  return { x: grip.x + Math.cos(a) * L, y: grip.y + Math.sin(a) * L };
}
function chestPoint() { return useSpriteChar() ? posePt("c") : { x: player.x, y: player.y }; }

// desenha a arma em uso nas mãos, seguindo o eixo da pose naquele quadro
function drawHeldWeapon(w, pose) {
  if (w.fists) return;
  if (w.dual) {
    const ang = dualTwist(pose).base;            // presa ao corpo: o giro vem do corpo todo
    const model = (w.len || 20) + 20, k = dualLenPx(w, pose) / model;
    for (const key of ["hl", "hr"]) {           // mão de trás primeiro, a da frente por cima
      const H = posePt(key, pose);
      ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(ang); ctx.scale(k, k * 0.9);
      drawWeaponShape(w, 0);
      ctx.restore();
    }
    return;
  }
  const A = posePt("a", pose), B = posePt("b", pose), U = posePt("u", pose);
  const m = weaponMeters(w), axX = B.x - A.x, axY = B.y - A.y;
  const lenPx = Math.hypot(axX, axY) * m, pxPerM = PSHEET.size / PSHEET.cell * 64;
  let ang = Math.atan2(axY, axX);
  const thick = clamp(0.5 + 0.5 * Math.hypot(U.x - A.x, U.y - A.y) / (0.1 * pxPerM), 0.55, 1);
  ctx.save(); ctx.translate(A.x, A.y);
  if (w.melee) {
    // golpe: a lâmina varre de um lado para o outro em volta da mão
    if (game.slashT > 0) ang += (-1 + (1 - game.slashT / 200) * 2) * (game.slashA || 0.9) * 1.2 + (player.angle - ang) * 0.6;
    ctx.rotate(ang);
    const model = (w.len || 20) + 18;
    ctx.scale(Math.max(0.25, lenPx / model), thick); ctx.translate(-8, -6);
    drawWeaponShape(w, 0);
  } else {
    // Rotação contínua da arma 2D enquanto o corpo usa oito poses.
    const fixedGrip = !!WEAPON_3D[w.id]?.poseLayer;
    ctx.rotate(fixedGrip ? ang : (Number.isFinite(player.gunAngle) ? player.gunAngle : player.angle));
    if (!fixedGrip && (w.look === "pistol" || w.look === "revolver")) ctx.translate(PISTOL_FWD, 0);
    const model = (w.len || 20) + 20, start = w.look === "pistol" || w.look === "revolver" ? 10 : 0;
    ctx.scale(Math.max(0.2, lenPx / (model - start)), thick); ctx.translate(-start, 0);
    if (w.tint) ctx.filter = w.tint;
    drawWeaponShape(w, 0);
    ctx.filter = "none";
  }
  ctx.restore();
}

// ---------- Rastro dos olhos da máscara HOPE ----------
// Andando com a máscara, cada olho deixa uma linha de brilho ciano para trás que some aos poucos.
// Os pontos dos olhos (eL/eR) vêm do SPRITE_POSES (gerados no Blender junto com o resto da pose).
const EYE_TRAIL = { L: [], R: [], life: 700, color: [90, 235, 255] };
function eyeTrailOn() { return typeof clothingLayer === "function" && clothingLayer("mask") === "mask_hope"; }
function eyeTrailTick() {
  const now = game.time, T = EYE_TRAIL;
  for (const k of ["L", "R"]) while (T[k].length && now - T[k][0].t > T.life) T[k].shift();
  if (!eyeTrailOn() || !player.moving) return;
  const pose = weaponPose(curW()) + TW.suf, info = SPRITE_POSES[pose] && SPRITE_POSES[pose][player.sRow | 0][spriteFrame()];
  if (!info || !info.eL) return;
  for (const k of ["L", "R"]) {
    const p = posePt("e" + k, pose), a = T[k], last = a[a.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1.5) a.push({ x: p.x, y: p.y, t: now });
  }
}
function drawEyeTrails() {
  const T = EYE_TRAIL, now = game.time, [r, g, b] = T.color;
  if (!T.L.length && !T.R.length) return;
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
  ctx.shadowColor = `rgb(${r},${g},${b})`; ctx.shadowBlur = 8;
  for (const k of ["L", "R"]) {
    const a = T[k];
    for (let i = 1; i < a.length; i++) {
      const f = 1 - (now - a[i].t) / T.life;              // 1 = acabou de sair do olho, 0 = sumiu
      if (f <= 0) continue;
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.75 * f})`; ctx.lineWidth = 0.8 + 1.6 * f;
      ctx.beginPath(); ctx.moveTo(a[i - 1].x, a[i - 1].y); ctx.lineTo(a[i].x, a[i].y); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPlayerSprite() {
  if (!useSpriteChar()) return false;
  eyeTrailTick();
  const p = player, w = curW(), pose = weaponPose(w) + TW.suf, S = PSHEET.size, c = PSHEET.cell, row = p.sRow | 0, col = spriteFrame();
  // Sombra ambiental macia no piso, com leve deslocamento de luz direcional.
  // Dá profundidade ao soldado 3D sem alterar colisão ou posição.
  if (!game.inside) {
    ctx.save();
    ctx.translate(p.x + 12, p.y + 13);
    ctx.rotate(-0.22);
    ctx.scale(1.25, 0.62);
    const shadow = ctx.createRadialGradient(0, 0, 2, 0, 0, 39);
    shadow.addColorStop(0, "rgba(7,13,9,0.43)");
    shadow.addColorStop(0.4, "rgba(10,13,9,0.23)");
    shadow.addColorStop(1, "rgba(10,13,9,0)");
    ctx.fillStyle = shadow;
    ctx.beginPath(); ctx.arc(0,0,39,0,6.283); ctx.fill();
    ctx.restore();
  }
  const kick = p.flashT > 0 ? 2 : 0, o = spriteOrigin(), info = SPRITE_POSES[pose][row][col];
  // tronco torcido: a arma 3D só existe na pose normal — usa a dela, levada até a mão do tronco girado
  const basePose = TW.suf ? pose.slice(0, -TW.suf.length) : pose;
  let w3 = weapon3dImg(w, pose), w3Base = false;
  if (!w3 && TW.suf && !w.thunder) { w3 = weapon3dImg(w, basePose); w3Base = !!w3; }
  if (info.bh && !w3) drawHeldWeapon(w, pose);       // arma atrás do corpo (de costas)
  drawEyeTrails();                                    // rastro dos olhos fica atrás do corpo
  const ox = o.x - Math.cos(p.angle) * kick, oy = o.y - Math.sin(p.angle) * kick;
  ctx.drawImage(tintedSheet(pose), col * c, row * c, c, c, ox, oy, S, S);
  // arma 3D: a camada já vem recortada pelo corpo; atrás do corpo vai antes do colete/mochila
  const drawW3 = () => {
    const d = WEAPON_3D[w.id];
    ctx.save();
    if (!w.melee && !d.poseLayer) {
      // Camada da arma 3D: vira em torno da empunhadura sem rodar o
      // personagem inteiro. A mira e o disparo usam este mesmo ângulo.
      const A = posePt("a", pose), A0 = w3Base ? posePt("a", basePose) : A, B0 = posePt("b", w3Base ? basePose : pose);
      const baseAngle = Math.atan2(B0.y - A0.y, B0.x - A0.x);
      const aim = Number.isFinite(p.gunAngle) ? p.gunAngle : p.angle;
      ctx.translate(A.x, A.y);
      ctx.rotate(angDelta(baseAngle, aim));
      if (basePose === "pistola") ctx.translate(Math.cos(baseAngle) * PISTOL_FWD, Math.sin(baseAngle) * PISTOL_FWD);   // pistola um pouco à frente na mão
      ctx.translate(-A0.x, -A0.y);
    } else if (w.melee && w.look !== "chainsaw" && game.slashT > 0) {
      const A = posePt("a", pose), A0 = w3Base ? posePt("a", basePose) : A, sw = (-1 + (1 - game.slashT / 200) * 2) * (game.slashA || 0.9) * 0.9;
      ctx.translate(A.x, A.y); ctx.rotate(sw); ctx.translate(-A0.x, -A0.y);
    } else if (w3Base && !d.poseLayer) {                                    // corpo a corpo parado: só leva a arma até a mão
      const A = posePt("a", pose), A0 = posePt("a", basePose);
      ctx.translate(A.x - A0.x, A.y - A0.y);
    }
    if (d.f) ctx.filter = d.f;
    ctx.drawImage(w3, col * c, row * c, c, c, ox, oy, S, S);
    drawHeldGlow(d, pose, col, row, c, ox, oy, S, p.flashT);
    ctx.restore();
  };
  if (w3 && info.bh) drawW3();
  // colete, mochila, capacete/máscara; de frente a mochila vai antes (o colete a cobre),
  // de lado e de costas ela vai depois do colete (fica por cima dele)
  const gearList = gearOrder(playerGear(), row !== 3 && row !== 4 && row !== 5);
  for (const id of gearList) {
    // tronco torcido sem a camada dessa peça: usa a da pose normal (calça e botas batem, as pernas não giram)
    const g = gearImg(id, pose) || (TW.suf ? gearImg(id, pose.slice(0, -TW.suf.length)) : null);
    if (g) ctx.drawImage(g, col * c, row * c, c, c, ox, oy, S, S);
  }
  if (w3 && !info.bh) drawW3();
  else if (!w3 && !info.bh) drawHeldWeapon(w, pose);      // arma na frente do corpo
  // A lanterna no colete fica fisicamente apagada sob o sol.
  if (info.cb == null ? row >= 1 && row <= 7 : !info.cb) {
    const L = chestPoint();
    if (flashlightActive()) {
      const a = row === 1 || row === 7 ? 0.55 : 1;
      ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, 7);
      g.addColorStop(0, "rgba(255,240,190,0.95)"); g.addColorStop(1, "rgba(255,220,140,0)");
      ctx.fillStyle = g; circle(L.x, L.y, 7);
      ctx.restore();
    }
    ctx.fillStyle = "#1c1c1c"; ctx.fillRect(L.x - 2.5, L.y - 2, 5, 4);
    ctx.fillStyle = flashlightActive() ? "#fff4cf" : "#595850"; circle(L.x, L.y, 1.6);
  }
  // clarão do tiro na ponta do cano
  if (p.flashT > 0 && !p.thunderFlash && !w.melee) {
    const m = muzzlePoint(), ang = p.shotAng != null ? p.shotAng : (p.gunAngle != null ? p.gunAngle : p.angle);
    if (m) {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.translate(m.x, m.y); ctx.rotate(ang);
      ctx.fillStyle = "rgba(255,220,120,0.9)"; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(18, 0); ctx.lineTo(0, 6); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,220,0.9)"; circle(2, 0, 4);
      ctx.restore();
    }
  }
  return true;
}

// ---------- Zumbis humanoides com spritesheet (mesmo estilo e câmera) ----------
const ZSHEET = { ok: false, sheets: {}, base: 72 };
(function loadZombieSheets() {
  const names = ["z_walker", "z_walker2", "z_runner", "z_brute", "z_hazmat", "z_dog", "z_creeper"];
  let n = 0;
  for (const nm of names) { const im = new Image(); im.onload = () => { if (++n === names.length) ZSHEET.ok = true; }; im.src = `img/${nm}.png`; ZSHEET.sheets[nm] = im; }
})();
function zombieSheet(z) {
  z.var = z.var == null ? Math.random() : z.var;
  switch (z.type) {
    case "walker": return z.var < 0.5 ? "z_walker" : "z_walker2";
    case "runner": case "infected": return "z_runner";
    case "brute": return "z_brute";
    case "hazmat": return "z_hazmat";
    case "spitter": return "z_walker2";
    case "toxic": return "z_walker";
    case "dog": return "z_dog";
    case "creeper": return "z_creeper";
    default: return null;
  }
}
// ---------- Morte: queda e corpo no chão ----------
// img/<nome>_death.png: 8 direções x 8 quadros de 256 px (o dobro do quadro de andar, mesma escala:
// cobre 4 m em vez de 2 m) com o pé no meio do quadro. O último quadro é o corpo deitado.
const ZDEATH = {};
function zombieDeathImg(nm) {
  let im = ZDEATH[nm];
  if (!im) { im = ZDEATH[nm] = new Image(); im.onerror = () => { im.bad = true; }; im.src = `img/${nm}_death.png?v=20261117-morte01`; }
  return im.bad || !im.complete || !im.naturalWidth ? null : im;
}
// dados que o corpo guarda ao morrer (null = zumbi sem sprite 3D, usa o boneco antigo)
function zombieDeathInfo(z) {
  if (!ZSHEET.ok || save.classicChar || z.boss) return null;
  const nm = zombieSheet(z); if (!nm) return null;
  zombieDeathImg(nm);
  return { dsheet: nm, drow: sheetRow(Math.cos(z.angle), Math.sin(z.angle)), dS: zSpriteSize(z, nm), fx: z.x, fy: z.y, t0: game.time,
    dfilter: z.type === "toxic" ? "hue-rotate(55deg) saturate(1.5)" : z.type === "infected" ? "brightness(0.8) contrast(1.15)" : null };
}
function drawZombieDeath(c) {
  const im = zombieDeathImg(c.dsheet);
  if (!im) return false;
  const el = game.time - c.t0, col = el < 0 ? 7 : Math.min(7, Math.floor(el / 70));   // queda em ~0,5 s
  const S = c.dS * 2, x = c.fx - S / 2, y = c.fy - S * 0.5;
  ctx.save();
  if (col === 7) {                                     // poça de sangue embaixo do corpo
    ctx.fillStyle = "rgba(70,5,5,0.35)"; ellipse(c.fx, c.fy, c.dS * 0.22, c.dS * 0.16);
  }
  if (c.life < 2000) ctx.globalAlpha = Math.max(0, c.life / 2000);   // some aos poucos no fim
  if (c.dfilter) ctx.filter = c.dfilter;
  ctx.drawImage(im, col * 256, c.drow * 256, 256, 256, x, y, S, S);
  ctx.restore();
  return true;
}
// ---------- Golpe: img/<nome>_attack.png (8 direções x 8 quadros, mesmo quadro do andar) ----------
const ZATTACK = {};
function zombieAttackImg(nm) {
  let im = ZATTACK[nm];
  if (!im) { im = ZATTACK[nm] = new Image(); im.onerror = () => { im.bad = true; }; im.src = `img/${nm}_attack.png?v=20261119-ataque01`; }
  return im.bad || !im.complete || !im.naturalWidth ? null : im;
}
// tamanho do quadro na tela: todos os modelos 3D foram fotografados na mesma escala
function zSpriteSize(z, nm) {
  if (nm === "z_dog") return ZSHEET.base * (z.r / 11);
  return ZSHEET.base * (z.r / 13) / (nm === "z_brute" ? 1.15 : 1);
}
// ---------- Corpo do zumbi para os acertos ----------
// O ponto do zumbi (z.x, z.y) é onde ele pisa; com o desenho em pé, o corpo vai dos pés até
// a cabeça. O acerto usa uma cápsula vertical com essa altura e a largura do zumbi (z.r).
function zBodyH(z) {
  if (!ZSHEET.ok || save.classicChar || z.boss) return 0;
  const nm = zombieSheet(z); if (!nm) return 0;
  return zSpriteSize(z, nm) * (nm === "z_dog" ? 0.3 : 0.6);
}
function zDist(z, x, y) {
  const h = zBodyH(z);
  if (!h) return Math.hypot(x - z.x, y - z.y);
  return Math.hypot(x - z.x, y - clamp(y, z.y - h, z.y));
}
function zCenter(z) { return { x: z.x, y: z.y - zBodyH(z) / 2 }; }

// desenha o zumbi com a spritesheet; devolve false se o tipo não tiver (cães, mutantes, chefes...)
function drawZombieSprite(z) {
  if (!ZSHEET.ok || save.classicChar || z.boss) return false;
  const nm = zombieSheet(z); if (!nm) return false;
  const S = zSpriteSize(z, nm);
  const row = sheetRow(Math.cos(z.angle), Math.sin(z.angle));
  const TAU = Math.PI * 2;
  let col = Math.floor((((z.anim || 0) % TAU) + TAU) % TAU / TAU * 8) % 8, sheet = ZSHEET.sheets[nm];
  const atkIm = zombieAttackImg(nm);                      // carrega já, para estar pronta no primeiro golpe
  if (z.atkT > 0 && atkIm) { sheet = atkIm; col = Math.min(7, Math.floor((1 - z.atkT / ZATK_MS) * 8)); }
  const lunge = z.lunge > 0 && sheet === ZSHEET.sheets[nm] ? 5 : 0;   // sem a folha de golpe: o tranco antigo
  const x = z.x - S / 2 + Math.cos(z.angle) * lunge, y = z.y + 6 - S * 0.82 + Math.sin(z.angle) * lunge;
  if (z.type === "toxic") ctx.filter = "hue-rotate(55deg) saturate(1.5)";
  else if (z.type === "infected") ctx.filter = "brightness(0.8) contrast(1.15)";
  ctx.drawImage(sheet, col * 128, row * 128, 128, 128, x, y, S, S);
  ctx.filter = "none";
  if (z.flash > 0) { ctx.save(); ctx.globalAlpha = 0.55; ctx.globalCompositeOperation = "lighter"; ctx.drawImage(sheet, col * 128, row * 128, 128, 128, x, y, S, S); ctx.restore(); }
  if (z.type === "spitter") {
    const pulse = 0.8 + 0.2 * Math.sin(game.time / 150);
    ctx.fillStyle = `rgba(143,209,79,${0.75 * pulse})`; circle(z.x - Math.cos(z.angle) * 5, z.y - S * 0.42, 6 * pulse * S / 86);
  }
  const top = z.y - S * (nm === "z_dog" ? 0.4 : 0.72);
  if (z.state === "chase") { ctx.fillStyle = "rgba(255,60,40,0.9)"; circle(z.x + Math.cos(z.angle) * 3, top + S * 0.08, 1.6); }
  if (z.alertT > 0) txt("!", z.x, top - 6, 20, "#e03a2f", "center", true);
  if (z.hp < z.maxHp) {
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(z.x - 13, top - 4, 26, 4);
    ctx.fillStyle = "#c0392b"; ctx.fillRect(z.x - 13, top - 4, 26 * Math.max(0, z.hp / z.maxHp), 4);
  }
  return true;
}

// ---------- Atmosfera: cone da lanterna, neblina azulada e vinheta ----------
function drawAtmosphere() {
  if (game.over) return;
  const dark = game.inside ? 0.3 : darkness();
  const sun = game.inside ? 0 : sunIntensity();
  const L = chestPoint(), px = L.x - cam.x, py = L.y - cam.y, a = player.angle;
  if (sun > 0.001) {
    // Sol externo simulado, com luz dourada difusa vindo do alto/esquerda.
    // Sem cone artificial: o sol ilumina o cenário inteiro, ao contrário
    // da lanterna. Entardecer reduz o efeito continuamente.
    ctx.save();
    const warmth = ctx.createLinearGradient(0, 0, W, H);
    warmth.addColorStop(0, `rgba(255,201,132,${0.11 * sun})`);
    warmth.addColorStop(0.55, `rgba(249,193,112,${0.075 * sun})`);
    warmth.addColorStop(1, `rgba(233,165,89,${0.025 * sun})`);
    ctx.fillStyle = warmth; ctx.fillRect(0, 0, W, H);
    const sunlight = ctx.createRadialGradient(W * 0.16, -H * 0.22, 12,
      W * 0.16, -H * 0.22, Math.max(W, H) * 1.15);
    sunlight.addColorStop(0, `rgba(255,235,176,${0.105 * sun})`);
    sunlight.addColorStop(0.45, `rgba(255,213,146,${0.038 * sun})`);
    sunlight.addColorStop(1, "rgba(255,199,130,0)");
    ctx.fillStyle = sunlight; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  // Neblina azul no escuro e poeira quente bem mais sutil de dia.
  const fog = ctx.createRadialGradient(px, py, 140, px, py, Math.max(W, H) * 0.8);
  fog.addColorStop(0, "rgba(70,100,140,0)");
  fog.addColorStop(1, sun > 0 ? `rgba(166,141,98,${0.07 * sun + 0.10 * (1 - sun)})` :
    `rgba(60,88,128,${game.inside ? 0.16 : 0.26})`);
  ctx.fillStyle = fog; ctx.fillRect(0, 0, W, H);
  if (sun < 0.1) {
    ctx.fillStyle = `rgba(40,70,110,${0.06 * (1 - sun)})`;
    ctx.fillRect(0, 0, W, H);
  }
  // Vinheta suavizada em dias de sol, preservada na escuridão.
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, `rgba(0,0,6,${0.55 - 0.22 * sun})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
