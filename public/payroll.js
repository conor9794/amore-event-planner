let pendingPayroll = [];
let expandedPayrollId = "";
let payingBookingId = "";
let payrollLoaded = false;

function payrollEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function payrollMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString([], { style: "currency", currency: "USD" });
}

function payrollNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "—";
}

function payrollDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function payrollDate(value) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function payrollDetailRow(label, value) {
  if (value === null || value === undefined || value === "") return "";
  return `<div class="payrollDetailRow"><span>${payrollEscape(label)}</span><strong>${payrollEscape(value)}</strong></div>`;
}

function showPayrollMessage(text, type = "ok") {
  const element = document.getElementById("payrollMessage");
  if (!element) return;
  element.textContent = text;
  element.className = `message ${type}`;
}

function hidePayrollMessage() {
  const element = document.getElementById("payrollMessage");
  if (!element) return;
  element.textContent = "";
  element.className = "message hidden";
}

function showPayrollToast(text, type = "ok") {
  const toast = document.getElementById("payrollToast");
  if (!toast) return;
  toast.textContent = text;
  toast.className = `recapToast ${type}`;
  window.clearTimeout(showPayrollToast.timer);
  showPayrollToast.timer = window.setTimeout(() => {
    toast.className = "recapToast hidden";
  }, 4000);
}

function switchToPayroll() {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
  document.getElementById("payrollPage")?.classList.add("active");
  document.getElementById("payrollTab")?.classList.add("active");
  if (!payrollLoaded) loadPayroll();
}

function leavePayroll() {
  document.getElementById("payrollPage")?.classList.remove("active");
  document.getElementById("payrollTab")?.classList.remove("active");
}

function payrollSearchText(booking) {
  return [
    booking.assignment,
    booking.ambassadorName,
    booking.ambassadorEmail,
    booking.brand,
    booking.store,
    booking.payroll?.expensePaymentMethod
  ].filter(Boolean).join(" ").toLowerCase();
}

function renderPayrollSummary(items) {
  const summary = document.getElementById("payrollSummary");
  if (!summary) return;
  const total = items.reduce((sum, booking) => sum + (Number(booking.payroll?.totalPayrollDue) || 0), 0);
  summary.innerHTML = `
    <div><strong>${payrollEscape(items.length)}</strong><span>Ready to Pay</span></div>
    <div><strong>${payrollEscape(payrollMoney(total))}</strong><span>Total Payroll Due</span></div>
  `;
}

function renderPayrollCard(booking) {
  const expanded = expandedPayrollId === booking.bookingId;
  const paying = payingBookingId === booking.bookingId;
  const totalDue = booking.payroll?.totalPayrollDue;
  const reimbursement = Number(booking.payroll?.reimbursementDue) || 0;
  const expenseAmount = Number(booking.payroll?.expenseAmount) || 0;
  const paymentMethod = booking.payroll?.expensePaymentMethod || (expenseAmount > 0 ? "Unspecified" : "No Expense");

  return `
    <article class="payrollCard ${expanded ? "expanded" : ""}">
      <button type="button" class="payrollCardSummary" data-payroll-toggle="${payrollEscape(booking.bookingId)}" aria-expanded="${expanded}">
        <div>
          <strong>${payrollEscape(booking.assignment || "Untitled Booking")}</strong>
          <span>${payrollEscape(booking.ambassadorName || "Unnamed Ambassador")}</span>
          <span>${payrollEscape([booking.brand, booking.store].filter(Boolean).join(" • "))}</span>
        </div>
        <div class="payrollCardAmount">
          <strong>${payrollEscape(payrollMoney(totalDue))}</strong>
          <span>${payrollEscape(payrollNumber(booking.payroll?.hours))} hrs</span>
        </div>
      </button>
      ${expanded ? `
        <div class="payrollBody">
          ${payrollDetailRow("Event Date", payrollDate(booking.eventDate))}
          ${payrollDetailRow("Ambassador", booking.ambassadorName)}
          ${payrollDetailRow("Email", booking.ambassadorEmail)}
          ${payrollDetailRow("Approved", payrollDateTime(booking.approvedAt))}
          ${payrollDetailRow("Pay Rate", payrollMoney(booking.payroll?.payRate))}
          ${payrollDetailRow("Actual Hours", payrollNumber(booking.payroll?.hours))}
          ${payrollDetailRow("Event Pay", payrollMoney(booking.payroll?.eventPay))}
          ${payrollDetailRow("Expense Payment Method", paymentMethod)}
          ${expenseAmount > 0 ? payrollDetailRow("Expense Amount", payrollMoney(expenseAmount)) : ""}
          ${payrollDetailRow("Reimbursement Due", payrollMoney(reimbursement))}
          ${payrollDetailRow("Total Payroll Due", payrollMoney(totalDue))}
          ${paymentMethod === "Unspecified" && expenseAmount > 0 ? `<div class="payrollWarning">Expense payment method is missing. Confirm whether this was paid personally or on the company card before paying.</div>` : ""}
          <div class="payrollWarning">Confirm the total payroll amount was sent before marking this booking paid.</div>
          <button type="button" class="primary payrollMarkPaid" data-payroll-paid="${payrollEscape(booking.bookingId)}" ${paying ? "disabled" : ""}>
            ${paying ? "Marking Paid..." : `Mark Paid — ${payrollEscape(payrollMoney(totalDue))}`}
          </button>
        </div>` : ""}
    </article>`;
}

function renderPayroll() {
  const list = document.getElementById("payrollList");
  const empty = document.getElementById("payrollEmpty");
  if (!list || !empty) return;

  const search = (document.getElementById("payrollSearch")?.value || "").trim().toLowerCase();
  const filtered = pendingPayroll.filter((booking) => !search || payrollSearchText(booking).includes(search));
  renderPayrollSummary(filtered);

  if (filtered.length === 0) {
    list.innerHTML = "";
    empty.textContent = pendingPayroll.length === 0
      ? "No approved bookings are waiting for payment."
      : "No payroll records match your search.";
    empty.className = "payrollEmpty";
    return;
  }

  empty.className = "payrollEmpty hidden";
  list.innerHTML = filtered.map(renderPayrollCard).join("");
}

async function loadPayroll() {
  hidePayrollMessage();
  const refresh = document.getElementById("refreshPayrollBtn");
  if (refresh) {
    refresh.disabled = true;
    refresh.textContent = "Refreshing...";
  }

  try {
    const response = await fetch("/api/payroll", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load payroll.");
    pendingPayroll = data.payroll || [];
    payrollLoaded = true;
    renderPayroll();
  } catch (error) {
    showPayrollMessage(error.message || "Could not load payroll.", "error");
  } finally {
    if (refresh) {
      refresh.disabled = false;
      refresh.textContent = "Refresh";
    }
  }
}

async function markPayrollPaid(bookingId) {
  const booking = pendingPayroll.find((item) => item.bookingId === bookingId);
  if (!booking) return;

  const confirmed = window.confirm(
    `Confirm ${payrollMoney(booking.payroll?.totalPayrollDue)} was paid to ${booking.ambassadorName || "this ambassador"}?`
  );
  if (!confirmed) return;

  payingBookingId = bookingId;
  renderPayroll();

  try {
    const response = await fetch("/api/payroll", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not mark this booking paid.");

    pendingPayroll = pendingPayroll.filter((item) => item.bookingId !== bookingId);
    expandedPayrollId = "";
    showPayrollToast(`Paid ${payrollMoney(data.totalPay)} and recorded the payment time.`, "ok");
  } catch (error) {
    showPayrollToast(error.message || "Could not mark this booking paid.", "error");
  } finally {
    payingBookingId = "";
    renderPayroll();
  }
}

document.getElementById("payrollTab")?.addEventListener("click", switchToPayroll);
["addEventTab", "assignTab", "confirmTab", "todayTab", "recapTab"].forEach((id) => {
  document.getElementById(id)?.addEventListener("click", leavePayroll, true);
});
document.getElementById("payrollSearch")?.addEventListener("input", renderPayroll);
document.getElementById("refreshPayrollBtn")?.addEventListener("click", loadPayroll);
document.getElementById("payrollList")?.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-payroll-toggle]");
  if (toggle) {
    const id = toggle.dataset.payrollToggle;
    expandedPayrollId = expandedPayrollId === id ? "" : id;
    renderPayroll();
    return;
  }

  const paid = event.target.closest("[data-payroll-paid]");
  if (paid && !paid.disabled) markPayrollPaid(paid.dataset.payrollPaid);
});
