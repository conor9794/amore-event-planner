(function () {
  const STORAGE_KEY = "amorePlannerLayoutMode";
  const button = document.getElementById("layoutModeToggle");

  if (!button) return;

  function preferredMode() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "desktop" || saved === "mobile") return saved;
    return window.matchMedia("(min-width: 900px)").matches ? "desktop" : "mobile";
  }

  function applyMode(mode) {
    const desktop = mode === "desktop";
    document.body.classList.toggle("desktop-mode", desktop);
    document.body.classList.toggle("mobile-mode", !desktop);
    button.textContent = desktop ? "Mobile" : "Desktop";
    button.setAttribute("aria-label", desktop ? "Switch to mobile layout" : "Switch to desktop layout");
    button.setAttribute("aria-pressed", desktop ? "true" : "false");
    localStorage.setItem(STORAGE_KEY, desktop ? "desktop" : "mobile");
  }

  applyMode(preferredMode());

  button.addEventListener("click", function () {
    applyMode(document.body.classList.contains("desktop-mode") ? "mobile" : "desktop");
  });
})();
