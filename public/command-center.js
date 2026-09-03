(function () {
  "use strict";

  const core = window.CommandCenterCore;
  const state = {
    events: [],
    unconfirmed: [],
    recaps: [],
    payroll: [],
    selectedEventId: "",
    loading: false,
    loaded: false
  };
  const areas = ["Long Island", "NYC", "NY North Metro", "NJ", "CT", "Upstate NY", "MD", "DC", "MA", "FL"];
  const $ = (id) => document.getElementById(id);

  if (!core || !$('commandCenterPage') || !$('overviewTab')) return;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    if (!value) return "Date not set";
    const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  function formatTime(value) {
    if (!value) return "";
    const [hour, minute] = String(value).split(":").map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return String(value);
    return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function eventTime(event) {
    const start = formatTime(event.localStartTime);
    const end = formatTime(event.localEndTime);
    return [start, end].filter(Boolean).join("–") || "Time not set";
  }

  function formatMoney(value) {
    const amount = Number(value);
    return (Number.isFinite(amount) ? amount : 0).toLocaleString([], {
      style: "currency", currency: "USD", maximumFractionDigits: 2
    });
  }

  function showMessage(text, type = "ok") {
    const message = $("commandMessage");
    message.textContent = text;
    message.className = `message ${type}`;
  }

  function hideMessage() {
    $("commandMessage").className = "message hidden";
  }

  async function fetchJson(url) {
    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}refresh=${Date.now()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Could not load ${url}.`);
    return data;
  }

  function eventRegion(event) {
    return event.eventArea || event.state || "Not set";
  }

  function populateRegions() {
    const select = $("commandRegionFilter");
    const current = select.value;
    const regions = [...new Set(state.events.map(eventRegion).filter((region) => region && region !== "Not set"))].sort();
    select.innerHTML = `<option value="all">All regions</option>${regions.map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`).join("")}`;
    select.value = regions.includes(current) ? current : "all";
  }

  function populateBrands() {
    const select = $("commandBrandFilter");
    const current = select.value;
    const brands = [...new Set(state.events.map((event) => event.brand).filter(Boolean))].sort();
    select.innerHTML = `<option value="all">All brands</option>${brands.map((brand) => `<option value="${escapeHtml(brand)}">${escapeHtml(brand)}</option>`).join("")}`;
    select.value = brands.includes(current) ? current : "all";
  }

  function filteredEvents() {
    return core.filterEvents(state.events, {
      period: $("commandPeriodFilter").value,
      region: $("commandRegionFilter").value,
      brand: $("commandBrandFilter").value,
      search: $("commandSearch").value
    });
  }

  function renderKpis() {
    const summary = core.metrics(state.events, state.unconfirmed, state.recaps, state.payroll);
    const items = [
      ["Events", summary.upcoming, "All upcoming events"],
      ["Next 7 days", summary.nextSevenDays, "Coming up this week"],
      ["Need staffing", summary.needsStaff, "Events without an ambassador"],
      ["Unconfirmed", summary.unconfirmed, "Bookings needing confirmation"],
      ["Recaps to review", summary.recaps, "Submitted and awaiting review"],
      ["Payroll + expenses", formatMoney(summary.payrollTotal), `${summary.payrollCount} approved ${summary.payrollCount === 1 ? "booking" : "bookings"}`]
    ];
    $("commandKpis").innerHTML = items.map(([label, value, note]) => `
      <div class="commandKpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>
    `).join("");
  }

  function renderAttention() {
    const urgentUnstaffed = state.events.filter((event) => core.operationalStatus(event).key === "unstaffed" && core.withinDays(event, 3)).length;
    const alerts = [];
    if (urgentUnstaffed) alerts.push(["danger", `${urgentUnstaffed} near-term ${urgentUnstaffed === 1 ? "event needs" : "events need"} staff`, "Scheduled within the next 3 days."]);
    if (state.unconfirmed.length) alerts.push(["warning", `${state.unconfirmed.length} ${state.unconfirmed.length === 1 ? "booking needs" : "bookings need"} confirmation`, "Confirm the pay rate and send the booking confirmation."]);
    if (state.recaps.length) alerts.push(["info", `${state.recaps.length} ${state.recaps.length === 1 ? "recap is" : "recaps are"} ready to review`, "Review attendance, results, photos, and expenses."]);
    if (!alerts.length) alerts.push(["info", "No urgent workflow items", "Upcoming events are staffed and current queues are clear."]);
    $("commandAttention").innerHTML = alerts.map(([kind, title, note]) => `
      <div class="commandAlert ${kind}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(note)}</span></div>
    `).join("");
  }

  function renderQueue() {
    const items = [
      ["Recaps to review", "Check attendance, results, photos, and expenses", state.recaps.length, "recapTab"],
      ["Ready for payroll", "Approved payroll and reimbursements", state.payroll.length, "payrollTab"]
    ];
    $("commandQueue").innerHTML = items.map(([title, note, count, tabId]) => `
      <button type="button" class="commandQueueItem" data-open-tab="${tabId}">
        <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(note)}</small></span>
        <span class="commandQueueCount">${count}</span>
      </button>
    `).join("");
  }

  function renderRegionStaffing() {
    const grouped = {};
    state.events.forEach((event) => {
      const region = eventRegion(event);
      grouped[region] ||= { total: 0, staffed: 0 };
      grouped[region].total += 1;
      if (Number(event.bookingCount || 0) > 0) grouped[region].staffed += 1;
    });
    const entries = Object.entries(grouped).sort(([left], [right]) => left.localeCompare(right));
    $("commandRegionStaffing").innerHTML = entries.length ? entries.map(([region, counts]) => {
      const percent = Math.round((counts.staffed / counts.total) * 100);
      return `<div class="commandRegionRow"><span>${escapeHtml(region)}</span><div class="commandRegionTrack" role="progressbar" aria-label="${escapeHtml(region)} staffing" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percent}%"></span></div><strong>${percent}%</strong></div>`;
    }).join("") : "<p>No upcoming regions to summarize.</p>";
  }

  function renderRows() {
    const events = filteredEvents();
    const rows = $("commandEventRows");
    $("commandEmpty").classList.toggle("hidden", events.length > 0);
    $("commandEmpty").textContent = events.length ? "" : "No upcoming events match these filters.";
    rows.innerHTML = events.map((event) => {
      const status = core.operationalStatus(event);
      const ambassadors = event.ambassadorNames?.length ? event.ambassadorNames.join(", ") : "Not assigned";
      return `
        <tr data-event-id="${escapeHtml(event.id)}" class="${event.id === state.selectedEventId ? "selected" : ""}">
          <td class="commandEventName"><strong>${escapeHtml(event.name || "Untitled Event")}</strong><small>${escapeHtml([event.brand, event.store].filter(Boolean).join(" • "))}</small></td>
          <td><strong>${escapeHtml(formatDate(event.eventDate))}</strong><br><small>${escapeHtml(eventTime(event))}</small></td>
          <td>${escapeHtml(eventRegion(event))}</td>
          <td>${escapeHtml(ambassadors)}</td>
          <td><span class="commandStatus ${status.key}">${escapeHtml(status.label)}</span></td>
          <td><button type="button" class="commandEditButton" data-edit-event="${escapeHtml(event.id)}">Edit event</button></td>
        </tr>`;
    }).join("");
  }

  function selectedEvent() {
    return state.events.find((event) => event.id === state.selectedEventId) || null;
  }

  function renderDetail() {
    const event = selectedEvent();
    if (!event) {
      $("commandEventDetail").innerHTML = "<p>Select an event to view and modify it.</p>";
      return;
    }
    const status = core.operationalStatus(event);
    const ambassadors = event.ambassadorNames?.length ? event.ambassadorNames.join(", ") : "Not assigned";
    $("commandEventDetail").innerHTML = `
      <div class="commandDetailTitle"><div><h3>${escapeHtml(event.name || "Untitled Event")}</h3><p>${escapeHtml([event.brand, event.store].filter(Boolean).join(" • "))}</p></div><span class="commandStatus ${status.key}">${escapeHtml(status.label)}</span></div>
      <div class="commandCallout">${escapeHtml(formatDate(event.eventDate))} · ${escapeHtml(eventTime(event))}</div>
      <div class="commandFacts">
        <div class="commandFact"><span>Region</span><strong>${escapeHtml(eventRegion(event))}</strong></div>
        <div class="commandFact"><span>Ambassador</span><strong>${escapeHtml(ambassadors)}</strong></div>
        <div class="commandFact"><span>Hourly rate</span><strong>${escapeHtml(event.hourlyRate ? formatMoney(event.hourlyRate) : "Not set")}</strong></div>
        <div class="commandFact"><span>Rep portal</span><strong>${event.portalVisible ? "Visible" : "Hidden"}</strong></div>
      </div>
      ${event.address ? `<div class="commandDetailSection"><h4>Location</h4><p>${escapeHtml(event.address)}</p></div>` : ""}
      ${event.details ? `<div class="commandDetailSection"><h4>Notes</h4><p>${escapeHtml(event.details)}</p></div>` : ""}
      <div class="commandDetailSection"><h4>Event workflow</h4>
        <div class="commandStep ${event.portalVisible ? "done" : ""}"><div><strong>${event.portalVisible ? "Event published" : "Event hidden"}</strong><small>Rep portal visibility</small></div></div>
        <div class="commandStep ${Number(event.bookingCount || 0) > 0 ? "done" : ""}"><div><strong>Ambassador assigned</strong><small>${escapeHtml(ambassadors)}</small></div></div>
        <div class="commandStep ${status.key === "confirmed" ? "done" : ""}"><div><strong>Booking confirmation</strong><small>${status.key === "confirmed" ? "All bookings confirmed" : "Waiting for operator"}</small></div></div>
        <div class="commandStep"><div><strong>Clock-in and recap</strong><small>Available on the event date</small></div></div>
      </div>
      <div class="commandDetailActions">
        <button type="button" class="primary" data-edit-event="${escapeHtml(event.id)}">Edit event</button>
        <button type="button" class="secondary" data-manage-event="${escapeHtml(event.id)}">Manage staff</button>
        ${status.key === "unconfirmed" ? `<button type="button" class="secondary" data-confirm-event>Confirm booking</button>` : ""}
      </div>`;
  }

  function renderEditForm(event) {
    const regionOptions = [...new Set([...areas, event.eventArea].filter(Boolean))];
    const hasConfirmed = Number(event.confirmedBookingCount || 0) > 0;
    $("commandEventDetail").innerHTML = `
      <form id="commandEditForm" class="commandEditForm">
        <div class="commandDetailTitle"><div><h3>Edit Event</h3><p>${escapeHtml(event.name || "Untitled Event")}</p></div></div>
        ${hasConfirmed ? `<div class="commandCallout">Changing the schedule will require ${event.confirmedBookingCount} confirmed ${event.confirmedBookingCount === 1 ? "booking" : "bookings"} to be reconfirmed.</div>` : ""}
        <label>Event date<input id="commandEditDate" type="date" value="${escapeHtml(event.eventDate || "")}" required></label>
        <div class="commandEditGrid">
          <label>Start time<input id="commandEditStart" type="time" value="${escapeHtml(event.localStartTime || "")}" required></label>
          <label>End time<input id="commandEditEnd" type="time" value="${escapeHtml(event.localEndTime || "")}" required></label>
        </div>
        <div class="commandEditGrid">
          <label>Event area<select id="commandEditArea" required>${regionOptions.map((area) => `<option value="${escapeHtml(area)}" ${area === event.eventArea ? "selected" : ""}>${escapeHtml(area)}</option>`).join("")}</select></label>
          <label>Hourly rate<input id="commandEditRate" type="number" min="0.01" step="0.01" value="${escapeHtml(event.hourlyRate || "")}" required></label>
        </div>
        <label>Details / notes<textarea id="commandEditDetails" rows="4">${escapeHtml(event.details || "")}</textarea></label>
        <label class="commandSwitchRow"><span><strong>Visible in rep portal</strong><small>Allow ambassadors to see and apply for this event.</small></span><input id="commandEditPortal" type="checkbox" ${event.portalVisible ? "checked" : ""}></label>
        <div class="commandDetailActions"><button type="button" class="secondary" id="commandCancelEdit">Cancel</button><button type="submit" class="primary" id="commandSaveEdit">Save changes</button></div>
      </form>`;
    $("commandEditForm").addEventListener("submit", saveEvent);
    $("commandCancelEdit").addEventListener("click", renderDetail);
  }

  async function saveEvent(submitEvent) {
    submitEvent.preventDefault();
    const event = selectedEvent();
    if (!event) return;
    const saveButton = $("commandSaveEdit");
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    hideMessage();
    try {
      const payload = core.editPayload(event, {
        eventDate: $("commandEditDate").value,
        startTime: $("commandEditStart").value,
        endTime: $("commandEditEnd").value,
        eventArea: $("commandEditArea").value,
        hourlyRate: $("commandEditRate").value,
        details: $("commandEditDetails").value,
        portalVisible: $("commandEditPortal").checked
      });
      const response = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not update the event.");
      await loadDashboard({ preserveMessage: true, throwOnError: true });
      const reconfirmation = Number(result.bookingsReconfirmationRequired || 0);
      showMessage(reconfirmation
        ? `Event updated. ${reconfirmation} confirmed ${reconfirmation === 1 ? "booking now needs" : "bookings now need"} reconfirmation.`
        : "Event updated successfully.", "ok");
    } catch (error) {
      showMessage(error.message, "error");
      saveButton.disabled = false;
      saveButton.textContent = "Save changes";
    }
  }

  function renderAll() {
    populateRegions();
    populateBrands();
    renderKpis();
    renderAttention();
    renderQueue();
    renderRegionStaffing();
    renderRows();
    renderDetail();
    $("commandUpdated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }

  async function loadDashboard(options = {}) {
    if (state.loading) return;
    state.loading = true;
    $("commandRefreshBtn").disabled = true;
    if (!options.preserveMessage) showMessage("Refreshing operations…", "ok");
    try {
      const [eventsData, bookingsData, recapsData, payrollData] = await Promise.all([
        fetchJson("/api/events"),
        fetchJson("/api/bookings?status=unconfirmed"),
        fetchJson("/api/recaps"),
        fetchJson("/api/payroll")
      ]);
      state.events = eventsData.events || [];
      state.unconfirmed = core.relevantUnconfirmedBookings(state.events, bookingsData.bookings || []);
      state.recaps = recapsData.recaps || [];
      state.payroll = payrollData.payroll || [];
      if (!state.events.some((event) => event.id === state.selectedEventId)) state.selectedEventId = state.events[0]?.id || "";
      state.loaded = true;
      renderAll();
      if (!options.preserveMessage) hideMessage();
    } catch (error) {
      showMessage(error.message, "error");
      if (options.throwOnError) throw error;
    } finally {
      state.loading = false;
      $("commandRefreshBtn").disabled = false;
    }
  }

  function overviewIsActive() {
    return $("commandCenterPage").classList.contains("active");
  }

  function showOverview() {
    if (!document.body.classList.contains("desktop-mode")) return;
    document.querySelectorAll(".page.active, .tab.active").forEach((element) => element.classList.remove("active"));
    $("commandCenterPage").classList.add("active");
    $("overviewTab").classList.add("active");
    if (!state.loaded) loadDashboard();
  }

  function leaveOverview() {
    $("commandCenterPage").classList.remove("active");
    $("overviewTab").classList.remove("active");
  }

  function openTab(tabId) {
    const tab = $(tabId);
    if (tab) tab.click();
  }

  $("overviewTab").addEventListener("click", showOverview);
  ["addEventTab", "assignTab", "confirmTab", "todayTab", "recapTab", "payrollTab"].forEach((id) => {
    $(id)?.addEventListener("click", leaveOverview, true);
  });
  $("commandAddEventBtn").addEventListener("click", () => openTab("addEventTab"));
  $("commandRefreshBtn").addEventListener("click", () => loadDashboard());
  ["commandPeriodFilter", "commandRegionFilter", "commandBrandFilter"].forEach((id) => $(id).addEventListener("change", renderRows));
  $("commandSearch").addEventListener("input", renderRows);

  $("commandEventRows").addEventListener("click", (clickEvent) => {
    const editButton = clickEvent.target.closest("[data-edit-event]");
    const row = clickEvent.target.closest("[data-event-id]");
    const id = editButton?.dataset.editEvent || row?.dataset.eventId;
    if (!id) return;
    state.selectedEventId = id;
    renderRows();
    if (editButton) renderEditForm(selectedEvent());
    else renderDetail();
  });

  $("commandEventDetail").addEventListener("click", (clickEvent) => {
    const editButton = clickEvent.target.closest("[data-edit-event]");
    if (editButton) renderEditForm(selectedEvent());
    const manageButton = clickEvent.target.closest("[data-manage-event]");
    if (manageButton) {
      if (typeof window.openEventInStaffing === "function") window.openEventInStaffing(manageButton.dataset.manageEvent);
      else openTab("assignTab");
    }
    if (clickEvent.target.closest("[data-confirm-event]")) openTab("confirmTab");
  });

  $("commandQueue").addEventListener("click", (clickEvent) => {
    const button = clickEvent.target.closest("[data-open-tab]");
    if (button) openTab(button.dataset.openTab);
  });

  document.addEventListener("amore:layoutchange", (event) => {
    if (event.detail?.mode === "desktop") showOverview();
    else if (overviewIsActive()) openTab("addEventTab");
  });

  window.addEventListener("focus", () => {
    if (overviewIsActive() && state.loaded) loadDashboard();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && overviewIsActive() && state.loaded) loadDashboard();
  });

  if (document.body.classList.contains("desktop-mode")) showOverview();
})();
