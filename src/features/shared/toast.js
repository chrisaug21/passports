export function showToast(message, variant = "default") {
  const root = document.querySelector("#toast-root");

  if (!root) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast toast--${variant}`;
  toast.textContent = message;
  root.append(toast);

  window.setTimeout(() => {
    toast.classList.add("is-leaving");
  }, 2400);

  window.setTimeout(() => {
    toast.remove();
  }, 3000);
}
