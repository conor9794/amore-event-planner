(function () {
  let editingBookingId = "";

  const style = document.createElement("style");
  style.textContent = `
    .staffActions { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
    .staffActions button { width:auto; min-height:36px; padding:8px 12px; }
    .staffRemoveBtn { border:1px solid currentColor; background:transparent; }
    .staffEditNotice { margin:10px 0 0; font-size:0.92rem; }
    #cancelStaffChangeBtn { margin-left:8px; }
  `;
  document.head.appendChild(style);

  function getBooking(bookingId) {
    return currentBookings.find((booking) => booking.id === bookingId);
  }

  function resetEditMode() {
    editingBookingId = "";
    const createBtn = document.getElementById("createBookingBtn");
    if (createBtn) createBtn.textContent = "Create Booking";
    document.getElementById("cancelStaffChangeBtn")?.remove();
  }

  function addCancelButton() {
    if (document.getElementById("cancelStaffChangeBtn")) return;
    const createBtn = document.getElementById("createBookingBtn");
    if (!createBtn) return;
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.id = "cancelStaffChangeBtn";
    cancel.className = "secondary";
    cancel.textContent = "Cancel Change";
    cancel.addEventListener("click", () => {
      resetEditMode();
      selectedAmbassadorId = "";
      document.getElementById("assignAmbassador").value = "";
      document.getElementById("ambassadorSearch").value = "";
      renderSelectedAmbassador();
      renderAmbassadorResults();
      hideAssignMessage();
    });
    createBtn.insertAdjacentElement("afterend", cancel);
  }

  renderBookedList = function () {
    const box = document.getElementById("bookedBox");
    const list = document.getElementById("bookedList");

    if (currentBookings.length === 0) {
      box.className = "detailBox hidden";
      list.innerHTML = "";
      return;
    }

    list.innerHTML = currentBookings.map((booking) => `
      <div class="item" data-booking-row="${escapeHtml(booking.id)}">
        <strong>${escapeHtml(booking.ambassadorName || booking.assignment || "Booked Ambassador")}</strong>
        ${booking.ambassadorEmail ? `<br>${escapeHtml(booking.ambassadorEmail)}` : ""}
        ${booking.bookingConfirmed ? `<br><em>Confirmed</em>` : `<br><em>Save the Date / Not Confirmed</em>`}
        <div class="staffActions">
          <button type="button" class="miniButton staffChangeBtn" data-booking-id="${escapeHtml(booking.id)}">Change Staff</button>
          <button type="button" class="miniButton staffRemoveBtn" data-booking-id="${escapeHtml(booking.id)}">Remove Staff</button>
        </div>
      </div>
    `).join("");
    box.className = "detailBox";
  };

  async function refreshEventStaff() {
    const eventId = selectedEventId || document.getElementById("assignEvent")?.value || "";
    if (!eventId) return;
    await loadBookingsForEvent(eventId);
    renderInterestList();
  }

  document.getElementById("bookedList")?.addEventListener("click", async (event) => {
    const changeBtn = event.target.closest(".staffChangeBtn");
    const removeBtn = event.target.closest(".staffRemoveBtn");

    if (changeBtn) {
      const booking = getBooking(changeBtn.dataset.bookingId);
      if (!booking) return;

      editingBookingId = booking.id;
      selectedAmbassadorId = "";
      document.getElementById("assignAmbassador").value = "";
      document.getElementById("ambassadorSearch").value = "";
      renderSelectedAmbassador();
      renderAmbassadorResults();

      const createBtn = document.getElementById("createBookingBtn");
      createBtn.textContent = "Save Staff Change";
      addCancelButton();
      showAssignMessage(`Changing staff for ${booking.ambassadorName || "this booking"}. Select the replacement ambassador, then tap Save Staff Change.`, "ok");
      document.getElementById("ambassadorSearch").focus();
      return;
    }

    if (removeBtn) {
      const booking = getBooking(removeBtn.dataset.bookingId);
      if (!booking) return;
      const name = booking.ambassadorName || "this ambassador";
      if (!window.confirm(`Remove ${name} from this event? This deletes the booking.`)) return;

      showAssignMessage(`Removing ${name}...`, "ok");
      try {
        const res = await fetch("/api/staff-bookings", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId: booking.id })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not remove staff.");

        resetEditMode();
        unconfirmedBookings = [];
        await refreshEventStaff();
        showAssignMessage(`${name} was removed from the event.`, "ok");
      } catch (err) {
        showAssignMessage(err.message, "error");
      }
    }
  });

  document.getElementById("createBookingBtn")?.addEventListener("click", async (event) => {
    if (!editingBookingId) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const ambassadorId = selectedAmbassadorId || document.getElementById("assignAmbassador")?.value || "";
    const ambassador = ambassadors.find((item) => item.id === ambassadorId);
    const booking = getBooking(editingBookingId);

    if (!ambassadorId) {
      showAssignMessage("Select the replacement ambassador.", "error");
      return;
    }

    const oldName = booking?.ambassadorName || "Current staff";
    const newName = ambassadorDisplayName(ambassador);
    const createBtn = document.getElementById("createBookingBtn");
    createBtn.disabled = true;
    showAssignMessage(`Changing staff from ${oldName} to ${newName}...`, "ok");

    try {
      const res = await fetch("/api/staff-bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: editingBookingId, ambassadorId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not change staff.");

      resetEditMode();
      selectedAmbassadorId = "";
      document.getElementById("assignAmbassador").value = "";
      document.getElementById("ambassadorSearch").value = "";
      renderSelectedAmbassador();
      unconfirmedBookings = [];
      await refreshEventStaff();
      showAssignMessage(`${newName} is now assigned. Please use Confirm Booking to confirm the replacement and send their confirmation email.`, "ok");
    } catch (err) {
      showAssignMessage(err.message, "error");
    } finally {
      createBtn.disabled = false;
    }
  }, true);

  document.getElementById("eventResults")?.addEventListener("click", resetEditMode);
  document.getElementById("clearEventBtn")?.addEventListener("click", resetEditMode);
})();
