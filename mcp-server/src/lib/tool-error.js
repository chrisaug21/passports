// Wraps a tool handler so any unexpected failure (a Supabase outage, a
// malformed query, a connection that needs reconnecting) reaches the MCP
// client as a plain, generic message instead of raw internal error text —
// this app's "never reference Supabase in user-facing errors" rule applies
// on this surface too, and a raw error class isn't something a client can
// safely act on anyway. A deliberate `return { isError: true, ... }` inside
// a handler (e.g. "trip not found") is unaffected — this only catches throws.
function withToolErrorHandling(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error("mcp tool failed:", error);
      const text = error.needsReconnect
        ? "Your Passports connection needs to be reconnected — open Settings → Connected Apps in the app, reconnect, and try again."
        : "Could not load that data right now. Try again in a moment.";
      return { isError: true, content: [{ type: "text", text }] };
    }
  };
}

module.exports = { withToolErrorHandling };
