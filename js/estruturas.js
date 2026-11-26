"use strict";
// =====================================================================
//  Estruturas grandes em 3D (base militar do Refúgio, bunkers...).
//  O modelo foi renderizado na projeção do jogo (chão visto de cima, altura
//  subindo na tela) e fatiado em: chão (desenhado embaixo de tudo) e faixas
//  de profundidade (ordenadas junto com o jogador, como os prédios). Assim dá
//  para andar entre as partes. A colisão vem do mapa de altura do modelo.
//  Dados em estruturas_data.js; imagens em img/estruturas/<id>.webp.
// =====================================================================
const ESTRUT_IMG = {};
function estrutOk(id) { return typeof ESTRUT_DATA !== "undefined" && !!ESTRUT_DATA[id]; }
function estrutImg(id) {
  let im = ESTRUT_IMG[id];
  if (!im) { im = ESTRUT_IMG[id] = new Image(); im.onerror = () => { im.bad = true; }; im.src = `img/estruturas/${id}.webp?v=2`; }
  return im.complete && !im.bad && im.naturalWidth ? im : null;
}
// coloca a estrutura com a borda norte em y0 e o centro em gx; k = px do mundo por metro
function addEstrutura(wd, id, gx, y0, k, opts = {}) {
  const d = ESTRUT_DATA[id], s = k / d.ppm;
  const x0 = gx - d.fw * k / 2, gy = y0 + d.fd * k / 2;
  const ox = gx - d.cx * s, oy = gy - d.cy * s;
  const e = { id, x: x0, y: y0, w: d.fw * k, h: d.fd * k, k, floor: [], parts: [] };
  for (const p of d.pieces) {
    const it = { a: p.a, x: ox + p.d[0] * s, y: oy + p.d[1] * s, w: p.a[2] * s, h: p.a[3] * s, sy: y0 + p.sy * k };
    (p.k === "floor" ? e.floor : e.parts).push(it);
  }
  for (const [rx, ry, rw, rh] of d.solids) {
    const r = { x: x0 + rx * k, y: y0 + ry * k, w: rw * k, h: rh * k, kind: "estrutura" };
    if (opts.skip && opts.skip(r)) continue;
    solid(wd, r, false);
  }
  (wd.estruturas || (wd.estruturas = [])).push(e);
  return e;
}
function drawEstrutPiece(im, p) { ctx.drawImage(im, p.a[0], p.a[1], p.a[2], p.a[3], p.x, p.y, p.w, p.h); }
// chão das estruturas: junto com a rua, antes de tudo que fica em pé
function drawEstruturasChao() {
  for (const e of world.estruturas || []) {
    const im = estrutImg(e.id);
    if (!im) continue;
    for (const p of e.floor) if (inView(p.x, p.y, p.w, p.h, 20)) drawEstrutPiece(im, p);
  }
}
// partes em pé entram na lista ordenada pela profundidade (drawSortedScene)
function estruturasNaCena(list) {
  for (const e of world.estruturas || []) {
    const im = estrutImg(e.id);
    if (!im) continue;
    for (const p of e.parts) if (inView(p.x, p.y, p.w, p.h, 20)) list.push({ y: p.sy, f: () => drawEstrutPiece(im, p) });
  }
}
