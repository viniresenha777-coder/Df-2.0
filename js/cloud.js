"use strict";
// Conta e progresso online do Fronteira Morta 2.0.
// Chave publishable: pode estar no navegador; NUNCA usar service_role aqui.
const fmCloud = (() => {
  const URL = "https://udoxuzyvyuxrqektdrxf.supabase.co";
  const KEY = "sb_publishable_8serkqz1z5k9fZLnDxMNlQ_hv_PF88z";
  const client = window.supabase && window.supabase.createClient(URL, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
      storageKey: "fronteira-morta-df20-auth" }
  });
  let user = null;
  let snapshot = null;
  let revision = null;
  let pending = Promise.resolve();

  function requireClient() {
    if (!client) throw new Error("Não foi possível carregar o serviço de login. Verifique a conexão e atualize a página.");
    return client;
  }
  function friendly(error) {
    if (!error) return new Error("Erro desconhecido");
    if (error.message && /failed to fetch|networkerror|load failed/i.test(error.message))
      return new Error("Não foi possível conectar ao Supabase. Confira se o projeto está ativo, se a URL/API Key estão corretas e se sua rede permite acesso ao Supabase.");
    if (error.code === "PGRST205" || error.code === "42P01" || error.code === "42501")
      return new Error("O banco de partidas ainda não foi configurado no Supabase. Execute o SQL de instalação.");
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
  async function openSession(account) {
    const db = requireClient();
    const { data, error } = await db.from("fm_partidas")
      .select("progresso,revisao").eq("jogador", account.id).maybeSingle();
    if (error) throw friendly(error);
    user = account;
    snapshot = data ? JSON.stringify(data.progresso) : null;
    revision = data ? data.revisao : null;
    pending = Promise.resolve();
  }
  async function resume() {
    const db = requireClient();
    const { data, error } = await db.auth.getSession();
    if (error) throw friendly(error);
    if (!data.session || !data.session.user) return false;
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
    await openSession(data.user);
    return true;
  }
  function write(str) {
    if (!user) return Promise.reject(new Error("Entre na sua conta para salvar."));
    let progress;
    try { progress = JSON.parse(str); } catch (error) { return Promise.reject(error); }
    const userId = user.id;
    const operation = pending.then(async () => {
      if (!user || user.id !== userId) throw new Error("A conta mudou durante o salvamento.");
      const db = requireClient();
      const nextRevision = crypto.randomUUID();
      let result;
      if (revision) {
        result = await db.from("fm_partidas")
          .update({ progresso: progress, revisao: nextRevision })
          .eq("jogador", userId).eq("revisao", revision).select("revisao");
      } else {
        result = await db.from("fm_partidas")
          .insert({ jogador: userId, progresso: progress, revisao: nextRevision }).select("revisao");
      }
      if (result.error) throw friendly(result.error);
      if (!result.data || result.data.length !== 1 || result.data[0].revisao !== nextRevision)
        throw new Error("Esta partida foi alterada em outra aba ou dispositivo. Saia e entre novamente antes de salvar.");
      snapshot = str;
      revision = nextRevision;
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
  // Diagnóstico do caminho de rede sem tentar criar uma conta nem enviar senhas.
  async function ping() {
    try {
      const response = await fetch(URL + "/auth/v1/health", {
        method: "GET", cache: "no-store", mode: "cors",
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error("Supabase respondeu HTTP " + response.status + ".");
      return new URL(URL).hostname;
    } catch (error) {
      if (error.name === "TimeoutError")
        throw new Error("O servidor não respondeu em 10 segundos. Verifique sua rede ou bloqueadores.");
      throw friendly(error);
    }
  }
  return { resume, login, logout, resend, ping, write, read: () => snapshot,
    isActive: () => !!user, hasOnlineSave: () => revision !== null };
})();
