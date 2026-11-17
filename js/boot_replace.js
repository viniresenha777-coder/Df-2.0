"use strict";
// Botas 2.0: substitui a silhueta dos pes arredondados do sprite 3D original.
// O jogo nao usa glTF em tempo real: as 5 folhas de animacao sao compostas com
// 8 direcoes x 8 quadros e o inventario usa uma tira de retratos giratorios.
// Este algoritmo isola cada bota pela cor neutra escura do sprite BASE, apaga
// somente a parte sem mascara de calca e redesenha um coturno estruturado.
// Nao altera posicao do jogador, hitbox, armadura, balas ou animacao.
function clothingReplaceBoots(target, original, mask, boots, portrait) {
  if (!boots || !target || !original) return false;
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
  const {ox,oy,fw,fh,frame,row,columns,foot:f} = d;
  const rawW = f.x1-f.x0+1, rawH=f.y1-f.y0+1;
  const fine = portrait ? 1 : 0;
  const extraX = portrait ? 2.4 : 0.75;
  const extraY = portrait ? 4.2 : 1.6;
  const x = ox+f.x0-extraX, y = oy+f.y0-extraY;
  const bw = Math.max(portrait?13:4,rawW+extraX*2);
  const bh = Math.max(portrait?17:6,rawH+extraY+1);
  const a = portrait ? 2*Math.PI*frame/columns : row*Math.PI/4;
  const side = Math.sin(a), profile = Math.abs(side) > 0.64;
  const base = item.color || "#51494a", trim = item.accent || "#938b83";
  ctx.save();
  ctx.beginPath();ctx.rect(ox,oy,fw,fh);ctx.clip();
  ctx.translate(x,y);
  // Inverta a direcao da biqueira nos perfis laterais sem mexer na pisada.
  if (profile && side < 0) {ctx.translate(bw,0);ctx.scale(-1,1);}
  const grad=ctx.createLinearGradient(0,0,bw,bh);
  grad.addColorStop(0,trim);
  grad.addColorStop(0.22,base);
  grad.addColorStop(0.72,base);
  grad.addColorStop(1,"#242527");
  const toe=profile ? 0.42 : 0.22;
  ctx.fillStyle=grad;
  ctx.strokeStyle="#1b1c1e";
  ctx.lineWidth=portrait?1.4:0.7;
  ctx.beginPath();
  if (profile) {
    // Cano atras, biqueira reta e alongada na frente.
    ctx.moveTo(bw*.11,bh*.10);
    ctx.lineTo(bw*.50,bh*.05);
    ctx.lineTo(bw*.60,bh*.50);
    ctx.lineTo(bw*.87,bh*.58);
    ctx.lineTo(bw*.99,bh*.76);
    ctx.lineTo(bw*.98,bh*.91);
    ctx.lineTo(bw*.80,bh*.94);
    ctx.lineTo(bw*.04,bh*.96);
    ctx.lineTo(bw*.01,bh*.80);
    ctx.lineTo(bw*.12,bh*.55);
  } else {
    // Frente e costas: tornozelo justo e biqueira quadrada, sem "bola".
    ctx.moveTo(bw*.22,bh*.06);
    ctx.lineTo(bw*.75,bh*.06);
    ctx.lineTo(bw*.83,bh*.57);
    ctx.lineTo(bw*.97,bh*.76);
    ctx.lineTo(bw*.97,bh*.91);
    ctx.lineTo(bw*.04,bh*.91);
    ctx.lineTo(bw*.04,bh*.76);
    ctx.lineTo(bw*.17,bh*.57);
  }
  ctx.closePath();ctx.fill();ctx.stroke();
  // Sola firme, reta, com borda de borracha e salto definido.
  ctx.fillStyle="#222325";
  ctx.fillRect(bw*.04,bh*.86,bw*.92,bh*.105);
  ctx.fillStyle=trim;ctx.globalAlpha=.58;
  ctx.fillRect(bw*.06,bh*.85,bw*.87,Math.max(.6,bh*.025));
  ctx.globalAlpha=1;
  if (portrait) {
    // Plaquetas no cano, costura e cadarco.
    ctx.strokeStyle="#252628";ctx.lineWidth=1.2;
    const xlace = profile ? bw*.34 : bw*.50;
    ctx.beginPath();
    ctx.moveTo(xlace-bw*.085,bh*.16);
    ctx.lineTo(xlace-bw*.10,bh*.61);
    ctx.moveTo(xlace+bw*.085,bh*.16);
    ctx.lineTo(xlace+bw*.10,bh*.61);
    ctx.stroke();
    ctx.strokeStyle=trim;ctx.lineWidth=.9;
    for (let i=0;i<4;i++) {
      const yy=bh*(.23+i*.095);
      ctx.beginPath();ctx.moveTo(xlace-bw*.09,yy);ctx.lineTo(xlace+bw*.09,yy+1.4);ctx.stroke();
    }
    ctx.strokeStyle="#b1a9a0";ctx.globalAlpha=.28;ctx.lineWidth=.85;
    ctx.beginPath();ctx.moveTo(bw*(profile?.59:.17),bh*.72);
    ctx.lineTo(bw*.82,bh*.72);ctx.stroke();
    ctx.globalAlpha=1;
  } else {
    ctx.strokeStyle=trim;ctx.lineWidth=.85;ctx.globalAlpha=.58;
    ctx.beginPath();ctx.moveTo(bw*.30,bh*.28);ctx.lineTo(bw*.61,bh*.43);ctx.stroke();
    ctx.globalAlpha=1;
  }
  ctx.restore();
}
