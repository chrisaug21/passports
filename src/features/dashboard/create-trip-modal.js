export function renderCreateTripModal({ isSubmitting }) {
  return `
    <div class="modal-shell is-hidden" id="create-trip-modal" aria-hidden="true">
      <div class="modal-backdrop" data-close-create-trip></div>
      <section class="panel modal-card">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">New Trip</p>
            <h3>Create a trip shell</h3>
          </div>
          <button class="icon-button" id="close-create-trip-modal" type="button" aria-label="Close create trip form">×</button>
        </div>

        <form class="create-trip-form" id="create-trip-form">
          <label class="field">
            <span>Trip Title</span>
            <input name="title" type="text" maxlength="120" placeholder="Spain 2026" required />
          </label>

          <label class="field">
            <span>Description</span>
            <input name="description" type="text" maxlength="160" placeholder="Optional short note" />
          </label>

          <label class="field">
            <span>Trip Length</span>
            <input name="tripLength" type="number" min="1" max="60" value="7" required />
          </label>

          <label class="field">
            <span>Start Date</span>
            <input name="startDate" type="date" />
          </label>

          <div class="modal-card__actions">
            <button class="button button--secondary" id="cancel-create-trip" type="button">Cancel</button>
            <button class="button" type="submit" ${isSubmitting ? "disabled" : ""}>
              ${isSubmitting ? "Creating…" : "Create Trip"}
            </button>
          </div>
        </form>
      </section>
    </div>
  `;
}

export function wireCreateTripModal({ onSubmit }) {
  const modal = document.querySelector("#create-trip-modal");
  const form = document.querySelector("#create-trip-form");

  const closeModal = () => {
    modal?.classList.add("is-hidden");
  };

  document.querySelector("#close-create-trip-modal")?.addEventListener("click", closeModal);
  document.querySelector("#cancel-create-trip")?.addEventListener("click", closeModal);
  document.querySelector("[data-close-create-trip]")?.addEventListener("click", closeModal);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);

    const wasSuccessful = await onSubmit({
      title: String(formData.get("title") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      tripLength: String(formData.get("tripLength") || "1"),
      startDate: String(formData.get("startDate") || "").trim(),
    });

    if (wasSuccessful) {
      form.reset();
      form.querySelector("input[name='tripLength']").value = "7";
      closeModal();
    }
  });
}
