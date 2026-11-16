"use strict";
// O jogo só é carregado depois da autenticação e da leitura do save online.
const loginForm = document.getElementById("login");
const statusEl = document.getElementById("login-status");
const emailEl = document.getElementById("login-email");
const passwordEl = document.getElementById("login-password");
const confirmRow = document.getElementById("confirm-row");
const confirmEl = document.getElementById("login-confirm");
const importRow = document.getElementById("import-row");
const importEl = document.getElementById("import-save");
let starting = false;
let loaded = false;

function loginStatus(message, bad = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", bad);
}
function loginBusy(busy) {
  starting = busy;
  for (const button of loginForm.querySelectorAll("button")) button.disabled = busy;
}
async function startGame() {
  if (loaded) return;
  loaded = true;
  loginForm.hidden = true;
  document.querySelector(".wrap").hidden = false;
  for (const scriptTag of document.getElementById("game-scripts").content.querySelectorAll("script")) {
    const script = document.createElement("script");
    script.src = scriptTag.getAttribute("src");
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = () => reject(new Error("Erro ao carregar " + script.src));
      document.body.appendChild(script);
    });
  }
  passwordEl.value = "";
  confirmEl.value = "";
}
async function enterAccount(registering) {
  const email = emailEl.value.trim();
  const password = passwordEl.value;
  if (registering && (password.length < 8 || confirmEl.value !== password))
    throw new Error("Para criar a conta, use pelo menos 8 caracteres e confirme a mesma senha.");
  const loggedIn = await fmCloud.login(email, password, registering);
  if (!loggedIn) {
    confirmRow.hidden = true;
    confirmEl.value = "";
    loginStatus("Cadastro recebido! Confirme o e-mail enviado pelo Supabase e depois clique em Entrar.");
    return;
  }
  if (importEl.checked && !fmCloud.hasOnlineSave()) {
    const oldData = localStorage.getItem("fronteira-morta");
    if (oldData) {
      JSON.parse(oldData);
      await fmCloud.write(oldData);
    }
  }
  loginStatus("Partida carregada. Iniciando...");
  await startGame();
}
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (starting || loaded) return;
  const registering = event.submitter && event.submitter.value === "register";
  if (registering && confirmRow.hidden) {
    confirmRow.hidden = false;
    confirmEl.required = true;
    confirmEl.focus();
    loginStatus("Confirme a senha e clique novamente em Criar conta.");
    return;
  }
  loginBusy(true);
  loginStatus(registering ? "Criando conta..." : "Entrando...");
  try {
    await enterAccount(registering);
  } catch (error) {
    loginStatus(error.message || "Não foi possível entrar.", true);
  } finally {
    loginBusy(false);
  }
});
document.getElementById("resend-confirmation").addEventListener("click", async () => {
  if (starting) return;
  if (!emailEl.reportValidity()) return;
  loginBusy(true);
  loginStatus("Reenviando confirmação...");
  try {
    await fmCloud.resend(emailEl.value);
    loginStatus("Se a confirmação estiver pendente, confira o e-mail de confirmação mais recente.");
  } catch (error) {
    loginStatus(error.message, true);
  } finally {
    loginBusy(false);
  }
});

(async () => {
  try {
    if (localStorage.getItem("fronteira-morta")) importRow.hidden = false;
  } catch (_) { /* navegação privada sem acesso ao armazenamento */ }
  const urlError = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (urlError.get("error")) {
    const expired = urlError.get("error_code") === "otp_expired";
    loginStatus(expired ? "O link de confirmação expirou. Informe seu e-mail e clique em Reenviar confirmação."
      : (urlError.get("error_description") || "Não foi possível confirmar o e-mail."), true);
    history.replaceState(null, "", location.pathname + location.search);
    return;
  }
  loginStatus("Verificando sessão...");
  try {
    if (await fmCloud.resume()) {
      loginStatus("Sessão restaurada. Carregando seu jogo...");
      await startGame();
    } else {
      loginStatus("Entre ou crie sua conta para continuar o jogo.");
    }
  } catch (error) {
    loginStatus(error.message || "Não foi possível verificar a sessão.", true);
  }
})();
