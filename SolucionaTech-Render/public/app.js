import { api, esc, money, dateTime, setupMenu } from "/shared.js";
setupMenu();
const form = document.querySelector("#ticketForm");
const submit = document.querySelector("#submitTicket");
const feedback = document.querySelector("#feedback");
let config;
let available = false;
let serverOffset = 0;
const categoryGrid = document.querySelector("#categoryGrid");
const issueDetails = document.querySelector("#issueDetails");
const selectedCategory = document.querySelector("#selectedCategory");
const categoryMeta = {
  "Windows / Sistema operativo": ["window", "Windows y sistema", "Arranque, actualizaciones o errores del sistema"],
  Hardware: ["chip", "Componentes y hardware", "Pantalla, batería, disco o piezas del equipo"],
  Software: ["app", "Programas y aplicaciones", "Una aplicación no abre o funciona mal"],
  "Internet / Wi-Fi / Redes": ["wifi", "Internet y Wi-Fi", "Conexión lenta, cortes o problemas de red"],
  "Seguridad / Malware": ["shield", "Seguridad y malware", "Virus, avisos extraños o actividad sospechosa"],
  Rendimiento: ["speed", "Equipo lento", "Bloqueos, lentitud o falta de espacio"],
  "Instalación / Configuración": ["tools", "Instalación y configuración", "Programas, impresoras, cuentas o periféricos"],
  "Otro / no estoy seguro": ["help", "No estoy seguro", "Descríbelo con tus palabras y te orientamos"],
  "Sistema y programas": ["window", "Sistema y programas", "Windows, aplicaciones, lentitud o errores"],
  "Internet y redes": ["wifi", "Internet y redes", "Wi-Fi, router o problemas de conexión"],
  "Seguridad, cuentas y correo": ["shield", "Seguridad, cuentas y correo", "Accesos, virus, contraseñas o email"],
  "Hardware (solo Madrid)": ["chip", "Hardware", "Componentes, reparación o montaje en Madrid"],
  "Periféricos y dispositivos": ["tools", "Periféricos y dispositivos", "Impresora, pantalla, móvil u otros equipos"],
  "Archivos, discos y copias": ["speed", "Archivos y copias", "Almacenamiento, migración o recuperación"],
  "Asesoramiento y compra": ["app", "Asesoramiento y compra", "Ayuda para elegir o mejorar tu equipo"],
  "No estoy seguro": ["help", "No estoy seguro", "Descríbelo con tus palabras y te orientamos"],
};
const icons = {
  window: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 9v11"/></svg>',
  chip: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 1v3m6-3v3M9 20v3m6-3v3M1 9h3m-3 6h3m16-6h3m-3 6h3"/></svg>',
  app: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9a12 12 0 0 1 16 0M7 13a8 8 0 0 1 10 0m-7 4a3 3 0 0 1 4 0"/><circle cx="12" cy="20" r="1"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-5"/></svg>',
  speed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17a9 9 0 1 1 16 0M12 13l4-4"/><circle cx="12" cy="17" r="1"/></svg>',
  tools: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 7 3-3 3 3-3 3M4 20l7-7m-5-1 6 6"/><path d="M5 4a4 4 0 0 0 5 5l8 8-3 3-8-8a4 4 0 0 1-3-5Z"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8m0 4h.01"/></svg>',
};
function chooseCategory(value, focusDetails = true) {
  const input = [...form.elements.category].find(item => item.value === value);
  if (!input) return;
  input.checked = true;
  categoryGrid.classList.add("has-selection");
  categoryGrid.querySelectorAll(".category-option").forEach(card => card.classList.toggle("is-selected", card.dataset.value === value));
  selectedCategory.textContent = categoryMeta[value]?.[1] || value;
  issueDetails.classList.add("is-open");
  issueDetails.setAttribute("aria-hidden", "false");
  issueDetails.inert = false;
  if (focusDetails) window.setTimeout(() => issueDetails.querySelector('input[name="title"]')?.focus({ preventScroll: true }), 260);
}
function resetCategoryPicker(focus = false) {
  form.elements.category.forEach(input => { input.checked = false; });
  categoryGrid.classList.remove("has-selection");
  categoryGrid.querySelectorAll(".category-option").forEach(card => card.classList.remove("is-selected"));
  issueDetails.classList.remove("is-open");
  issueDetails.setAttribute("aria-hidden", "true");
  issueDetails.inert = true;
  if (focus) categoryGrid.querySelector("input")?.focus();
}
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
    categoryGrid.innerHTML = config.categories.map((value, index) => {
      const [icon, title, description] = categoryMeta[value] || ["help", value, "Selecciona esta categoría para continuar"];
      return `<label class="category-option" data-value="${esc(value)}"><input type="radio" name="category" value="${esc(value)}" ${index === 0 ? "required" : ""}><span class="category-icon">${icons[icon]}</span><span class="category-copy"><b>${esc(title)}</b><small>${esc(description)}</small></span><span class="category-arrow" aria-hidden="true">→</span></label>`;
    }).join("");
    categoryGrid.addEventListener("change", event => chooseCategory(event.target.value));
    issueDetails.inert = true;
  }
  document.querySelector("#prices").innerHTML = config.prices.map(([name, price, description]) => `<div class="price-row"><div><strong>${esc(name)}</strong><p>${esc(description)}</p></div><span class="price-value">${money(price * 100)}</span></div>`).join("") +
    `<div class="price-row"><div><strong>Atención extraordinaria fuera de horario</strong><p>Sujeta a disponibilidad y confirmación. Se suma al servicio; no se cobra al abrir el ticket.</p></div><span class="price-value">+${money(config.schedule.urgencyFeeCents)}</span></div>`;
  submit.disabled = false;
  refreshHours();
}
form.elements.urgencyRequested.forEach(input => input.addEventListener("change", refreshHours));
document.querySelector("#changeCategory").addEventListener("click", () => resetCategoryPicker(true));
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!available) return;
  submit.disabled = true;
  submit.textContent = "Enviando…";
  feedback.hidden = true;
  try {
    const body = Object.fromEntries(new FormData(form));
    const title = body.title.trim();
    body.description = `${title}\n\n${body.description.trim()}`;
    body.service = config.services.at(-1);
    body.device = config.devices.at(-1);
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
    resetCategoryPicker();
    refreshHours();
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
