// Recap payroll is based only on the scheduled shift duration.
// Clock-in and clock-out remain visible for attendance review but never change pay.
(function () {
  function scheduledHours(recap) {
    const start = new Date(recap?.time?.scheduledStart || "");
    const end = new Date(recap?.time?.scheduledEnd || "");
    const minutes = (end.getTime() - start.getTime()) / 60000;
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    return minutes / 60;
  }

  function applyScheduledPayroll() {
    pendingRecaps.forEach((recap) => {
      const hours = scheduledHours(recap);
      const rate = Number(recap?.payroll?.payRate);

      recap.time ||= {};
      recap.payroll ||= {};
      recap.time.actualHours = hours;
      recap.payroll.actualHours = hours;
      recap.payroll.totalPay = hours !== null && Number.isFinite(rate)
        ? hours * rate
        : null;
    });
  }

  function relabelRenderedHours() {
    document.querySelectorAll(".recapDetailRow span").forEach((label) => {
      if (label.textContent === "Actual Hours") label.textContent = "Scheduled Hours";
    });
  }

  const originalRenderRecaps = renderRecaps;
  renderRecaps = function () {
    applyScheduledPayroll();
    originalRenderRecaps();
    relabelRenderedHours();
  };
})();
