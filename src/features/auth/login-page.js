import { signIn, signUp } from "../../services/auth-service.js";
import { checkInviteCode, fetchSignupPolicy } from "../../services/signup-service.js";
import { showToast } from "../shared/toast.js";
import { INVITE_PREFILL_KEY, LOGIN_START_MODE_KEY } from "../../config/constants.js";
import { pickHeroPhoto } from "../../config/hero-photos.js";

const PASSWORD_MIN_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function renderLoginPage() {
  return `
    <section class="auth-page">
      <section class="auth-layout">
        <section class="panel hero-panel" style="--auth-hero-image: url('${pickHeroPhoto()}')">
          <p class="eyebrow">Travel Planner + Diary</p>
          <h2 class="hero-panel__title">Build the trip first. Keep the memory forever.</h2>
          <p class="muted">Sign in to start planning trips, or create an account if this is your first time here.</p>
        </section>
        <section class="panel auth-panel">
          <div class="auth-toggle" role="tablist" aria-label="Authentication mode">
            <button class="auth-toggle__button is-active" id="show-sign-in" type="button">Sign In</button>
            <button class="auth-toggle__button" id="show-sign-up" type="button">Create Account</button>
          </div>

          <form class="auth-form" id="sign-in-form">
            <label class="field">
              <span>Email</span>
              <input id="sign-in-email" name="email" type="email" autocomplete="email" required />
            </label>
            <label class="field">
              <span>Password</span>
              <input id="sign-in-password" name="password" type="password" autocomplete="current-password" required />
            </label>
            <button class="button auth-form__submit" type="submit">Sign In</button>
          </form>

          <form class="auth-form is-hidden" id="sign-up-form" novalidate>
            <div class="field" data-field="email">
              <label for="sign-up-email">Email</label>
              <input id="sign-up-email" name="email" type="email" autocomplete="email" aria-describedby="sign-up-email-error" required />
              <p class="field-error" id="sign-up-email-error" role="alert" hidden></p>
            </div>
            <div class="field" data-field="password">
              <label for="sign-up-password">Password</label>
              <input id="sign-up-password" name="password" type="password" autocomplete="new-password" aria-describedby="password-rules sign-up-password-error" required />
              <ul class="password-rules" id="password-rules">
                <li data-rule="length">At least ${PASSWORD_MIN_LENGTH} characters</li>
              </ul>
              <p class="field-error" id="sign-up-password-error" role="alert" hidden></p>
            </div>
            <div class="field is-hidden" id="invite-code-field" data-field="inviteCode">
              <label for="sign-up-invite-code">Invite code</label>
              <input id="sign-up-invite-code" name="inviteCode" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="invite-code-hint sign-up-invite-error" />
              <p class="field-hint" id="invite-code-hint">Passports is invite-only right now.</p>
              <p class="field-error" id="sign-up-invite-error" role="alert" hidden></p>
            </div>
            <button class="button auth-form__submit" type="submit">Create Account</button>
          </form>
        </section>
      </section>
      <section class="auth-marketing" aria-labelledby="auth-marketing-title">
        <div class="auth-marketing__inner">
          <div class="auth-marketing__header">
            <p class="eyebrow">Why Passports</p>
            <h3 class="auth-marketing__title" id="auth-marketing-title">Plan it. Live it. Remember it.</h3>
          </div>
          <div class="auth-marketing__grid">
            <article class="auth-feature">
              <div class="auth-feature__header">
                <span class="auth-feature__icon" aria-hidden="true"><i data-lucide="map"></i></span>
                <h4 class="auth-feature__title">Map it all out</h4>
              </div>
              <p class="auth-feature__copy">Every base, day, and activity in one place — before you even book a flight. Build the full itinerary and adjust as plans evolve.</p>
            </article>
            <article class="auth-feature">
              <div class="auth-feature__header">
                <span class="auth-feature__icon" aria-hidden="true"><i data-lucide="file-text"></i></span>
                <h4 class="auth-feature__title">Log it as you go</h4>
              </div>
              <p class="auth-feature__copy">Add notes and photos as you go. It's a travel journal that lives alongside your plan, in the same place you built the trip.</p>
            </article>
            <article class="auth-feature">
              <div class="auth-feature__header">
                <span class="auth-feature__icon" aria-hidden="true"><i data-lucide="users"></i></span>
                <h4 class="auth-feature__title">Bring someone along</h4>
              </div>
              <p class="auth-feature__copy">Share the planning, share the adventure. Invite anyone joining the trip — they can view the plan, add ideas, and relive it with you.</p>
            </article>
          </div>
          <div class="auth-marketing__cta">
            <div class="auth-marketing__cta-content">
              <p class="auth-marketing__cta-copy">Ready to plan your next trip?</p>
            </div>
            <a class="button auth-marketing__cta-button" href="#sign-up-form" data-auth-create-account>Create account</a>
          </div>
        </div>
      </section>
      <footer class="auth-built-by">
        Built by <a href="https://chrisaug.com" target="_blank" rel="noopener">Chris Augustine</a> · © ${new Date().getFullYear()}
      </footer>
    </section>
  `;
}

export function wireLoginPage() {
  const signInForm = document.querySelector("#sign-in-form");
  const signUpForm = document.querySelector("#sign-up-form");
  const showSignInButton = document.querySelector("#show-sign-in");
  const showSignUpButton = document.querySelector("#show-sign-up");
  const createAccountLink = document.querySelector("[data-auth-create-account]");

  const setMode = (mode) => {
    const showingSignIn = mode === "sign-in";

    signInForm?.classList.toggle("is-hidden", !showingSignIn);
    signUpForm?.classList.toggle("is-hidden", showingSignIn);
    showSignInButton?.classList.toggle("is-active", showingSignIn);
    showSignUpButton?.classList.toggle("is-active", !showingSignIn);
  };

  try {
    if (sessionStorage.getItem(LOGIN_START_MODE_KEY) === "sign-up") setMode("sign-up");
    sessionStorage.removeItem(LOGIN_START_MODE_KEY);
  } catch {
    // Storage unavailable: the page just opens on Sign In.
  }

  const inviteField = wireInviteCodeField(setMode);
  wireSignUpValidation();

  showSignInButton?.addEventListener("click", () => setMode("sign-in"));
  showSignUpButton?.addEventListener("click", () => setMode("sign-up"));
  createAccountLink?.addEventListener("click", (event) => {
    event.preventDefault();
    setMode("sign-up");
    signUpForm?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelector("#sign-up-email")?.focus();
  });

  signInForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = signInForm.querySelector('button[type="submit"]');
    const formData = new FormData(signInForm);

    submitButton.disabled = true;
    submitButton.textContent = "Signing In…";

    try {
      await signIn({
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
      });
      showToast("Signed in.", "success");
    } catch (error) {
      console.error(error);
      showToast(getAuthErrorMessage(error), "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Sign In";
    }
  });

  signUpForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Show every problem inline, next to the field, before anything is sent.
    if (!validateSignUpForm()) return;

    const submitButton = signUpForm.querySelector('button[type="submit"]');
    const formData = new FormData(signUpForm);
    const inviteCode = String(formData.get("inviteCode") || "").trim();

    submitButton.disabled = true;
    submitButton.textContent = "Creating…";

    try {
      // A friendly check before the sign-up itself. The database is what
      // really enforces the rule; this just explains a rejection clearly.
      if (inviteCode) {
        const check = await checkInviteCode(inviteCode);
        if (!check.valid) {
          setFieldError("inviteCode", getInviteCodeMessage(check));
          return;
        }
      }

      const { hasSession } = await signUp({
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
        inviteCode,
      });

      if (hasSession) {
        // Signed in straight away; the app takes it from here.
        showToast("Account created. Welcome to Passports!", "success");
      } else {
        showToast("Account created. Check your email to confirm your address, then sign in.", "success");
        setMode("sign-in");
      }
    } catch (error) {
      console.error(error);
      // The auth service reports ANY failure while creating the account as a
      // generic database error, so only treat it as an invite problem when
      // invites are actually required right now (the policy may have changed
      // since the page loaded). Otherwise it's something else: say so plainly.
      if (isInviteRejection(error) && (await fetchSignupPolicy()).requiresInvite) {
        inviteField.show();
        setFieldError("inviteCode", inviteCode ? "That invite code just ran out. Ask for a new one." : "Passports is invite-only right now. Enter an invite code to create an account.");
        document.querySelector("#sign-up-invite-code")?.focus();
      } else {
        showToast(getAuthErrorMessage(error), "error");
      }
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Create Account";
    }
  });
}

// ---------------------------------------------------------------------------
// Sign-up validation: problems appear inline under the field, as you type
// (once you've left the field once), rather than only after submitting.
// ---------------------------------------------------------------------------

function getField(name) {
  return document.querySelector(`#sign-up-form [data-field="${name}"]`);
}

function setFieldError(name, message) {
  const field = getField(name);
  const input = field?.querySelector("input");
  const error = field?.querySelector(".field-error");
  if (!field || !input || !error) return;

  field.classList.toggle("is-invalid", Boolean(message));
  input.setAttribute("aria-invalid", message ? "true" : "false");
  error.textContent = message || "";
  error.hidden = !message;
}

function getPasswordError(password) {
  if (!password) return "Enter a password.";
  if (password.length < PASSWORD_MIN_LENGTH) return `Your password needs at least ${PASSWORD_MIN_LENGTH} characters.`;
  return "";
}

function getEmailError(email) {
  if (!email) return "Enter your email address.";
  if (!EMAIL_PATTERN.test(email)) return "That doesn't look like an email address.";
  return "";
}

function validateSignUpForm() {
  const emailInput = document.querySelector("#sign-up-email");
  const passwordInput = document.querySelector("#sign-up-password");
  const inviteInput = document.querySelector("#sign-up-invite-code");
  const inviteShown = !document.querySelector("#invite-code-field")?.classList.contains("is-hidden");

  const emailError = getEmailError(emailInput.value.trim());
  const passwordError = getPasswordError(passwordInput.value);
  const inviteError = inviteShown && !inviteInput.value.trim() ? "Enter your invite code." : "";

  setFieldError("email", emailError);
  setFieldError("password", passwordError);
  setFieldError("inviteCode", inviteError);

  const firstInvalid = [
    [emailError, emailInput],
    [passwordError, passwordInput],
    [inviteError, inviteInput],
  ].find(([message]) => message);
  firstInvalid?.[1].focus();
  return !firstInvalid;
}

function wireSignUpValidation() {
  const emailInput = document.querySelector("#sign-up-email");
  const passwordInput = document.querySelector("#sign-up-password");
  const inviteInput = document.querySelector("#sign-up-invite-code");
  const rule = document.querySelector('[data-rule="length"]');
  if (!emailInput || !passwordInput) return;

  // Show a field's problem once the person has left it; after that, keep it
  // current on every keystroke so the message clears the moment it's fixed.
  const wire = (input, name, getError) => {
    let touched = false;
    const check = () => setFieldError(name, getError(input.value));
    input.addEventListener("blur", () => {
      touched = true;
      check();
    });
    input.addEventListener("input", () => {
      if (touched) check();
    });
  };

  wire(emailInput, "email", (value) => getEmailError(value.trim()));
  wire(passwordInput, "password", getPasswordError);
  wire(inviteInput, "inviteCode", (value) => (value.trim() ? "" : "Enter your invite code."));

  // The requirement ticks green as soon as the password meets it.
  passwordInput.addEventListener("input", () => {
    rule?.classList.toggle("is-met", passwordInput.value.length >= PASSWORD_MIN_LENGTH);
  });
}

// ---------------------------------------------------------------------------
// Invite code: the field exists only while sign-up is invite-only. When it's
// open there is no field and no "have a code?" prompt anywhere. Campaign links
// (/login?invite=VIP) arrive through sessionStorage and just prefill it.
// ---------------------------------------------------------------------------

function wireInviteCodeField(setMode) {
  const field = document.querySelector("#invite-code-field");
  const input = document.querySelector("#sign-up-invite-code");

  const show = () => field?.classList.remove("is-hidden");

  let prefill = "";
  try {
    prefill = sessionStorage.getItem(INVITE_PREFILL_KEY) || "";
    sessionStorage.removeItem(INVITE_PREFILL_KEY);
  } catch {
    // Storage unavailable: no prefill.
  }

  void fetchSignupPolicy().then(({ requiresInvite }) => {
    if (!input || !document.body.contains(input) || !requiresInvite) return;
    show();
    if (prefill) {
      input.value = prefill;
      setMode("sign-up");
    }
  });

  return { show };
}

function getInviteCodeMessage(check) {
  if (check.rateLimited) return "You've tried a lot of codes. Please wait a few minutes and try again.";
  if (check.reason === "expired") return "That invite code has expired. Ask for a new one.";
  if (check.reason === "used_up") return "That invite code has been used up. Ask for a new one.";
  return "That invite code isn't valid. Check it and try again.";
}

// The database refused the new account because of the invite rule. The auth
// service reports that only as a generic database error.
function isInviteRejection(error) {
  const lowered = (error?.message || "").toLowerCase();
  return lowered.includes("database error") || lowered.includes("signup_requires_invite");
}

function getAuthErrorMessage(error) {
  const lowered = (error?.message || "Something went wrong.").toLowerCase();

  if (lowered.includes("invalid login credentials")) {
    return "That email or password did not match.";
  }

  if (lowered.includes("email not confirmed")) {
    return "Your email is not confirmed yet. Check your inbox and try again.";
  }

  if (lowered.includes("already registered") || lowered.includes("already been registered")) {
    return "There's already an account with that email. Try signing in instead.";
  }

  if (lowered.includes("database error")) {
    return "We couldn't create your account just now. Please try again in a moment.";
  }

  if (lowered.includes("password") && (lowered.includes("weak") || lowered.includes("should") || lowered.includes("at least"))) {
    return "That password is too easy to guess. Try a longer or less common one.";
  }

  return error?.message || "Something went wrong.";
}
