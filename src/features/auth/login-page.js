import { signIn, signUp } from "../../services/auth-service.js";
import { checkInviteCode, fetchSignupPolicy } from "../../services/signup-service.js";
import { showToast } from "../shared/toast.js";
import { INVITE_PREFILL_KEY, LOGIN_START_MODE_KEY } from "../../config/constants.js";

export function renderLoginPage() {
  return `
    <section class="auth-page">
      <section class="auth-layout">
        <section class="panel hero-panel">
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

          <form class="auth-form is-hidden" id="sign-up-form">
            <label class="field">
              <span>Email</span>
              <input id="sign-up-email" name="email" type="email" autocomplete="email" required />
            </label>
            <label class="field">
              <span>Password</span>
              <input id="sign-up-password" name="password" type="password" autocomplete="new-password" minlength="8" required />
            </label>
            <button class="button-link is-hidden" id="invite-code-reveal" type="button">Have an invite code?</button>
            <label class="field is-hidden" id="invite-code-field">
              <span>Invite code</span>
              <input id="sign-up-invite-code" name="inviteCode" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" />
              <small class="field-hint" id="invite-code-hint">Passports is invite-only right now.</small>
            </label>
            <p class="field-hint">Use at least 8 characters. If email confirmation is enabled in Supabase, you may need to confirm your address before signing in.</p>
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
        Built by <a href="https://chrisaug.com" target="_blank" rel="noopener">Chris Augustine</a>
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

  wireInviteCodeField(setMode);

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
          showToast(getInviteCodeMessage(check), "error");
          return;
        }
      }

      await signUp({
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
        inviteCode,
      });
      showToast("Account created. If confirmation is enabled, check your email next.", "success");
      setMode("sign-in");
    } catch (error) {
      console.error(error);
      showToast(getAuthErrorMessage(error, { inviteCode }), "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Create Account";
    }
  });
}

// Shows the invite code field: required when sign-up is invite-only, tucked
// behind "Have an invite code?" when it's open. Campaign links
// (/login?invite=VIP) arrive here through sessionStorage and just prefill it.
async function wireInviteCodeField(setMode) {
  const field = document.querySelector("#invite-code-field");
  const input = document.querySelector("#sign-up-invite-code");
  const hint = document.querySelector("#invite-code-hint");
  const reveal = document.querySelector("#invite-code-reveal");
  if (!field || !input || !reveal) return;

  let prefill = "";
  try {
    prefill = sessionStorage.getItem(INVITE_PREFILL_KEY) || "";
    sessionStorage.removeItem(INVITE_PREFILL_KEY);
  } catch {
    // Storage unavailable: no prefill.
  }

  const showField = () => {
    field.classList.remove("is-hidden");
    reveal.classList.add("is-hidden");
  };

  reveal.addEventListener("click", () => {
    showField();
    input.focus();
  });

  if (prefill) {
    input.value = prefill;
    showField();
    setMode("sign-up");
  }

  const { requiresInvite } = await fetchSignupPolicy();
  if (!document.body.contains(input)) return;

  if (requiresInvite) {
    input.required = true;
    hint.textContent = "Passports is invite-only right now.";
    showField();
  } else {
    input.required = false;
    hint.textContent = "Enter the code you were given.";
    if (!input.value) reveal.classList.remove("is-hidden");
  }
}

function getInviteCodeMessage(check) {
  if (check.rateLimited) return "You've tried a lot of codes. Please wait a few minutes and try again.";
  if (check.reason === "expired") return "That invite code has expired. Ask for a new one.";
  if (check.reason === "used_up") return "That invite code has been used up. Ask for a new one.";
  return "That invite code isn't valid. Check it and try again.";
}

function getAuthErrorMessage(error, { inviteCode = "" } = {}) {
  const message = error?.message || "Something went wrong.";
  const lowered = message.toLowerCase();

  if (lowered.includes("invalid login credentials")) {
    return "That email or password did not match.";
  }

  if (lowered.includes("email not confirmed")) {
    return "Your email is not confirmed yet. Check your inbox and try again.";
  }

  // The database refused the new account (invite gate). The auth service
  // reports that as a generic database error, so explain it in plain terms.
  if (lowered.includes("database error") || lowered.includes("signup_requires_invite")) {
    return inviteCode
      ? "That invite code just ran out. Ask for a new one."
      : "Passports is invite-only right now. Enter an invite code to create an account.";
  }

  return message;
}
