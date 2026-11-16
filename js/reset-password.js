"use strict";
// Esta página só habilita a troca de senha quando o Supabase valida
// o token de recuperação entregue ao e-mail do titular.
const recovery = window.__fmRecoveryLink || {};
const form = document.getElementById("reset-password-form");
const status = document.getElementById("reset-status");
const success = document.getElementById("reset-success");
const newPassword = document.getElementById("new-password");
const repeatPassword = document.getElementById("confirm-new-password");
let recoveryEventConfirmed = false;
let recoveryAuthorized = false;
let checking = false;
let done = false;

function showStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}
function errorMessage(error) {
  const msg = String(error && error.message || error || "");
  if (/expired|otp_expired|invalid.*(token|link)|access_denied|auth session missing/i.test(msg))
    return "Este link de recuperação expirou ou é inválido. Volte ao login e solicite outro link.";
  if (/same_password|same password|different from the old/i.test(msg))
    return "Escolha uma senha diferente da senha anterior.";
  if (/weak_password|password.*short/i.test(msg))
    return "Use uma senha mais forte, com pelo menos 8 caracteres.";
  if (/failed to fetch|networkerror|load failed/i.test(msg))
    return "Falha de conexão com o Supabase. Verifique sua internet e tente novamente.";
  return msg || "Não foi possível concluir a recuperação.";
}
async function validateRecoveryLink() {
  if (checking || recoveryAuthorized || done) return;
  if (!recoveryEventConfirmed && !recovery.token && !recovery.hasCode) return;
  checking = true;
  try {
    const current = await fmCloud.recoverySession();
    if (!current) throw new Error("Link expirado ou sessão de recuperação inválida.");
    // Não basta ter uma sessão de login comum. É preciso que a sessão tenha
    // vindo do link recebido ou do evento PASSWORD_RECOVERY do Supabase.
    const proof = recoveryEventConfirmed ||
      (typeof recovery.token === "string" && !!recovery.token &&
       current.accessToken === recovery.token);
    if (!proof) throw new Error("Link de recuperação inválido. Solicite outro e-mail.");
    recoveryAuthorized = true;
    showStatus("E-mail confirmado pelo link de recuperação. Crie uma nova senha.");
    form.hidden = false;
    newPassword.focus();
    // Não deixar tokens de autenticação na barra de endereço.
    history.replaceState(null, "", location.pathname);
    recovery.token = null;
    recovery.hasCode = false;
  } catch (error) {
    showStatus(errorMessage(error), true);
  } finally {
    checking = false;
  }
}

try {
  fmCloud.observeAuth((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session) {
      recoveryEventConfirmed = true;
      // Evita chamar outros métodos auth dentro do callback de estado.
      setTimeout(() => { void validateRecoveryLink(); }, 0);
    }
  });
} catch (error) {
  showStatus(errorMessage(error), true);
}

if (recovery.error) {
  showStatus(recovery.errorCode === "otp_expired"
    ? "Este link expirou. Volte ao login e solicite um novo e-mail de recuperação."
    : "Não foi possível confirmar este link. Volte ao login e solicite outro.", true);
  history.replaceState(null, "", location.pathname);
} else if (recovery.token || recovery.hasCode) {
  void validateRecoveryLink();
} else {
  // Se o usuário abriu esta página diretamente, não permitimos trocar senha
  // usando uma sessão normal salva no navegador.
  showStatus("Abra o link de recuperação que enviamos para o seu e-mail. Para solicitar um novo, volte ao login.", true);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!recoveryAuthorized || done) {
    showStatus("Confirme primeiro sua conta pelo link recebido no e-mail.", true);
    return;
  }
  if (newPassword.value.length < 8)
    return showStatus("A nova senha precisa ter pelo menos 8 caracteres.", true);
  if (newPassword.value !== repeatPassword.value)
    return showStatus("As duas senhas não coincidem.", true);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  showStatus("Atualizando sua senha com segurança...");
  try {
    await fmCloud.changeRecoveredPassword(newPassword.value);
    done = true;
    newPassword.value = "";
    repeatPassword.value = "";
    form.hidden = true;
    success.hidden = false;
    showStatus("Senha atualizada. Entre novamente usando a nova senha.");
  } catch (error) {
    showStatus(errorMessage(error), true);
  } finally {
    button.disabled = false;
  }
});
