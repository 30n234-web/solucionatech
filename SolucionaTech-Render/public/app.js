import { api, esc, money, dateTime, setupMenu } from "/shared.js";
setupMenu();
const form = document.querySelector("#ticketForm");
const submit = document.querySelector("#submitTicket");
const feedback = document.querySelector("#feedback");
const serviceNotice = document.querySelector("#serviceNotice");
let config;
let available = false;
let serverOffset = 0;
function withinHours() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: config.schedule.timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(Date.now() + serverOffset)).map(part => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return ["Sat", "Sun"].includes(parts.weekday) && minutes >= config.schedule.startHour * 60 && minutes < config.schedule.endHour * 60;
}
function refreshHours() {
  if (!config || !available) return;
  const inside = withinHours();
  document.querySelector("#hoursNotice").textContent = inside
    ? "Estamos dentro del horario ordinario. La prioridad no garantiza atención inmediata."
    : "Ahora estamos fuera del horario ordinario. Puedes dejar tu solicitud sin suplemento o solicitar atención extraordinaria.";
  document.querySelector("#urgencyOptions").hidden = inside;
  if (inside) {
    form.elements.urgencyRequested.value = "false";
    form.elements.urgencyAccepted.checked = false;
  }
  const requested = !inside && form.elements.urgencyRequested.value === "true";
  document.querySelector("#feeConsent").hidden = !requested;
  form.elements.urgencyAccepted.required = requested;
}
function refreshServiceNotice() {
  const service = form.elements.service.value;
  if (service.includes("solo Madrid") || service === "Montaje completo de ordenador (solo Madrid)") {
    serviceNotice.textContent = "Este servicio requiere manipulación física del equipo y solo se atiende presencialmente en Madrid.";
    return;
  }
  if (service === "Asesoramiento para montaje de PC") {
    serviceNotice.textContent = "Servicio remoto por 10 €: selección de componentes y comprobación de compatibilidad según presupuesto y necesidades.";
    return;
  }
  serviceNotice.textContent = service ? "La modalidad se confirmará al revisar tu solicitud." : "Selecciona un servicio para ver su modalidad.";
}
async function loadConfig(first = false) {
  const latest = await api("/api/config");
  const changedFee = config && config.schedule.urgencyFeeCents !== latest.schedule.urgencyFeeCents;
  config = latest;
  serverOffset = Date.parse(config.serverTime) - Date.now();
  available = true;
  if (changedFee) form.elements.urgencyAccepted.checked = false;
  const hours = `Sábados y domingos · ${String(config.schedule.startHour).padStart(2, "0")}:00–${String(config.schedule.endHour).padStart(2, "0")}:00`;
  document.querySelectorAll("[data-schedule]").forEach(node => { node.textContent = hours; });
  document.querySelector("#feeLabel").textContent = "+" + money(config.schedule.urgencyFeeCents);
  if (first) {
    for (const [field, list] of [["service", config.services], ["category", config.categories], ["device", config.devices]]) {
      for (const value of list) form.elements[field].add(new Option(value, value));
    }
  }
  document.querySelector("#prices").innerHTML = config.prices.map(([name, price, description]) => `<div class="price-row"><div><strong>${esc(name)}</strong><p>${esc(description)}</p></div><span class="price-value">${money(price * 100)}</span></div>`).join("") +
    `<div class="price-row"><div><strong>Atención extraordinaria fuera de horario</strong><p>Sujeta a disponibilidad y confirmación. Se suma al servicio; no se cobra al abrir el ticket.</p></div><span class="price-value">+${money(config.schedule.urgencyFeeCents)}</span></div>`;
  submit.disabled = false;
  refreshHours();
  refreshServiceNotice();
}
form.elements.urgencyRequested.forEach(input => input.addEventListener("change", refreshHours));
form.elements.service.addEventListener("change", refreshServiceNotice);
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!available) return;
  submit.disabled = true;
  submit.textContent = "Enviando…";
  feedback.hidden = true;
  try {
    const body = Object.fromEntries(new FormData(form));
    body.urgencyRequested = body.urgencyRequested === "true";
    body.urgencyAccepted = form.elements.urgencyAccepted.checked;
    body.urgencyFeeCents = config.schedule.urgencyFeeCents;
    body.privacyVersion = config.privacyVersion;
    const result = await api("/api/tickets", { method: "POST", body: JSON.stringify(body) });
    if (!result.reference) throw new Error("No se recibió una referencia. Inténtalo de nuevo.");
    feedback.className = "success";
    feedback.innerHTML = `<strong>Ticket recibido.</strong><p class="reference">${esc(result.reference)}</p><button type="button" class="secondary" id="copyReference">Copiar referencia</button><p>Guárdala para consultar tu solicitud.${result.urgencyRequested ? " Urgencia solicitada; pendiente de confirmar disponibilidad. No se ha realizado ningún cobro." : ""}</p>`;
    document.querySelector("#copyReference").addEventListener("click", async event => {
      try { await navigator.clipboard.writeText(result.reference); event.target.textContent = "Referencia copiada"; }
      catch { event.target.textContent = "Selecciona y copia la referencia de arriba"; }
    });
    document.querySelector("#statusForm").elements.reference.value = result.reference;
    form.reset();
    refreshHours();
    refreshServiceNotice();
  } catch (error) {
    feedback.className = "error";
    feedback.textContent = error.message;
    if (error.status === 409) {
      form.elements.urgencyAccepted.checked = false;
      try { await loadConfig(); } catch { available = false; }
    }
  } finally {
    feedback.hidden = false;
    submit.disabled = !available;
    submit.textContent = "Abrir ticket gratis";
  }
});
document.querySelector("#statusForm").addEventListener("submit", async event => {
  event.preventDefault();
  const statusForm = event.currentTarget, button = statusForm.querySelector("button"), box = document.querySelector("#statusResult");
  button.disabled = true;
  button.textContent = "Consultando…";
  box.hidden = true;
  try {
    const reference = statusForm.elements.reference.value.trim().toUpperCase();
    const result = await api("/api/tickets/status/" + encodeURIComponent(reference));
    const ticket = result.ticket;
    const labels = config?.statuses || {};
    box.className = "";
    box.innerHTML = `<div class="status-head"><span class="reference">${esc(ticket.reference)}</span><span class="badge">${esc(ticket.statusLabel || ticket.status)}</span></div>
    <p><strong>${esc(ticket.service)}</strong><br>Prioridad: ${esc(ticket.priority === "Alta" ? "Importante" : ticket.priority)}<br><small>Última actualización: ${dateTime(ticket.updated_at)}</small></p>
    ${ticket.urgency_requested ? `<p class="notice">Atención extraordinaria solicitada (+${money(ticket.urgency_fee_cents)}), sujeta a confirmación.</p>` : ""}
    <div class="state-list" aria-label="Estados posibles del ticket">${Object.entries(labels).map(([code, label]) => `<span class="badge ${ticket.status === code ? "current" : ""}" ${ticket.status === code ? 'aria-current="step"' : ""}>${esc(label)}</span>`).join("")}</div>
    <h3>Historial de tu solicitud</h3><ol class="timeline">${result.history.map(item => `<li><strong>${esc(item.label || item.status)}</strong><time datetime="${esc(item.created_at)}">${dateTime(item.created_at)}</time>${item.kind === "snapshot" ? "<small>Último estado conocido antes de incorporar el historial.</small>" : ""}</li>`).join("")}</ol>`;
  } catch (error) { box.className = "error"; box.textContent = error.message; }
  finally { box.hidden = false; button.disabled = false; button.textContent = "Consultar estado"; }
});
loadConfig(true).catch(error => {
  available = false;
  feedback.hidden = false;
  feedback.className = "error";
  feedback.textContent = "No se pudo cargar el formulario. Recarga la página para intentarlo de nuevo.";
  document.querySelector("#prices").textContent = "No se pudieron cargar las tarifas.";
  document.querySelector("#hoursNotice").textContent = "Horario temporalmente no disponible.";
});
setInterval(refreshHours, 30000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && config) loadConfig().catch(() => {
    available = false; submit.disabled = true;
    feedback.hidden = false; feedback.className = "error";
    feedback.textContent = "No se pudo actualizar el horario. Recarga la página antes de enviar.";
  });
});
