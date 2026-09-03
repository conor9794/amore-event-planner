(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CommandCenterCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function dateValue(event) {
    const parsed = new Date(event?.startTime || event?.eventDate || "");
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function operationalStatus(event) {
    const bookingCount = Number(event?.bookingCount || 0);
    const confirmedCount = Number(event?.confirmedBookingCount || 0);
    if (bookingCount === 0) return { key: "unstaffed", label: "Needs staff" };
    if (confirmedCount < bookingCount) return { key: "unconfirmed", label: "Needs confirmation" };
    return { key: "confirmed", label: "Confirmed" };
  }

  function withinDays(event, days, now = new Date()) {
    const start = dateValue(event);
    if (!start) return false;
    const beginning = new Date(now);
    beginning.setHours(0, 0, 0, 0);
    const ending = new Date(beginning);
    ending.setDate(ending.getDate() + Number(days));
    ending.setHours(23, 59, 59, 999);
    return start >= beginning && start <= ending;
  }

  function withinPastDays(event, days, now = new Date()) {
    const start = dateValue(event);
    if (!start) return false;
    const ending = new Date(now);
    ending.setHours(0, 0, 0, 0);
    const beginning = new Date(ending);
    beginning.setDate(beginning.getDate() - Number(days));
    return start >= beginning && start < ending;
  }

  function pastOperationalStatus(event) {
    if (Number(event?.historyLockedBookingCount || 0) > 0 || event?.hasHistoricalActivity) {
      return { key: "locked", label: "History protected" };
    }
    return { key: "editable", label: "Editable" };
  }

  function searchText(event) {
    return [
      event?.name,
      event?.brand,
      event?.store,
      event?.address,
      event?.eventArea,
      ...(event?.ambassadorNames || [])
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function filterEvents(events, filters = {}, now = new Date()) {
    const period = String(filters.period || "all");
    const view = String(filters.view || "upcoming");
    const region = String(filters.region || "all");
    const brand = String(filters.brand || "all");
    const search = String(filters.search || "").trim().toLowerCase();
    return (events || []).filter((event) => {
      if (period !== "all" && !(view === "past" ? withinPastDays(event, Number(period), now) : withinDays(event, Number(period), now))) return false;
      if (region !== "all" && String(event.eventArea || event.state || "") !== region) return false;
      if (brand !== "all" && String(event.brand || "") !== brand) return false;
      if (search && !searchText(event).includes(search)) return false;
      return true;
    });
  }

  function payrollTotal(items) {
    return (items || []).reduce((sum, item) => {
      const amount = Number(item?.payroll?.totalPayrollDue);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }

  function relevantUnconfirmedBookings(events, bookings) {
    const relevantIds = new Set((events || []).flatMap((event) => (event.bookings || [])
      .filter((booking) => !booking.confirmed && !booking.historyLocked)
      .map((booking) => booking.id)));
    return (bookings || []).filter((booking) => relevantIds.has(booking.id));
  }

  function metrics(events, unconfirmed, recaps, payroll, now = new Date()) {
    const upcoming = events || [];
    return {
      upcoming: upcoming.length,
      nextSevenDays: upcoming.filter((event) => withinDays(event, 7, now)).length,
      needsStaff: upcoming.filter((event) => operationalStatus(event).key === "unstaffed").length,
      unconfirmed: (unconfirmed || []).length,
      recaps: (recaps || []).length,
      payrollCount: (payroll || []).length,
      payrollTotal: payrollTotal(payroll)
    };
  }

  function editPayload(event, values) {
    const payload = {
      eventId: event.id,
      eventArea: String(values.eventArea || "").trim(),
      hourlyRate: String(values.hourlyRate || "").trim(),
      details: String(values.details || "").trim(),
      portalVisible: Boolean(values.portalVisible)
    };
    const eventDate = String(values.eventDate || "");
    const startTime = String(values.startTime || "");
    const endTime = String(values.endTime || "");
    const scheduleChanged = eventDate !== String(event.eventDate || "")
      || startTime !== String(event.localStartTime || "")
      || endTime !== String(event.localEndTime || "");
    if (scheduleChanged) Object.assign(payload, { eventDate, startTime, endTime });
    return payload;
  }

  return { dateValue, operationalStatus, pastOperationalStatus, withinDays, withinPastDays, filterEvents, payrollTotal, relevantUnconfirmedBookings, metrics, editPayload };
});
