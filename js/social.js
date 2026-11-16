"use strict";
// Fronteira Morta 2.0: presença online e amizades. Posição é apenas visual:
// combate, economia e saves continuam individuais (não há servidor de combate).
const fmSocial = (() => {
  let channel = null, timer = null, userId = null, peers = new Map();
  let friends = [], profiles = new Map(), busy = false, connecting = null;
  const db = () => (typeof fmCloud !== "undefined" && fmCloud.socialClient ? fmCloud.socialClient() : null);
  const myself = () => (typeof fmCloud !== "undefined" && fmCloud.userId ? fmCloud.userId() : null);
  const textName = (s) => String(s || "").trim().replace(/\s+/g, " ").slice(0, 16);

  async function claimName(candidate) {
    const client = db(), uid = myself(), name = textName(candidate);
    if (!client || !uid) throw new Error("Faça login antes de criar o personagem.");
    if (name.length < 3) throw new Error("Use um nome com pelo menos três caracteres.");
    const existing = await client.from("fm_perfis").select("nome").eq("jogador", uid).maybeSingle();
    if (existing.error) throw new Error("Falha ao consultar o nome da conta: " + existing.error.message);
    if (existing.data) return existing.data.nome;
    const created = await client.from("fm_perfis").insert({ jogador: uid, nome: name }).select("nome").single();
    if (created.error) {
      if (created.error.code === "23505")
        throw new Error("Esse nome já está em uso. Escolha outro nome para o seu personagem.");
      throw new Error("Não foi possível registrar o nome: " + created.error.message);
    }
    return created.data.nome;
  }

  async function start() {
    const client = db(), uid = myself();
    if (!client || !uid || !save.name || channel || connecting) return connecting || Promise.resolve();
    connecting = (async () => {
      const registeredName = await claimName(save.name);
      if (save.name !== registeredName) {
        save.name = registeredName;
        persist(); // servidor é a fonte de verdade do nome definitivo
      }
      userId = uid;
      await refreshFriends();
      if (myself() !== uid) return;
      channel = client.channel("fm-world-online-v1", { config: { presence: { key: uid } } });
      channel.on("presence", { event: "sync" }, syncPresence);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") publish(true);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("Conexão multiplayer temporariamente indisponível.");
      });
      timer = setInterval(() => { publish(false); }, 2200);
      window.addEventListener("pagehide", stop, { once: true });
    })().catch((err) => {
      console.warn("Multiplayer não iniciado:", err);
    }).finally(() => { connecting = null; });
    return connecting;
  }

  function ownState() {
    if (!game || !player || !world || !save.name) return null;
    const pos = game.inside && game.exitPos ? game.exitPos : player;
    return {
      uid: userId, name: textName(save.name), cx: world.cell.cx, cy: world.cell.cy,
      x: Math.round(pos.x), y: Math.round(pos.y),
      angle: Number.isFinite(player.angle) ? player.angle : 0,
      skin: save.skin | 0, inside: !!(game.inside || game.hub),
      moving: !!player.moving, sent: Date.now()
    };
  }
  let lastSent = "", lastTime = 0, inflight = false;
  async function publish(force) {
    if (!channel || !userId || inflight || myself() !== userId) return;
    const state = ownState();
    if (!state) return;
    const compact = JSON.stringify([state.cx, state.cy, state.x, state.y, state.angle.toFixed(2), state.skin, state.inside, state.moving, state.name]);
    const now = Date.now();
    if (!force && compact === lastSent && now - lastTime < 14000) return;
    lastSent = compact; lastTime = now;
    inflight = true;
    try { await channel.track(state); }
    catch (error) { console.warn("Falha ao publicar posição multiplayer:", error); }
    finally { inflight = false; }
  }
  function syncPresence() {
    if (!channel) return;
    const state = channel.presenceState(), next = new Map(), now = performance.now();
    for (const group of Object.values(state)) for (const p of group) {
      if (!p || typeof p.uid !== "string" || p.uid === userId || !p.name) continue;
      if (!Number.isInteger(p.cx) || !Number.isInteger(p.cy) ||
          !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.angle)) continue;
      if (p.cx < 0 || p.cx >= MAP_W || p.cy < 0 || p.cy >= MAP_H) continue;
      const prev = peers.get(p.uid);
      const originX = prev ? interpolate(prev, now).x : p.x, originY = prev ? interpolate(prev, now).y : p.y;
      next.set(p.uid, {
        uid: p.uid, name: textName(p.name), cx: p.cx, cy: p.cy,
        x: clamp(p.x, 0, WORLD_W), y: clamp(p.y, 0, WORLD_H),
        fromX: prev && prev.cx === p.cx && prev.cy === p.cy ? originX : p.x,
        fromY: prev && prev.cx === p.cx && prev.cy === p.cy ? originY : p.y,
        at: now, angle: p.angle, skin: clamp(p.skin | 0, 0, SKINS.length - 1),
        moving: !!p.moving, inside: !!p.inside
      });
    }
    peers = next;
  }
  function interpolate(p, now) {
    const t = Math.min(1, (now - p.at) / 2000);
    return { x: p.fromX + (p.x - p.fromX) * t, y: p.fromY + (p.y - p.fromY) * t };
  }
  function online() { return Array.from(peers.values()); }
  function inSector() {
    if (!world) return [];
    const now = performance.now();
    return online().filter(p => !p.inside && p.cx === world.cell.cx && p.cy === world.cell.cy)
      .map(p => ({ ...p, ...interpolate(p, now) }));
  }
  function isFriend(uid) { return friends.some(f => f.status === "aceito" && (f.solicitante === uid || f.destinatario === uid)); }
  function friendList() {
    return friends.map(f => {
      const otherId = f.solicitante === userId ? f.destinatario : f.solicitante;
      return { ...f, otherId, name: profiles.get(otherId) || "Sobrevivente", online: peers.has(otherId), incoming: f.destinatario === userId };
    });
  }
  async function refreshFriends() {
    const client = db(), uid = myself();
    if (!client || !uid) return;
    const res = await client.from("fm_amizades")
      .select("id,solicitante,destinatario,status").order("criado_em", { ascending: false });
    if (res.error) throw new Error("Não foi possível carregar os amigos.");
    if (myself() !== uid) return;
    friends = res.data || [];
    const ids = [...new Set(friends.flatMap(f => [f.solicitante, f.destinatario]))];
    profiles = new Map();
    if (ids.length) {
      const res2 = await client.from("fm_perfis").select("jogador,nome").in("jogador", ids);
      if (!res2.error) for (const p of (res2.data || [])) profiles.set(p.jogador, p.nome);
    }
  }
  async function addFriend(name) {
    if (busy) return "Aguarde a solicitação atual.";
    busy = true;
    try {
      const candidate = textName(name);
      if (candidate.length < 3) throw new Error("Digite o nome do jogador.");
      const client = db(), uid = myself();
      if (!client || !uid) throw new Error("Você precisa estar conectado.");
      const res = await client.from("fm_perfis").select("jogador,nome").ilike("nome", candidate).limit(20);
      if (res.error) throw new Error("Não foi possível pesquisar jogadores.");
      const match = (res.data || []).find(p => p.nome.toLocaleLowerCase("pt-BR") === candidate.toLocaleLowerCase("pt-BR"));
      if (!match) throw new Error("Jogador não encontrado. Confira o nome exato.");
      if (match.jogador === uid) throw new Error("Você não pode adicionar a si mesmo.");
      await refreshFriends();
      if (friends.some(f => (f.solicitante === uid && f.destinatario === match.jogador) ||
                            (f.solicitante === match.jogador && f.destinatario === uid)))
        throw new Error("Já existe uma solicitação ou amizade com esse jogador.");
      const result = await client.from("fm_amizades").insert({ solicitante: uid, destinatario: match.jogador });
      if (result.error) throw new Error("Não foi possível enviar a solicitação: " + result.error.message);
      await refreshFriends();
      return "Solicitação enviada para " + match.nome + ".";
    } catch (err) { return err.message || "Não foi possível adicionar."; }
    finally { busy = false; }
  }
  async function acceptFriend(id) {
    const client = db(), uid = myself();
    if (!client || !uid || !friends.some(f => f.id === id && f.destinatario === uid && f.status === "pendente"))
      return "Solicitação não disponível.";
    const res = await client.from("fm_amizades").update({ status: "aceito" }).eq("id", id).eq("destinatario", uid);
    if (res.error) return "Erro ao aceitar: " + res.error.message;
    await refreshFriends();
    return "Amizade aceita!";
  }
  async function stop() {
    if (timer) clearInterval(timer);
    timer = null; userId = null; peers.clear(); friends = []; profiles.clear(); lastSent = "";
    if (channel) {
      const old = channel; channel = null;
      try { await old.untrack(); await db()?.removeChannel(old); } catch (_) {}
    }
  }
  return { start, stop, claimName, online, inSector, friendList, isFriend,
    refreshFriends, addFriend, acceptFriend };
})();

// Jogadores remotos visíveis nas ruas. Personagens desenhados com a aparência
// básica e a paleta escolhida, sem afetar o combate local.
function drawOnlinePlayer(p) {
  const skin = SKINS[p.skin] || SKINS[0];
  const walk = Math.sin(performance.now() / 160 + p.x * 0.1) * (p.moving ? 8 : 0);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ellipse(p.x + 3, p.y + 5, 15, 11);
  ctx.translate(p.x, p.y); ctx.rotate(p.angle);
  ctx.lineCap = "round";
  for (const [side, step] of [[-1, walk], [1, -walk]]) {
    ctx.strokeStyle = skin.pants || "#333";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-4, side * 5); ctx.lineTo(step, side * 5); ctx.stroke();
    ctx.fillStyle = "#201c18"; ellipse(step + 2, side * 5, 4.5, 3.5);
  }
  ctx.fillStyle = skin.jacket || "#606d50"; ellipse(0, 0, 9, 12);
  ctx.fillStyle = "#35302b"; ctx.fillRect(-12, -6, 5, 12);
  ctx.strokeStyle = skin.jacket || "#606d50"; ctx.lineWidth = 5;
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(2, side * 9); ctx.lineTo(13, side * 10); ctx.stroke();
    ctx.fillStyle = skin.skin || "#b78e6a"; circle(13, side * 10, 3);
  }
  ctx.fillStyle = skin.helmet || skin.hood || skin.cap || skin.hair || "#393532"; circle(1, 0, 8);
  ctx.fillStyle = skin.mask || skin.skin || "#b78e6a"; ellipse(5, 0, 5, 5.5);
  ctx.restore();
  hudT(p.name, p.x, p.y - 29, 11, fmSocial.isFriend(p.uid) ? "#8fe0a8" : "#73ceff", "center", true, 170);
}

function friendsKey(k) {
  if (k === "escape" || k === "u") { game.menu = null; return; }
  if (game.friendBusy) return;
  if (k === "enter") { friendsAdd(); return; }
  let s = game.friendDraft || "";
  if (k === "backspace") s = s.slice(0, -1);
  else if (game.rawKey && game.rawKey.length === 1 && /[\p{L}\p{N} _\-.]/u.test(game.rawKey) && s.length < 16)
    s += game.rawKey;
  game.friendDraft = s.replace(/^\s+/, "");
}
async function friendsAdd() {
  if (game.friendBusy) return;
  game.friendBusy = true;
  game.friendStatus = "Procurando jogador...";
  try { game.friendStatus = await fmSocial.addFriend(game.friendDraft || ""); }
  finally { game.friendBusy = false; }
}
async function friendsAccept(id) {
  game.friendStatus = await fmSocial.acceptFriend(id);
}
function openFriends() {
  game.paused = false;
  game.menu = "friends"; game.friendDraft = ""; game.friendStatus = "";
  fmSocial.refreshFriends().catch(() => { game.friendStatus = "Não foi possível atualizar a lista."; });
}
function drawFriends() {
  menuFrame("Jogadores e amigos", "Adicione sobreviventes pelo nome usado dentro do jogo");
  const mx = 60, names = fmSocial.friendList(), online = fmSocial.online();
  txt("JOGADORES ONLINE: " + (online.length + 1), mx, 113, 16, "#8fe0a8", "left", true);
  txt("Adicionar amigo pelo nome exato:", mx, 158, 15, "#e5e0c8", "left");
  ctx.fillStyle = "#161813"; rr(mx, 174, 560, 48, 8); ctx.fill();
  ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 1.5; ctx.stroke();
  txt((game.friendDraft || "") + (Math.floor(performance.now() / 550) % 2 ? "|" : ""), mx + 14, 205, 20, "#ffd96a", "left", true, 530);
  btn(632, 174, 250, 48, game.friendBusy ? "Enviando..." : "Adicionar (Enter)", friendsAdd, true, !!game.friendBusy);
  if (game.friendStatus) txt(game.friendStatus, mx, 247, 13, "#ffd96a", "left", false, 820);
  txt("AMIGOS E SOLICITAÇÕES", mx, 291, 15, "#e5e0c8", "left", true);
  if (!names.length) txt("Você ainda não tem amigos. Digite um nome acima para enviar convite.", mx, 322, 13, "#a9a58f");
  names.slice(0, 7).forEach((f, i) => {
    const y = 304 + i * 32;
    ctx.fillStyle = i % 2 ? "#191b17" : "#25251f"; rr(mx, y, 824, 29, 4); ctx.fill();
    txt(f.name, mx + 10, y + 20, 13, f.online ? "#8fe0a8" : "#e5e0c8", "left", true, 280);
    const status = f.status === "aceito" ? (f.online ? "ONLINE · amigo" : "OFFLINE · amigo") : f.incoming ? "Pedido recebido" : "Convite enviado";
    txt(status, mx + 320, y + 20, 12, "#c9c4ad");
    if (f.status === "pendente" && f.incoming) btn(mx + 674, y + 1, 140, 26, "Aceitar", () => friendsAccept(f.id), true);
  });
  const onlineNames = online.slice(0, 5).map(p => p.name).join(" · ");
  txt("Conectados: " + (onlineNames || "nenhum outro jogador online"), mx, 547, 12, "#73ceff", "left", false, 835);
  hint("Digite o nome e pressione Enter · Esc ou U fecha");
}