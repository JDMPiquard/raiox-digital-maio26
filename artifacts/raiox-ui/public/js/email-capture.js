// Email capture form — shared between the waiting view and the reveal share scene.
// Wires up a single form: validates the email, calls the API, and renders
// inline success/error state. After a successful submit the form locks itself.

import { submitResultEmail, isValidEmail } from "/js/api.js";

const STORAGE_PREFIX = "raiox:email:";

export function rememberCapturedEmail(sid, email) {
  if (!sid || !email) return;
  try { sessionStorage.setItem(`${STORAGE_PREFIX}${sid}`, email); } catch {}
}
export function getCapturedEmail(sid) {
  if (!sid) return null;
  try { return sessionStorage.getItem(`${STORAGE_PREFIX}${sid}`); } catch { return null; }
}

// Wire a form -> POST email submission. `mode` is "queue" (waiting view, before
// result is ready) or "immediate" (reveal scene, after result is ready).
export function bindEmailForm({ form, input, submitBtn, msg, sid, shopName, mode }) {
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  const existing = getCapturedEmail(sid);
  if (existing) {
    input.value = existing;
    lockSubmitted(form, input, submitBtn, msg, mode === "immediate"
      ? "Enviámos para o teu email."
      : "Enviamos-te assim que estiver pronto.");
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (form.dataset.state === "submitting" || form.dataset.state === "done") return;

    const email = (input.value || "").trim();
    if (!isValidEmail(email)) {
      setMsg(msg, "Email inválido — verifica e tenta de novo.", "error");
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    input.removeAttribute("aria-invalid");

    form.dataset.state = "submitting";
    submitBtn.disabled = true;
    submitBtn.textContent = "A enviar…";
    setMsg(msg, "", null);

    try {
      const res = await submitResultEmail(sid, email, {
        immediate: mode === "immediate",
        shopName: shopName ?? undefined,
      });
      rememberCapturedEmail(sid, email);
      const sent = !!res?.sent;
      lockSubmitted(form, input, submitBtn, msg, sent
        ? "Enviámos para o teu email."
        : "Enviamos-te assim que estiver pronto.");
    } catch {
      form.dataset.state = "";
      submitBtn.disabled = false;
      submitBtn.textContent = "Quero receber";
      setMsg(msg, "Não consegui enviar — tenta de novo daqui a uns segundos.", "error");
    }
  });
}

function lockSubmitted(form, input, submitBtn, msg, text) {
  form.dataset.state = "done";
  input.disabled = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "✓ Enviado";
  setMsg(msg, text, "ok");
  ensureEditAffordance(form, input, submitBtn, msg);
}

// Inject (once) a small "alterar email" link below the form so users can
// replace a previously-captured address in the same session. Backend upsert
// already supports replacement; this just unlocks the UI.
function ensureEditAffordance(form, input, submitBtn, msg) {
  let edit = form.querySelector('[data-role="email-edit"]');
  if (!edit) {
    edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.role = "email-edit";
    edit.className = "email-edit-link";
    edit.textContent = "alterar email";
    edit.addEventListener("click", () => {
      form.dataset.state = "";
      input.disabled = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Quero receber";
      setMsg(msg, "", null);
      edit.hidden = true;
      input.focus();
      input.select?.();
    });
    form.appendChild(edit);
  }
  edit.hidden = false;
}

function setMsg(el, text, kind) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("is-error", kind === "error");
  el.classList.toggle("is-ok", kind === "ok");
}
