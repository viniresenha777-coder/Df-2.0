"use strict";
// Botas 5.0: as botas glTF reais seguem a barra da calca e o tamanho dos tornozelos.
// O jogo nao usa glTF em tempo real: as 5 folhas de animacao sao compostas com
// 8 direcoes x 8 quadros e o inventario usa uma tira de retratos giratorios.
// Este algoritmo localiza a barra de cada perna pela mascara verde, apaga
// somente o calcado original perto do tornozelo e coloca a imagem glTF.
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

// As marcas verdes nas máscaras originais indicam exatamente a calça.
// Encontra as barras das duas pernas em cada ângulo/pose, sem confundir capa,
// braços e sombras com botas (erro que causava as botas gigantes da ROUPAS-04).
function clothingFindPantHems(maskData, sheetWidth, ox, oy, fw, fh, portrait) {
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
function clothingFindOriginalFoot(base, maskData, sw, ox, oy, fw, fh, hem, portrait) {
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
function clothingReplaceBoots(target, original, mask, boots, portrait) {
  if (!boots || !target || !original || !mask || !clothingBootImageReady()) return false;
  const w = target.width, h = target.height, fw = portrait ? 240 : 128;
  const fh = portrait ? h : 128;
  if (!w || !h || w % fw || h % fh) return false;
  try {
    const originalCanvas = document.createElement('canvas');
    originalCanvas.width = w; originalCanvas.height = h;
    const g0 = originalCanvas.getContext('2d',{willReadFrequently:true});
    g0.drawImage(original,0,0);
    const base = g0.getImageData(0,0,w,h).data;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = w; maskCanvas.height = h;
    const gm = maskCanvas.getContext('2d',{willReadFrequently:true});
    gm.drawImage(mask,0,0);
    const md = gm.getImageData(0,0,w,h).data;
    const g = target.getContext('2d',{willReadFrequently:true});
    const image = g.getImageData(0,0,w,h), dst = image.data;
    const placements = [];
    for (let row = 0; row < h/fh; row++) for (let col = 0; col < w/fw; col++) {
      const ox=col*fw,oy=row*fh;
      const hems=clothingFindPantHems(md,w,ox,oy,fw,fh,portrait);
      const used=[];
      for (const hem of hems) {
        const foot=clothingFindOriginalFoot(base,md,w,ox,oy,fw,fh,hem,portrait);
        if (!foot) continue;
        if (used.some(p=>Math.abs(p.x0-foot.x0) < 2 && Math.abs(p.y0-foot.y0) < 2)) continue;
        used.push(foot);
        const pad = portrait ? 2 : 1;
        for (let yy=Math.max(0,foot.y0-pad);yy<=Math.min(fh-1,foot.y1+pad);yy++)
          for (let xx=Math.max(0,foot.x0-pad);xx<=Math.min(fw-1,foot.x1+pad);xx++) {
            const i=((oy+yy)*w+ox+xx)*4;
            if (md[i]>65 || md[i+1]>65 || base[i+3]<8) continue;
            const rr=base[i],gg=base[i+1],bb=base[i+2];
            if ((rr+gg+bb)/3<209 && Math.max(rr,gg,bb)-Math.min(rr,gg,bb)<78)
              dst[i+3]=0;
          }
        placements.push({ox,oy,fw,fh,frame:col,row,foot});
      }
    }
    if (!placements.length) return false;
    g.putImageData(image,0,0);
    for (const p of placements) clothingDrawReplacementBoot(g,p,boots,portrait);
    return true;
  } catch(error) {
    console.warn('Bota glTF: preservando sprite antigo apos falha no ajuste.',error);
    return false;
  }
}
function clothingDrawReplacementBoot(ctx, placement, item, portrait) {
  const {ox,oy,fw,fh,frame,row,foot}=placement;
  const view = portrait ? Math.round(frame/2)%8 : (row+4)%8;
  const box = BOOT_REAL_VIEW_BOX[view];
  const sw=box[2]-box[0],sh=box[3]-box[1];
  if(sw<2||sh<2)return;
  const oldW=foot.x1-foot.x0+1;
  const width=portrait
    ? Math.max(12,Math.min(27,oldW*0.84))
    : Math.max(3,Math.min(12,oldW*0.87));
  const height=portrait
    ? Math.max(17,Math.min(34,width*sh/sw*0.82))
    : Math.max(4,Math.min(15,width*sh/sw*0.77));
  const cx=(foot.x0+foot.x1)/2;
  const x=ox+cx-width/2;
  const y=oy+foot.y1+0.6-height;
  ctx.save();ctx.beginPath();ctx.rect(ox,oy,fw,fh);ctx.clip();
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(BOOT_REAL_ATLAS,view*48+box[0],box[1],sw,sh,x,y,width,height);
  ctx.restore();
}
