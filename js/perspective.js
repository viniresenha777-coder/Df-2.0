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
  if (!im) { im = GEAR_IMG[k] = new Image(); im.onerror = () => { im.bad = true; }; im.src = `img/gear/${k}.png${CHAR_V}${id.startsWith("w_fm_trovao_") ? "&grip=3" : ""}`; }
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
const THUNDER_MUZZLES = {"longa":[[[64.64,4.63],[62.94,4.63],[61.34,4.63],[61,4.63],[61.94,4.63],[63.74,4.63],[65.24,4.63],[65.64,4.63]],[[112.79,20.74],[111.59,19.34],[110.49,16.94],[110.22,16.97],[110.8,19.15],[112.02,20.07],[113.09,19.54],[113.42,19.97]],[[122.01,59.91],[122.01,58.11],[122.01,55.41],[122.01,55.31],[122.01,57.71],[122.01,59.02],[122.01,58.77],[122.01,59.42]],[[109.88,98.05],[111.15,96.78],[112.25,94.48],[112.58,94.45],[111.78,96.55],[110.48,97.35],[109.38,96.85],[109.03,97.31]],[[63.36,116.25],[65.06,115.95],[66.66,114.45],[67,114.75],[66.06,116.25],[64.26,116.05],[62.76,114.55],[62.36,114.75]],[[17.09,96.28],[18.26,97.05],[19.36,96.45],[19.66,96.95],[19.09,97.88],[17.86,96.65],[16.79,94.38],[16.46,94.35]],[[5.01,57.47],[5.01,58.57],[5.01,58.37],[5.01,58.97],[5.01,59.67],[5.01,58.07],[5.01,55.37],[5.01,55.32]],[[16.35,18.97],[15.1,19.51],[13.95,18.97],[13.68,19.54],[14.48,20.44],[15.75,19.37],[16.85,17.07],[17.17,17.05]]],"longa_tm15":[[[81.13,4.59],[79.33,4.59],[77.17,4.59],[76.88,4.59],[78.43,4.59],[80.2,4.59],[81.21,4.59],[81.68,4.59]],[[121.48,31.32],[120.28,29.92],[119.18,27.54],[118.88,27.62],[119.58,29.72],[120.78,30.64],[121.88,30.14],[121.94,30.56]],[[122.04,70.95],[122.04,69.12],[122.04,66.42],[122.04,66.32],[122.04,68.75],[122.04,70.06],[122.04,69.89],[122.04,70.46]],[[98.53,106.98],[99.73,105.58],[100.76,103.33],[101.09,103.31],[100.4,105.4],[99.13,106.18],[98.03,105.68],[97.7,106.1]],[[46.82,113.55],[48.48,113.34],[50.13,111.86],[50.52,112.05],[49.52,113.55],[47.73,113.36],[46.23,111.96],[45.83,112.16]],[[7.97,85.01],[9.17,85.71],[10.26,85.09],[10.57,85.61],[9.87,86.51],[8.66,85.29],[7.56,82.99],[7.27,83.01]],[[4.97,45.06],[4.97,46.23],[4.97,45.97],[4.97,46.53],[4.97,47.36],[4.97,45.75],[4.97,43.03],[4.97,42.85]],[[27.75,8.18],[26.48,8.86],[25.39,8.15],[25.12,8.73],[25.78,9.76],[27.08,8.56],[28.18,6.26],[28.45,6.28]]],"longa_tm30":[[[98.24,7.95],[96.48,7.58],[94.98,6.08],[94.58,6.38],[95.54,7.95],[97.25,7.86],[98.81,6.43],[99.21,6.63]],[[121.97,44.59],[121.97,43.13],[121.97,40.57],[121.97,40.5],[121.97,42.82],[121.97,43.82],[121.97,43.5],[121.97,44.05]],[[121.03,84.41],[121.13,82.71],[121.13,79.91],[121.13,79.81],[121.03,82.21],[121.03,83.51],[121.03,83.31],[121.03,83.91]],[[83.51,113.36],[84.71,112.06],[85.82,109.65],[86.12,109.65],[85.41,111.76],[84.11,112.56],[83.01,112.06],[82.71,112.56]],[[31.65,107.21],[33.41,106.88],[34.91,105.38],[35.31,105.68],[34.35,107.21],[32.61,106.98],[31.05,105.51],[30.65,105.71]],[[5.04,71.95],[5.04,72.93],[5.04,72.6],[5.04,73.3],[5.04,74.02],[5.04,72.49],[5.04,69.89],[5.04,69.71]],[[5.67,31.82],[5.59,32.87],[5.57,32.72],[5.57,33.32],[5.67,34.12],[5.67,32.52],[5.69,29.77],[5.67,29.72]],[[44.46,4.59],[43.03,4.59],[42.14,4.59],[41.69,4.59],[42.04,4.59],[43.7,4.59],[45.6,4.59],[45.96,4.59]]],"longa_tm45":[[[110.5,18.05],[108.79,17.64],[107.32,16.17],[106.92,16.47],[107.8,18.05],[109.59,17.94],[111.07,16.41],[111.5,16.65]],[[122.01,56.5],[122.01,55.26],[122.01,52.92],[122.01,52.93],[122.01,55.1],[122.01,55.84],[122.01,55.29],[122.01,55.77]],[[112.38,95.65],[112.45,93.88],[112.45,91.18],[112.45,91.08],[112.38,93.45],[112.38,94.65],[112.28,94.55],[112.38,95.05]],[[66.66,115.75],[67.96,114.45],[69.06,112.15],[69.36,112.15],[68.56,114.15],[67.42,115.05],[66.32,114.45],[66.02,114.95]],[[19.39,97.78],[21.06,97.45],[22.56,95.95],[22.96,96.25],[22.09,97.78],[20.26,97.55],[18.79,96.18],[18.39,96.38]],[[5.01,59.56],[5.01,60.32],[5.01,59.77],[5.01,60.39],[5.01,61.25],[5.01,59.99],[5.01,57.64],[5.01,57.63]],[[13.85,20.17],[13.8,21.21],[13.75,20.97],[13.8,21.61],[13.85,22.37],[13.88,20.74],[13.95,18.07],[13.85,17.97]],[[61.34,4.63],[60.04,4.63],[58.94,4.63],[58.64,4.63],[59.44,4.63],[60.58,4.63],[61.69,4.63],[61.99,4.63]]],"longa_tm60":[[[119.08,29.82],[117.38,29.42],[115.88,27.92],[115.38,28.24],[116.38,29.84],[118.08,29.72],[119.68,28.22],[120.08,28.42]],[[122.04,68.56],[122.04,67.57],[122.04,65.45],[122.04,65.53],[122.04,67.57],[122.04,68.05],[122.04,67.25],[122.04,67.67]],[[100.33,104.98],[100.43,103.28],[100.36,100.53],[100.39,100.41],[100.33,102.78],[100.33,103.98],[100.3,103.9],[100.33,104.38]],[[49.82,113.25],[51.03,111.96],[52.13,109.66],[52.42,109.65],[51.72,111.75],[50.52,112.55],[49.42,111.95],[49.13,112.46]],[[10.37,86.51],[12.07,86.21],[13.57,84.71],[14.06,84.99],[13.06,86.49],[11.37,86.31],[9.77,84.91],[9.37,85.11]],[[4.97,47.49],[4.97,48],[4.97,47.22],[4.97,47.67],[4.97,48.77],[4.97,47.77],[4.97,45.66],[4.97,45.71]],[[25.85,10.18],[25.75,11.28],[25.79,10.95],[25.82,11.53],[25.85,12.38],[25.85,10.78],[25.85,8.08],[25.88,7.96]],[[78.24,4.59],[77.26,4.59],[75.94,4.59],[75.83,4.59],[76.9,4.59],[77.69,4.59],[77.99,4.59],[78.28,4.59]]],"longa_tm75":[[[121.97,42.67],[121.97,42.05],[120.78,40.44],[120.28,40.73],[121.28,42.33],[121.97,42.41],[121.97,41.27],[121.97,41.54]],[[120.73,81.91],[119.53,80.61],[118.43,78.21],[118.11,78.35],[118.73,80.41],[119.93,81.21],[121.03,80.71],[121.33,81.21]],[[85.32,111.35],[85.42,109.65],[85.42,106.95],[85.42,106.85],[85.32,109.15],[85.32,110.45],[85.32,110.25],[85.32,110.75]],[[34.63,106.8],[35.95,105.51],[37.01,103.18],[37.33,103.2],[36.51,105.28],[35.33,106.1],[34.27,105.63],[33.91,105.98]],[[5.04,74.22],[6.51,73.91],[8.01,72.41],[8.51,72.73],[7.53,74.28],[5.81,74.01],[5.04,72.32],[5.04,72.49]],[[5.97,34.32],[7.17,35.02],[8.29,34.37],[8.57,34.92],[7.97,35.92],[6.79,34.67],[5.67,32.42],[5.37,32.42]],[[41.98,4.59],[41.51,4.59],[41.56,4.59],[41.39,4.63],[41.47,5.34],[41.75,4.59],[42.68,4.59],[42.73,4.59]],[[95.25,8.26],[93.94,8.95],[92.95,8.36],[92.68,8.88],[93.38,9.88],[94.58,8.78],[95.64,6.45],[95.95,6.36]]],"longa_tm90":[[[122.01,55.13],[122.01,54.81],[122.01,53.38],[121.8,53.7],[122.01,55.26],[122.01,55.07],[122.01,53.6],[122.01,53.73]],[[111.93,93.21],[110.75,91.88],[109.78,89.45],[109.48,89.45],[110.05,91.58],[111.28,92.45],[112.35,91.88],[112.65,92.38]],[[68.56,113.75],[68.56,112.05],[68.56,109.35],[68.56,109.25],[68.56,111.55],[68.56,112.75],[68.56,112.65],[68.56,113.15]],[[22.36,97.45],[23.62,96.21],[24.66,93.75],[24.96,93.75],[24.26,95.85],[23.06,96.65],[21.96,96.15],[21.66,96.55]],[[5.01,61.28],[5.01,61.07],[5.79,59.6],[6.29,59.8],[5.29,61.4],[5.01,61.13],[5.01,59.55],[5.01,59.83]],[[14.3,22.61],[15.47,23.25],[16.45,22.67],[16.75,23.27],[16.17,24.15],[14.95,23.07],[13.87,20.65],[13.57,20.65]],[[59.44,4.63],[59.44,4.63],[59.44,4.63],[59.44,4.63],[59.44,4.63],[59.54,4.63],[59.54,4.63],[59.54,4.63]],[[107.52,18.37],[106.3,18.95],[105.22,18.37],[104.89,18.94],[105.62,19.97],[106.89,18.84],[107.99,16.54],[108.32,16.47]]],"longa_tp15":[[[47.7,4.59],[45.99,4.59],[44.93,4.59],[44.42,4.59],[44.9,4.59],[46.74,4.59],[48.82,4.59],[49.15,4.59]],[[100.61,9.43],[99.45,8.06],[98.35,5.66],[98.08,5.78],[98.78,7.98],[99.98,8.88],[101.08,8.28],[101.34,8.75]],[[121.97,47.19],[121.97,45.4],[121.97,42.72],[121.97,42.6],[121.97,44.99],[121.97,46.3],[121.97,46.08],[121.97,46.7]],[[119.23,86.41],[120.53,85.01],[121.63,82.71],[121.93,82.71],[121.15,84.79],[119.83,85.71],[118.73,85.11],[118.43,85.61]],[[80.41,113.66],[82.22,113.35],[83.82,111.85],[84.22,112.15],[83.21,113.66],[81.42,113.45],[79.82,112.05],[79.42,112.25]],[[29.27,105.63],[30.41,106.28],[31.51,105.78],[31.83,106.3],[31.11,107.18],[29.91,105.98],[28.81,103.58],[28.55,103.61]],[[5.04,69.3],[5.04,70.49],[5.04,70.16],[5.04,70.89],[5.04,71.6],[5.04,69.97],[5.04,67.22],[5.04,67.12]],[[7.47,29.92],[6.17,30.62],[5.09,29.87],[4.94,30.55],[5.56,31.44],[6.87,30.32],[7.97,28.02],[8.27,27.92]]],"longa_tp30":[[[30.75,7.88],[28.99,7.45],[27.35,5.98],[26.95,6.28],[28.05,7.88],[29.88,7.66],[31.38,6.26],[31.78,6.46]],[[84.06,4.59],[82.37,4.59],[80.47,4.59],[80.15,4.59],[81.63,4.59],[83.19,4.59],[84.09,4.59],[84.59,4.59]],[[121.88,33.82],[121.88,32.02],[121.88,29.22],[121.88,29.22],[121.88,31.52],[121.85,32.87],[121.78,32.72],[121.85,33.27]],[[122.04,73.51],[122.04,71.71],[122.04,69.11],[122.04,69.03],[122.04,71.32],[122.04,72.57],[122.04,72.27],[122.04,72.85]],[[95.43,107.28],[97.19,107.01],[98.83,105.48],[99.2,105.8],[98.13,107.28],[96.33,107.08],[94.83,105.68],[94.43,105.88]],[[44.42,112.05],[45.62,112.75],[46.72,112.15],[47.02,112.75],[46.32,113.65],[45.09,112.48],[43.99,110.08],[43.62,110.05]],[[7.57,82.51],[7.57,83.61],[7.57,83.41],[7.57,84.01],[7.57,84.71],[7.57,83.11],[7.67,80.41],[7.57,80.21]],[[4.97,42.79],[4.97,43.76],[4.97,43.34],[4.97,43.89],[4.97,44.67],[4.97,43.36],[4.97,40.77],[4.97,40.72]]],"longa_tp45":[[[18.78,17.84],[16.98,17.44],[15.38,15.94],[15,16.21],[16.05,17.87],[17.85,17.67],[19.45,16.27],[19.75,16.47]],[[66.74,4.63],[65.54,4.63],[64.44,4.63],[64.14,4.63],[64.84,4.63],[66.14,4.63],[67.24,4.63],[67.54,4.63]],[[113.29,22.04],[113.29,20.24],[113.42,17.47],[113.32,17.47],[113.29,19.84],[113.29,21.14],[113.29,20.94],[113.29,21.54]],[[122.01,61.08],[122.01,59.61],[122.01,57.16],[122.01,57.24],[122.01,59.38],[122.01,60.35],[122.01,59.91],[122.01,60.32]],[[107.48,97.85],[109.28,97.55],[110.88,96.15],[111.25,96.38],[110.18,97.85],[108.35,97.78],[106.75,96.38],[106.48,96.55]],[[61.26,114.55],[62.46,115.25],[63.56,114.65],[63.86,115.15],[63.16,116.05],[61.86,114.85],[60.76,112.55],[60.46,112.55]],[[16.59,93.78],[16.56,94.85],[16.56,94.65],[16.56,95.25],[16.59,95.98],[16.56,94.25],[16.56,91.55],[16.56,91.45]],[[5.01,55.23],[5.01,55.87],[5.01,55.21],[5.01,55.7],[5.01,56.64],[5.01,55.5],[5.01,53.31],[5.01,53.27]]],"longa_tp60":[[[10.57,29.52],[8.77,29.22],[7.17,27.72],[6.76,28.04],[7.87,29.52],[9.66,29.44],[11.17,28.02],[11.59,28.17]],[[49.52,4.59],[48.71,4.59],[48.52,4.59],[48.19,4.59],[48.2,4.59],[49.19,4.59],[50.4,4.59],[50.52,4.59]],[[101.08,11.98],[101.05,10.16],[101.08,7.48],[101.05,7.36],[101.05,9.76],[101.08,11.08],[101.05,10.96],[101.08,11.48]],[[121.97,48.88],[121.97,47.7],[121.97,45.43],[121.97,45.63],[121.97,47.6],[121.97,48.3],[121.97,47.6],[121.97,47.97]],[[116.13,86.71],[117.93,86.41],[119.53,84.91],[119.95,85.19],[118.83,86.71],[117.05,86.49],[115.53,85.11],[115.13,85.31]],[[78.02,112.15],[79.31,112.86],[80.35,112.28],[80.67,112.77],[79.91,113.66],[78.72,112.45],[77.58,110.14],[77.32,110.15]],[[28.81,103.08],[28.81,104.28],[28.81,103.98],[28.81,104.68],[28.83,105.3],[28.81,103.68],[28.81,100.98],[28.83,100.9]],[[5.04,67.81],[5.04,68.25],[5.04,67.37],[5.04,67.79],[5.04,68.89],[5.04,68.04],[5.04,66.04],[5.04,66.12]]],"longa_tp75":[[[5.92,42.1],[4.97,41.89],[4.97,40.64],[4.97,41.06],[4.97,42.39],[5.03,41.99],[6.63,40.44],[7.03,40.64]],[[33.15,9.38],[31.89,7.95],[30.88,5.66],[30.55,5.68],[31.28,7.76],[32.58,8.66],[33.68,8.16],[33.98,8.56]],[[85.31,4.94],[84.8,4.59],[83.84,4.59],[83.8,4.59],[84.66,4.59],[85.12,4.59],[85.08,4.59],[85.26,4.59]],[[119.98,35.82],[121.28,34.42],[121.94,32.2],[121.94,32.42],[121.88,34.22],[120.68,35.12],[119.58,34.62],[119.26,34.99]],[[121.44,74.41],[122.04,73.79],[122.04,71.88],[122.04,72.06],[122.04,73.84],[122.04,74.25],[120.74,72.91],[120.34,73.11]],[[93.03,105.68],[94.26,106.53],[95.43,105.88],[95.63,106.38],[94.9,107.3],[93.63,106.08],[92.53,103.78],[92.23,103.68]],[[44.02,109.55],[44.02,110.75],[44.02,110.45],[44.02,111.05],[44.02,111.75],[44.03,110.16],[43.93,107.46],[44.02,107.25]],[[9.47,80.51],[8.17,81.21],[7.17,80.61],[6.87,81.11],[7.57,82.01],[8.89,80.85],[9.97,78.51],[10.26,78.49]]],"longa_tp90":[[[5.01,54.99],[5.01,54.6],[5.01,53.02],[5.01,53.3],[5.01,54.85],[5.01,54.74],[5.39,53.4],[5.79,53.6]],[[21.28,19.34],[19.95,17.97],[18.85,15.67],[18.58,15.64],[19.35,17.77],[20.65,18.67],[21.75,18.17],[21.95,18.57]],[[67.24,4.63],[67.24,4.63],[67.14,4.63],[67.24,4.63],[67.24,4.63],[67.24,4.63],[67.24,4.63],[67.24,4.63]],[[111.52,24.07],[112.82,22.67],[113.82,20.27],[114.09,20.34],[113.42,22.57],[112.19,23.44],[111.09,22.94],[110.82,23.37]],[[122.01,61.63],[122.01,61.14],[122.01,59.56],[122.01,59.84],[122.01,61.5],[122.01,61.39],[122.01,60.07],[122.01,60.29]],[[104.95,96.48],[106.28,97.15],[107.38,96.55],[107.68,97.05],[106.88,97.95],[105.58,96.85],[104.48,94.45],[104.18,94.45]],[[60.76,112.05],[60.76,113.15],[60.86,112.95],[60.76,113.55],[60.76,114.25],[60.76,112.65],[60.76,109.95],[60.76,109.75]],[[18.36,91.65],[17.06,92.45],[16.06,91.85],[15.76,92.35],[16.46,93.25],[17.66,92.05],[18.76,89.65],[19.09,89.68]]]};
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
