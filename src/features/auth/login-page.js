import { signIn, signUp } from "../../services/auth-service.js";
import { showToast } from "../shared/toast.js";

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
            <p class="field-hint">Use at least 8 characters. If email confirmation is enabled in Supabase, you may need to confirm your address before signing in.</p>
            <button class="button auth-form__submit" type="submit">Create Account</button>
          </form>
        </section>
      </section>
      <section class="auth-marketing" aria-labelledby="auth-marketing-title">
        <div class="auth-marketing__inner">
          <div class="auth-marketing__header">
            <p class="eyebrow">Why Passports</p>
            <h3 class="auth-marketing__title" id="auth-marketing-title">A lighter way to shape the trip before, during, and after you go.</h3>
          </div>
          <div class="auth-marketing__grid">
            <article class="auth-feature">
              <p class="auth-feature__icon" aria-hidden="true">🗺️</p>
              <h4 class="auth-feature__title">Plan the whole trip</h4>
              <p class="auth-feature__copy">Organize every base, day, and activity in one place. Build the itinerary before you book anything.</p>
            </article>
            <article class="auth-feature">
              <p class="auth-feature__icon" aria-hidden="true">📸</p>
              <h4 class="auth-feature__title">Keep the memory</h4>
              <p class="auth-feature__copy">Attach photos and notes as you go. When the trip is done, it becomes a beautiful diary.</p>
            </article>
            <article class="auth-feature">
              <p class="auth-feature__icon" aria-hidden="true">👫</p>
              <h4 class="auth-feature__title">Travel together</h4>
              <p class="auth-feature__copy">Invite your travel partner. Plan together, explore together, remember it together.</p>
            </article>
          </div>
          <div class="auth-marketing__cta">
            <p class="auth-marketing__cta-copy">Ready to plan your next trip?</p>
            <a class="button" href="#sign-up-form" data-auth-create-account>Create account</a>
          </div>
        </div>
      </section>
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

    submitButton.disabled = true;
    submitButton.textContent = "Creating…";

    try {
      await signUp({
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || ""),
      });
      showToast("Account created. If confirmation is enabled, check your email next.", "success");
      setMode("sign-in");
    } catch (error) {
      console.error(error);
      showToast(getAuthErrorMessage(error), "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Create Account";
    }
  });
}

function getAuthErrorMessage(error) {
  const message = error?.message || "Something went wrong.";

  if (message.toLowerCase().includes("invalid login credentials")) {
    return "That email or password did not match.";
  }

  if (message.toLowerCase().includes("email not confirmed")) {
    return "Your email is not confirmed yet. Check your inbox and try again.";
  }

  return message;
}
