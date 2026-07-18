let pendingRecaps = [];
let expandedRecapId = "";
let approvingRecapId = "";
let recapsLoaded = false;

function recapEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function recapDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function recapDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function recapTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function recapMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString([], { style: "currency", currency: "USD" });
}

function recapNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "—";
}

function showRecapMessage(text, type = "ok") {
  const element = document.getElementById("recapMessage");
  if (!element) return;
  element.textContent = text;
  element.className = `message ${type}`;
}

function hideRecapMessage() {
  const element = document.getElementById("recapMessage");
  if (!element) return;
  element.textContent = "";
  element.className = "message hidden";
}

function showRecapToast(text, type = "ok") {
  const toast = document.getElementById("recapToast");
  if (!toast) return;
  toast.textContent = text;
  toast.className = `recapToast ${type}`;
  window.clearTimeout(showRecapToast.timer);
  showRecapToast.timer = window.setTimeout(() => {
    toast.className = "recapToast hidden";
  }, 4000);
}

function switchToRecaps() {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
  document.getElementById("recapPage")?.classList.add("active");
  document.getElementById("recapTab")?.classList.add("active");
  if (!recapsLoaded) loadRecaps();
}

function leaveRecaps() {
  document.getElementById("recapPage")?.classList.remove("active");
  document.getElementById("recapTab")?.classList.remove("active");
}

function recapSearchText(recap) {
  return [
    recap.assignment,
    recap.event?.name,
    recap.event?.brand,
    recap.event?.store,
    recap.ambassador?.name,
    recap.ambassador?.email
  ].filter(Boolean).join(" ").toLowerCase();
}

function detailRow(label, value) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "";
  const display = Array.isArray(value) ? value.join(", ") : value;
  return `<div class="recapDetailRow"><span>${recapEscape(label)}</span><strong>${recapEscape(display)}</strong></div>`;
}

function photoGrid(items, label) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return `
    <section class="recapSection">
      <h3>${recapEscape(label)}</h3>
      <div class="recapPhotoGrid">
        ${items.map((item) => `
          <a href="${recapEscape(item.url)}" target="_blank" rel="noreferrer">
            <img src="${recapEscape(item.thumbnailUrl || item.url)}" alt="${recapEscape(item.filename || label)}" loading="lazy" />
          </a>
        `).join("")}
      </div>
    </section>`;
}

function renderTalkhouse(recap) {
  const talkhouse = recap.recap?.talkhouse || {};
  const hasContent = (talkhouse.flavorsCarried || []).length || (talkhouse.sales || []).length || talkhouse.soldOutDetails;
  if (!hasContent) return "";
  return `
    <section class="recapSection">
      <h3>Talkhouse Sales</h3>
      ${detailRow("Flavors Carried", talkhouse.flavorsCarried || [])}
      ${(talkhouse.sales || []).map(([name, value]) => detailRow(`${name} 4-Packs Sold`, value)).join("")}
      ${detailRow("Sold Out Details", talkhouse.soldOutDetails)}
    </section>`;
}

function renderRecapCard(recap) {
  const expanded = expandedRecapId === recap.bookingId;
  const approving = approvingRecapId === recap.bookingId;
  const actualHours = recap.time?.actualHours;
  const totalPay = recap.payroll?.totalPay;

  return `
    <article class="recapCard ${expanded ? "expanded" : ""}">
      <button type="button" class="recapSummary" data-recap-toggle="${recapEscape(recap.bookingId)}" aria-expanded="${expanded}">
        <div>
          <strong>${recapEscape(recap.event?.name || recap.assignment || "Untitled Event")}</strong>
          <span>${recapEscape([recap.event?.brand, recap.event?.store].filter(Boolean).join(" • "))}</span>
          <span>${recapEscape(recap.ambassador?.name || "Unnamed Ambassador")}</span>
        </div>
        <div class="recapSummaryRight">
          <strong>${recapMoney(totalPay)}</strong>
          <span>${recapNumber(actualHours)} hrs</span>
          <span>Submitted ${recapEscape(recapDateTime(recap.recap?.submittedAt))}</span>
        </div>
      </button>
      ${expanded ? `
        <div class="recapBody">
          <section class="recapSection">
            <h3>Event</h3>
            ${detailRow("Event", recap.event?.name)}
            ${detailRow("Brand", recap.event?.brand)}
            ${detailRow("Store", recap.event?.store)}
            ${detailRow("Event Date", recapDate(recap.event?.date))}
            ${detailRow("Ambassador", recap.ambassador?.name)}
            ${detailRow("Email", recap.ambassador?.email)}
          </section>

          <section class="recapSection">
            <h3>Time</h3>
            ${detailRow("Scheduled", `${recapTime(recap.time?.scheduledStart)} – ${recapTime(recap.time?.scheduledEnd)}`)}
            ${detailRow("Clock In", recapTime(recap.time?.clockIn))}
            ${detailRow("Clock Out", recapTime(recap.time?.clockOut))}
            ${detailRow("Actual Hours", recapNumber(recap.time?.actualHours))}
          </section>

          <section class="recapSection">
            <h3>Recap</h3>
            ${detailRow("Products Sampled", recap.recap?.productsSampled)}
            ${detailRow("Consumers Seen", recap.recap?.consumersSeen)}
            ${detailRow("Consumers Sampled", recap.recap?.consumersSampled)}
            ${detailRow("Product Price", recap.recap?.productPrice)}
            ${detailRow("Product Sold", recap.recap?.productSold)}
            ${detailRow("Table Location", recap.recap?.tableLocation)}
            ${detailRow("Store Contact", recap.recap?.storeContactName)}
            ${detailRow("Leftover Inventory", recap.recap?.leftoverInventory)}
            ${recap.recap?.notes ? `<div class="recapLongText"><span>Recap Notes</span><p>${recapEscape(recap.recap.notes)}</p></div>` : ""}
            ${recap.recap?.feedback ? `<div class="recapLongText"><span>Event Feedback</span><p>${recapEscape(recap.recap.feedback)}</p></div>` : ""}
            ${recap.recap?.gpsMapLink ? `<a class="recapLink" href="${recapEscape(recap.recap.gpsMapLink)}" target="_blank" rel="noreferrer">Open Clock-Out GPS Location</a>` : ""}
          </section>

          ${renderTalkhouse(recap)}
          ${photoGrid(recap.recap?.photos, "Event Photos")}

          <section class="recapSection">
            <h3>Expense</h3>
            ${detailRow("Amount", recapMoney(recap.expense?.amount))}
            ${photoGrid(recap.expense?.receipts, "Receipts")}
          </section>

          <section class="recapSection recapPayroll">
            <h3>Payroll</h3>
            ${detailRow("Pay Rate", recapMoney(recap.payroll?.payRate))}
            ${detailRow("Actual Hours", recapNumber(recap.payroll?.actualHours))}
            ${detailRow("Total Pay", recapMoney(recap.payroll?.totalPay))}
          </section>

          <button type="button" class="primary recapApprove" data-recap-approve="${recapEscape(recap.bookingId)}" ${approving ? "disabled" : ""}>
            ${approving ? "Approving..." : "Approve Recap"}
          </button>
        </div>` : ""}
    </article>`;
}

function renderRecaps() {
  const list = document.getElementById("recapList");
  const empty = document.getElementById("recapEmpty");
  if (!list || !empty) return;

  const search = (document.getElementById("recapSearch")?.value || "").trim().toLowerCase();
  const filtered = pendingRecaps.filter((recap) => !search || recapSearchText(recap).includes(search));

  if (filtered.length === 0) {
    list.innerHTML = "";
    empty.textContent = pendingRecaps.length === 0
      ? "All recaps have been reviewed."
      : "No recaps match your search.";
    empty.className = "recapEmpty";
    return;
  }

  empty.className = "recapEmpty hidden";
  list.innerHTML = filtered.map(renderRecapCard).join("");
}

async function loadRecaps() {
  hideRecapMessage();
  const spinner = document.getElementById("recapSpinner");
  if (spinner) spinner.className = "recapSpinner";

  try {
    const response = await fetch("/api/recaps");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load recaps.");
    pendingRecaps = data.recaps || [];
    recapsLoaded = true;
    renderRecaps();
  } catch (error) {
    showRecapMessage(error.message || "Could not load recaps.", "error");
  } finally {
    if (spinner) spinner.className = "recapSpinner hidden";
  }
}

async function approveRecap(bookingId) {
  const recap = pendingRecaps.find((item) => item.bookingId === bookingId);
  if (!recap) return;

  const approved = window.confirm(`Approve ${recap.ambassador?.name || "this ambassador"}'s recap and send it to payroll?`);
  if (!approved) return;

  approvingRecapId = bookingId;
  renderRecaps();

  try {
    const response = await fetch("/api/recaps", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not approve recap.");

    pendingRecaps = pendingRecaps.filter((item) => item.bookingId !== bookingId);
    expandedRecapId = "";
    showRecapToast("Recap approved and sent to payroll.", "ok");
  } catch (error) {
    showRecapToast(error.message || "Could not approve recap.", "error");
  } finally {
    approvingRecapId = "";
    renderRecaps();
  }
}

document.getElementById("recapTab")?.addEventListener("click", switchToRecaps);
["addEventTab", "assignTab", "confirmTab"].forEach((id) => {
  document.getElementById(id)?.addEventListener("click", leaveRecaps, true);
});
document.getElementById("recapSearch")?.addEventListener("input", renderRecaps);
document.getElementById("refreshRecapsBtn")?.addEventListener("click", loadRecaps);
document.getElementById("recapList")?.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-recap-toggle]");
  if (toggle) {
    const id = toggle.dataset.recapToggle;
    expandedRecapId = expandedRecapId === id ? "" : id;
    renderRecaps();
    return;
  }

  const approve = event.target.closest("[data-recap-approve]");
  if (approve && !approve.disabled) approveRecap(approve.dataset.recapApprove);
});
