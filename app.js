"use strict";

const EXPERIENCE_CONFIG = Object.freeze({
  passwordSha256: "53756a188511e73d7c54d6c9df55f382d298a3f73dd278aa9cf25127d582d344",
  sessionKey: "writepath_review_authenticated",
  attemptKey: "writepath_review_attempts",
  lockKey: "writepath_review_locked_until",
  maxAttempts: 5,
  lockDurationMs: 60_000,
  backupUrl: "http://git.writepath.art/",
  axureEntryCandidates: [
    "./prototype-viewer.html",
    "./prototype/首页.html",
    "./prototype/index.html",
    "./prototype/start.html"
  ]
});

const form = document.querySelector("#login-form");
const passwordInput = document.querySelector("#password");
const submitButton = document.querySelector("#submit-button");
const message = document.querySelector("#form-message");
const visibilityToggle = document.querySelector("#visibility-toggle");
const backupLink = document.querySelector("#backup-link");

let lockTimer = null;

function getSessionNumber(key) {
  const parsed = Number.parseInt(sessionStorage.getItem(key) || "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setMessage(text, type = "error") {
  message.textContent = text;
  message.classList.toggle("success", type === "success");
}

function setLockedState(lockedUntil) {
  const remainingMs = lockedUntil - Date.now();
  if (remainingMs <= 0) {
    sessionStorage.removeItem(EXPERIENCE_CONFIG.lockKey);
    sessionStorage.removeItem(EXPERIENCE_CONFIG.attemptKey);
    passwordInput.disabled = false;
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "进入体验";
    setMessage("");
    if (lockTimer) {
      window.clearInterval(lockTimer);
      lockTimer = null;
    }
    return;
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  passwordInput.disabled = true;
  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = `请等待 ${remainingSeconds} 秒`;
  setMessage(`连续输入错误次数过多，请在 ${remainingSeconds} 秒后重试。`);
}

function startLockCountdown(lockedUntil) {
  setLockedState(lockedUntil);
  if (lockTimer) window.clearInterval(lockTimer);
  lockTimer = window.setInterval(() => setLockedState(lockedUntil), 250);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function resolveAxureEntry() {
  for (const candidate of EXPERIENCE_CONFIG.axureEntryCandidates) {
    try {
      const response = await fetch(candidate, { method: "HEAD", cache: "no-store" });
      if (response.ok) return candidate;
    } catch {
      // 入口不可用时继续检查下一项。
    }
  }
  return EXPERIENCE_CONFIG.axureEntryCandidates[0];
}

async function enterExperience() {
  setMessage("验证成功，正在进入体验…", "success");
  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "正在进入";
  const entry = await resolveAxureEntry();
  window.location.assign(entry);
}

visibilityToggle.addEventListener("click", () => {
  const shouldShow = passwordInput.type === "password";
  passwordInput.type = shouldShow ? "text" : "password";
  visibilityToggle.setAttribute("aria-pressed", String(shouldShow));
  visibilityToggle.setAttribute("aria-label", shouldShow ? "隐藏密码" : "显示密码");
  passwordInput.focus();
});

passwordInput.addEventListener("input", () => {
  passwordInput.removeAttribute("aria-invalid");
  if (!getSessionNumber(EXPERIENCE_CONFIG.lockKey)) setMessage("");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const lockedUntil = getSessionNumber(EXPERIENCE_CONFIG.lockKey);
  if (lockedUntil > Date.now()) {
    startLockCountdown(lockedUntil);
    return;
  }

  const candidate = passwordInput.value;
  if (!candidate) {
    passwordInput.setAttribute("aria-invalid", "true");
    setMessage("请输入访问密码。");
    passwordInput.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "正在验证";

  try {
    const digest = await sha256(candidate);
    if (digest === EXPERIENCE_CONFIG.passwordSha256) {
      sessionStorage.setItem(EXPERIENCE_CONFIG.sessionKey, "1");
      sessionStorage.removeItem(EXPERIENCE_CONFIG.attemptKey);
      sessionStorage.removeItem(EXPERIENCE_CONFIG.lockKey);
      await enterExperience();
      return;
    }

    const attempts = getSessionNumber(EXPERIENCE_CONFIG.attemptKey) + 1;
    sessionStorage.setItem(EXPERIENCE_CONFIG.attemptKey, String(attempts));
    passwordInput.value = "";
    passwordInput.setAttribute("aria-invalid", "true");

    if (attempts >= EXPERIENCE_CONFIG.maxAttempts) {
      const newLockedUntil = Date.now() + EXPERIENCE_CONFIG.lockDurationMs;
      sessionStorage.setItem(EXPERIENCE_CONFIG.lockKey, String(newLockedUntil));
      startLockCountdown(newLockedUntil);
    } else {
      const remaining = EXPERIENCE_CONFIG.maxAttempts - attempts;
      setMessage(`密码不正确，还可尝试 ${remaining} 次。`);
      submitButton.disabled = false;
      submitButton.querySelector("span").textContent = "进入体验";
      passwordInput.focus();
    }
  } catch {
    setMessage("当前浏览器无法完成安全验证，请使用最新版 Chrome 或 Edge。" );
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "进入体验";
  }
});

backupLink.addEventListener("click", (event) => {
  if (!EXPERIENCE_CONFIG.backupUrl) {
    event.preventDefault();
    setMessage("备用体验入口暂未配置，请联系赛事工作人员。" );
    return;
  }
});

if (EXPERIENCE_CONFIG.backupUrl) {
  backupLink.href = EXPERIENCE_CONFIG.backupUrl;
}

const activeLock = getSessionNumber(EXPERIENCE_CONFIG.lockKey);
if (activeLock > Date.now()) startLockCountdown(activeLock);

if (sessionStorage.getItem(EXPERIENCE_CONFIG.sessionKey) === "1") {
  enterExperience();
}
