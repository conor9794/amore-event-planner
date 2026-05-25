let selectedPlace = null;
let autocomplete = null;

const $ = (id) => document.getElementById(id);

function showMessage(text, type = "ok") {
  const el = $("message");
  el.textContent = text;
  el.className = `message ${type}`;
}

function hideMessage() {
  $("message").className = "message hidden";
  $("message").textContent = "";
}

function setButtons(disabled) {
  $("draftBtn").disabled = disabled;
  $("publishBtn").disabled = disabled;
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
      <strong>${selectedPlace.name}</strong><br>
      ${selectedPlace.address || ""}
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
    $("selectedStore").className = "storeBox hidden";
  } catch (err) {
    showMessage(err.message, "error");
  } finally {
    setButtons(false);
  }
}

$("draftBtn").addEventListener("click", () => submitEvent(false));
$("publishBtn").addEventListener("click", () => submitEvent(true));

loadBrands();
loadConfigAndGoogle();
