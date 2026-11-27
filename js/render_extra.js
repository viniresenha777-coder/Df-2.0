"use strict";
// =====================================================================
//  Desenhos extras: 8 chefes, demônio, detalhes dos zumbis especiais,
//  corpos na rua, carros explosivos, poças/nuvens, fumaça e o painel
//  de bônus ativos na lateral esquerda.
// =====================================================================

// Atlas 8 direções x 8 quadros, renderizado a partir dos GLBs rigados.
// A cena continua 2D, portanto não exige renderizar 50 MB de GLB em tempo real.
const CHRISTMAS_BOSS_SPRITES = {};
const christmasGaits = {};
const christmasStride = new WeakMap();
for (const kind of ["santa", "alce"]) {
  const image = new Image();
  image.src = "img/boss_natal_" + kind + "_atlas." + (kind === "alce" ? "webp" : "png") + "?v=20261123-eventboss02";
  CHRISTMAS_BOSS_SPRITES[kind] = image;
  const gait = new Image();
  gait.src = "img/" + kind + "-gait.webp";
  christmasGaits[kind] = gait;
}
function drawChristmasBoss(z, kind) {
  let img = CHRISTMAS_BOSS_SPRITES[kind];
  const rad = z.r, size = kind === "santa" ? rad * 4.0 : rad * 4.25;
  // Golpes e movimento desenhados em quadros diferentes.
  const attacking = z.abilT > 0;
  let stride = christmasStride.get(z);
  if (!stride) {
    stride = { x: z.x, y: z.y, phase: 0 };
    christmasStride.set(z, stride);
  }
  const distance = Math.hypot(z.x - stride.x, z.y - stride.y);
  stride.x = z.x; stride.y = z.y;
  const moving = !attacking && distance > .015 && distance < size;
  if (moving) stride.phase = (stride.phase + distance / (size * .32)) % 1;
  const gait = christmasGaits[kind];
  const useGait = moving && gait.complete && gait.naturalWidth === 1920;
  if (useGait) img = gait;
  const frame = attacking ? 5 + Math.min(2, Math.max(0, Math.floor((1 - z.abilT / (kind === "santa" ? 670 : 510)) * 3)))
    : useGait ? Math.floor(stride.phase * 8) : 0;
  const facing = ((Math.round(-z.angle * 4 / Math.PI) % 8) + 8) % 8;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.40)";
  ellipse(z.x + 4, z.y + 9, size * .38, size * .15);
  // Anel natalino discreto distingue o evento dos inimigos normais.
  const glow = ctx.createRadialGradient(z.x, z.y, rad * .3, z.x, z.y, rad * 2.0);
  glow.addColorStop(0, kind === "santa" ? "rgba(212,38,28,.30)" : "rgba(114,173,65,.25)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow; circle(z.x,z.y,rad*2);
  if (img && img.complete && img.naturalWidth >= 1920) {
    const sx = frame * 240, sy = facing * 240;
    const dx = z.x - size / 2, dy = z.y - size * .63;
    if (kind === "alce" && attacking) {
      // Cabeçada de girafa: pescoço arma o golpe, cabeça baixa
      // rapidamente e retorna. A base do corpo permanece estável.
      const phase = Math.max(0, Math.min(1, 1 - z.abilT / 510));
      const strike = Math.sin(Math.PI * phase);
      const split = 118, overlap = 14, scale = size / 240;
      ctx.drawImage(img, sx, sy + split - overlap, 240, 240 - split + overlap,
        dx, dy + (split - overlap) * scale, size, (240 - split + overlap) * scale);
      ctx.save();
      ctx.translate(dx + size * .5, dy + split * scale);
      ctx.rotate(.27 * strike);
      ctx.translate(0, 18 * strike * scale);
      ctx.drawImage(img, sx, sy, 240, split + overlap,
        -size * .5, -(split + overlap) * scale, size, (split + overlap) * scale);
      ctx.restore();
    } else {
      const bob = !attacking && moving ? Math.sin(stride.phase * Math.PI * 4) * size * .009 : 0;
      ctx.drawImage(img, sx, sy, 240, 240, dx, dy + bob, size, size);
    }
  } else {
    ctx.fillStyle = kind === "santa" ? "#ac2729" : "#526244";
    ellipse(z.x, z.y, rad, rad * .75);
    ctx.fillStyle = "#f1eee0"; circle(z.x + rad * .40, z.y - rad * .4, rad * .3);
  }
  // Golpe do pirulito: anima a arma no braço do Papai Noel.
  // O atlas preserva a aparência 3D, enquanto o pirulito destaca o golpe.
  if (kind === "santa" && attacking) {
    const phase = Math.max(0, Math.min(1, 1 - z.abilT / 670));
    ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(z.angle);
    ctx.translate(rad * .2, rad * .1);
    ctx.rotate(-1.15 + phase * 2.3);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const len = rad * 1.15, thick = Math.max(5, rad * .17);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0);
    ctx.quadraticCurveTo(len + rad * .22, -rad * .36, len - rad * .06, -rad * .45);
    ctx.strokeStyle = "#f8e8d9"; ctx.lineWidth = thick + 3; ctx.stroke();
    ctx.strokeStyle = "#d32834"; ctx.lineWidth = thick * .62; ctx.setLineDash([thick * 1.9, thick * 1.15]); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }
  if (z.flash > 0) { ctx.globalAlpha = .28; ctx.fillStyle = "#fff"; circle(z.x,z.y,rad); }
  ctx.restore();
  if (z.hp < z.maxHp) {
    ctx.fillStyle = "#130b0b"; ctx.fillRect(z.x - rad, z.y - rad - 19, 2*rad, 5);
    ctx.fillStyle = "#e24737"; ctx.fillRect(z.x - rad, z.y - rad - 19, 2*rad*Math.max(0,z.hp/z.maxHp), 5);
  }
}

// ---------- Chefes (vistos de cima, apontando para +x) ----------
const reaperSheets = {};
function drawReaperFrame(x, y, angle, action, frame) {
  let sheet = reaperSheets[action];
  if (!sheet) {
    sheet = reaperSheets[action] = new Image();
    sheet.src = "img/ceifador_" + action + ".webp";
  }
  if (!sheet.complete || !sheet.naturalWidth) return false;
  const row = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
  const size = 336;
  ctx.drawImage(sheet, frame * 256, row * 256, 256, 256,
    x - size / 2, y - size * 0.54, size, size);
  return true;
}
function drawReaper(z) {
  const attacking = z.abilT > 0;
  const frame = attacking ? Math.min(11, Math.floor((1 - z.abilT / REAPER_SWING_MS) * 12))
    : Math.floor(z.anim * 0.6) % 6;
  if (!drawReaperFrame(z.x, z.y, z.angle, attacking ? "attack" : "walk", Math.max(0, frame))) return false;
  drawZombieFx(z);
  txt(z.bossName || "O Ceifador", z.x, z.y - 83, 12, "#ffb070", "center", true);
  if (z.hp < z.maxHp) {
    ctx.fillStyle = "#241813"; ctx.fillRect(z.x - 28, z.y - 78, 56, 5);
    ctx.fillStyle = "#c0392b"; ctx.fillRect(z.x - 28, z.y - 78, 56 * z.hp / z.maxHp, 5);
  }
  return true;
}
function drawBoss(z) {
  if (z.bossId === "ceifador" && drawReaper(z)) return;
  if (z.bossId === "santa_natal") { drawChristmasBoss(z, "santa"); return; }
  const B = BOSSES[z.bossId] || BOSSES.acougueiro, s = z.r / 28, t = game.time, sway = Math.sin(z.anim) * 4 * s;
  ctx.globalAlpha = 1;
  const aura = { acougueiro: "200,40,30", matriarca: "200,120,60", capataz: "160,170,190", pestilento: "120,200,60", carrasco: "220,60,30",
    necromante: "80,255,120", alfa: "220,60,40", ceifador: "150,140,200" }[z.bossId] || "200,40,30";
  const g = ctx.createRadialGradient(z.x, z.y, z.r * 0.4, z.x, z.y, z.r * 2.4);
  g.addColorStop(0, `rgba(${aura},0.35)`); g.addColorStop(1, `rgba(${aura},0)`);
  ctx.fillStyle = g; circle(z.x, z.y, z.r * 2.4);
  ctx.fillStyle = "rgba(0,0,0,0.4)"; ellipse(z.x + 6, z.y + 8, z.r * 1.15, z.r * 0.9);
  ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(z.angle);
  const sk = B.skin, cl = B.cloth, dk = shade(sk, -0.35);
  switch (z.bossId) {
    case "acougueiro": {
      ctx.fillStyle = dk; ellipse(sway - 6 * s, -12 * s, 9 * s, 7 * s); ellipse(-sway - 6 * s, 12 * s, 9 * s, 7 * s);
      ctx.strokeStyle = sk; ctx.lineWidth = 11 * s; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(0, -20 * s); ctx.lineTo(18 * s, -24 * s); ctx.moveTo(0, 20 * s); ctx.lineTo(20 * s + sway, 22 * s); ctx.stroke();
      // cutelo
      ctx.save(); ctx.translate(22 * s + sway, 24 * s); ctx.rotate(z.abilT > 0 ? -1.2 + (1 - z.abilT / 450) * 2.4 : 0.3);
      ctx.fillStyle = "#4a3220"; ctx.fillRect(0, -3 * s, 12 * s, 6 * s);
      ctx.fillStyle = "#b8bcc0"; ctx.fillRect(12 * s, -9 * s, 26 * s, 18 * s); ctx.fillStyle = "rgba(140,10,10,0.7)"; ctx.fillRect(28 * s, -9 * s, 10 * s, 12 * s);
      ctx.restore();
      ctx.fillStyle = sk; ellipse(0, 0, 22 * s, 26 * s);
      ctx.fillStyle = cl; ellipse(4 * s, 0, 15 * s, 20 * s);
      ctx.fillStyle = "rgba(140,10,10,0.6)"; circle(8 * s, 6 * s, 5 * s); circle(2 * s, -8 * s, 3 * s);
      ctx.fillStyle = shade(sk, 0.1); circle(6 * s, 0, 10 * s);
      ctx.fillStyle = "#ff3b2f"; circle(13 * s, -3 * s, 1.8 * s); circle(13 * s, 3 * s, 1.8 * s);
      break;
    }
    case "matriarca": {
      ctx.fillStyle = dk; ellipse(-6 * s, -18 * s, 8 * s, 6 * s); ellipse(-6 * s, 18 * s, 8 * s, 6 * s);
      ctx.fillStyle = sk; circle(0, 0, 28 * s);
      ctx.fillStyle = cl; ellipse(-8 * s, 0, 14 * s, 24 * s);
      for (let i = 0; i < 9; i++) {
        const a = i * 0.7, rr0 = 16 * s + (i % 3) * 4 * s, pul = 1 + 0.2 * Math.sin(t / 220 + i);
        ctx.fillStyle = i % 2 ? "rgba(200,200,90,0.85)" : "rgba(170,210,80,0.8)"; circle(Math.cos(a) * rr0, Math.sin(a) * rr0, (3 + (i % 3)) * s * pul);
      }
      ctx.fillStyle = shade(sk, 0.15); circle(22 * s, 0, 8 * s);
      ctx.fillStyle = "#ff3b2f"; circle(27 * s, -3 * s, 1.6 * s); circle(27 * s, 3 * s, 1.6 * s);
      break;
    }
    case "capataz": {
      ctx.fillStyle = "#1a1c20"; ellipse(sway - 6 * s, -11 * s, 8 * s, 6 * s); ellipse(-sway - 6 * s, 11 * s, 8 * s, 6 * s);
      ctx.fillStyle = "#3a3e44"; rr(-16 * s, -24 * s, 30 * s, 48 * s, 6 * s); ctx.fill();
      ctx.fillStyle = "#5a6068"; rr(-12 * s, -28 * s, 16 * s, 12 * s, 3 * s); ctx.fill(); rr(-12 * s, 16 * s, 16 * s, 12 * s, 3 * s); ctx.fill();
      // placa frontal (lado blindado)
      ctx.strokeStyle = "#8a9098"; ctx.lineWidth = 6 * s; ctx.beginPath(); ctx.arc(2 * s, 0, 22 * s, -0.9, 0.9); ctx.stroke();
      ctx.fillStyle = "#c9a23a"; for (const [x, y] of [[-10, -18], [-10, 18], [8, -14], [8, 14]]) circle(x * s, y * s, 1.8 * s);
      ctx.fillStyle = "#2a2c30"; circle(4 * s, 0, 10 * s);
      ctx.fillStyle = "#6a7078"; ctx.fillRect(8 * s, -6 * s, 4 * s, 12 * s);
      ctx.fillStyle = "#ff3b2f"; ctx.fillRect(9 * s, -4 * s, 2 * s, 2 * s); ctx.fillRect(9 * s, 2 * s, 2 * s, 2 * s);
      break;
    }
    case "pestilento": {
      ctx.strokeStyle = `rgba(120,220,70,${0.3 + 0.2 * Math.sin(t / 200)})`; ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.arc(0, 0, 34 * s + Math.sin(t / 300) * 4, 0, 6.283); ctx.stroke();
      ctx.fillStyle = dk; ellipse(sway - 6 * s, -12 * s, 8 * s, 6 * s); ellipse(-sway - 6 * s, 12 * s, 8 * s, 6 * s);
      ctx.strokeStyle = sk; ctx.lineWidth = 8 * s; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(0, -16 * s); ctx.lineTo(20 * s + sway, -20 * s); ctx.moveTo(0, 16 * s); ctx.lineTo(20 * s - sway, 20 * s); ctx.stroke();
      ctx.fillStyle = sk; ellipse(-2 * s, 0, 20 * s, 24 * s);
      ctx.fillStyle = "#5a1a12"; for (let i = 0; i < 5; i++) poly([[-12 * s, (i * 9 - 20) * s], [-26 * s, (i * 9 - 17) * s], [-12 * s, (i * 9 - 14) * s]], "#5a1a12");
      ctx.fillStyle = "rgba(140,220,70,0.7)"; for (let i = 0; i < 6; i++) circle(Math.cos(i * 1.3) * 10 * s, Math.sin(i * 2.1) * 14 * s, 3 * s);
      ctx.fillStyle = shade(sk, 0.1); circle(10 * s, 0, 9 * s);
      ctx.fillStyle = "#a6e05a"; circle(15 * s, -3 * s, 2 * s); circle(15 * s, 3 * s, 2 * s);
      break;
    }
    case "carrasco": {
      ctx.fillStyle = "#1a1a1a"; ellipse(sway - 6 * s, -11 * s, 8 * s, 6 * s); ellipse(-sway - 6 * s, 11 * s, 8 * s, 6 * s);
      ctx.strokeStyle = sk; ctx.lineWidth = 10 * s; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(0, -20 * s); ctx.lineTo(16 * s, -22 * s); ctx.moveTo(0, 20 * s); ctx.lineTo(18 * s, 22 * s); ctx.stroke();
      // serra gigante
      ctx.save(); ctx.translate(30 * s, 22 * s); ctx.rotate(z.abilT > 0 ? t / 30 : t / 400);
      ctx.fillStyle = "#9aa0a6"; circle(0, 0, 14 * s);
      ctx.fillStyle = "#5a5f64"; for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; poly([[Math.cos(a) * 13 * s, Math.sin(a) * 13 * s], [Math.cos(a + 0.2) * 18 * s, Math.sin(a + 0.2) * 18 * s], [Math.cos(a + 0.4) * 13 * s, Math.sin(a + 0.4) * 13 * s]], "#5a5f64"); }
      ctx.fillStyle = "rgba(140,10,10,0.7)"; circle(4 * s, 4 * s, 5 * s); ctx.fillStyle = "#2a2a2a"; circle(0, 0, 4 * s);
      ctx.restore();
      ctx.fillStyle = sk; ellipse(0, 0, 18 * s, 25 * s);
      ctx.fillStyle = "#3a2a1a"; ctx.fillRect(-4 * s, -24 * s, 6 * s, 48 * s);
      ctx.fillStyle = "#121212"; poly([[-6 * s, -10 * s], [18 * s, 0], [-6 * s, 10 * s]], "#121212"); circle(4 * s, 0, 10 * s);
      ctx.fillStyle = "#ff3b2f"; circle(10 * s, -3 * s, 1.6 * s); circle(10 * s, 3 * s, 1.6 * s);
      break;
    }
    case "necromante": {
      for (let i = 0; i < 6; i++) { const a = t / 600 + i * 1.05; ctx.fillStyle = "rgba(90,255,120,0.5)"; circle(Math.cos(a) * 30 * s, Math.sin(a) * 30 * s, 2.5 * s); }
      ctx.fillStyle = cl; circle(0, 0, 22 * s);
      ctx.fillStyle = shade(cl, 0.15); ellipse(-6 * s, 0, 12 * s, 20 * s);
      ctx.shadowColor = "#5aff7a"; ctx.shadowBlur = 16;
      ctx.fillStyle = "#7aff8a"; circle(18 * s, -16 * s, 5 * s * (1 + 0.15 * Math.sin(t / 150))); circle(18 * s, 16 * s, 5 * s * (1 + 0.15 * Math.cos(t / 150)));
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#0e140e"; circle(6 * s, 0, 11 * s);
      ctx.fillStyle = "#7aff8a"; circle(12 * s, -3 * s, 1.8 * s); circle(12 * s, 3 * s, 1.8 * s);
      break;
    }
    case "alfa": {
      const leg = Math.sin(z.anim * 2) * 7 * s;
      ctx.fillStyle = dk;
      ellipse(14 * s + leg, -11 * s, 5 * s, 3.5 * s); ellipse(14 * s - leg, 11 * s, 5 * s, 3.5 * s); ellipse(-16 * s - leg, -10 * s, 5 * s, 3.5 * s); ellipse(-16 * s + leg, 10 * s, 5 * s, 3.5 * s);
      ctx.fillStyle = sk; ellipse(0, 0, 26 * s, 13 * s);
      ctx.fillStyle = "#2a1a14"; for (let i = 0; i < 7; i++) poly([[(i * 6 - 18) * s, -6 * s], [(i * 6 - 15) * s, -14 * s], [(i * 6 - 12) * s, -6 * s]], "#2a1a14");
      ctx.fillStyle = shade(sk, 0.08); ellipse(26 * s, 0, 11 * s, 9 * s); ellipse(36 * s, 0, 7 * s, 5 * s);
      ctx.fillStyle = "#e8dcc8"; poly([[40 * s, -3 * s], [44 * s, -1 * s], [40 * s, 0]], "#e8dcc8"); poly([[40 * s, 3 * s], [44 * s, 1 * s], [40 * s, 0]], "#e8dcc8");
      ctx.fillStyle = "#ff3b2f"; circle(30 * s, -4 * s, 2 * s); circle(30 * s, 4 * s, 2 * s);
      break;
    }
    default: { // ceifador
      ctx.fillStyle = "rgba(10,10,14,0.85)";
      for (let i = 0; i < 6; i++) poly([[-10 * s, (i * 8 - 22) * s], [-30 * s - Math.sin(t / 200 + i) * 5, (i * 8 - 18) * s], [-10 * s, (i * 8 - 14) * s]], "rgba(10,10,14,0.85)");
      ctx.fillStyle = cl; ellipse(-2 * s, 0, 18 * s, 22 * s);
      // foice
      ctx.strokeStyle = "#4a3a2a"; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(-6 * s, 20 * s); ctx.lineTo(34 * s, 18 * s); ctx.stroke();
      ctx.strokeStyle = "#c8ccd2"; ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.arc(30 * s, -2 * s, 20 * s, 0.4, 1.9); ctx.stroke();
      ctx.fillStyle = "#e8e4da"; circle(6 * s, 0, 8 * s);
      ctx.fillStyle = "#1a1a1a"; circle(9 * s, -3 * s, 2 * s); circle(9 * s, 3 * s, 2 * s);
      ctx.fillStyle = "#b8a8ff"; circle(9 * s, -3 * s, 0.9 * s); circle(9 * s, 3 * s, 0.9 * s);
    }
  }
  if (z.flash > 0) { ctx.globalAlpha = 0.5; ctx.fillStyle = "#fff"; circle(0, 0, z.r); }
  ctx.restore();
  ctx.globalAlpha = 1;
  drawZombieFx(z);
  if (z.alertT > 0) txt("!", z.x, z.y - z.r - 10, 22, "#e03a2f", "center", true);
  txt(z.bossName || "", z.x, z.y - z.r - 14, 12, "#ffb070", "center", true);
}

// ---------- Demônio ----------
function drawDemon(z) {
  const s = z.r / 17, sway = Math.sin(z.anim) * 5 * s;
  ctx.fillStyle = "rgba(0,0,0,0.38)"; ellipse(z.x + 4, z.y + 6, z.r * 1.1, z.r * 0.85);
  ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(z.angle);
  const sk = z.skin, dk = shade(sk, -0.4);
  ctx.fillStyle = dk; ellipse(sway - 4 * s, -8 * s, 6 * s, 4 * s); ellipse(-sway - 4 * s, 8 * s, 6 * s, 4 * s);
  ctx.strokeStyle = sk; ctx.lineWidth = 5 * s; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(0, -12 * s); ctx.lineTo(18 * s + sway, -14 * s); ctx.moveTo(0, 12 * s); ctx.lineTo(18 * s - sway, 14 * s); ctx.stroke();
  ctx.fillStyle = "#e8dcc8"; for (const yy of [-14, 14]) for (let c = -1; c <= 1; c++) poly([[19 * s, (yy + c * 2) * s], [25 * s, (yy + c * 3) * s], [19 * s, (yy + c * 2 + 1.5) * s]], "#e8dcc8");
  ctx.fillStyle = sk; ellipse(0, 0, 11 * s, 16 * s);
  ctx.fillStyle = dk; ctx.fillRect(-6 * s, -12 * s, 2 * s, 24 * s);
  ctx.fillStyle = shade(sk, 0.1); circle(6 * s, 0, 8 * s);
  ctx.fillStyle = "#2a1a14"; poly([[2 * s, -7 * s], [-6 * s, -14 * s], [5 * s, -10 * s]], "#2a1a14"); poly([[2 * s, 7 * s], [-6 * s, 14 * s], [5 * s, 10 * s]], "#2a1a14");
  ctx.shadowColor = "#ffb030"; ctx.shadowBlur = 8; ctx.fillStyle = "#ffcf40"; circle(11 * s, -3 * s, 1.8 * s); circle(11 * s, 3 * s, 1.8 * s); ctx.shadowBlur = 0;
  if (z.flash > 0) { ctx.globalAlpha = 0.55; ctx.fillStyle = "#fff"; ellipse(0, 0, 11 * s, 16 * s); ctx.globalAlpha = 1; }
  ctx.restore();
}
// detalhes por cima dos zumbis humanos especiais
function drawZombieExtra(z) {
  if (z.hp <= 0 || z.boss) return;
  // A máscara do hazmat já faz parte do sprite; não sobrepor o desenho antigo.
  if (z.type === "toxic") {
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(110,220,60,${0.18 + 0.08 * Math.sin(game.time / 200 + z.x)})`; circle(z.x, z.y, z.r * 1.8);
    ctx.globalCompositeOperation = "source-over";
  } else if (z.type === "infected") {
    ctx.fillStyle = "rgba(140,10,10,0.75)"; circle(z.x + Math.cos(z.angle) * 5, z.y + Math.sin(z.angle) * 5, 2.5);
  }
}

// ---------- Cadáveres infectados nas ruas ----------
// Os 4 sprites vieram do ZIP do criador, removidos os fundos quadrados.
// A variante depende da posição e da semente da área: nunca muda no reload.
const DEAD_ZOMBIES_IMG = new Image();
DEAD_ZOMBIES_IMG.src = "img/zombies_dead_4.webp?v=20261116-four-corpses1";
function deadZombieVariant(o) {
  const cx = Math.floor(o.x + o.w / 2), cy = Math.floor(o.y + o.h / 2);
  const seed = world && world.cell ? world.cell.seed >>> 0 : 0;
  const h = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ seed) >>> 0;
  return h % 4;
}
function drawBody(o) {
  const x = o.x + o.w / 2, y = o.y + o.h / 2;
  const active = lootSpotActive(o);
  if (DEAD_ZOMBIES_IMG.complete && DEAD_ZOMBIES_IMG.naturalWidth) {
    ctx.save();
    if (active) {
      // Sinal discreto de saque: brilho ATRÁS, sem amarelar nem ocultar o corpo.
      const glow = ctx.createRadialGradient(x, y, 4, x, y, 42);
      glow.addColorStop(0, "rgba(255,219,110,0.28)");
      glow.addColorStop(0.6, "rgba(255,199,84,0.12)");
      glow.addColorStop(1, "rgba(255,195,66,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, 42, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = "rgba(255,221,122,0.62)";
      ctx.shadowBlur = 8;
    }
    const v = deadZombieVariant(o), tile = 256, size = 72;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.filter = active ? "brightness(1.24) contrast(1.08)" : "brightness(1.17) contrast(1.06)";
    ctx.drawImage(DEAD_ZOMBIES_IMG, (v % 2) * tile, Math.floor(v / 2) * tile, tile, tile,
      x - size / 2, y - size / 2, size, size);
    ctx.restore();
  } else {
    // Fallback enquanto a imagem é carregada (não deixa corpos invisíveis).
    ctx.save(); ctx.translate(x, y); ctx.rotate(o.ang || 0);
    ctx.fillStyle = "rgba(80,6,6,0.45)"; ellipse(3, 2, 20, 13);
    ctx.fillStyle = o.pants || "#454039"; ctx.fillRect(-16, -5, 10, 4); ctx.fillRect(-16, 1, 10, 4);
    ctx.strokeStyle = o.skin || "#8d826a"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(6, -15); ctx.moveTo(0, 6); ctx.lineTo(10, 10); ctx.stroke();
    ctx.fillStyle = o.cloth || "#40483c"; ellipse(0, 0, 8, 7);
    if (o.bag) { ctx.fillStyle = "#5a4a32"; ctx.fillRect(-6, -9, 7, 5); }
    ctx.fillStyle = o.skin || "#8d826a"; circle(10, 0, 4.5);
    ctx.restore();
  }
  // Sem saque real não aparece ? nem luz amarela.
  if (active) drawLootQuestion(o, x, y - 30);
}

// ---------- Carros explosivos ----------
function carUnder(c) {
  if (!c.explosive || c.burnt) return;
  // Marca discreta de óleo no chão. A mancha roxa deslocada da versão
  // anterior fazia carros abandonados parecerem suspensos.
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  ctx.fillStyle = "rgba(16,18,16,0.18)";
  ellipse(cx + 1, cy + 1, c.w * 0.28, c.h * 0.28);
}
function carOver(c) {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  if (c.explosive && !c.burnt) {
    ctx.fillStyle = "#c0392b"; circle(c.x + c.w - 6, c.y + c.h / 2, 3);
    if (Math.random() < 0.02) game.parts.push({ x: c.x + c.w / 2, y: c.y + 6, vx: rand(-0.3, 0.3), vy: -rand(0.3, 0.8), life: 500, max: 500, color: "#ffd96a", size: 1.5, fr: 0.95 });
  }
  if (c.fuse > 0) {
    const p = 0.5 + 0.5 * Math.sin(game.time / 60);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255,${120 + 80 * p},40,0.55)`; circle(cx, cy, 18 + 6 * p);
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `rgba(255,60,40,${p})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 150 * (1 - c.fuse / 2000), 0, 6.283); ctx.stroke();
  }
  if (c.burnt && Math.random() < 0.05) game.parts.push({ x: cx + rand(-10, 10), y: cy + rand(-10, 10), vx: rand(-0.2, 0.2), vy: -rand(0.4, 1), life: 900, max: 900, color: "rgba(60,60,60,0.6)", size: rand(3, 6), fr: 0.97 });
}

// ---------- Poças, nuvens de gás, fogo e fumaça ----------
function drawHazards() {
  for (const h of game.hazards) {
    if (h.inside !== (game.inside || null)) continue;
    const a = Math.min(1, h.t / 800) * (h.kind === "gas" ? 0.35 : 0.5);
    const col = { gas: "200,190,60", acid: "130,220,60", poison: "90,180,40", fire: "255,120,30" }[h.kind] || "130,220,60";
    if (h.kind === "fire") ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
    g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; circle(h.x, h.y, h.r);
    ctx.globalCompositeOperation = "source-over";
    if (h.kind === "fire" && Math.random() < 0.3) game.parts.push({ x: h.x + rand(-h.r * 0.6, h.r * 0.6), y: h.y + rand(-h.r * 0.6, h.r * 0.6), vx: rand(-0.2, 0.2), vy: -rand(0.5, 1.4), life: 400, max: 400, color: pick(["#ffb040", "#ff7020", "#ffd060"]), size: rand(2, 5), fr: 0.95 });
  }
}
function drawSmoke() {
  if (game.inside) return;
  for (const s of game.smoke) {
    const k = s.t / 14000;
    for (let i = 0; i < 5; i++) {
      const up = ((game.time / 30 + i * 40) % 200);
      ctx.fillStyle = `rgba(30,30,30,${0.25 * k * (1 - up / 200)})`;
      circle(s.x + Math.sin(game.time / 900 + i) * 12 + up * 0.25, s.y - up, 14 + up * 0.18);
    }
  }
}

// ---------- Painel de bônus ativos (lateral esquerda) ----------
const BONUS_TXT = {
  exp: (v) => `${sgn(v)}% XP`, hunter: (v) => `${sgn(v)}% chance de armas`, scavenger: (v) => `${sgn(v)}% suprimentos`, crit: (v) => `${sgn(v)}% crítico`,
  reload: (v) => `${sgn(-v)}% tempo de recarga`, endurance: (v) => `${sgn(-v)}% energia gasta`, metabolism: (v) => `${sgn(-v)}% fome e sede`,
  vigor: (v) => `${sgn(v)} vida máxima`, regen: (v) => `+${v} vida/s`, silence: (v) => `${sgn(-v)}% barulho e visão`, firepower: (v) => `${sgn(v)}% dano`,
  thick: (v) => `${sgn(-v)}% dano recebido`, greed: (v) => `${sgn(v)}% dinheiro`, agility: (v) => `${sgn(v)}% velocidade`, saver: (v) => `${v}% poupa bala`,
  implantLoot: (v) => `${sgn(v)}% implantes`, rage: (v) => `${sgn(v)}% dano com pouca vida`, killHeal: (v) => `+${v} vida por abate`,
  lootSense: (v) => `faro de saque ${v}`, luck: (v) => `${sgn(v)}% raridade`, accImp: (v) => `${sgn(-v)}% dispersão`, stealthImp: (v) => `${sgn(v)}% furtividade`,
  craftDisc: (v) => `${sgn(-v)}% preço oficina`, critDmg: (v) => `${sgn(v)}% dano crítico`, leech: (v) => `${v}% dano vira vida`, adren: (v) => `${sgn(v)}% veloc. com pouca vida`,
  armorFind: (v) => `${sgn(v)}% chance de coletes`, ammoLoot: (v) => `${sgn(v)}% munição achada`, searchSpeed: (v) => `${sgn(v)}% velocidade de busca`,
  miscFind: (v) => `${sgn(v)}% materiais`, lootSpots: (v) => `${sgn(v)}% lugares com saque`, atkSpeed: (v) => `${sgn(v)}% velocidade de ataque`,
  deathDefy: (v) => `${v}% de sobreviver a golpe fatal`, bossRare: (v) => `${sgn(v)}% raridade nos chefes`, mcChance: (v) => `${sgn(v)}% armas com melhorias`
};
// efeitos onde o número negativo é bom para o jogador
const NEG_GOOD = [];
function sgn(v) { v = Math.round(v * 100) / 100; return v > 0 ? `+${v}` : `${v}`; }
function activeBonuses() {
  const out = [], fx = { ...(player.fx || {}) };
  const vest = save.vest >= 0 ? vestDefinition(save.vest) : null, w = curW();
  fx.thick = armorRed() * 100;
  fx.vigor = (fx.vigor || 0) + (vest ? vest.hp || 0 : 0);
  fx.stealthImp = (fx.stealthImp || 0) + (vest ? vest.stealth || 0 : 0);
  fx.crit = (fx.crit || 0) + (w.crit || 0);
  fx.exp = (xpMult() - 1) * 100;
  fx.greed = (moneyMult() - 1) * 100;
  const slow = player.flags.jugger ? 0 : (vest ? vest.slow || 0 : 0) + (w.slow || 0);
  fx.agility = ((1 + ((fx.agility || 0) + vestSpeedBonus()) / 100) * (1 - slow / 100) - 1) * 100;
  // de onde vem cada efeito (nomes dos implantes)
  const src = {};
  save.installed.forEach((im, i) => { const f = implantFx(im, i, save.installed); for (const k in f) (src[k] = src[k] || []).push(implantName(im)); });
  const source = (k, label) => (src[k] = src[k] || []).push(label);
  const profession = prof();
  if (profession && profession.fx) for (const k in profession.fx) source(k, `Profissão: ${profession.name}`);
  if (vest) for (const [field, key] of [["armor", "thick"], ["hp", "vigor"], ["stealth", "stealthImp"], ["slow", "agility"]])
    if (vest[field]) source(key, `Colete: ${vest.name}`);
  if (vestSpeedBonus()) source("agility", `Melhoria: ${vest.name}`);
  if (A("armor")) source("thick", `Armadura: ${A("armor")}`);
  if (w.crit) source("crit", `Arma: ${w.name}`);
  if (w.slow) source("agility", `Arma: ${w.name}`);
  if (vipActive()) { source("exp", "VIP"); source("greed", "VIP (dinheiro x2)"); }
  const bonusKeys = ["exp", "greed", ...STAT_KEYS.filter(k => k !== "exp" && k !== "greed")];
  for (const k of bonusKeys) {
    const v = fx[k];
    if (!v || !BONUS_TXT[k]) continue;
    const bad = ["reload", "endurance", "metabolism", "thick", "silence", "accImp", "craftDisc"].includes(k) ? false : v < 0;
    const good = ["thick", "silence", "reload", "endurance", "metabolism", "accImp", "craftDisc"].includes(k) ? v > 0 : v > 0;
    out.push({ icon: "◆", text: BONUS_TXT[k](v), from: (src[k] || []).join(", "), color: vipActive() && (k === "exp" || k === "greed") ? "#ffd25a" : good && !bad ? "#8fd08a" : "#e07b5a" });
  }
  if (vest && vest.acid) out.push({ icon: "▣", text: `-${vest.acid}% dano de ácido`, from: `Colete: ${vest.name}`, color: "#8fb3ff" });
  if (w.burn) out.push({ icon: "✦", text: `fogo ${w.burn}/s`, from: `Arma: ${w.name}`, color: "#ffb070" });
  if (w.bleed) out.push({ icon: "✦", text: `${Math.round(w.bleed * 100)}% sangramento`, from: `Arma: ${w.name}`, color: "#ffb070" });
  if (w.stun) out.push({ icon: "✦", text: `${Math.round(w.stun * 100)}% atordoar`, from: `Arma: ${w.name}`, color: "#ffb070" });
  if (w.lifesteal) out.push({ icon: "✦", text: `${w.lifesteal * 100}% roubo de vida`, from: `Arma: ${w.name}`, color: "#ffb070" });
  if (fx.rage && player.hp / player.maxHp < 0.4) out.push({ icon: "!", text: `DESESPERO ATIVO +${fx.rage}% dano`, from: "Vida abaixo de 40%", color: "#ff6a4a" });
  if (fx.adren && player.hp / player.maxHp < 0.5) out.push({ icon: "!", text: `ADRENALINA +${fx.adren}% velocidade`, from: "Vida abaixo de 50%", color: "#ff6a4a" });
  if (inSafe()) out.push({ icon: "+", text: "+1,5 vida/s (descanso)", from: "Dentro de um posto seguro", color: "#8fd08a" });
  if (player.hunger <= 0 || player.thirst <= 0) out.push({ icon: "!", text: "energia não regenera", from: "Fome ou sede zerada", color: "#e05a4a" });
  return out;
}
function drawBonusPanel() {
  const list = activeBonuses();
  if (!list.length || save.hud === 1) return;
  // lista de bônus à esquerda, só texto, logo abaixo das informações do topo
  const x = 12, h = 13, y0 = game.hudBonusY || 170, room = H - 196 - y0, max = Math.max(3, Math.floor(room / h));
  const rows = list.slice(0, max);
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.95)"; ctx.shadowBlur = 3; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
  rows.forEach((b, i) => {
    const y = y0 + i * h;
    txt(b.text.toUpperCase(), x, y, 9.5, b.color, "left", true, 230);
  });
  if (list.length > max) txt(`+${list.length - max} BÔNUS`, x, y0 + rows.length * h, 9, "#a9a58f", "left", true);
  ctx.restore();
}

// ---------- Bússola de chefe ----------
// aponta para o chefe mais perto: dentro da área dele, para o próprio chefe; fora, para a área
function nearestBoss() {
  const c = world.cell;
  if (c.boss) {
    const z = zombies.find((m) => m.boss && m.hp > 0);
    if (z && !game.inside) return { cell: c, dist: 0, ang: Math.atan2(z.y - player.y, z.x - player.x), z };
  }
  let best = null;
  for (const b of bossCells()) {
    const d = Math.abs(b.cx - c.cx) + Math.abs(b.cy - c.cy);
    if (d === 0) continue;
    if (!best || d < best.dist) best = { cell: b, dist: d, ang: Math.atan2(b.cy - c.cy, b.cx - c.cx) };
  }
  return best;
}
function drawBossCompass() {
  if (game.over || game.menu || game.shop) return;
  const t = nearestBoss();
  if (!t) return;
  const B = BOSSES[t.cell.boss], RG = REGIONS[t.cell.tier];
  const isNatal = t.cell.boss === "santa_natal";
  const bossAccent = isNatal ? "#68f18c" : "#e04a4a";
  const label = t.dist === 0 ? `☠ ${B.name} está nesta área` : `☠ ${B.name} · ${t.cell.code} (${RG.name}) · ${t.dist} ${t.dist > 1 ? "áreas" : "área"}`;
  ctx.font = `bold 12px ${FONT}`;
  const tw = ctx.measureText(label).width + 44, x = W / 2 - tw / 2 + 60, y = 58;
  ctx.globalAlpha = hudFade("bc", x, y, tw, 26);
  ctx.fillStyle = "rgba(20,8,8,0.72)"; rr(x, y, tw, 26, 13); ctx.fill();
  ctx.strokeStyle = isNatal ? "rgba(104,241,140,0.65)" : "rgba(224,74,74,0.6)";
  ctx.lineWidth = 1.2; ctx.stroke();
  ctx.save(); ctx.translate(x + 16, y + 13); ctx.rotate(t.ang);
  poly([[8, 0], [-5, -6], [-2, 0], [-5, 6]], bossAccent); ctx.restore();
  txt(label, x + 28, y + 17, 12, isNatal ? "#daffe1" : "#f2d0c8", "left", true);
  ctx.globalAlpha = 1;
  // seta vermelha girando em volta do personagem
  if (!game.inside) {
    const px = (player.x - cam.x) * VIEW_ZOOM, py = (player.y - cam.y) * VIEW_ZOOM, pulse = 0.55 + 0.35 * Math.sin(performance.now() / 250);
    ctx.save(); ctx.translate(px + Math.cos(t.ang) * 46, py + Math.sin(t.ang) * 46); ctx.rotate(t.ang);
    ctx.globalAlpha = pulse; poly([[9, 0], [-5, -7], [-1, 0], [-5, 7]], bossAccent); ctx.restore();
    ctx.globalAlpha = 1;
  }
}

function drawChristmasCorpse(c, kind) {
  const img = CHRISTMAS_BOSS_SPRITES[kind];
  if (!img.complete || !img.naturalWidth) return;
  const angle = c.ang || 0;
  const facing = ((Math.round(-angle * 4 / Math.PI) % 8) + 8) % 8;
  const size = (c.radius || (kind === "santa" ? 37 : 27)) * (kind === "santa" ? 4 : 4.25);
  const t = c.deathTime == null ? 1 : clamp((game.time - c.deathTime) / 480, 0, 1);
  const fall = Math.sin(t * Math.PI / 2);
  ctx.save();
  ctx.translate(c.x + c.w / 2, c.y + c.h / 2);
  ctx.fillStyle = "rgba(23,12,10,.42)";
  ellipse(0, 6, size * .32, size * .10);
  ctx.scale(1, 1 - .39 * fall);
  ctx.rotate((Math.cos(angle) >= 0 ? 1 : -1) * fall * 1.40);
  ctx.drawImage(img, 0, facing * 240, 240, 240, -size / 2, -size * (.63 - .13 * fall), size, size);
  ctx.restore();
}
