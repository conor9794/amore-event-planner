let todaysEventsLoaded = false;
let todaysEvents = [];
let todaysEventsCounts = null;
let selectedEventsDate = getInitialEventsDate();

function todayEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function getInitialEventsDate() {
  const dateFromUrl = new URLSearchParams(window.location.search).get("date");
  return validDateKey(dateFromUrl) ? dateFromUrl : localDateKey();
}

function dateFromKey(dateKey) {
  return new Date(`${dateKey}T12:00:00`);
}

function shiftDateKey(dateKey, days) {
  const date = dateFromKey(dateKey);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function formatSelectedDate(dateKey, options = {}) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: options.short ? "short" : "long",
    month: options.short ? "short" : "long",
    day: "numeric",
    year: options.includeYear ? "numeric" : undefined
  }).format(dateFromKey(dateKey));
}

function isActualToday() {
  return selectedEventsDate === localDateKey();
}

function updateDateInUrl() {
  const url = new URL(window.location.href);
  if (isActualToday()) url.searchParams.delete("date");
  else url.searchParams.set("date", selectedEventsDate);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function todayStatusLabel(status) {
  return {
    upcoming: "Upcoming",
    "checked-in": "Checked In",
    late: "Late / Not Checked In",
    completed: "Completed"
  }[status] || status;
}

function todayStatusOrder(status) {
  return { late: 0, "checked-in": 1, upcoming: 2, completed: 3 }[status] ?? 4;
}

function showTodayMessage(text, type = "ok") {
  const element = document.getElementById("todayMessage");
  if (!element) return;
  element.textContent = text;
  element.className = `message ${type}`;
}

function hideTodayMessage() {
  const element = document.getElementById("todayMessage");
  if (!element) return;
  element.textContent = "";
  element.className = "message hidden";
}

function installDateControls() {
  if (document.getElementById("todayDateControls")) return;
  const counts = document.getElementById("todayCounts");
  if (!counts) return;

  const controls = document.createElement("div");
  controls.id = "todayDateControls";
  controls.className = "todayDateControls";
  controls.innerHTML = `
    <div class="todayDateStepper">
      <button type="button" id="previousEventsDate" class="todayDateArrow" aria-label="View previous day">‹</button>
      <div id="selectedEventsDateLabel" class="todayDateLabel"></div>
      <button type="button" id="nextEventsDate" class="todayDateArrow" aria-label="View next day">›</button>
    </div>
    <div class="todayDateActions">
      <label class="todayDatePickerLabel">
        Choose date
        <input id="eventsDatePicker" type="date" />
      </label>
      <button type="button" id="returnToTodayBtn" class="todayTodayButton">Today</button>
    </div>
  `;
  counts.parentNode.insertBefore(controls, counts);

  const style = document.createElement("style");
  style.textContent = `
    .todayDateControls { display:grid; gap:10px; margin:0 0 14px; }
    .todayDateStepper { display:grid; grid-template-columns:44px 1fr 44px; gap:8px; align-items:center; }
    .todayDateArrow, .todayTodayButton { border:1px solid var(--border); background:var(--soft); color:var(--text); }
    .todayDateArrow { min-height:44px; padding:8px; font-size:24px; line-height:1; }
    .todayDateLabel { min-height:44px; display:flex; align-items:center; justify-content:center; border:1px solid var(--border); border-radius:12px; background:var(--box-bg); color:var(--text); font-weight:900; text-align:center; padding:8px 10px; }
    .todayDateActions { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:end; }
    .todayDatePickerLabel { margin:0; }
    .todayTodayButton { padding:13px 14px; }
    @media (min-width:520px) { .todayDateControls { grid-template-columns:minmax(280px, 1fr) minmax(260px, .8fr); align-items:end; } }
  `;
  document.head.appendChild(style);

  document.getElementById("previousEventsDate")?.addEventListener("click", () => selectEventsDate(shiftDateKey(selectedEventsDate, -1)));
  document.getElementById("nextEventsDate")?.addEventListener("click", () => selectEventsDate(shiftDateKey(selectedEventsDate, 1)));
  document.getElementById("returnToTodayBtn")?.addEventListener("click", () => selectEventsDate(localDateKey()));
  document.getElementById("eventsDatePicker")?.addEventListener("change", (event) => {
    if (validDateKey(event.target.value)) selectEventsDate(event.target.value);
  });

  updateSelectedDateDisplay();
}

function updateSelectedDateDisplay() {
  const heading = document.querySelector("#todayPage .sectionIntro h2");
  const description = document.querySelector("#todayPage .sectionIntro p");
  const searchLabel = document.querySelector('label:has(#todaySearch)');
  const dateLabel = document.getElementById("selectedEventsDateLabel");
  const datePicker = document.getElementById("eventsDatePicker");
  const todayButton = document.getElementById("returnToTodayBtn");

  if (heading) heading.textContent = isActualToday() ? "Today's Events" : `Events for ${formatSelectedDate(selectedEventsDate)}`;
  if (description) description.textContent = isActualToday()
    ? "See every confirmed event happening today in its store's local timezone and quickly identify who is checked in, late, upcoming, or completed."
    : `Preview confirmed bookings scheduled for ${formatSelectedDate(selectedEventsDate)} in each store's local timezone.`;
  if (searchLabel) searchLabel.childNodes[0].textContent = "Search Events\n            ";
  if (dateLabel) dateLabel.textContent = formatSelectedDate(selectedEventsDate, { short: true, includeYear: true });
  if (datePicker) datePicker.value = selectedEventsDate;
  if (todayButton) todayButton.disabled = isActualToday();
}

function selectEventsDate(dateKey) {
  if (!validDateKey(dateKey) || dateKey === selectedEventsDate) return;
  selectedEventsDate = dateKey;
  todaysEventsLoaded = false;
  updateDateInUrl();
  updateSelectedDateDisplay();
  loadTodaysEvents();
}

function switchToToday() {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
  document.getElementById("todayPage")?.classList.add("active");
  document.getElementById("todayTab")?.classList.add("active");
  installDateControls();
  updateSelectedDateDisplay();
  if (!todaysEventsLoaded) loadTodaysEvents();
}

function leaveToday() {
  document.getElementById("todayPage")?.classList.remove("active");
  document.getElementById("todayTab")?.classList.remove("active");
}

function renderTodayCounts() {
  const container = document.getElementById("todayCounts");
  if (!container || !todaysEventsCounts) return;
  const cards = [
    ["Total", todaysEventsCounts.total, "total"],
    ["Checked In", todaysEventsCounts["checked-in"], "checked-in"],
    ["Late", todaysEventsCounts.late, "late"],
    ["Upcoming", todaysEventsCounts.upcoming, "upcoming"],
    ["Completed", todaysEventsCounts.completed, "completed"]
  ];
  container.innerHTML = cards.map(([label, count, status]) => `
    <div class="todayCount ${todayEscape(status)}">
      <strong>${todayEscape(count)}</strong>
      <span>${todayEscape(label)}</span>
    </div>
  `).join("");
}

function renderTodayEvent(event) {
  const details = [event.brandName, event.storeName].filter(Boolean).join(" • ");
  const attendance = event.status === "checked-in"
    ? `Clocked in ${event.clockInLabel || ""}`
    : event.status === "completed"
      ? `Clocked out ${event.clockOutLabel || ""}`
      : event.status === "late"
        ? "Scheduled start has passed"
        : `Starts at ${(event.scheduledLabel || "").split(" – ")[0] || ""}`;

  return `
    <article class="todayEvent ${todayEscape(event.status)}">
      <div class="todayEventTop">
        <div>
          <strong>${todayEscape(event.eventName || "Untitled Event")}</strong>
          ${details ? `<span>${todayEscape(details)}</span>` : ""}
        </div>
        <span class="todayBadge ${todayEscape(event.status)}">${todayEscape(todayStatusLabel(event.status))}</span>
      </div>
      <div class="todayEventGrid">
        <div><span>Scheduled</span><strong>${todayEscape(event.scheduledLabel || "—")}</strong></div>
        <div><span>Ambassador</span><strong>${todayEscape(event.ambassadorName || "Unassigned")}</strong></div>
        <div><span>Attendance</span><strong>${todayEscape(attendance)}</strong></div>
        <div><span>Time Zone</span><strong>${todayEscape(event.timeZone || "America/New_York")}</strong></div>
      </div>
    </article>
  `;
}

function renderTodaysEvents() {
  const list = document.getElementById("todayList");
  const empty = document.getElementById("todayEmpty");
  if (!list || !empty) return;

  const search = (document.getElementById("todaySearch")?.value || "").trim().toLowerCase();
  const statusFilter = document.getElementById("todayStatusFilter")?.value || "all";
  const filtered = todaysEvents
    .filter((event) => statusFilter === "all" || event.status === statusFilter)
    .filter((event) => {
      if (!search) return true;
      return [event.eventName, event.brandName, event.storeName, event.ambassadorName, event.ambassadorEmail]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    })
    .sort((a, b) => todayStatusOrder(a.status) - todayStatusOrder(b.status) || new Date(a.scheduledStart) - new Date(b.scheduledStart));

  if (filtered.length === 0) {
    list.innerHTML = "";
    empty.textContent = todaysEvents.length === 0
      ? `No confirmed events are scheduled for ${formatSelectedDate(selectedEventsDate)}.`
      : "No events match your filters.";
    empty.className = "todayEmpty";
    return;
  }

  empty.className = "todayEmpty hidden";
  list.innerHTML = filtered.map(renderTodayEvent).join("");
}

async function loadTodaysEvents() {
  hideTodayMessage();
  installDateControls();
  updateSelectedDateDisplay();
  const refresh = document.getElementById("refreshTodayBtn");
  if (refresh) {
    refresh.disabled = true;
    refresh.textContent = "Refreshing...";
  }

  try {
    const response = await fetch(`/api/todays-events?date=${encodeURIComponent(selectedEventsDate)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load events.");
    todaysEvents = data.events || [];
    todaysEventsCounts = data.counts || { total: 0, upcoming: 0, "checked-in": 0, late: 0, completed: 0 };
    selectedEventsDate = data.selectedDate || selectedEventsDate;
    todaysEventsLoaded = true;
    updateDateInUrl();
    updateSelectedDateDisplay();
    renderTodayCounts();
    renderTodaysEvents();
    const updated = document.getElementById("todayUpdated");
    if (updated) updated.textContent = `Updated ${new Date(data.generatedAt || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } catch (error) {
    showTodayMessage(error.message || "Could not load events.", "error");
  } finally {
    if (refresh) {
      refresh.disabled = false;
      refresh.textContent = "Refresh";
    }
  }
}

document.getElementById("todayTab")?.addEventListener("click", switchToToday);
["addEventTab", "assignTab", "confirmTab", "recapTab"].forEach((id) => {
  document.getElementById(id)?.addEventListener("click", leaveToday, true);
});
document.getElementById("todaySearch")?.addEventListener("input", renderTodaysEvents);
document.getElementById("todayStatusFilter")?.addEventListener("change", renderTodaysEvents);
document.getElementById("refreshTodayBtn")?.addEventListener("click", loadTodaysEvents);

window.setInterval(() => {
  if (document.getElementById("todayPage")?.classList.contains("active") && isActualToday()) loadTodaysEvents();
}, 60000);