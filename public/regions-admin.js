(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const tab = $("regionsAdminTab");
  const page = $("regionsAdminPage");
  if (!tab || !page) return;

  let busy = false;

  function message(text, error) {
    const box = $("regionsAdminMessage");
    box.textContent = text;
    box.className = "message " + (error ? "error" : "ok");
  }

  async function refresh() {
    const list = $("regionsAdminList");
    list.textContent = "Loading available regions…";
    try {
      const response = await fetch("/api/regions", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load regions.");
      const data = await response.json();
      if (!Array.isArray(data.regions)) throw new Error("Invalid region response.");
      list.replaceChildren();
      for (const region of data.regions) {
        const item = document.createElement("li");
        const name = document.createElement("strong");
        name.textContent = String(region.name || "");
        const state = document.createElement("span");
        state.textContent = String(region.state || "");
        item.append(name, state);
        list.appendChild(item);
      }
      if (!data.regions.length) list.textContent = "No approved regions.";
    } catch (err) {
      list.textContent = err.message || "Could not load regions.";
    }
  }

  function open() {
    document.querySelectorAll(".page, .tab").forEach((element) => element.classList.remove("active"));
    page.classList.add("active");
    tab.classList.add("active");
    refresh();
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    const name = $("regionsAdminName").value.trim().replace(/\s+/g, " ");
    const state = $("regionsAdminState").value;
    if (!name || !state) return message("Enter a region name and state.", true);
    if (!window.confirm('Add "' + name + '" (' + state + ') as an approved event area?')) return;

    busy = true;
    $("regionsAdminSave").disabled = true;
    message("Saving region…", false);
    try {
      const response = await fetch("/api/region-admin", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, state })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save region.");
      $("regionsAdminName").value = "";
      $("regionsAdminState").value = "";
      message('Region "' + data.region.name + '" added. It is now available when creating events.', false);
      await refresh();
      if (typeof window.loadEventAreas === "function") await window.loadEventAreas();
    } catch (err) {
      message(err.message || "Could not save region.", true);
    } finally {
      busy = false;
      $("regionsAdminSave").disabled = false;
    }
  }

  tab.addEventListener("click", open);
  $("regionsAdminForm").addEventListener("submit", save);
  $("regionsAdminRefresh").addEventListener("click", refresh);
})();
