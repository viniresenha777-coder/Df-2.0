"use strict";
// Botas 2.0: substitui a silhueta dos pes arredondados do sprite 3D original.
// O jogo nao usa glTF em tempo real: as 5 folhas de animacao sao compostas com
// 8 direcoes x 8 quadros e o inventario usa uma tira de retratos giratorios.
// Este algoritmo isola cada bota pela cor neutra escura do sprite BASE, apaga
// somente a parte sem mascara de calca e redesenha um coturno estruturado.
// Nao altera posicao do jogador, hitbox, armadura, balas ou animacao.

// Imagens extraidas diretamente do modelo glTF da bota enviado pelo criador.
// O atlas contem 8 vistas reais com textura, cadarcos e sola do modelo.
const BOOT_REAL_VIEW_BOX = [
  [11,1,37,47], [2,1,46,47], [1,6,47,42], [1,2,47,46],
  [12,1,36,47], [3,1,45,47], [1,6,47,42], [1,3,47,44]
];
const BOOT_REAL_ATLAS = new Image();
BOOT_REAL_ATLAS.onload = () => {
  // Atualiza a composicao quando a textura terminar de carregar.
  if (typeof PSHEET !== "undefined") { PSHEET.tintKey = ""; PSHEET.tinted = {}; }
  if (typeof PORTRAIT !== "undefined") { PORTRAIT.key = ""; PORTRAIT.cache = null; }
  if (typeof REMOTE_PLAYER_SHEETS !== "undefined") REMOTE_PLAYER_SHEETS.clear();
};
BOOT_REAL_ATLAS.onerror = () => console.warn("Bota glTF: atlas indisponivel, mantendo o sprite original.");
BOOT_REAL_ATLAS.src = "img/clothing/boot_real_8views.png?v=20261117-real-model04";
function clothingBootImageReady() {
  return BOOT_REAL_ATLAS.complete && BOOT_REAL_ATLAS.naturalWidth === 384;
}

function clothingReplaceBoots(target, original, mask, boots, portrait) {
  if (!boots || !target || !original || !clothingBootImageReady()) return false;
  const w = target.width, h = target.height;
  const fw = portrait ? 240 : 128, fh = portrait ? h : 128;
  if (!w || !h || w % fw !== 0 || h % fh !== 0) return false;
  try {
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = w; srcCanvas.height = h;
    const sc = srcCanvas.getContext("2d", { willReadFrequently: true });
    sc.drawImage(original, 0, 0, w, h);
    const base = sc.getImageData(0, 0, w, h).data;
    let md = null;
    if (mask) {
      const mc = document.createElement("canvas");
      mc.width = w; mc.height = h;
      const mg = mc.getContext("2d", { willReadFrequently: true });
      mg.drawImage(mask, 0, 0, w, h);
      md = mg.getImageData(0, 0, w, h).data;
    }
    const ctx = target.getContext("2d", { willReadFrequently: true });
    const output = ctx.getImageData(0, 0, w, h);
    const dst = output.data;
    const columns = w / fw, rows = h / fh, drawings = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const ox = col * fw, oy = row * fh;
      const yBegin = Math.floor(fh * (portrait ? 0.70 : 0.53));
      const maskMap = new Uint8Array(fw * fh);
      // Separa o couro cinza-escuro original dos tecidos claros da calca.
      // A mascara verde protege toda a perna, inclusive o tecido multiforest.
      for (let ly = yBegin; ly < fh; ly++) for (let lx = 0; lx < fw; lx++) {
        const gx = ox + lx, gy = oy + ly, i = (gy * w + gx) * 4;
        if (base[i + 3] < 34) continue;
        if (md && (md[i] > 68 || md[i + 1] > 68)) continue;
        const r = base[i], g = base[i + 1], b = base[i + 2];
        const light = (r + g + b) / 3, spread = Math.max(r,g,b) - Math.min(r,g,b);
        if (light < 155 && spread < 55) maskMap[ly * fw + lx] = 1;
      }
      // Componentes conexos de pixels: em cada pose as duas botas podem
      // ficar em lugares diferentes, por isso nao usamos coordenadas fixas.
      const seen = new Uint8Array(fw * fh), groups = [], queue = new Int32Array(fw * fh);
      for (let yy = yBegin; yy < fh; yy++) for (let xx = 0; xx < fw; xx++) {
        const start = yy * fw + xx;
        if (!maskMap[start] || seen[start]) continue;
        let head = 0, tail = 1;
        queue[0] = start; seen[start] = 1;
        let x0 = fw, y0 = fh, x1 = 0, y1 = 0, count = 0;
        while (head < tail) {
          const at = queue[head++], x = at % fw, y = Math.floor(at / fw);
          count++;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          // 8 vizinhos conectam areas de couro separadas por antialiasing.
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= fw || ny < yBegin || ny >= fh) continue;
            const ni = ny * fw + nx;
            if (maskMap[ni] && !seen[ni]) { seen[ni] = 1; queue[tail++] = ni; }
          }
        }
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
        if (count >= (portrait ? 38 : 4) && bw >= (portrait ? 5 : 2) &&
            bh >= (portrait ? 5 : 2) && y1 >= fh * (portrait ? 0.78 : 0.62)) {
          groups.push({x0,x1,y0,y1,count});
        }
      }
      // Remove particulas pequenas, em caso de costura escura, e limita a
      // duas botas. A escolha privilegia area e posicao no fim da perna.
      groups.sort((a,b)=>b.count-a.count || b.y1-a.y1);
      const feet = groups.slice(0,2).sort((a,b)=>a.x0-b.x0);
      if (!feet.length) continue;
      for (const foot of feet) {
        const pad = portrait ? 2 : 1;
        const x0 = Math.max(0, foot.x0-pad), x1 = Math.min(fw-1,foot.x1+pad);
        const y0 = Math.max(yBegin, foot.y0-pad), y1 = Math.min(fh-1,foot.y1+pad);
        // Remove o contorno antigo (incluindo seus pixels de borda).
        // Nunca perfura a mascara verde da calca.
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const i = ((oy+y)*w+ox+x)*4;
          if (md && (md[i] > 68 || md[i+1] > 68)) continue;
          if (base[i+3]<8) continue;
          const r=base[i],g=base[i+1],b=base[i+2],light=(r+g+b)/3;
          if (light < 188 && Math.max(r,g,b)-Math.min(r,g,b)<62) dst[i+3]=0;
        }
        drawings.push({ox,oy,frame:col,row,columns,fw,fh,foot});
      }
    }
    ctx.putImageData(output,0,0);
    for (const d of drawings) clothingDrawReplacementBoot(ctx,d,boots,portrait);
    return drawings.length > 0;
  } catch (err) {
    console.warn("Nao foi possivel substituir a silhueta das botas:",err);
    return false;
  }
}

function clothingDrawReplacementBoot(ctx, d, item, portrait) {
  const { ox, oy, fw, fh, frame, row, foot } = d;
  // Personagem de frente no retrato = angulo 0 da bota.
  // No jogo a linha 4 = frente; a linha 0 = de costas.
  const view = portrait ? Math.round(frame / 2) % 8 : (row + 4) % 8;
  const rect = BOOT_REAL_VIEW_BOX[view], sx = view * 48 + rect[0], sy = rect[1];
  const sw = rect[2] - rect[0], sh = rect[3] - rect[1];
  if (sw < 1 || sh < 1) return;
  const fw0 = foot.x1 - foot.x0 + 1, fh0 = foot.y1 - foot.y0 + 1;
  // Medidas relativas ao calçado original naquele quadro: sem dimensoes
  // fixas que façam a bota flutuar ao correr, pisar ou virar.
  const width = Math.max(portrait ? 11 : 3, fw0 * (portrait ? 1.08 : 1.10));
  const height = Math.max(fh0 * (portrait ? 1.14 : 1.10),
    width * (sh / sw) * (portrait ? 0.63 : 0.72));
  const x = ox + (foot.x0 + foot.x1) * 0.5 - width * 0.5;
  const y = oy + foot.y1 + (portrait ? 1 : 0.6) - height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, fw, fh);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  // Sem polígonos ou cores inventadas: copia pixels do GLTF original.
  ctx.drawImage(BOOT_REAL_ATLAS, sx, sy, sw, sh, x, y, width, height);
  ctx.restore();
}
