"use strict";
// Arquivos fornecidos pelo criador: sons de armas, criatura e impacto.
// O áudio tem atenuação por distância, pan estéreo e filtro passa-baixas
// para dar profundidade às mortes, groans e tiros no mundo compartilhado.
const FM_AUDIO = { buffer: null, loading: false, failed: false, voices: 0,
  amb: null, ambNode: null, ambGain: null, lastGroan: 0, lastKill: 0 };
const FM_AUDIO_CUES = {"pistol":[0.0,0.5571],"pistol_silenced":[0.6371,0.3871],"rifle":[1.1042,0.3271],"rifle_burst":[1.5113,0.4971],"shotgun":[2.0884,0.3871],"sniper":[2.5556,0.1271],"reload_pistol":[2.7627,1.465],"reload_rifle":[4.3077,1.125],"pump":[5.5127,0.3421],"hit_metal":[5.9347,0.3171],"hit_concrete":[6.3318,0.5071],"ricochet":[6.919,1.3003],"knife":[8.2993,0.3821],"explosion":[8.7614,1.74],"zombie_groan1":[10.5814,1.3],"zombie_groan2":[11.9614,1.35],"zombie_die1":[13.3913,1.4],"zombie_die2":[14.8713,1.3],"zombie_die3":[16.2513,1.2],"gore1":[17.5313,0.4286],"gore2":[18.0399,0.8571],"walther":[18.977,0.9896]};
// Arquivo .mp3 enviado pelo criador: clique mecânico curto a cada cartucho.
function fmLoadRifleRound() {
  if (!SND.ac || FM_AUDIO.rifleRoundBuffer || FM_AUDIO.rifleRoundLoading || FM_AUDIO.rifleRoundFailed) return;
  FM_AUDIO.rifleRoundLoading = true;
  fetch("audio/rifle_reload_round.mp3?v=20261117-rifle-reload1")
    .then(r => { if (!r.ok) throw new Error("Som de recarga não disponível"); return r.arrayBuffer(); })
    .then(buf => SND.ac.decodeAudioData(buf))
    .then(buf => { FM_AUDIO.rifleRoundBuffer = buf; })
    .catch(err => { FM_AUDIO.rifleRoundFailed = true; console.warn("Som individual de recarga indisponível", err); })
    .finally(() => { FM_AUDIO.rifleRoundLoading = false; });
}
function fmAudioAssetsStart() {
  fmLoadRifleRound();
  if (!SND.ac || FM_AUDIO.loading || FM_AUDIO.buffer || FM_AUDIO.failed) return;
  FM_AUDIO.loading = true;
  fetch("audio/fm_sfx_pack.ogg?v=20261117-1")
    .then(r => { if (!r.ok) throw new Error("Pacote de sons não disponível"); return r.arrayBuffer(); })
    .then(buf => SND.ac.decodeAudioData(buf))
    .then(buf => { FM_AUDIO.buffer = buf; })
    .catch(err => { FM_AUDIO.failed = true; console.warn("Sons externos indisponíveis; usando efeitos originais", err); })
    .finally(() => { FM_AUDIO.loading = false; });
}
function fmAmbientVolume() {
  const v = typeof save !== "undefined" ? Number(save.ambientVolume) : 0.45;
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.45;
}
function fmAmbientSetVolume() {
  if (!FM_AUDIO.ambGain || !SND.ac) return;
  FM_AUDIO.ambGain.gain.setTargetAtTime(fmAmbientVolume() * 0.44, SND.ac.currentTime, 0.14);
}
function fmAmbientStart() {
  if (!SND.ac || !SND.master) return;
  if (!FM_AUDIO.amb) {
    const media = new Audio("audio/fm_ambient_lost.ogg?v=20261117-1");
    media.loop = true; media.preload = "auto";
    const node = SND.ac.createMediaElementSource(media), gain = SND.ac.createGain();
    node.connect(gain); gain.connect(SND.master);
    FM_AUDIO.amb = media; FM_AUDIO.ambNode = node; FM_AUDIO.ambGain = gain;
  }
  fmAmbientSetVolume();
  if (FM_AUDIO.amb.paused && fmAmbientVolume() > 0) FM_AUDIO.amb.play().catch(() => {});
}
function fmPlaySample(key, opt) {
  const ac = SND.ac, spec = FM_AUDIO_CUES[key];
  if (!ac || SND.muted || !FM_AUDIO.buffer || !spec || FM_AUDIO.voices > 22) return false;
  opt = opt || {};
  let volume = Number.isFinite(opt.volume) ? opt.volume : 1;
  let pan = 0, distance = 0;
  if (Number.isFinite(opt.x) && Number.isFinite(opt.y) && player) {
    const dx = opt.x - player.x, dy = opt.y - player.y;
    distance = Math.hypot(dx,dy);
    // Sem corte abrupto: 200 unidades ainda soam próximas; 700 ficam abafadas.
    if (distance > 1350) return true;
    volume *= 1 / (1 + Math.pow(distance / 270, 1.75));
    pan = Math.max(-0.88, Math.min(0.88, dx / 360));
  }
  if (volume < 0.018) return true;
  const source = ac.createBufferSource(); source.buffer = FM_AUDIO.buffer;
  const gain = ac.createGain(); gain.gain.value = Math.min(1.4, volume);
  let target = gain;
  if (distance > 220) {
    const low = ac.createBiquadFilter();low.type = "lowpass";
    low.frequency.value = Math.max(1100, 7500 - distance * 6.2);
    gain.connect(low); target = low;
  }
  if (ac.createStereoPanner) {
    const stereo = ac.createStereoPanner();stereo.pan.value = pan;
    target.connect(stereo);target = stereo;
  }
  target.connect(SND.master);source.connect(gain);
  FM_AUDIO.voices++;
  source.onended = () => { FM_AUDIO.voices = Math.max(0, FM_AUDIO.voices - 1);source.disconnect();gain.disconnect(); };
  source.start(0, spec[0], Math.max(0.01, spec[1] - .008));
  return true;
}
function fmSoundFromWeapon(w) {
  if (!w || w.melee || w.fists) return "knife";
  if (w.cat === "shotguns") return "shotgun";
  if (w.cat === "rifles") return w.mag && w.mag <= 8 ? "sniper" : "rifle";
  if (w.silenced || w.sound === 0) return "pistol_silenced";
  return w.cat === "pistols" ? "pistol" : "rifle";
}
function fmInstallAudioSamples() {
  if (FM_AUDIO.installed) return;
  FM_AUDIO.installed = true;
  const prev = {
    shot:sfx.shot, reload:sfx.reload, hit:sfx.hit, kill:sfx.kill, groan:sfx.groan,
    empty:sfx.empty, spit:sfx.spit
  };
  sfx.shot = function(w) {
    if (!fmPlaySample(fmSoundFromWeapon(w), {volume:w&&w.melee?.48:.72})) prev.shot(w);
  };
  sfx.reload = function() {
    const w = typeof curW === "function" ? curW() : {};
    const key = w.cat === "rifles" ? "reload_rifle" : "reload_pistol";
    if (!fmPlaySample(key,{volume:.55})) prev.reload();
  };
  // Som único do Rifle de Caça: tocar no R e em cada próxima inserção.
  sfx.reloadRound = function() {
    const ac = SND.ac;
    if (!ac || SND.muted) return;
    if (!FM_AUDIO.rifleRoundBuffer) {
      fmLoadRifleRound();
      if (!fmPlaySample("pump", {volume:.28})) prev.reload();
      return;
    }
    const src = ac.createBufferSource(), gain = ac.createGain();
    src.buffer = FM_AUDIO.rifleRoundBuffer;
    // 0,648s originais, acelerados para acompanhar o cartucho (~0,5s).
    src.playbackRate.value = 1.30;
    gain.gain.value = .62;
    src.connect(gain);gain.connect(SND.master);
    src.start();
  };
  sfx.hit = function() { if (!fmPlaySample("gore1",{volume:.30})) prev.hit(); };
  sfx.kill = function(z) {
    const keys=["zombie_die1","zombie_die2","zombie_die3"];
    const id=z?((Math.floor(z.x*17)+Math.floor(z.y*23))>>>0)%3:Math.floor(Math.random()*3);
    if (!fmPlaySample(keys[id],{x:z&&z.x,y:z&&z.y,volume:z&&z.boss?1:.80})) prev.kill();
    if (z && Math.random()<.32) fmPlaySample("gore2",{x:z.x,y:z.y,volume:.42});
  };
  sfx.groan = function(vol,z) {
    const now=performance.now();
    if(now-FM_AUDIO.lastGroan<900)return;
    FM_AUDIO.lastGroan=now;
    const id=z?((Math.floor(z.x*13)+Math.floor(z.y*7))&1):Math.floor(Math.random()*2);
    if (!fmPlaySample(id?"zombie_groan2":"zombie_groan1",{x:z&&z.x,y:z&&z.y,volume:vol*.67})) prev.groan(vol);
  };
  sfx.empty = function() {if(!fmPlaySample("walther",{volume:.2}))prev.empty();};
}
fmInstallAudioSamples();
// =====================================================================
//  Sons enviados pelo criador (pacote Modern Weapons & Military - AHTu20 e
//  FirearmFX Walther P38 - JDSherbert), cada um no seu lugar:
//  tiro e recarga dos fuzis, facas, cartucho caindo no chão, passos (chão
//  duro e grama), lança-granadas (tiro e recarga) e ambiente do bunker e dos hospitais.
// =====================================================================
const FM_EXTRA_FILES = {
  grito_rastejante: "audio/grito_rastejante.m4a",
  fuzil_tiro: "audio/fuzil_tiro.ogg", fuzil_recarga: "audio/fuzil_recarga.mp3", faca: "audio/faca.ogg",
  cartucho: "audio/cartucho_chao.ogg", passos: "audio/passos.ogg", passos_grama: "audio/passos_grama.ogg",
  granada_tiro: "audio/lancagranada_tiro.ogg", granada_recarga: "audio/lancagranada_recarga.ogg",
  amb_bunker: "audio/amb_bunker.ogg", amb_hospital: "audio/amb_hospital.ogg"
};
const FM_EXTRA = { buf: {}, loading: false, lastShell: 0, steps: null, amb: null };
const FM_NEW_SHOT_CUES = {flecha:[0,.32],minigun:[.36,.08],doze:[.48,.37],m249:[.89,.112],barrett:[1.042,.84]};
const FM_NEW_SHOTS = {buffer:null,loading:false,voices:0};
function fmNewShotLoad() {
  const ac = SND.ac;
  if (!ac || FM_NEW_SHOTS.loading || FM_NEW_SHOTS.buffer) return;
  FM_NEW_SHOTS.loading = true;
  fetch("audio/fm_novos_disparos.ogg?v=20261127-v1")
    .then(r=>{if(!r.ok)throw Error("novos disparos");return r.arrayBuffer();})
    .then(b=>ac.decodeAudioData(b)).then(b=>{FM_NEW_SHOTS.buffer=b;})
    .catch(e=>console.warn("Sons de disparo indisponíveis; usando os anteriores",e));
}
function fmNewShotKey(w) {
  if (!w || !w.id) return null;
  if (w.id === "besta") return "flecha";
  if (w.id === "minigun" || w.id === "minigun_inf" || w.id === "minigun_inf_oficina") return "minigun";
  if (w.id === "m249") return "m249";
  if (w.id === "barrett" || w.id === "choque" || w.id === "vingador") return "barrett";
  if (w.cat === "shotguns") return "doze";
  return null;
}
function fmPlayNewShot(w) {
  const key = fmNewShotKey(w), ac = SND.ac;
  if (!key || !ac) return false;
  if (SND.muted) return true;
  fmNewShotLoad();
  if (!FM_NEW_SHOTS.buffer) return false;
  if (FM_NEW_SHOTS.voices >= 22) return true;
  const spec = FM_NEW_SHOT_CUES[key], src = ac.createBufferSource(), gain = ac.createGain();
  src.buffer = FM_NEW_SHOTS.buffer;
  src.playbackRate.value = key === "m249" ? 1.35 : 1;
  gain.gain.value = key === "minigun" || key === "m249" ? .55 : .8;
  src.connect(gain); gain.connect(SND.master);
  FM_NEW_SHOTS.voices++;
  src.onended=()=>{FM_NEW_SHOTS.voices=Math.max(0,FM_NEW_SHOTS.voices-1);src.disconnect();gain.disconnect();};
  src.start(0,spec[0],spec[1]); return true;
}
function fmExtraLoad() {
  fmNewShotLoad();
  if (!SND.ac || FM_EXTRA.loading) return;
  FM_EXTRA.loading = true;
  for (const [k, url] of Object.entries(FM_EXTRA_FILES)) {
    fetch(url + "?v=20261117-sons01")
      .then(r => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); })
      .then(b => SND.ac.decodeAudioData(b))
      .then(b => { FM_EXTRA.buf[k] = b; })
      .catch(err => console.warn("Som não carregado:", err));
  }
}
// toca um dos sons extras; devolve false se ainda não carregou (o jogo usa o som antigo)
function fmPlayExtra(key, opt) {
  const ac = SND.ac, buf = FM_EXTRA.buf[key];
  if (!ac || SND.muted || !buf) return false;
  opt = opt || {};
  const src = ac.createBufferSource(), gain = ac.createGain();
  src.buffer = buf;
  src.playbackRate.value = opt.rate || 1;
  gain.gain.value = opt.volume != null ? opt.volume : 1;
  src.connect(gain); gain.connect(SND.master);
  src.start(ac.currentTime + (opt.delay || 0));
  return true;
}
// grupos de armas pelo jeito (look) de cada uma
const FM_RIFLE_LOOKS = new Set(["ar", "lmg"]);                        // fuzis de assalto e metralhadoras de fuzil
const FM_RIFLE_RELOAD_LOOKS = new Set(["ar", "lmg", "rifle"]);        // todos os fuzis (inclui os de precisão)
const FM_BLADE_LOOKS = new Set(["knife", "machete", "katana", "sword", "axe"]);
function fmIsGrenadeLauncher(w) { return !!w && w.ammo === "granada"; }

(function fmInstallExtraSounds() {
  const prevShot = sfx.shot, prevReload = sfx.reload;
  sfx.shot = function (w) {
    w = w || {};
    if (fmPlayNewShot(w)) { fmShellDrop(w); return; }
    if (fmIsGrenadeLauncher(w) && fmPlayExtra("granada_tiro", { volume: .75 })) return;
    if (FM_RIFLE_LOOKS.has(w.look) && fmPlayExtra("fuzil_tiro", { volume: .72, rate: .96 + Math.random() * .08 })) { fmShellDrop(w); return; }
    if (w.melee && FM_BLADE_LOOKS.has(w.look) && fmPlayExtra("faca", { volume: .55, rate: .94 + Math.random() * .12 })) return;
    prevShot(w);
    if (!w.melee && !w.fists) fmShellDrop(w);
  };
  sfx.reload = function () {
    const w = typeof curW === "function" ? curW() : {};
    if (fmIsGrenadeLauncher(w) && fmPlayExtra("granada_recarga", { volume: .7 })) return;
    if (FM_RIFLE_RELOAD_LOOKS.has(w.look) && fmPlayExtra("fuzil_recarga", { volume: .7 })) return;
    prevReload();
  };
})();
// cartucho vazio caindo no chão logo depois do tiro (rajadas não empilham o som)
function fmShellDrop(w) {
  if (!w || w.melee || w.fists || w.infinite || w.look === "crossbow" || w.look === "flamer" || fmIsGrenadeLauncher(w)) return;
  const now = performance.now();
  if (now - FM_EXTRA.lastShell < 220) return;
  FM_EXTRA.lastShell = now;
  fmPlayExtra("cartucho", { volume: .22, delay: .28 + Math.random() * .12, rate: .9 + Math.random() * .2 });
}

// ---- som contínuo (passos e ambiente): um laço que só aumenta ou diminui o volume ----
function fmLoop(key) {
  const ac = SND.ac, buf = FM_EXTRA.buf[key];
  if (!ac || !buf) return null;
  const src = ac.createBufferSource(), gain = ac.createGain();
  src.buffer = buf; src.loop = true; gain.gain.value = 0;
  src.connect(gain); gain.connect(SND.master); src.start();
  return { key, src, gain };
}
function fmLoopTo(l, vol) { if (l) l.gain.gain.setTargetAtTime(SND.muted ? 0 : vol, SND.ac.currentTime, .08); }
function fmLoopStop(l) { if (!l) return; fmLoopTo(l, 0); setTimeout(() => { try { l.src.stop(); } catch (_) {} l.src.disconnect(); l.gain.disconnect(); }, 400); }
// chão debaixo do personagem: grama nos quintais e praças; o resto (rua, calçada, dentro de prédio) é chão duro
function fmOnGrass() {
  if (!world || game.inside || game.hub) return false;
  const b = typeof blockAt === "function" ? blockAt(player.x, player.y) : null;
  if (!b || b.ground !== "grass") return false;
  const m = 26;                                                     // a calçada fica na borda da quadra
  return player.x > b.x + m && player.x < b.x + b.w - m && player.y > b.y + m && player.y < b.y + b.h - m;
}
function fmStepsTick() {
  if (!SND.ac || typeof game === "undefined" || !game || !player) return;
  const walking = !!player.moving && !game.menu && !game.paused && !game.over && !game.trans && !game.hub;
  const key = fmOnGrass() ? "passos_grama" : "passos";
  if (FM_EXTRA.steps && (FM_EXTRA.steps.key !== key || !walking)) { fmLoopStop(FM_EXTRA.steps); FM_EXTRA.steps = null; }
  if (!walking) return;
  if (!FM_EXTRA.steps) FM_EXTRA.steps = fmLoop(key);
  const s = FM_EXTRA.steps;
  if (!s) return;
  s.src.playbackRate.value = player.sprinting ? 1.45 : 1;          // correndo, os passos ficam mais rápidos
  fmLoopTo(s, player.sprinting ? .34 : .26);
}
function fmAmbTick() {
  if (!SND.ac || typeof game === "undefined" || !game) return;
  const t = game.inside && game.inside.type;
  const key = t === "bunker" ? "amb_bunker" : t === "hospital" ? "amb_hospital" : null;
  if (FM_EXTRA.amb && FM_EXTRA.amb.key !== key) { fmLoopStop(FM_EXTRA.amb); FM_EXTRA.amb = null; }
  if (!key) return;
  if (!FM_EXTRA.amb) FM_EXTRA.amb = fmLoop(key);
  fmLoopTo(FM_EXTRA.amb, fmAmbientVolume() * .8);
}
setInterval(() => {
  if (!SND.ac) return;
  fmExtraLoad();
  fmStepsTick();
  fmAmbTick();
}, 100);
