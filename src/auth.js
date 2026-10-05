import {
  browserLocalPersistence,
  getIdTokenResult,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { labKitAuthConfig } from "./firebase-config.js";

const body = document.body;
const loadingView = document.querySelector("#labkit-auth-loading");
const formView = document.querySelector("#labkit-auth-form-view");
const verificationView = document.querySelector("#labkit-auth-verification");
const accessView = document.querySelector("#labkit-auth-access");
const form = document.querySelector("#labkit-auth-form");
const emailInput = document.querySelector("#labkit-auth-email");
const passwordField = document.querySelector("#labkit-auth-password-field");
const passwordInput = document.querySelector("#labkit-auth-password");
const title = document.querySelector("#labkit-auth-title");
const description = document.querySelector("#labkit-auth-description");
const submitButton = document.querySelector("#labkit-auth-submit");
const backButton = document.querySelector("#labkit-auth-back");
const forgotButton = document.querySelector("#labkit-auth-forgot");
const status = document.querySelector("#labkit-auth-status");
const verificationEmail = document.querySelector("#labkit-verification-email");
const verificationStatus = document.querySelector("#labkit-verification-status");
const resendButton = document.querySelector("#labkit-resend-verification");
const verifiedButton = document.querySelector("#labkit-check-verification");
const verificationSignOutButton = document.querySelector("#labkit-verification-sign-out");
const accessStatus = document.querySelector("#labkit-access-status");
const accessSignOutButton = document.querySelector("#labkit-access-sign-out");
const session = document.querySelector("#labkit-auth-session");
const sessionUser = document.querySelector("#labkit-session-user");
const sessionSignOutButton = document.querySelector("#labkit-session-sign-out");
const watchBanner = document.querySelector("#labkit-watch-banner");
const watchMessage = document.querySelector("#labkit-watch-message");

let mode = "signin";
let workspaceUser = null;
const accountEmail = labKitAuthConfig.accountEmail;
emailInput.value = accountEmail;

async function signOutCurrentUser() {
  await window.LabKitDataSource?.disconnect?.();
  await signOut(auth);
}

window.LabKitAuth = Object.freeze({
  signOut: signOutCurrentUser,
});

function setBodyState(state) {
  body.classList.remove(
    "auth-pending",
    "auth-signed-out",
    "auth-unverified",
    "auth-signed-in",
  );
  body.classList.add(state);
  if (state !== "auth-signed-in") watchBanner.hidden = true;
}

function renderAccess(access = window.LabKitDataSource?.access) {
  const watching = access?.canEdit === false;
  watchBanner.hidden = !watching || !body.classList.contains("auth-signed-in");
  if (watching) {
    const editor = access?.editor?.label || "Another browser";
    watchMessage.textContent = `${editor} currently has edit access. You can watch live; editing unlocks automatically after that session signs out or disconnects.`;
  }
  if (workspaceUser) {
    const accountLabel = workspaceUser.displayName || workspaceUser.email || "Signed in";
    sessionUser.textContent = watching
      ? `${accountLabel} · watching`
      : `${accountLabel} · editing`;
  }
}

function setStatus(element, message = "", isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function setBusy(isBusy) {
  for (const control of form.elements) control.disabled = isBusy;
  backButton.disabled = isBusy;
  forgotButton.disabled = isBusy;
  submitButton.dataset.defaultLabel ??= submitButton.textContent;
  submitButton.textContent = isBusy ? "Please wait…" : submitButton.dataset.defaultLabel;
}

function friendlyError(error) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      return "An account already exists for that email. Try signing in instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "The password must contain at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Firebase could not be reached. Check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in is not enabled for this Firebase project.";
    case "auth/unauthorized-continue-uri":
      return "This website is not yet listed in Firebase Authentication's authorized domains.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "The email or password is incorrect.";
    default:
      return "Firebase could not complete that request. Please try again.";
  }
}

function showForm(nextMode = "signin") {
  mode = nextMode;
  loadingView.hidden = true;
  verificationView.hidden = true;
  accessView.hidden = true;
  formView.hidden = false;
  session.hidden = true;
  setBodyState("auth-signed-out");
  setStatus(status);

  const resetting = mode === "reset";
  passwordField.hidden = resetting;
  passwordInput.required = !resetting;
  passwordInput.autocomplete = "current-password";
  forgotButton.hidden = mode !== "signin";
  backButton.hidden = mode === "signin";
  emailInput.value = accountEmail;

  if (resetting) {
    title.textContent = "Reset your password";
    description.textContent = `Firebase will send a password-reset link to ${accountEmail}.`;
    submitButton.textContent = "Send reset link";
  } else {
    title.textContent = "Welcome back";
    description.textContent = "Sign in with the dedicated HKN Lab Supplies account.";
    submitButton.textContent = "Sign in";
  }

  submitButton.dataset.defaultLabel = submitButton.textContent;
  window.setTimeout(() => (resetting ? submitButton : passwordInput).focus(), 0);
}

function showVerification(user, message = "") {
  loadingView.hidden = true;
  formView.hidden = true;
  verificationView.hidden = false;
  accessView.hidden = true;
  session.hidden = true;
  verificationEmail.textContent = user.email ?? "your email address";
  setStatus(verificationStatus, message);
  setBodyState("auth-unverified");
}

function showAccessError(error) {
  loadingView.hidden = true;
  formView.hidden = true;
  verificationView.hidden = true;
  accessView.hidden = false;
  session.hidden = true;
  accessStatus.textContent = error?.message
    || "This account could not open the shared LabKit data.";
  setBodyState("auth-signed-out");
}

function showWorkspace(user, backendUser = null, access = null) {
  loadingView.hidden = true;
  formView.hidden = true;
  verificationView.hidden = true;
  accessView.hidden = true;
  session.hidden = false;
  workspaceUser = user;
  const accountLabel = user.displayName || user.email || "Signed in";
  sessionUser.textContent = backendUser?.role
    ? `${accountLabel} · ${backendUser.role}`
    : accountLabel;
  setBodyState("auth-signed-in");
  renderAccess(access);
}

async function openWorkspace(user) {
  loadingView.hidden = false;
  loadingView.textContent = window.LabKitDataSource?.kind === "apps-script"
    ? "Loading the shared LabKit sheet…"
    : "Opening the LabKit workspace…";
  formView.hidden = true;
  verificationView.hidden = true;
  accessView.hidden = true;
  session.hidden = true;
  setBodyState("auth-pending");

  try {
    const connection = await window.LabKitDataSource?.connect?.(user);
    showWorkspace(user, connection?.user || null, connection?.access || null);
  } catch (error) {
    showAccessError(error);
  }
}

async function renderUser(user) {
  if (!user) {
    window.LabKitDataSource?.disconnect?.();
    showForm("signin");
    return;
  }

  loadingView.hidden = false;
  loadingView.textContent = "Confirming account status with Firebase…";
  formView.hidden = true;
  verificationView.hidden = true;
  accessView.hidden = true;
  session.hidden = true;
  setBodyState("auth-pending");

  try {
    const verified = await isVerifiedByFirebase(user);
    if (!verified) {
      showVerification(user);
      return;
    }
    await openWorkspace(user);
  } catch (error) {
    showVerification(user);
    setStatus(
      verificationStatus,
      "Firebase could not confirm this account’s verification status. Check your connection and try again.",
      true,
    );
  }
}

async function isVerifiedByFirebase(user) {
  await reload(user);
  const token = await getIdTokenResult(user, true);
  return user.emailVerified === true && token.claims.email_verified === true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const email = accountEmail;
  const password = passwordInput.value;
  setBusy(true);
  setStatus(status);

  try {
    if (mode === "reset") {
      await sendPasswordResetEmail(auth, email);
      showForm("signin");
      emailInput.value = email;
      setStatus(status, "If an account exists for that email, a reset link has been sent.");
      return;
    }

    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    setStatus(status, friendlyError(error), true);
  } finally {
    setBusy(false);
  }
});

forgotButton.addEventListener("click", () => showForm("reset"));
backButton.addEventListener("click", () => showForm("signin"));

resendButton.addEventListener("click", async () => {
  resendButton.disabled = true;
  setStatus(verificationStatus);
  try {
    await sendEmailVerification(auth.currentUser);
    setStatus(verificationStatus, "A new verification email has been sent.");
  } catch (error) {
    setStatus(verificationStatus, friendlyError(error), true);
  } finally {
    resendButton.disabled = false;
  }
});

verifiedButton.addEventListener("click", async () => {
  verifiedButton.disabled = true;
  setStatus(verificationStatus, "Checking verification…");
  try {
    const verified = await isVerifiedByFirebase(auth.currentUser);
    if (verified) {
      setStatus(verificationStatus, "Firebase confirmed that this email address is verified. Opening the workspace…");
      window.setTimeout(() => openWorkspace(auth.currentUser), 650);
    } else {
      setStatus(verificationStatus, "Firebase still reports this email as unverified. Open the link in the verification message first.", true);
    }
  } catch (error) {
    setStatus(verificationStatus, friendlyError(error), true);
  } finally {
    verifiedButton.disabled = false;
  }
});

verificationSignOutButton.addEventListener("click", signOutCurrentUser);
accessSignOutButton.addEventListener("click", signOutCurrentUser);
sessionSignOutButton.addEventListener("click", signOutCurrentUser);
window.addEventListener("labkit:access-changed", (event) => {
  renderAccess(event.detail?.access);
});

setPersistence(auth, browserLocalPersistence)
  .catch(() => {
    // Firebase can still use its available fallback persistence.
  })
  .finally(() => {
    onAuthStateChanged(auth, renderUser, () => {
      loadingView.textContent = "Firebase Authentication could not be reached. Refresh the page to try again.";
      loadingView.classList.add("is-error");
    });
  });
