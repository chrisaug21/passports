import { getSupabase } from "../../lib/supabase.js";
import { getSession } from "../../services/auth-service.js";
import { showToast } from "./toast.js";

function getConnectParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    clientId: params.get("client_id") || "",
    redirectUri: params.get("redirect_uri") || "",
    state: params.get("state") || "",
    codeChallenge: params.get("code_challenge") || "",
    codeChallengeMethod: params.get("code_challenge_method") || "S256",
  };
}

export function renderMcpConnectPage() {
  return `
    <section class="auth-page">
      <section class="auth-layout auth-layout--single">
        <section class="panel auth-panel" id="mcp-connect-panel">
          <p class="eyebrow">Connect AI Assistant</p>
          <h2 class="mcp-connect__title" id="mcp-connect-title">Loading…</h2>
          <p class="muted" id="mcp-connect-copy"></p>
          <div class="mcp-connect__actions" id="mcp-connect-actions"></div>
        </section>
      </section>
    </section>
  `;
}

// The router calls this without awaiting it, so an error thrown in here has
// nowhere to surface: the page just sits on "Loading…" forever with no clue
// what happened. That cost hours of debugging once. Everything real lives in
// renderConnectPrompt; this wrapper guarantees a failure is always visible.
export async function wireMcpConnectPage() {
  try {
    await renderConnectPrompt();
  } catch (error) {
    console.error("Connect page failed to load:", error);
    const titleEl = document.querySelector("#mcp-connect-title");
    const copyEl = document.querySelector("#mcp-connect-copy");
    if (titleEl) titleEl.textContent = "Something went wrong.";
    if (copyEl) {
      copyEl.textContent =
        "We couldn't load this connection request. Close this window and try connecting again.";
    }
  }
}

async function renderConnectPrompt() {
  const { clientId, redirectUri, state, codeChallenge, codeChallengeMethod } = getConnectParams();
  const titleEl = document.querySelector("#mcp-connect-title");
  const copyEl = document.querySelector("#mcp-connect-copy");
  const actionsEl = document.querySelector("#mcp-connect-actions");

  if (!clientId || !redirectUri || !codeChallenge) {
    titleEl.textContent = "This connection link isn't valid.";
    copyEl.textContent = "Ask the app you're connecting from to try adding this connector again.";
    return;
  }

  // try/catch, not .catch(): the object .rpc() returns is a thenable, not a
  // Promise — it defines then() and nothing else. Calling .catch() on it threw
  // TypeError before the request was ever sent, which is why no network call
  // for this RPC appeared in the logs and the page hung on "Loading…".
  let redirectAllowed = false;
  try {
    const { data, error } = await getSupabase()
      .rpc("mcp_is_redirect_uri_allowed", { p_client_id: clientId, p_redirect_uri: redirectUri });
    redirectAllowed = !error && data === true;
  } catch (error) {
    console.error("Could not check the redirect address:", error);
  }

  if (!redirectAllowed) {
    titleEl.textContent = "This connection link isn't valid.";
    copyEl.textContent = "The address this link would send you back to isn't one this app registered. Ask it to try adding this connector again.";
    return;
  }

  let clientName = "An AI assistant";
  try {
    const { data, error } = await getSupabase().rpc("mcp_get_client_name", { p_client_id: clientId });
    if (!error && data) {
      clientName = data;
    }
  } catch {
    // fall back to the generic label below
  }

  titleEl.textContent = `Connect ${clientName}?`;
  copyEl.textContent = `${clientName} will be able to read and, in a future update, suggest changes to your trips — using your own account, the same as if you were using the app yourself. You can revoke this anytime from Settings.`;

  actionsEl.innerHTML = `
    <button class="button" id="mcp-connect-allow" type="button">Allow</button>
    <button class="button button--secondary" id="mcp-connect-deny" type="button">Deny</button>
  `;

  document.querySelector("#mcp-connect-deny")?.addEventListener("click", () => {
    redirectWithDenial(redirectUri, state);
  });

  document.querySelector("#mcp-connect-allow")?.addEventListener("click", async () => {
    const allowButton = document.querySelector("#mcp-connect-allow");
    allowButton.disabled = true;
    allowButton.textContent = "Connecting…";

    try {
      const session = await getSession();
      if (!session) {
        throw new Error("Your session expired. Please sign in again.");
      }

      const response = await fetch("/api/mcp-oauth-approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          supabaseAccessToken: session.access_token,
          supabaseRefreshToken: session.refresh_token,
          clientId,
          clientName,
          redirectUri,
          codeChallenge,
          codeChallengeMethod,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.code) {
        throw new Error(result.error || "Could not complete the connection.");
      }

      const target = new URL(redirectUri);
      target.searchParams.set("code", result.code);
      if (state) target.searchParams.set("state", state);
      window.location.href = target.toString();
    } catch (error) {
      console.error(error);
      showToast(error.message || "Something went wrong. Please try again.", "error");
      allowButton.disabled = false;
      allowButton.textContent = "Allow";
    }
  });
}

function redirectWithDenial(redirectUri, state) {
  try {
    const target = new URL(redirectUri);
    target.searchParams.set("error", "access_denied");
    if (state) target.searchParams.set("state", state);
    window.location.href = target.toString();
  } catch {
    window.location.href = "/app";
  }
}
