export const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
export const money = cents => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(cents / 100);
export const dateTime = value => new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(value));
export async function api(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...options.headers } }); }
  catch { throw new Error("No hay conexión. Comprueba tu conexión e inténtalo de nuevo."); }
  let result;
  try { result = await response.json(); }
  catch { throw new Error("El servicio no está disponible. Inténtalo de nuevo."); }
  if (!response.ok) {
    const error = new Error(result.error || "No se pudo completar la operación.");
    error.status = response.status;
    throw error;
  }
  return result;
}
export function setupMenu() {
  const button = document.querySelector("#menuButton"), nav = document.querySelector("#navigation");
  if (!button || !nav) return;
  const close = () => { nav.classList.remove("open"); button.setAttribute("aria-expanded", "false"); };
  button.addEventListener("click", () => { const open = nav.classList.toggle("open"); button.setAttribute("aria-expanded", String(open)); });
  nav.addEventListener("click", event => { if (event.target.closest("a")) close(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && nav.classList.contains("open")) { close(); button.focus(); } });
}
