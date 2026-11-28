"use strict";
// Conta e progresso online do Fronteira Morta 2.0.
// Chave publishable: pode estar no navegador; NUNCA usar service_role aqui.
const fmCloud = (() => {
  const SUPABASE_URL = "https://udoxuzyvyuxrqektdrxf.supabase.co";
  const KEY = "sb_publishable_8serkqz1z5k9fZLnDxMNlQ_hv_PF88z";
  // Cada ABA tem o próprio login: assim dá para jogar com duas contas diferentes no mesmo navegador.
  // O login fica no sessionStorage da aba (com uma chave própria, para as abas não trocarem sessão entre si);
  // o último login também vai para o localStorage, para uma aba nova já abrir logada nele.
  const SHARED = "fronteira-morta-df20-auth";
  const TAB_KEY = (() => {
    try {
      let id = sessionStorage.getItem("fm-aba");
      if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem("fm-aba", id); }
      return SHARED + "-aba-" + id;
    } catch (e) { return SHARED; }
  })();
  const tabStorage = {
    getItem(k) {
      try {
        let v = sessionStorage.getItem(k);
        if (v == null && k === TAB_KEY) { v = localStorage.getItem(SHARED); if (v != null) sessionStorage.setItem(k, v); }
        return v;
      } catch (e) { return null; }
    },
    setItem(k, v) { try { sessionStorage.setItem(k, v); if (k === TAB_KEY) localStorage.setItem(SHARED, v); } catch (e) {} },
    removeItem(k) {
      try {
        const mine = sessionStorage.getItem(k);
        sessionStorage.removeItem(k);
        if (k === TAB_KEY && mine != null && localStorage.getItem(SHARED) === mine) localStorage.removeItem(SHARED);
      } catch (e) {}
    }
  };
  const client = window.supabase && window.supabase.createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
      storageKey: TAB_KEY, storage: tabStorage }
  });
  let user = null;
  let userIsAdmin = false;
  let ownerName = null;   // nome do personagem desta conta: um save com outro nome nunca é gravado aqui
  let snapshot = null;
  let revision = null;
  let pending = Promise.resolve();
  let retainedWallet = 0, retainedBank = 0;
  let maintenanceToken = null;

  async function checkMaintenance(session) {
    const notice = document.getElementById('maintenance');
    if (!notice || location.hostname === 'viniresenha777-coder.github.io') return;
    maintenanceToken = null;
    const token = session?.access_token;
    const response = await fetch('/api/maintenance', {
      cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (response.status === 403) {
      notice.hidden = false;
      if (token) throw new Error('O servidor está em manutenção. Tente novamente em breve.');
      return;
    }
    if (!response.ok || !['on', 'off'].includes(response.headers.get('X-FM-Maintenance')))
      throw new Error('Não foi possível verificar a disponibilidade do jogo. Tente novamente.');
    if (response.headers.get('X-FM-Maintenance') === 'on') maintenanceToken = token;
    notice.hidden = true;
  }

  async function protectedGameScript(src) {
    if (!maintenanceToken) return src;
    const response = await fetch(src, {
      cache: 'no-store', headers: { Authorization: `Bearer ${maintenanceToken}` },
    });
    if (!response.ok) throw new Error('O servidor não autorizou a abertura do jogo.');
    return URL.createObjectURL(await response.blob());
  }

  function requireClient() {
    if (!client) throw new Error("Não foi possível carregar o serviço de login. Verifique a conexão e atualize a página.");
    return client;
  }
  function friendly(error) {
    if (!error) return new Error("Erro desconhecido");
    if (error.message && /failed to fetch|networkerror|load failed/i.test(error.message))
      return new Error("Não foi possível conectar ao Supabase. Confira se o projeto está ativo, se a URL/API Key estão corretas e se sua rede permite acesso ao Supabase.");
    if (error.code === "PGRST205" || error.code === "42P01")
      return new Error("O banco de partidas ainda não foi configurado no Supabase. Execute o SQL de instalação.");
    if (error.code === "42501") return new Error("O servidor recusou a permissão desta sessão.");
    if (error.code === "23505")
      return new Error("Já existe uma partida online para essa conta. Entre novamente para carregá-la.");
    if (error.code === "user_already_exists" || /user already registered|user already exists/i.test(error.message || ""))
      return new Error("Este e-mail já está cadastrado. Clique em Entrar ou recupere sua senha.");
    if (error.message && /email not confirmed/i.test(error.message))
      return new Error("Confirme seu e-mail antes de entrar. Se o link expirou, use Reenviar confirmação.");
    if (error.message && /invalid login credentials/i.test(error.message))
      return new Error("E-mail ou senha incorretos.");
    return new Error(error.message || "Não foi possível conectar ao Supabase.");
  }
  // ---- Banimento (a regra vale no servidor: banido não lê nem grava a partida) ----
  function banMessage(b) {
    const fim = b.ate ? new Date(b.ate).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;
    return (fim ? `Esta conta está banida até ${fim}.` : "Esta conta foi banida permanentemente.") +
      (b.motivo ? ` Motivo: ${b.motivo}` : "");
  }
  async function activeBan(db, id) {
    const r = await db.from("fm_banimentos").select("ate,motivo").eq("jogador", id).maybeSingle();
    if (r.error || !r.data) return null;              // tabela ainda não criada: ninguém banido
    return !r.data.ate || new Date(r.data.ate) > new Date() ? r.data : null;
  }
  let banTimer = null;
  function watchBan() {
    clearInterval(banTimer);
    banTimer = setInterval(async () => {
      if (!user) { clearInterval(banTimer); return; }
      const b = await activeBan(requireClient(), user.id).catch(() => null);
      if (!b) return;
      clearInterval(banTimer);
      const msg = banMessage(b);
      try { await requireClient().auth.signOut({ scope: "local" }); } catch (_) {}
      user = null; userIsAdmin = false;
      alert(msg);
      location.reload();
    }, 60000);
  }
  async function rpc(name, args) {
    const { data, error } = await requireClient().rpc(name, args);
    if (error && /could not find the function|schema cache/i.test(error.message || ""))
      throw new Error("Banimento ainda não ativado no servidor: rode supabase/configurar-banimentos.sql no Supabase.");
    if (error) throw new Error(error.message || "O servidor recusou.");
    return data;
  }
  async function openSession(account) {
    const db = requireClient();
    const ban = await activeBan(db, account.id);
    if (ban) {
      await db.auth.signOut({ scope: "local" }).catch(() => {});
      throw new Error(banMessage(ban));
    }
    watchBan();
    const { data, error } = await db.from("fm_partidas")
      .select("progresso,revisao").eq("jogador", account.id).maybeSingle();
    if (error) throw friendly(error);
    // A permissão de administrador é atribuída somente no servidor.
    // Usuários novos não conseguem se promover: a tabela é somente leitura
    // e cada jogador pode consultar apenas o próprio registro.
    const adminCheck = await db.from("fm_administradores")
      .select("jogador").eq("jogador", account.id).maybeSingle();
    userIsAdmin = !adminCheck.error && !!adminCheck.data;
    if (adminCheck.error) console.warn("Sem confirmação de privilégio de administrador; acesso administrativo bloqueado.");
    user = account;
    snapshot = data ? JSON.stringify(data.progresso) : null;
    ownerName = (data && data.progresso && typeof data.progresso.name === "string" && data.progresso.name) || null;
    revision = data ? data.revisao : null;
    saleTotal = Number(data?.progresso?.saleTotal) || 0;
    pending = Promise.resolve();
    retainedWallet = retainedBank = 0;
    await saveJournal.recover(user.id, revision, writeRemote);
  }
  async function resume() {
    const db = requireClient();
    const { data, error } = await db.auth.getSession();
    if (error) throw friendly(error);
    await checkMaintenance(data.session);
    if (!data.session || !data.session.user) { user = null; userIsAdmin = false; return false; }
    await openSession(data.session.user);
    return true;
  }
  async function login(email, password, registering) {
    const db = requireClient();
    const credentials = { email: email.trim().toLowerCase(), password };
    const { data, error } = registering
      ? await db.auth.signUp({ ...credentials, options: { emailRedirectTo: location.origin + location.pathname } })
      : await db.auth.signInWithPassword(credentials);
    if (error) throw friendly(error);
    if (!data.session) return false; // cadastro com confirmação de e-mail pendente
    try {
      await checkMaintenance(data.session);
    } catch (error) {
      await db.auth.signOut({ scope: 'local' }).catch(() => {});
      throw error;
    }
    await openSession(data.user);
    return true;
  }
  let saleTotal = 0;
  async function syncSales() {
    const uid = user?.id;
    if (!uid) return null;
    const { data, error } = await requireClient().rpc("fm_correio_vendas", { client_revision: revision });
    if (error) throw friendly(error);
    if (!data || user?.id !== uid) return null;
    if (data.revision !== revision && !data.related) return null;
    revision = data.revision;
    saleTotal = Number(data.total) || 0;
    window.dispatchEvent(new CustomEvent("fm-sales", { detail: data }));
    return data;
  }
  function saleMail() {
    const result = pending.then(syncSales);
    pending = result.catch(() => {});
    return result;
  }
  let saveCount = 0, saveSequence = 0, saveFailed = false;
  function saveIndicator(state) {
    if (!document.body) return;
    let el = document.getElementById("fm-save-status");
    if (!el) {
      el = document.createElement("div");
      el.id = "fm-save-status";
      el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;bottom:12px;left:12px;z-index:98;padding:5px 9px;background:rgba(12,15,12,.9);border:1px solid currentColor;border-radius:4px;font:12px sans-serif;pointer-events:none";
      document.body.appendChild(el);
    }
    el.style.color = state === "ok" ? "#8ddd91" : state === "pending" ? "#ffd478" : "#ff8585";
    el.textContent = state === "ok" ? "✓ Progresso salvo" : state === "pending" ? "Salvando progresso..." : "Falha ao salvar — não feche o jogo";
  }
  function write(str) {
    const seq = ++saveSequence;
    saveCount++;
    saveIndicator("pending");
    return writeRemote(str).then(value => {
      if (seq === saveSequence) saveFailed = false;
      return value;
    }, error => {
      if (seq === saveSequence) saveFailed = true;
      throw error;
    }).finally(() => {
      saveCount--;
      saveIndicator(saveFailed ? "error" : saveCount ? "pending" : "ok");
    });
  }
  let lastSaveRefresh = -Infinity;
  async function writeWithSession(db, ownerId, send) {
    const first = await send();
    if (first.status !== 401) return first;
    if (performance.now() - lastSaveRefresh < 30000) return first;
    lastSaveRefresh = performance.now();
    const current = await db.auth.getSession();
    if (current.error || current.data?.session?.user?.id !== ownerId)
      throw new Error("Sessão indisponível. Mantenha o jogo aberto e entre novamente nesta conta para salvar.");
    const renewed = await db.auth.refreshSession();
    if (renewed.error || renewed.data?.session?.user?.id !== ownerId)
      throw new Error("Falha ao renovar a sessão. Mantenha o jogo aberto para tentar salvar novamente.");
    return send();
  }
  function createSaveJournal() {
    const pageId = crypto.randomUUID();
    function key(owner) { return "fm-save-pending:" + owner + ":" + pageId; }
    function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
    function put(k, entry) {
      try { localStorage.setItem(k, JSON.stringify(entry)); return true; }
      catch { return false; }
    }
    function stage(owner, base, payload) {
      const k = key(owner), previous = read(k), id = crypto.randomUUID();
      if (!put(k, { id, base, payload, at: Date.now(), flight: previous?.flight || null }))
        console.warn("Não foi possível criar a cópia local do save.");
      return { k, id };
    }
    function sending(ticket, base, next) {
      const entry = read(ticket.k);
      if (entry) put(ticket.k, { ...entry, base, flight: { id: ticket.id, next } });
    }
    function acknowledge(ticket, next) {
      const entry = read(ticket.k);
      if (!entry) return;
      if (entry.id === ticket.id) localStorage.removeItem(ticket.k);
      else put(ticket.k, { ...entry, base: next, flight: null });
    }
    async function recover(owner, revision, write) {
      const prefix = "fm-save-pending:" + owner + ":";
      let keys;
      try { keys = Object.keys(localStorage).filter(k => k.startsWith(prefix)); } catch { return; }
      const matches = [];
      for (const k of keys) {
        const e = read(k);
        if (!e) continue;
        if (e.flight?.next === revision && e.id === e.flight.id) {
          localStorage.removeItem(k);
        } else if (e.base === revision || (e.flight && e.flight.next === revision)) matches.push({k,e});
      }
      if (matches.length !== 1) {
        if (keys.some(k => read(k))) window.alert("Há uma cópia pendente neste navegador com outra revisão. Ela foi preservada para recuperação. A partida será aberta com o save do servidor.");
        return;
      }
      const {k,e} = matches[0];
      await write(e.payload, { k, id: e.id });
      if (read(k)?.id === e.id) localStorage.removeItem(k);
    }
    return { stage, sending, acknowledge, recover };
  }
  const saveJournal = createSaveJournal();
  let confirmedTime=null;
  function writeRemote(str, recoveryTicket) {
    if (!user) return Promise.reject(new Error("Entre na sua conta para salvar."));
    let progress;
    try { progress = JSON.parse(str); } catch (error) { return Promise.reject(error); }
    const userId = user.id;
    const walletAtCapture = retainedWallet, bankAtCapture = retainedBank;
    // trava: nunca gravar a partida de outro personagem nesta conta (duas contas no mesmo navegador)
    if (ownerName && progress.name && progress.name !== ownerName)
      return Promise.reject(new Error(`Esta aba está com a partida de "${progress.name}", mas a conta logada é de "${ownerName}". Nada foi salvo: recarregue a página.`));
    const ticket = recoveryTicket || saveJournal.stage(userId, revision, str);
    const operation = pending.then(async () => {
      if (!user || user.id !== userId) throw new Error("A conta mudou durante o salvamento.");
      const db = requireClient();
      const nextRevision = crypto.randomUUID();
      saveJournal.sending(ticket, revision, nextRevision);
      if (progress.run?.g) progress.run.g.money = Math.max(0, (Number(progress.run.g.money) || 0) - (retainedWallet - walletAtCapture));
      progress.bank = Math.max(0, (Number(progress.bank) || 0) - (retainedBank - bankAtCapture));
      let result;
      if (revision) {
        const saveCurrent = () => {
          const extra = saleTotal - (Number(progress.saleTotal) || 0);
          progress.bank = (Number(progress.bank) || 0) + extra;
          progress.saleTotal = saleTotal;
          return db.from("fm_partidas")
          .update({ progresso: progress, revisao: nextRevision })
          .eq("jogador", userId).eq("revisao", revision).select("revisao,progresso,atualizado_em");
        };
        result = await writeWithSession(db, userId, saveCurrent);
        if (!result.error && !result.data?.length && await syncSales()) result = await saveCurrent();
      } else {
        result = await writeWithSession(db, userId, () => db.from("fm_partidas")
          .insert({ jogador: userId, progresso: progress, revisao: nextRevision }).select("revisao,progresso,atualizado_em"));
      }
      if (result.error) throw friendly(result.error);
      if (!result.data || result.data.length !== 1 || result.data[0].revisao !== nextRevision)
        throw new Error("Esta partida foi alterada em outra aba ou dispositivo. Saia e entre novamente antes de salvar.");
      const accepted = result.data[0].progresso || progress;
      // ganho acima do limite por hora: o servidor guardou a diferença como "Bloqueado" (em análise)
      const cortadoMochila = (Number(progress.run?.g?.money) || 0) - (Number(accepted.run?.g?.money) || 0);
      const cortadoBanco = (Number(progress.bank) || 0) - (Number(accepted.bank) || 0);
      retainedWallet += Math.max(0, cortadoMochila);
      retainedBank += Math.max(0, cortadoBanco);
      if (cortadoMochila > 0 || cortadoBanco > 0)
        window.dispatchEvent(new CustomEvent("fm-dinheiro-retido", { detail: { mochila: Math.max(0, cortadoMochila), banco: Math.max(0, cortadoBanco) } }));
      snapshot = JSON.stringify(accepted);
      if (!ownerName && accepted.name) ownerName = accepted.name;
      revision = nextRevision;
      // Um trigger de validação pode alterar apenas o nível no banco.
      // Nunca confirmar um checkpoint se o servidor salvou outro nível.
      const requestedLevel = Number(progress.char && progress.char.level) || 1;
      const acceptedLevel = Number(accepted.char && accepted.char.level) || 1;
      if (requestedLevel !== acceptedLevel) {
        throw new Error("Nível NÃO salvo! Servidor manteve nível " + acceptedLevel +
          " em vez de " + requestedLevel +
          ". Seu dinheiro e itens podem ter sido salvos. Avise a administração antes de sair.");
      }
      confirmedTime = result.data[0].atualizado_em;
      saveJournal.acknowledge(ticket, nextRevision);
    });
    pending = operation.catch(() => {});
    return operation;
  }
  function marketAction(args) {
    const userId = user?.id;
    const operation = pending.then(async () => {
      if (!userId || user?.id !== userId || !revision) throw new Error("Salve a partida antes de negociar.");
      const nextRevision = crypto.randomUUID();
      const { data: result, error } = args.unidades == null
        ? await requireClient().rpc("fm_mercado_operar", { ...args, versao: revision, nova_versao: nextRevision })
        : await requireClient().rpc("fm_mercado_anunciar_quantidade", {
            local_item: args.local_item, posicao: args.posicao, preco: args.preco,
            versao: revision, nova_versao: nextRevision, unidades: args.unidades
          });
      if (error) throw new Error(error.message || "O servidor recusou a negociação.");
      if (!result?.run?.p || !Number.isFinite(result.run.g?.money)) {
        throw new Error("O Mercado Negro não confirmou a negociação. Atualize a lista antes de tentar novamente.");
      }
      revision = nextRevision;
      snapshot = JSON.stringify(result);
      return result;
    });
    pending = operation.catch(() => {});
    return operation;
  }
  async function logout() {
    // Uma falha de rede ao revogar o refresh token não deve impedir que o
    // jogador retorne à tela de login após o progresso ter sido salvo.
    await pending;
    const db = requireClient();
    try {
      const { error } = await db.auth.signOut({ scope: "local" });
      if (error) console.warn("Logout local com erro de servidor:", error.message);
    } finally {
      user = null;
      userIsAdmin = false;
      snapshot = null;
      revision = null;
    }
  }
  async function resend(email) {
    try {
      const { error } = await requireClient().auth.resend({
        type: "signup", email: email.trim().toLowerCase(),
        options: { emailRedirectTo: location.origin + location.pathname }
      });
      if (error) throw friendly(error);
    } catch (error) { throw friendly(error); }
  }
  // O Supabase envia o link para a caixa postal do titular; o navegador
  // não recebe informação sobre a existência ou não da conta.
  async function sendPasswordRecovery(email) {
    const addr = email.trim().toLowerCase();
    const redirectTo = new URL("recuperar.html", location.href).href;
    try {
      const { error } = await requireClient().auth.resetPasswordForEmail(addr, { redirectTo });
      if (error) throw friendly(error);
    } catch (error) { throw friendly(error); }
  }
  function observeAuth(callback) {
    return requireClient().auth.onAuthStateChange(callback);
  }
  async function recoverySession() {
    const db = requireClient();
    const { data, error } = await db.auth.getSession();
    if (error) throw friendly(error);
    if (!data || !data.session) return null;
    const verified = await db.auth.getUser();
    if (verified.error || !verified.data.user) return null;
    return { accessToken: data.session.access_token, user: verified.data.user };
  }
  async function changeRecoveredPassword(password) {
    const db = requireClient();
    const { error } = await db.auth.updateUser({ password });
    if (error) throw friendly(error);
    // O link de recuperação não deixa o jogo aberto em uma sessão autenticada.
    const result = await db.auth.signOut({ scope: "local" });
    if (result.error) console.warn("Senha redefinida; erro ao encerrar sessão local:", result.error.message);
    return true;
  }
  // Diagnóstico do caminho de rede sem tentar criar uma conta nem enviar senhas.
  async function ping() {
    try {
      const response = await fetch(SUPABASE_URL + "/auth/v1/health", {
        method: "GET", cache: "no-store", mode: "cors",
        headers: { apikey: KEY, Accept: "application/json" },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          throw new Error("O Supabase está acessível, mas recusou a chave de acesso (HTTP " + response.status + "). Confira a chave publicável.");
        throw new Error("Supabase respondeu HTTP " + response.status + ".");
      }
      return new URL(SUPABASE_URL).hostname;
    } catch (error) {
      if (error.name === "TimeoutError")
        throw new Error("O servidor não respondeu em 10 segundos. Verifique sua rede ou bloqueadores.");
      throw friendly(error);
    }
  }
  return { lastConfirmedAt: () => confirmedTime, resume, login, logout, resend, ping, protectedGameScript,
    sendPasswordRecovery, observeAuth, recoverySession, changeRecoveredPassword,
    write, saleMail, marketAction, read: () => snapshot, isActive: () => !!user, isAdmin: () => !!user && userIsAdmin, hasOnlineSave: () => revision !== null,
    userId: () => user ? user.id : null, socialClient: () => client,
    // administrador: o servidor confere a permissão em cada chamada
    ban: (uid, dias, motivo) => rpc("fm_banir", { alvo: uid, dias: dias || null, motivo: motivo || "" }),
    unban: (uid) => rpc("fm_desbanir", { alvo: uid }),
    bannedList: () => rpc("fm_listar_banidos", {}) };
})();
