let directoryAmbassadors = [];
let directoryEditingId = "";

const directoryEl = (id) => document.getElementById(id);
const esc = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

function showDirectoryMessage(text, type = "ok") {
  const message = directoryEl("ambassadorDirectoryMessage");
  message.textContent = text;
  message.className = `message ${type}`;
}

function clearDirectoryForm() {
  directoryEditingId = "";
  directoryEl("ambassadorDirectoryForm").reset();
  directoryEl("ambassadorDirectoryFormTitle").textContent = "Add Ambassador";
  directoryEl("saveAmbassadorBtn").textContent = "Add Ambassador";
  directoryEl("cancelAmbassadorEditBtn").classList.add("hidden");
}

function photoMarkup(ambassador) {
  if (ambassador.photoUrl) return `<img class="ambassadorPhoto" src="${esc(ambassador.photoUrl)}" alt="${esc(ambassador.name)}" />`;
  return `<div class="ambassadorPhoto ambassadorPhotoPlaceholder" aria-label="No photo">${esc((ambassador.name || "?").slice(0, 1).toUpperCase())}</div>`;
}

function renderDirectory() {
  const term = directoryEl("ambassadorDirectorySearch").value.trim().toLowerCase();
  const matches = directoryAmbassadors.filter((ambassador) => `${ambassador.name} ${ambassador.email} ${(ambassador.state || []).join(" ")} ${(ambassador.region || []).join(" ")}`.toLowerCase().includes(term));
  const list = directoryEl("ambassadorDirectoryList");
  if (!matches.length) {
    list.innerHTML = `<p class="directoryEmpty">No ambassadors match this search.</p>`;
    return;
  }
  list.innerHTML = matches.map((ambassador) => `
    <article class="ambassadorCard">
      ${photoMarkup(ambassador)}
      <div class="ambassadorCardBody">
        <strong>${esc(ambassador.name || "Unnamed Ambassador")}</strong>
        ${ambassador.email ? `<span>${esc(ambassador.email)}</span>` : ""}
        <small>${esc([...(ambassador.state || []), ...(ambassador.region || [])].join(" • ") || "State and region not set")}</small>
      </div>
      <div class="ambassadorCardActions">
        <button type="button" class="miniButton" data-edit-ambassador="${esc(ambassador.id)}">Edit</button>
        <button type="button" class="miniButton dangerButton" data-delete-ambassador="${esc(ambassador.id)}" ${ambassador.bookingCount ? "disabled title=\"Has booking history\"" : ""}>Delete</button>
      </div>
    </article>
  `).join("");
}

async function loadDirectory() {
  showDirectoryMessage("Loading ambassadors...");
  try {
    const response = await fetch(`/api/ambassador-management?refresh=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load ambassadors.");
    directoryAmbassadors = data.ambassadors || [];
    renderDirectory();
    directoryEl("ambassadorDirectoryMessage").className = "message hidden";
  } catch (error) {
    showDirectoryMessage(error.message, "error");
  }
}

function editDirectoryAmbassador(id) {
  const ambassador = directoryAmbassadors.find((item) => item.id === id);
  if (!ambassador) return;
  directoryEditingId = id;
  directoryEl("ambassadorName").value = ambassador.name || "";
  directoryEl("ambassadorEmail").value = ambassador.email || "";
  directoryEl("ambassadorState").value = (ambassador.state || []).join(", ");
  directoryEl("ambassadorRegion").value = (ambassador.region || []).join(", ");
  directoryEl("ambassadorPhotoUrl").value = ambassador.photoUrl || "";
  directoryEl("ambassadorDirectoryFormTitle").textContent = "Edit Ambassador";
  directoryEl("saveAmbassadorBtn").textContent = "Save Changes";
  directoryEl("cancelAmbassadorEditBtn").classList.remove("hidden");
  directoryEl("ambassadorDirectoryForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveDirectoryAmbassador(event) {
  event.preventDefault();
  const payload = {
    name: directoryEl("ambassadorName").value,
    email: directoryEl("ambassadorEmail").value,
    state: directoryEl("ambassadorState").value,
    region: directoryEl("ambassadorRegion").value,
    photoUrl: directoryEl("ambassadorPhotoUrl").value
  };
  if (directoryEditingId) payload.id = directoryEditingId;
  const button = directoryEl("saveAmbassadorBtn");
  button.disabled = true;
  showDirectoryMessage(directoryEditingId ? "Saving ambassador..." : "Adding ambassador...");
  try {
    const response = await fetch("/api/ambassador-management", { method: directoryEditingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save ambassador.");
    clearDirectoryForm();
    await loadDirectory();
    showDirectoryMessage("Ambassador saved.");
  } catch (error) {
    showDirectoryMessage(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function deleteDirectoryAmbassador(id) {
  const ambassador = directoryAmbassadors.find((item) => item.id === id);
  if (!ambassador || !confirm(`Delete ${ambassador.name}? This cannot be undone.`)) return;
  try {
    const response = await fetch("/api/ambassador-management", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not delete ambassador.");
    await loadDirectory();
    showDirectoryMessage("Ambassador deleted.");
  } catch (error) {
    showDirectoryMessage(error.message, "error");
  }
}

function initAmbassadorDirectory() {
  directoryEl("ambassadorTab")?.addEventListener("click", () => {
    document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    directoryEl("ambassadorDirectoryPage").classList.add("active");
    directoryEl("ambassadorTab").classList.add("active");
    loadDirectory();
  });
  directoryEl("ambassadorDirectorySearch")?.addEventListener("input", renderDirectory);
  directoryEl("ambassadorDirectoryForm")?.addEventListener("submit", saveDirectoryAmbassador);
  directoryEl("cancelAmbassadorEditBtn")?.addEventListener("click", clearDirectoryForm);
  directoryEl("ambassadorDirectoryList")?.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-ambassador]");
    const remove = event.target.closest("[data-delete-ambassador]");
    if (edit) editDirectoryAmbassador(edit.dataset.editAmbassador);
    if (remove && !remove.disabled) deleteDirectoryAmbassador(remove.dataset.deleteAmbassador);
  });
}

initAmbassadorDirectory();
