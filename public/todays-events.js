let todaysEventsLoaded = false;
let todaysEvents = [];
let todaysEventsCounts = null;

function todayEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function switchToToday() {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
  document.getElementById("todayPage")?.classList.add("active");
  document.getElementById("todayTab")?.classList.add("active");
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
    empty.textContent = todaysEvents.length === 0 ? "No confirmed events are scheduled for today." : "No events match your filters.";
    empty.className = "todayEmpty";
    return;
  }

  empty.className = "todayEmpty hidden";
  list.innerHTML = filtered.map(renderTodayEvent).join("");
}

async function loadTodaysEvents() {
  hideTodayMessage();
  const refresh = document.getElementById("refreshTodayBtn");
  if (refresh) {
    refresh.disabled = true;
    refresh.textContent = "Refreshing...";
  }

  try {
    const response = await fetch("/api/todays-events", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load today's events.");
    todaysEvents = data.events || [];
    todaysEventsCounts = data.counts || { total: 0, upcoming: 0, "checked-in": 0, late: 0, completed: 0 };
    todaysEventsLoaded = true;
    renderTodayCounts();
    renderTodaysEvents();
    const updated = document.getElementById("todayUpdated");
    if (updated) updated.textContent = `Updated ${new Date(data.generatedAt || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } catch (error) {
    showTodayMessage(error.message || "Could not load today's events.", "error");
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
  if (document.getElementById("todayPage")?.classList.contains("active")) loadTodaysEvents();
}, 60000);
