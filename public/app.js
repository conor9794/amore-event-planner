let selectedPlace = null;
let autocomplete = null;
let plannerEvents = [];
let ambassadors = [];
let currentBookings = [];

const $ = (id) => document.getElementById(id);

function showMessage(text, type = "ok") {
  const el = $("message");
  el.textContent = text;
  el.className = `message ${type}`;
}

function showAssignMessage(text, type = "ok") {
  const el = $("assignMessage");
  el.textContent = text;
  el.className = `message ${type}`;
}

function hideMessage() {
  $("message").className = "message hidden";
  $("message").textContent = "";
}

function hideAssignMessage() {
  $("assignMessage").className = "message hidden";
  $("assignMessage").textContent = "";
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark", isDark);
  const btn = $("themeToggle");
  if (btn) btn.textContent = isDark ? "Light" : "Dark";
  localStorage.setItem("amorePlannerTheme", isDark ? "dark" : "light");
}

function initTheme() {
  const saved = localStorage.getItem("amorePlannerTheme") || "light";
  applyTheme(saved);
  $("themeToggle")?.addEventListener("click", () => {
    applyTheme(document.body.classList.contains("dark") ? "light" : "dark");
  });
}

function setButtons(disabled) {
  $("draftBtn").disabled = disabled;
  $("publishBtn").disabled = disabled;
}

function setCreateBookingButton(disabled) {
  $("createBookingBtn").disabled = disabled;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function switchPage(pageName) {
  const isAssign = pageName === "assign";
  $("addEventPage").classList.toggle("active", !isAssign);
  $("assignPage").classList.toggle("active", isAssign);
  $("addEventTab").classList.toggle("active", !isAssign);
  $("assignTab").classList.toggle("active", isAssign);

  if (isAssign && plannerEvents.length === 0) {
    loadAssignData();
  }
}

async function loadConfigAndGoogle() {
  const res = await fetch("/api/config");
  const config = await res.json();

  if (!config.googleMapsApiKey) {
    showMessage("Missing Google Maps API key in Netlify environment variables.", "error");
    return;
  }

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsApiKey)}&libraries=places&callback=initGooglePlaces`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

window.initGooglePlaces = function () {
  autocomplete = new google.maps.places.Autocomplete($("storeSearch"), {
    fields: ["place_id", "name", "formatted_address", "geometry", "address_components"],
    types: ["establishment"]
  });

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();

    if (!place || !place.place_id) {
      selectedPlace = null;
      $("selectedStore").className = "storeBox hidden";
      return;
    }

    selectedPlace = normalizePlace(place);

    $("selectedStore").innerHTML = `
      <strong>${escapeHtml(selectedPlace.name)}</strong><br>
      ${escapeHtml(selectedPlace.address || "")}
    `;
    $("selectedStore").className = "storeBox";
  });
};

function normalizePlace(place) {
  const comps = place.address_components || [];
  const getComp = (type, key = "long_name") => {
    const item = comps.find(c => c.types.includes(type));
    return item ? item[key] : "";
  };

  return {
    googlePlaceId: place.place_id,
    name: place.name || $("storeSearch").value.trim(),
    address: place.formatted_address || "",
    city: getComp("locality") || getComp("sublocality") || getComp("administrative_area_level_2"),
    state: getComp("administrative_area_level_1", "short_name"),
    zip: getComp("postal_code"),
    latitude: place.geometry?.location?.lat ? place.geometry.location.lat() : null,
    longitude: place.geometry?.location?.lng ? place.geometry.location.lng() : null
  };
}

async function loadBrands() {
  const select = $("brand");
  const res = await fetch("/api/brands");
  const data = await res.json();

  if (!res.ok) {
    select.innerHTML = `<option value="">Could not load brands</option>`;
    showMessage(data.error || "Could not load brands.", "error");
    return;
  }

  select.innerHTML = `<option value="">Select brand...</option>`;
  data.brands.forEach(brand => {
    const option = document.createElement("option");
    option.value = brand.id;
    option.textContent = brand.name;
    option.dataset.name = brand.name;
    select.appendChild(option);
  });
}

async function submitEvent(publish) {
  hideMessage();

  const brandSelect = $("brand");
  const brandRecordId = brandSelect.value;
  const brandName = brandSelect.options[brandSelect.selectedIndex]?.dataset?.name || "";

  if (!brandRecordId) return showMessage("Select a brand.", "error");
  if (!selectedPlace) return showMessage("Select a store from the Google suggestions.", "error");

  const payload = {
    publish,
    brandRecordId,
    brandName,
    store: selectedPlace,
    eventDate: $("eventDate").value,
    startTime: $("startTime").value,
    endTime: $("endTime").value,
    hourlyRate: $("hourlyRate").value.trim(),
    details: $("details").value.trim()
  };

  if (!payload.eventDate || !payload.startTime || !payload.endTime || !payload.hourlyRate) {
    return showMessage("Fill out date, time, and hourly rate.", "error");
  }

  setButtons(true);
  showMessage(publish ? "Publishing event..." : "Saving draft...", "ok");

  try {
    const res = await fetch("/api/create-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Event creation failed.");

    showMessage(
      publish
        ? "Event created and published to the rep portal."
        : "Draft event created.",
      "ok"
    );

    $("eventForm").reset();
    selectedPlace = null;
    plannerEvents = [];
    $("selectedStore").className = "storeBox hidden";
  } catch (err) {
    showMessage(err.message, "error");
  } finally {
    setButtons(false);
  }
}

async function loadAssignData() {
  hideAssignMessage();
  setCreateBookingButton(true);
  showAssignMessage("Loading events and ambassadors...", "ok");

  try {
    const [eventsRes, ambassadorsRes] = await Promise.all([
      fetch("/api/events"),
      fetch("/api/ambassadors")
    ]);
    const eventsData = await eventsRes.json();
    const ambassadorsData = await ambassadorsRes.json();

    if (!eventsRes.ok) throw new Error(eventsData.error || "Could not load events.");
    if (!ambassadorsRes.ok) throw new Error(ambassadorsData.error || "Could not load ambassadors.");

    plannerEvents = eventsData.events || [];
    ambassadors = ambassadorsData.ambassadors || [];

    renderEventOptions();
    renderAmbassadorOptions();
    hideAssignMessage();
  } catch (err) {
    showAssignMessage(err.message, "error");
  } finally {
    setCreateBookingButton(false);
  }
}

function renderEventOptions() {
  const select = $("assignEvent");
  select.innerHTML = `<option value="">Select event...</option>`;

  plannerEvents.forEach((event) => {
    const option = document.createElement("option");
    option.value = event.id;
    option.textContent = `${event.name}${event.startTime ? ` — ${formatDateTime(event.startTime)}` : ""}`;
    select.appendChild(option);
  });
}

function renderAmbassadorOptions() {
  const search = $("ambassadorSearch").value.trim().toLowerCase();
  const bookedAmbassadorIds = new Set(currentBookings.flatMap((booking) => booking.ambassadorIds || []));
  const select = $("assignAmbassador");
  select.innerHTML = `<option value="">Select ambassador...</option>`;

  ambassadors
    .filter((ambassador) => ambassador.active !== false)
    .filter((ambassador) => {
      if (!search) return true;
      return `${ambassador.name} ${ambassador.email}`.toLowerCase().includes(search);
    })
    .forEach((ambassador) => {
      const option = document.createElement("option");
      option.value = ambassador.id;
      option.textContent = `${ambassador.name || ambassador.email}${ambassador.email ? ` — ${ambassador.email}` : ""}`;
      if (bookedAmbassadorIds.has(ambassador.id)) {
        option.disabled = true;
        option.textContent += " — already booked";
      }
      select.appendChild(option);
    });
}

async function handleEventChange() {
  const eventId = $("assignEvent").value;
  const event = plannerEvents.find((item) => item.id === eventId);
  currentBookings = [];
  hideAssignMessage();

  if (!event) {
    $("eventDetails").className = "detailBox hidden";
    $("bookedBox").className = "detailBox hidden";
    renderAmbassadorOptions();
    return;
  }

  $("eventDetails").innerHTML = `
    <strong>${escapeHtml(event.name)}</strong><br>
    ${event.eventDate ? `Date: ${escapeHtml(formatDate(event.eventDate))}<br>` : ""}
    ${event.startTime ? `Start: ${escapeHtml(formatDateTime(event.startTime))}<br>` : ""}
    ${event.endTime ? `End: ${escapeHtml(formatDateTime(event.endTime))}<br>` : ""}
    ${event.hourlyRate ? `Hourly Rate: ${escapeHtml(event.hourlyRate)}<br>` : ""}
    ${event.address ? `Address: ${escapeHtml(event.address)}<br>` : ""}
    ${event.status ? `Status: ${escapeHtml(event.status)}` : ""}
  `;
  $("eventDetails").className = "detailBox";

  await loadBookingsForEvent(eventId);
}

async function loadBookingsForEvent(eventId) {
  try {
    const res = await fetch(`/api/bookings?eventId=${encodeURIComponent(eventId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load bookings for this event.");

    currentBookings = data.bookings || [];
    renderBookedList();
    renderAmbassadorOptions();
  } catch (err) {
    showAssignMessage(err.message, "error");
  }
}

function renderBookedList() {
  const box = $("bookedBox");
  const list = $("bookedList");

  if (currentBookings.length === 0) {
    box.className = "detailBox hidden";
    list.innerHTML = "";
    return;
  }

  list.innerHTML = currentBookings.map((booking) => `
    <div class="item">
      <strong>${escapeHtml(booking.ambassadorName || booking.assignment || "Booked Ambassador")}</strong>
      ${booking.ambassadorEmail ? `<br>${escapeHtml(booking.ambassadorEmail)}` : ""}
    </div>
  `).join("");
  box.className = "detailBox";
}

async function createBooking() {
  hideAssignMessage();

  const eventId = $("assignEvent").value;
  const ambassadorId = $("assignAmbassador").value;
  const event = plannerEvents.find((item) => item.id === eventId);

  if (!eventId) return showAssignMessage("Select an event.", "error");
  if (!ambassadorId) return showAssignMessage("Select an ambassador.", "error");

  setCreateBookingButton(true);
  showAssignMessage("Creating booking...", "ok");

  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        ambassadorId,
        scheduledStart: event?.startTime || "",
        scheduledEnd: event?.endTime || "",
        sendSaveTheDate: $("sendSaveTheDate").checked
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Booking creation failed.");

    showAssignMessage(data.warning || "Booking created. Save the Date should send if the Airtable automation is active.", data.warning ? "error" : "ok");
    $("assignAmbassador").value = "";
    await loadBookingsForEvent(eventId);
  } catch (err) {
    showAssignMessage(err.message, "error");
  } finally {
    setCreateBookingButton(false);
  }
}

$("draftBtn").addEventListener("click", () => submitEvent(false));
$("publishBtn").addEventListener("click", () => submitEvent(true));
$("addEventTab").addEventListener("click", () => switchPage("add"));
$("assignTab").addEventListener("click", () => switchPage("assign"));
$("assignEvent").addEventListener("change", handleEventChange);
$("ambassadorSearch").addEventListener("input", renderAmbassadorOptions);
$("createBookingBtn").addEventListener("click", createBooking);

initTheme();
loadBrands();
loadConfigAndGoogle();
