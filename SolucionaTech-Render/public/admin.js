import { api, esc, money, dateTime } from "/shared.js";
const $ = selector => document.querySelector(selector);
const login = $("#login"), dashboard = $("#dashboard"), dialog = $("#ticketDialog");
let tickets = [], labels = {}, currentId, truncated = false, requestNumber = 0;
const initialReference = new URLSearchParams(location.search).get("ticket") || "";
$("#search").value = initialReference;
if (initialReference) $("#statusFilter").value = "all";
function errorAt(selector, error) {
  const box = $(selector);
  box.textContent = error.message;
  box.hidden = false;
  if (error.status === 401) {
    dialog.close(); dashboard.hidden = true; login.hidden = false;
    tickets = []; $("#tickets").replaceChildren(); $("#detail").replaceChildren(); $("#notes").replaceChildren();
  }
}
async function load() {
  const number = ++requestNumber;
  $("#adminError").hidden = true;
  try {
    const params = new URLSearchParams({ status: $("#statusFilter").value, priority: $("#priorityFilter").value, urgency: $("#urgencyFilter").value });
    if (initialReference && $("#search").value === initialReference) params.set("reference", initialReference);
    const [data, counts] = await Promise.all([api("/api/admin/tickets?" + params), api("/api/admin/metrics")]);
    if (number !== requestNumber) return;
    tickets = data.tickets; truncated = data.truncated;
    login.hidden = true; dashboard.hidden = false;
    $("#metrics").innerHTML = [["pending", "Por atender", "↗"], ["urgent", "Necesitan atención", "!"], ["resolved", "Resueltos", "✓"], ["closed", "Archivados", "○"], ["total", "Desde el inicio", "∞"]].map(([key, title, mark]) =>
      `<div class="metric metric-${key}"><span class="metric-mark" aria-hidden="true">${mark}</span><strong>${esc(counts.metrics[key])}</strong><span>${title}</span></div>`).join("");
    render();
  } catch (error) { if (number === requestNumber) errorAt("#adminError", error); }
}
function render() {
  const query = $("#search").value.toLocaleLowerCase("es");
  const shown = tickets.filter(ticket => [ticket.reference, ticket.name, ticket.phone, ticket.service, ticket.description, ticket.category, ticket.device].join(" ").toLocaleLowerCase("es").includes(query));
  $("#summary").textContent = `${shown.length} solicitudes en esta vista.${truncated ? " Se muestran como máximo 250 tickets. Acota los filtros; la búsqueda se aplica a esta vista." : ""}`;
  $("#tickets").innerHTML = shown.length ? shown.map(ticket => { const subject = ticket.description?.split("\n")[0] || ticket.service; return `<tr>
    <td data-label="Ticket / cliente"><strong>${esc(ticket.name)}</strong><small class="reference">${esc(ticket.reference)}</small><small>${dateTime(ticket.created_at)}</small></td>
    <td data-label="Incidencia"><strong>${esc(subject)}</strong><small>${esc(ticket.category || "Categoría sin especificar")}</small></td>
    <td data-label="Estado"><span class="badge">${esc(labels[ticket.status] || ticket.status)}</span></td>
    <td data-label="Prioridad / urgencia">${esc(ticket.priority === "Alta" ? "Importante" : ticket.priority)}<small>${ticket.urgency_requested ? "Suplemento solicitado: +" + money(ticket.urgency_fee_cents) : "Sin suplemento"}</small></td>
    <td><button class="secondary" data-id="${esc(ticket.id)}" aria-label="Gestionar ticket de ${esc(ticket.name)}">Abrir <span aria-hidden="true">→</span></button></td></tr>`; }).join("") : '<tr><td colspan="5">No hay tickets que coincidan con estos filtros.</td></tr>';
}
$("#tickets").addEventListener("click", event => {
  const button = event.target.closest("[data-id]");
  if (button) openTicket(button.dataset.id);
});
async function openTicket(id) {
  const ticket = tickets.find(item => String(item.id) === String(id));
  if (!ticket) return;
  currentId = ticket.id;
  $("#detailError").hidden = true; $("#savedStatus").textContent = ""; $("#noteForm").reset();
  $("#dialogTitle").textContent = "Ticket " + ticket.reference;
  const descriptionParts = String(ticket.description || "").split(/\n\s*\n/), subject = descriptionParts.length > 1 ? descriptionParts.shift() : ticket.service;
  const detailText = descriptionParts.length ? descriptionParts.join("\n\n") : ticket.description;
  $("#detail").innerHTML = `<dl class="detail-grid"><div><dt>Cliente</dt><dd>${esc(ticket.name)}</dd></div><div><dt>Contacto</dt><dd>${esc(ticket.phone)}<br>${esc(ticket.email || "")}</dd></div><div><dt>Categoría / dispositivo</dt><dd>${esc(ticket.category || "Sin especificar")} · ${esc(ticket.device || "Sin especificar")}</dd></div><div><dt>Suplemento solicitado</dt><dd>${ticket.urgency_requested ? "+" + money(ticket.urgency_fee_cents) + " · sujeto a confirmación" : "No"}</dd></div></dl>
    <h3>${esc(subject)}</h3><p class="pre-wrap">${esc(detailText)}</p>`;
  const digits = ticket.phone.replace(/\D/g, "");
  if (digits) {
    const link = document.createElement("a");
    link.className = "button secondary"; link.target = "_blank"; link.rel = "noopener";
    link.href = "https://wa.me/" + (digits.startsWith("34") ? digits : "34" + digits);
    link.textContent = "Contactar por WhatsApp"; $("#detail").append(link);
  }
  $("#statusEdit").elements.status.value = ticket.status;
  renderStatusChoices(ticket.status);
  dialog.showModal();
  await loadNotes(ticket.id);
}
function renderStatusChoices(current) {
  $("#statusChoices").innerHTML = Object.entries(labels).map(([code, label]) => `<button type="button" class="status-choice ${code === current ? "is-active" : ""}" data-status="${esc(code)}" aria-pressed="${code === current}">${esc(label)}</button>`).join("");
}
$("#statusChoices").addEventListener("click", event => {
  const button = event.target.closest("[data-status]");
  if (!button) return;
  $("#statusEdit").elements.status.value = button.dataset.status;
  $("#statusChoices").querySelectorAll(".status-choice").forEach(item => { const active = item === button; item.classList.toggle("is-active", active); item.setAttribute("aria-pressed", String(active)); });
});
async function loadNotes(id) {
  $("#notes").textContent = "Cargando notas…";
  try {
    const result = await api(`/api/admin/tickets/${id}/notes`);
    if (String(currentId) !== String(id)) return;
    $("#notes").innerHTML = result.notes.length ? result.notes.map(note => `<article class="note"><p class="pre-wrap">${esc(note.note)}</p><time datetime="${esc(note.created_at)}">${dateTime(note.created_at)}</time></article>`).join("") : "<p>No hay notas internas.</p>";
  } catch (error) { errorAt("#detailError", error); $("#notes").textContent = ""; }
}
$("#statusEdit").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button"), id = currentId;
  button.disabled = true; $("#detailError").hidden = true;
  try {
    await api(`/api/admin/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ status: event.currentTarget.elements.status.value }) });
    $("#savedStatus").textContent = "Estado guardado. El cliente puede verlo en el seguimiento.";
    await load();
  } catch (error) { errorAt("#detailError", error); }
  finally { button.disabled = false; }
});
$("#noteForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector("button"), id = currentId;
  button.disabled = true; $("#detailError").hidden = true;
  try {
    await api(`/api/admin/tickets/${id}/notes`, { method: "POST", body: JSON.stringify({ note: form.elements.note.value }) });
    form.reset(); await loadNotes(id);
  } catch (error) { errorAt("#detailError", error); }
  finally { button.disabled = false; }
});
login.querySelector("form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector("button");
  button.disabled = true; $("#loginError").hidden = true;
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: form.elements.password.value }) });
    form.reset(); await load();
  } catch (error) { errorAt("#loginError", error); }
  finally { button.disabled = false; }
});
$("#closeDialog").addEventListener("click", () => dialog.close());
$("#logout").addEventListener("click", async () => {
  try { await api("/api/admin/logout", { method: "POST" }); location.reload(); }
  catch (error) { errorAt("#adminError", error); }
});
$("#refresh").addEventListener("click", load);
$("#search").addEventListener("input", render);
for (const id of ["statusFilter", "priorityFilter", "urgencyFilter"]) $("#" + id).addEventListener("change", load);
async function initialize() {
  try {
    const config = await api("/api/config"); labels = config.statuses;
    for (const [code, label] of Object.entries(labels)) {
      $("#statusFilter").add(new Option(label, code));
      $("#statusEdit").elements.status.add(new Option(label, code));
    }
    await load();
  } catch (error) { errorAt("#loginError", error); }
}
initialize();
