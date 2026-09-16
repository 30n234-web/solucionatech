const login = document.querySelector('#login');
const dashboard = document.querySelector('#dashboard');
const container = document.querySelector('#tickets');
const summary = document.querySelector('#summary');
let tickets = [];

const initialReference = new URLSearchParams(location.search).get('ticket') || '';
document.querySelector('#search').value = initialReference;

const styles = {
  Nuevo: 'bg-blue-100 text-blue-800',
  Contactado: 'bg-cyan-100 text-cyan-800',
  'En curso': 'bg-violet-100 text-violet-800',
  'Esperando respuesta': 'bg-amber-100 text-amber-900',
  Resuelto: 'bg-emerald-100 text-emerald-800'
};
const statuses = ['Nuevo', 'Contactado', 'En curso', 'Esperando respuesta', 'Resuelto'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const phone = value => { const digits = value.replace(/\D/g, ''); return digits.startsWith('34') ? digits : `34${digits}`; };

async function load() {
  const status = document.querySelector('#statusFilter').value;
  const priority = document.querySelector('#priorityFilter').value;
  const response = await fetch(`/api/admin/tickets?status=${encodeURIComponent(status)}&priority=${encodeURIComponent(priority)}`);
  if (response.status === 401) {
    login.classList.remove('hidden');
    dashboard.classList.add('hidden');
    return;
  }
  tickets = (await response.json()).tickets;
  login.classList.add('hidden');
  dashboard.classList.remove('hidden');
  render();
}

function render() {
  const query = document.querySelector('#search').value.toLowerCase();
  const shown = tickets.filter(ticket => `${ticket.reference} ${ticket.name} ${ticket.phone} ${ticket.service} ${ticket.description}`.toLowerCase().includes(query));
  summary.textContent = `${shown.length} ticket${shown.length === 1 ? '' : 's'} en esta vista`;
  container.innerHTML = shown.length ? shown.map(ticket => `
    <article class="rounded-3xl border bg-white p-5 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex flex-wrap gap-2">
            <span class="font-mono text-xs font-bold text-slate-500">${esc(ticket.reference)}</span>
            <span class="rounded-full px-2.5 py-1 text-xs font-bold ${styles[ticket.status]}">${esc(ticket.status)}</span>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">${esc(ticket.priority)}</span>
          </div>
          <h2 class="mt-3 text-xl font-black">${esc(ticket.name)}</h2>
          <p class="mt-1 text-sm text-slate-500">${new Date(ticket.created_at).toLocaleString('es-ES')}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button data-id="${ticket.id}" class="details-toggle rounded-xl border px-4 py-2 text-sm font-bold">Ver ticket y notas</button>
          <a class="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white" target="_blank" rel="noopener" href="https://wa.me/${phone(ticket.phone)}">WhatsApp</a>
        </div>
      </div>
      <div class="mt-5 grid gap-4 border-t pt-5 lg:grid-cols-[1fr_250px]">
        <div>
          <b class="text-sm">${esc(ticket.service)}</b>
          <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">${esc(ticket.description)}</p>
          <p class="mt-3 text-sm text-slate-500">${esc(ticket.phone)}${ticket.email ? ` · ${esc(ticket.email)}` : ''}</p>
        </div>
        <label class="grid gap-2 text-sm font-bold">Actualizar estado
          <select data-id="${ticket.id}" class="status h-10 rounded-xl border bg-white px-3 font-normal">${statuses.map(status => `<option ${status === ticket.status ? 'selected' : ''}>${status}</option>`).join('')}</select>
        </label>
      </div>
      <section data-details-id="${ticket.id}" class="ticket-details mt-5 hidden rounded-2xl bg-slate-50 p-4 sm:p-5">
        <p class="text-sm font-bold text-slate-500">Cargando notas…</p>
      </section>
    </article>`).join('') : '<div class="rounded-3xl border border-dashed bg-white p-12 text-center"><b>No hay tickets en esta vista</b></div>';

  document.querySelectorAll('.status').forEach(element => element.addEventListener('change', () => update(element.dataset.id, element.value)));
  document.querySelectorAll('.details-toggle').forEach(element => element.addEventListener('click', () => toggleDetails(element)));
}

async function toggleDetails(button) {
  const id = button.dataset.id;
  const details = document.querySelector(`[data-details-id="${id}"]`);
  const opening = details.classList.contains('hidden');
  details.classList.toggle('hidden');
  button.textContent = opening ? 'Cerrar detalle' : 'Ver ticket y notas';
  if (opening) await loadNotes(id, details);
}

async function loadNotes(id, details) {
  const response = await fetch(`/api/admin/tickets/${id}/notes`);
  if (!response.ok) {
    details.innerHTML = '<p class="text-sm font-bold text-red-600">No se pudieron cargar las notas.</p>';
    return;
  }
  const notes = (await response.json()).notes;
  details.innerHTML = `
    <h3 class="font-black">Notas internas</h3>
    <p class="mt-1 text-xs text-slate-500">Solo son visibles desde el panel administrativo.</p>
    <form class="mt-4 grid gap-3">
      <textarea name="note" required minlength="2" maxlength="1500" rows="3" class="rounded-xl border bg-white p-3 text-sm" placeholder="Ej.: Cliente contactado. Pendiente de confirmar disponibilidad."></textarea>
      <button class="w-fit rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">Añadir nota</button>
      <p class="note-error hidden text-sm font-bold text-red-600"></p>
    </form>
    <div class="notes-list mt-5 grid gap-3">${notes.length ? notes.map(note => noteMarkup(note)).join('') : '<p class="text-sm text-slate-500">Todavía no hay notas internas.</p>'}</div>`;
  details.querySelector('form').addEventListener('submit', event => addNote(event, id, details));
}

function noteMarkup(note) {
  return `<article class="rounded-xl border bg-white p-4"><p class="whitespace-pre-wrap text-sm leading-6">${esc(note.note)}</p><time class="mt-2 block text-xs text-slate-500">${new Date(note.created_at).toLocaleString('es-ES')}</time></article>`;
}

async function addNote(event, id, details) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const error = form.querySelector('.note-error');
  const note = new FormData(form).get('note');
  button.disabled = true;
  button.textContent = 'Guardando…';
  error.classList.add('hidden');
  const response = await fetch(`/api/admin/tickets/${id}/notes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note }) });
  const result = await response.json();
  if (!response.ok) {
    error.textContent = result.error || 'No se pudo guardar la nota.';
    error.classList.remove('hidden');
    button.disabled = false;
    button.textContent = 'Añadir nota';
    return;
  }
  await loadNotes(id, details);
}

async function update(id, status) {
  const response = await fetch(`/api/admin/tickets/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
  if (response.ok) await load();
}

login.querySelector('form').addEventListener('submit', async event => {
  event.preventDefault();
  const password = new FormData(event.currentTarget).get('password');
  const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
  if (!response.ok) {
    const error = login.querySelector('.error');
    error.textContent = 'Clave incorrecta.';
    error.classList.remove('hidden');
    return;
  }
  await load();
});

document.querySelector('#logout').addEventListener('click', async () => { await fetch('/api/admin/logout', { method: 'POST' }); location.reload(); });
document.querySelector('#refresh').addEventListener('click', load);
document.querySelector('#search').addEventListener('input', render);
document.querySelector('#statusFilter').addEventListener('change', load);
document.querySelector('#priorityFilter').addEventListener('change', load);
load();
