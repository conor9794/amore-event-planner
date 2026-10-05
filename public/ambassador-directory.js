let directoryAmbassadors = [];
let directoryEditingId = "";
let directoryViewMode = localStorage.getItem("amoreAmbassadorView") || "gallery";
let selectedDirectoryAmbassadorId = "";

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

function statusText(value, yes = "Yes", no = "No") {
  return value ? yes : no;
}

function firstInitial(name) {
  return (name || "?").trim().slice(0, 1).toUpperCase();
}

function photoMarkup(ambassador, large = false) {
  const cls = large ? "ambassadorProfilePhoto" : "ambassadorGalleryPhoto";
  if (ambassador.photoUrl) return `<img class="${cls}" src="${esc(ambassador.photoUrl)}" alt="${esc(ambassador.name)}" loading="lazy" />`;
  return `<div class="${cls} ambassadorPhotoPlaceholder" aria-label="No photo">${esc(firstInitial(ambassador.name))}</div>`;
}

function getUniqueValues(key) {
  return [...new Set(directoryAmbassadors.flatMap((ambassador) => ambassador[key] || []).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function populateDirectoryFilters() {
  const state = directoryEl("ambassadorStateFilter");
  const region = directoryEl("ambassadorRegionFilter");
  const stateValue = state.value;
  const regionValue = region.value;

  state.innerHTML = '<option value="all">All states</option>' + getUniqueValues("state")
    .map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("");
  region.innerHTML = '<option value="all">All regions</option>' + getUniqueValues("region")
    .map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("");

  if ([...state.options].some((option) => option.value === stateValue)) state.value = stateValue;
  if ([...region.options].some((option) => option.value === regionValue)) region.value = regionValue;
}

function filteredAmbassadors() {
  const term = directoryEl("ambassadorDirectorySearch").value.trim().toLowerCase();
  const state = directoryEl("ambassadorStateFilter").value;
  const region = directoryEl("ambassadorRegionFilter").value;
  const status = directoryEl("ambassadorStatusFilter").value;

  return directoryAmbassadors.filter((ambassador) => {
    const searchText = [
      ambassador.name,
      ambassador.email,
      ambassador.phone,
      ...(ambassador.state || []),
      ...(ambassador.region || []),
      ...(ambassador.languages || [])
    ].join(" ").toLowerCase();

    const matchesTerm = !term || searchText.includes(term);
    const matchesState = state === "all" || (ambassador.state || []).includes(state);
    const matchesRegion = region === "all" || (ambassador.region || []).includes(region);
    const matchesStatus = status === "all" ||
      (status === "active" && ambassador.active) ||
      (status === "inactive" && !ambassador.active);

    return matchesTerm && matchesState && matchesRegion && matchesStatus;
  });
}

function chip(text, className = "") {
  return `<span class="ambassadorChip ${className}">${esc(text)}</span>`;
}

function renderGalleryCard(ambassador) {
  const location = [...(ambassador.state || []), ...(ambassador.region || [])].join(" • ") || "Location not set";
  const operational = [
    ambassador.portalAccess ? chip("Portal", "chipGood") : "",
    ambassador.taxFormOnFile ? chip("Tax form", "chipGood") : "",
    ambassador.w9OnFile ? chip("W-9", "chipGood") : ""
  ].filter(Boolean).join("");

  return `
    <article class="ambassadorGalleryCard" data-profile-ambassador="${esc(ambassador.id)}" tabindex="0" role="button" aria-label="View ${esc(ambassador.name || "ambassador")} profile">
      <div class="ambassadorGalleryPhotoWrap">
        ${photoMarkup(ambassador)}
        <span class="ambassadorStatusDot ${ambassador.active ? "isActive" : "isInactive"}" title="${ambassador.active ? "Active" : "Inactive"}"></span>
      </div>
      <div class="ambassadorGalleryBody">
        <div class="ambassadorNameRow">
          <h3>${esc(ambassador.name || "Unnamed Ambassador")}</h3>
          ${chip(ambassador.active ? "Active" : "Inactive", ambassador.active ? "chipGood" : "chipMuted")}
        </div>
        <p class="ambassadorLocation">${esc(location)}</p>
        ${ambassador.email ? `<a class="ambassadorEmail" href="mailto:${esc(ambassador.email)}" onclick="event.stopPropagation()">${esc(ambassador.email)}</a>` : '<span class="ambassadorEmail mutedText">No email</span>'}
        <div class="ambassadorGalleryStats ambassadorGalleryStatsSingle">
          <div><strong>${Number(ambassador.bookingCount || 0)}</strong><span>Bookings</span></div>
        </div>
        <div class="ambassadorCardChips">${operational || chip("Profile", "chipMuted")}</div>
      </div>
      <div class="ambassadorGalleryFooter">
        <button type="button" class="ambassadorProfileButton" data-profile-ambassador="${esc(ambassador.id)}">View Profile</button>
        <button type="button" class="miniButton" data-edit-ambassador="${esc(ambassador.id)}">Edit</button>
      </div>
    </article>
  `;
}

function renderListCard(ambassador) {
  return `
    <article class="ambassadorListCard">
      ${photoMarkup(ambassador)}
      <div class="ambassadorListBody">
        <strong>${esc(ambassador.name || "Unnamed Ambassador")}</strong>
        ${ambassador.email ? `<span>${esc(ambassador.email)}</span>` : ""}
        <small>${esc([...(ambassador.state || []), ...(ambassador.region || [])].join(" • ") || "State and region not set")}</small>
      </div>
      <div class="ambassadorListMeta">
        ${chip(ambassador.active ? "Active" : "Inactive", ambassador.active ? "chipGood" : "chipMuted")}
        <span>${Number(ambassador.bookingCount || 0)} bookings</span>
      </div>
      <div class="ambassadorCardActions">
        <button type="button" class="miniButton" data-profile-ambassador="${esc(ambassador.id)}">View</button>
        <button type="button" class="miniButton" data-edit-ambassador="${esc(ambassador.id)}">Edit</button>
      </div>
    </article>
  `;
}

function updateViewButtons() {
  const gallery = directoryEl("ambassadorGalleryViewBtn");
  const list = directoryEl("ambassadorListViewBtn");
  gallery.classList.toggle("active", directoryViewMode === "gallery");
  list.classList.toggle("active", directoryViewMode === "list");
  gallery.setAttribute("aria-pressed", directoryViewMode === "gallery" ? "true" : "false");
  list.setAttribute("aria-pressed", directoryViewMode === "list" ? "true" : "false");
}

function renderDirectory() {
  const matches = filteredAmbassadors();
  const list = directoryEl("ambassadorDirectoryList");
  const count = directoryEl("ambassadorDirectoryCount");
  count.textContent = `${matches.length} of ${directoryAmbassadors.length} ambassadors`;
  updateViewButtons();

  list.className = directoryViewMode === "gallery"
    ? "ambassadorDirectoryList ambassadorGalleryGrid"
    : "ambassadorDirectoryList ambassadorListView";

  if (!matches.length) {
    list.innerHTML = '<p class="directoryEmpty">No ambassadors match these filters.</p>';
    return;
  }

  list.innerHTML = matches.map(directoryViewMode === "gallery" ? renderGalleryCard : renderListCard).join("");
}

function renderProfileStatus(label, value, good = true) {
  return `
    <div class="ambassadorStatusItem">
      <span>${esc(label)}</span>
      <strong class="${value && good ? "statusGood" : ""}">${esc(statusText(value))}</strong>
    </div>
  `;
}

function openAmbassadorProfile(id) {
  const ambassador = directoryAmbassadors.find((item) => item.id === id);
  if (!ambassador) return;
  selectedDirectoryAmbassadorId = id;

  const location = [...(ambassador.state || []), ...(ambassador.region || [])].join(" • ") || "Location not set";
  directoryEl("ambassadorProfileContent").innerHTML = `
    <div class="ambassadorProfileHero">
      ${photoMarkup(ambassador, true)}
      <div>
        <div class="ambassadorProfileNameRow">
          <h2>${esc(ambassador.name || "Unnamed Ambassador")}</h2>
          ${chip(ambassador.active ? "Active" : "Inactive", ambassador.active ? "chipGood" : "chipMuted")}
        </div>
        <p>${esc(location)}</p>
        <div class="ambassadorProfileContact">
          ${ambassador.email ? `<a href="mailto:${esc(ambassador.email)}">${esc(ambassador.email)}</a>` : "<span>No email on file</span>"}
          ${ambassador.phone ? `<a href="tel:${esc(ambassador.phone)}">${esc(ambassador.phone)}</a>` : "<span>No phone on file</span>"}
        </div>
      </div>
    </div>

    <div class="ambassadorProfileMetrics">
      <div><strong>${Number(ambassador.bookingCount || 0)}</strong><span>Bookings</span></div>
      <div><strong>${(ambassador.languages || []).length}</strong><span>Languages</span></div>
      <div><strong>${(ambassador.region || []).length}</strong><span>Regions</span></div>
    </div>

    <section class="ambassadorProfileSection">
      <h3>Operations</h3>
      <div class="ambassadorStatusGrid">
        ${renderProfileStatus("Portal access", ambassador.portalAccess)}
        ${renderProfileStatus("Tax form on file", ambassador.taxFormOnFile)}
        ${renderProfileStatus("W-9 on file", ambassador.w9OnFile)}
        ${renderProfileStatus("Signed agreement", ambassador.signedAgreementOnFile)}
        ${renderProfileStatus("Onboarding forms", ambassador.onboardingFormsOnFile)}
      </div>
    </section>

    ${(ambassador.languages || []).length ? `
      <section class="ambassadorProfileSection">
        <h3>Languages</h3>
        <div class="ambassadorCardChips">${ambassador.languages.map((language) => chip(language)).join("")}</div>
      </section>
    ` : ""}

    ${ambassador.demographics ? `
      <section class="ambassadorProfileSection">
        <h3>Demographics / Profile</h3>
        <p class="profileLongText">${esc(ambassador.demographics)}</p>
      </section>
    ` : ""}

    ${ambassador.notes ? `
      <section class="ambassadorProfileSection">
        <h3>Notes</h3>
        <p class="profileLongText">${esc(ambassador.notes)}</p>
      </section>
    ` : ""}

    <div class="ambassadorProfileActions">
      <button type="button" class="primary" data-edit-profile-ambassador="${esc(ambassador.id)}">Edit Ambassador</button>
    </div>
  `;

  directoryEl("ambassadorProfileModal").classList.remove("hidden");
  document.body.classList.add("modalOpen");
}

function closeAmbassadorProfile() {
  selectedDirectoryAmbassadorId = "";
  directoryEl("ambassadorProfileModal").classList.add("hidden");
  document.body.classList.remove("modalOpen");
}

async function loadDirectory() {
  showDirectoryMessage("Loading ambassadors...");
  try {
    const response = await fetch(`/api/ambassador-management?refresh=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load ambassadors.");
    directoryAmbassadors = data.ambassadors || [];
    populateDirectoryFilters();
    renderDirectory();
    directoryEl("ambassadorDirectoryMessage").className = "message hidden";
  } catch (error) {
    showDirectoryMessage(error.message, "error");
  }
}

function editDirectoryAmbassador(id) {
  const ambassador = directoryAmbassadors.find((item) => item.id === id);
  if (!ambassador) return;
  closeAmbassadorProfile();
  directoryEditingId = id;
  directoryEl("ambassadorName").value = ambassador.name || "";
  directoryEl("ambassadorEmail").value = ambassador.email || "";
  directoryEl("ambassadorState").value = (ambassador.state || []).join(", ");
  directoryEl("ambassadorRegion").value = (ambassador.region || []).join(", ");
  directoryEl("ambassadorPhotoUrl").value = ambassador.photoUrl || "";
  directoryEl("ambassadorDirectoryFormTitle").textContent = "Edit Ambassador";
  directoryEl("saveAmbassadorBtn").textContent = "Save Changes";
  directoryEl("cancelAmbassadorEditBtn").classList.remove("hidden");
  const details = directoryEl("ambassadorFormDetails");
  details.open = true;
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
    const response = await fetch("/api/ambassador-management", {
      method: directoryEditingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save ambassador.");
    clearDirectoryForm();
    directoryEl("ambassadorFormDetails").open = false;
    await loadDirectory();
    showDirectoryMessage("Ambassador saved.");
  } catch (error) {
    showDirectoryMessage(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

function setDirectoryView(mode) {
  directoryViewMode = mode;
  localStorage.setItem("amoreAmbassadorView", mode);
  renderDirectory();
}

function resetDirectoryFilters() {
  directoryEl("ambassadorDirectorySearch").value = "";
  directoryEl("ambassadorStateFilter").value = "all";
  directoryEl("ambassadorRegionFilter").value = "all";
  directoryEl("ambassadorStatusFilter").value = "all";
  renderDirectory();
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
  directoryEl("ambassadorStateFilter")?.addEventListener("change", renderDirectory);
  directoryEl("ambassadorRegionFilter")?.addEventListener("change", renderDirectory);
  directoryEl("ambassadorStatusFilter")?.addEventListener("change", renderDirectory);
  directoryEl("ambassadorClearFilters")?.addEventListener("click", resetDirectoryFilters);
  directoryEl("ambassadorGalleryViewBtn")?.addEventListener("click", () => setDirectoryView("gallery"));
  directoryEl("ambassadorListViewBtn")?.addEventListener("click", () => setDirectoryView("list"));

  directoryEl("ambassadorDirectoryForm")?.addEventListener("submit", saveDirectoryAmbassador);
  directoryEl("cancelAmbassadorEditBtn")?.addEventListener("click", clearDirectoryForm);

  directoryEl("ambassadorDirectoryList")?.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-ambassador]");
    const profile = event.target.closest("[data-profile-ambassador]");
    if (edit) {
      event.stopPropagation();
      editDirectoryAmbassador(edit.dataset.editAmbassador);
      return;
    }
    if (profile) openAmbassadorProfile(profile.dataset.profileAmbassador);
  });

  directoryEl("ambassadorDirectoryList")?.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-profile-ambassador]")) {
      event.preventDefault();
      openAmbassadorProfile(event.target.dataset.profileAmbassador);
    }
  });

  directoryEl("ambassadorProfileClose")?.addEventListener("click", closeAmbassadorProfile);
  directoryEl("ambassadorProfileModal")?.addEventListener("click", (event) => {
    if (event.target === directoryEl("ambassadorProfileModal")) closeAmbassadorProfile();
  });
  directoryEl("ambassadorProfileContent")?.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-profile-ambassador]");
    if (edit) editDirectoryAmbassador(edit.dataset.editProfileAmbassador);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !directoryEl("ambassadorProfileModal")?.classList.contains("hidden")) closeAmbassadorProfile();
  });

  updateViewButtons();
}

initAmbassadorDirectory();
