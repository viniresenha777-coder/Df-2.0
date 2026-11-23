"use strict";
// =====================================================================
//  Estética dos menus: o mesmo clima da tela inicial (vidro verde-escuro,
//  bordas douradas, neve caindo e pisca-pisca de Natal) e efeitos de
//  brilho nos implantes. Só desenho: nenhuma regra do jogo muda aqui.
// =====================================================================
const UI_GOLD = "#d4af37", UI_GOLD_LT = "#f3d77a", UI_INK = "#f2eedc";
function uiNow() { return (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000; }

// ---------- brilho redondo pronto (desenhar shadowBlur a cada quadro pesa) ----------
const UI_GLOW = {};
function uiGlowSprite(color) {
  if (UI_GLOW[color]) return UI_GLOW[color];
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, color); grd.addColorStop(0.25, color.replace(/,[\d.]+\)$/, ",0.55)"));
  grd.addColorStop(1, color.replace(/,[\d.]+\)$/, ",0)"));
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return (UI_GLOW[color] = c);
}
function uiGlow(x, y, r, color, a) {
  const s = uiGlowSprite(color);
  const old = ctx.globalAlpha; ctx.globalAlpha = old * (a == null ? 1 : a);
  ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = old;
}

// ---------- neve: flocos que caem devagar por cima do fundo do menu ----------
const UI_SNOW = [];
for (let i = 0; i < 90; i++) UI_SNOW.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.8, v: 0.018 + Math.random() * 0.04, s: Math.random() * 6.28 });
function uiSnow(x0, y0, w, h, alpha) {
  const t = uiNow();
  ctx.save();
  ctx.fillStyle = "#f4f5ed";
  for (const f of UI_SNOW) {
    const y = ((f.y + t * f.v) % 1) * h + y0;
    const x = ((f.x + Math.sin(t * 0.6 + f.s) * 0.012) % 1 + 1) % 1 * w + x0;
    ctx.globalAlpha = (alpha == null ? 0.55 : alpha) * (0.35 + f.r / 3);
    ctx.beginPath(); ctx.arc(x, y, f.r, 0, 6.2832); ctx.fill();
  }
  ctx.restore();
}

// ---------- pisca-pisca: fio em arco com lâmpadas coloridas que acendem em ondas ----------
const UI_BULBS = ["rgba(255,70,60,1)", "rgba(255,206,90,1)", "rgba(80,220,120,1)", "rgba(90,170,255,1)"];
function uiLights(x0, x1, y, sag, step) {
  const t = uiNow(), n = Math.max(2, Math.round((x1 - x0) / (step || 58)));
  const seg = (x1 - x0) / n;
  ctx.save();
  ctx.strokeStyle = "rgba(20,26,18,0.95)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y);
  for (let i = 0; i < n; i++) ctx.quadraticCurveTo(x0 + seg * (i + 0.5), y + sag, x0 + seg * (i + 1), y);
  ctx.stroke();
  for (let i = 0; i < n; i++) {
    for (const k of [0.3, 0.7]) {
      const bx = x0 + seg * (i + k), by = y + 2 * k * (1 - k) * sag + 3;
      const id = i * 2 + (k > 0.5 ? 1 : 0), col = UI_BULBS[id % UI_BULBS.length];
      const on = 0.55 + 0.45 * Math.sin(t * 2.2 - id * 0.9);       // onda que corre pelo fio
      ctx.fillStyle = "#2b2f25"; ctx.fillRect(bx - 2, by - 5, 4, 4);   // bocal
      ctx.globalCompositeOperation = "lighter";
      uiGlow(bx, by + 3, 15, col, 0.55 * on);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = col.replace(/,[\d.]+\)$/, `,${(0.55 + 0.45 * on).toFixed(2)})`);
      ctx.beginPath(); ctx.ellipse(bx, by + 3, 3.2, 4.6, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${(0.5 * on).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(bx - 1, by + 1.5, 1.1, 0, 6.2832); ctx.fill();
    }
  }
  ctx.restore();
}

// ---------- azevinho no canto (folhas e frutinhas) ----------
function uiHolly(x, y, flip) {
  ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
  const leaf = (a) => {
    ctx.save(); ctx.rotate(a);
    ctx.fillStyle = "#1f5a2c"; ctx.beginPath();
    ctx.moveTo(0, 0); ctx.quadraticCurveTo(9, -7, 22, -2); ctx.quadraticCurveTo(10, 5, 0, 0); ctx.fill();
    ctx.strokeStyle = "rgba(140,200,120,0.45)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(20, -2); ctx.stroke();
    ctx.restore();
  };
  leaf(0.15); leaf(1.2); leaf(0.7);
  for (const [bx, by] of [[3, 5], [8, 3], [5, 10]]) {
    ctx.fillStyle = "#b3202a"; ctx.beginPath(); ctx.arc(bx, by, 3.4, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "rgba(255,220,220,0.6)"; ctx.beginPath(); ctx.arc(bx - 1, by - 1, 1, 0, 6.2832); ctx.fill();
  }
  ctx.restore();
}

// ---------- painel de vidro (como os cartões da tela inicial) ----------
function uiPanel(x, y, w, h, r, glow) {
  ctx.save();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "rgba(16,24,18,0.94)"); g.addColorStop(1, "rgba(8,12,9,0.96)");
  ctx.fillStyle = g; rr(x, y, w, h, r); ctx.fill();
  if (glow) { ctx.shadowColor = "rgba(212,175,55,0.45)"; ctx.shadowBlur = 14; }
  ctx.strokeStyle = "rgba(212,175,55,0.55)"; ctx.lineWidth = 1.2; rr(x, y, w, h, r); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,240,200,0.06)"; ctx.lineWidth = 1; rr(x + 3, y + 3, w - 6, h - 6, Math.max(2, r - 3)); ctx.stroke();
  ctx.restore();
}

// ---------- moldura de tela cheia usada por todos os menus ----------
// fundo de tela cheia (vidro escuro, vinheta, neve, borda dourada e pisca-pisca), sem título
function uiBackdrop(alpha) {
  ctx.save();
  ctx.fillStyle = `rgba(6,9,7,${alpha == null ? 0.93 : alpha})`; ctx.fillRect(0, 0, W, H);
  // vinheta esverdeada com um calor dourado no topo
  const v = ctx.createRadialGradient(W / 2, H * 0.08, 20, W / 2, H * 0.5, Math.max(W, H) * 0.75);
  v.addColorStop(0, "rgba(120,96,30,0.16)"); v.addColorStop(0.45, "rgba(20,48,30,0.10)"); v.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  uiSnow(0, 0, W, H, 0.4);
  ctx.restore();
  // borda dourada com brilho suave
  ctx.save();
  ctx.shadowColor = "rgba(212,175,55,0.35)"; ctx.shadowBlur = 12;
  ctx.strokeStyle = "rgba(212,175,55,0.5)"; ctx.lineWidth = 1.2; rr(16, 12, W - 32, H - 24, 12); ctx.stroke();
  ctx.restore();
  uiLights(40, W - 40, 14, 13, 62);
  uiHolly(30, 22, false); uiHolly(W - 30, 22, true);
}
function uiFrame(title, sub) {
  uiBackdrop(0.93);
  // título com sombra e uma linha dourada que some nas pontas
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 6;
  txt(title, W / 2, 46, 28, "#f3ead0", "center", true); ctx.restore();
  const lw = Math.min(360, W * 0.4), lg = ctx.createLinearGradient(W / 2 - lw / 2, 0, W / 2 + lw / 2, 0);
  lg.addColorStop(0, "rgba(212,175,55,0)"); lg.addColorStop(0.5, "rgba(243,215,122,0.85)"); lg.addColorStop(1, "rgba(212,175,55,0)");
  ctx.fillStyle = lg; ctx.fillRect(W / 2 - lw / 2, 54, lw, 1.2);
  if (sub) txt(sub, W / 2, 72, 15, "#b9b296", "center");
}

// ---------- botão: dourado (principal) ou vidro, com brilho e reflexo ao passar o mouse ----------
function uiButton(x, y, w, h, label, hov, primary, disabled, fontSize) {
  ctx.save();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  if (disabled) { g.addColorStop(0, "rgba(40,42,36,0.85)"); g.addColorStop(1, "rgba(30,31,27,0.85)"); }
  else if (primary) { g.addColorStop(0, hov ? "#8a7130" : "#6e5a26"); g.addColorStop(1, hov ? "#5a4a1f" : "#463a19"); }
  else { g.addColorStop(0, hov ? "#2c3a2e" : "#1c241d"); g.addColorStop(1, hov ? "#1e2a20" : "#141a15"); }
  if (hov && !disabled) { ctx.shadowColor = primary ? "rgba(243,215,122,0.55)" : "rgba(212,175,55,0.35)"; ctx.shadowBlur = 14; }
  ctx.fillStyle = g; rr(x, y, w, h, 7); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = disabled ? "#3d3b30" : primary ? (hov ? UI_GOLD_LT : UI_GOLD) : hov ? "rgba(212,175,55,0.8)" : "rgba(212,175,55,0.38)";
  ctx.lineWidth = 1.4; rr(x, y, w, h, 7); ctx.stroke();
  // reflexo que atravessa o botão enquanto o mouse está em cima
  if (hov && !disabled) {
    ctx.save(); rr(x, y, w, h, 7); ctx.clip();
    const p = (uiNow() * 0.9) % 1.6 - 0.3, sx = x + p * w;
    const s = ctx.createLinearGradient(sx - 30, 0, sx + 30, 0);
    s.addColorStop(0, "rgba(255,255,255,0)"); s.addColorStop(0.5, "rgba(255,248,220,0.16)"); s.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = s; ctx.fillRect(x, y, w, h); ctx.restore();
  }
  ctx.fillStyle = "rgba(255,255,255,0.06)"; rr(x + 2, y + 2, w - 4, h / 2 - 2, 5); ctx.fill();
  ctx.restore();
  const fs = fontSize || 15;
  txt(label, x + w / 2, y + h / 2 + fs / 3, fs, disabled ? "#6d6a58" : primary ? "#fff6d8" : UI_INK, "center", true);
}

// ---------- linha de lista ----------
function uiRow(x, y, w, h, sel, accent) {
  ctx.save();
  const g = ctx.createLinearGradient(x, y, x + w, y);
  if (sel) { g.addColorStop(0, "rgba(70,60,24,0.95)"); g.addColorStop(1, "rgba(32,34,24,0.95)"); }
  else { g.addColorStop(0, "rgba(24,30,24,0.92)"); g.addColorStop(1, "rgba(18,21,17,0.92)"); }
  if (sel) { ctx.shadowColor = "rgba(243,215,122,0.35)"; ctx.shadowBlur = 10; }
  ctx.fillStyle = g; rr(x, y, w, h, 6); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = sel ? "#ffd96a" : accent || "rgba(212,175,55,0.22)"; ctx.lineWidth = sel ? 2 : 1; rr(x, y, w, h, 6); ctx.stroke();
  if (sel) { ctx.fillStyle = UI_GOLD_LT; rr(x + 3, y + 5, 3, h - 10, 1.5); ctx.fill(); }   // marcador lateral
  ctx.restore();
}

// ---------- implantes: as partes que brilham no ícone pulsam e soltam faíscas ----------
// Do atlas, separa o que já é claro e colorido (luzes, frascos, telas) num mapa de brilho por implante.
const IMP_FX = {};
function implantFx(src, sx, sy, tile) {
  const key = sx + "," + sy;
  if (IMP_FX[key] !== undefined) return IMP_FX[key];
  IMP_FX[key] = null;
  try {
    const c = document.createElement("canvas"); c.width = c.height = tile;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(src, sx, sy, tile, tile, 0, 0, tile, tile);
    const img = g.getImageData(0, 0, tile, tile), d = img.data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
      const bright = mx > 150 && (mx - mn > 60 || mx > 225) && d[i + 3] > 40;
      if (bright) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; d[i + 3] = Math.min(255, d[i + 3] * 0.9); }
      else d[i + 3] = 0;
    }
    g.putImageData(img, 0, 0);
    const col = n ? `rgba(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)},1)` : "rgba(243,215,122,1)";
    IMP_FX[key] = { c, col, n };
  } catch (e) { /* aberto direto do disco: fica sem efeito */ }
  return IMP_FX[key];
}
function drawImplantFx(src, sx, sy, tile, cx, cy, size, seed) {
  const fx = implantFx(src, sx, sy, tile);
  if (!fx || fx.n < 20) return;
  const t = uiNow() + (seed || 0) * 0.37, pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
  const col = fx.col, soft = col.replace(/,1\)$/, ",0.6)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  uiGlow(cx, cy, size * 0.7, soft, 0.35 + 0.3 * pulse);          // aura que respira
  ctx.globalAlpha = 0.55 + 0.45 * pulse;                          // as partes claras do implante acendem
  ctx.drawImage(fx.c, cx - size / 2, cy - size / 2, size, size);
  ctx.globalAlpha = 0.25 + 0.25 * pulse;
  ctx.drawImage(fx.c, cx - size * 0.54, cy - size * 0.54, size * 1.08, size * 1.08);
  // anel fino que gira em volta
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = soft; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.5, t * 1.4, t * 1.4 + 1.4); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.5, t * 1.4 + 3.14, t * 1.4 + 4.54); ctx.stroke();
  // faíscas que sobem e somem
  for (let i = 0; i < 6; i++) {
    const ph = (t * 0.45 + i / 6) % 1, ang = i * 2.4 + (seed || 0);
    const px = cx + Math.cos(ang) * size * 0.34 * (0.6 + ph * 0.5), py = cy + size * 0.28 - ph * size * 0.75;
    ctx.globalAlpha = Math.sin(ph * Math.PI);
    uiGlow(px, py, 3 + size * 0.05, col, 1);
  }
  ctx.restore();
}

// ---------- espaço de item (inventário, mochila, baú) ----------
function uiCell(x, y, w, h, sel, hov, drop) {
  ctx.save();
  const g = ctx.createRadialGradient(x + w / 2, y + h * 0.35, 2, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, sel ? "rgba(70,62,30,0.95)" : hov ? "rgba(40,48,36,0.95)" : "rgba(28,33,26,0.95)");
  g.addColorStop(1, sel ? "rgba(36,33,20,0.95)" : "rgba(14,17,13,0.95)");
  if (sel || drop) { ctx.shadowColor = drop ? "rgba(111,208,106,0.6)" : "rgba(243,215,122,0.45)"; ctx.shadowBlur = 10; }
  ctx.fillStyle = g; rr(x, y, w, h, 6); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = drop ? "#6fd06a" : sel ? "#ffd96a" : hov ? "rgba(212,175,55,0.75)" : "rgba(212,175,55,0.22)";
  ctx.lineWidth = drop || sel ? 2 : 1; rr(x, y, w, h, 6); ctx.stroke();
  ctx.restore();
}
