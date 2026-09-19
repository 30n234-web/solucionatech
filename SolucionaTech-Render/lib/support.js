// Public labels keep the original database values compatible with older clients.
export const STATUS_LABELS = {
  Nuevo: "Recibido",
  Contactado: "En espera",
  "En curso": "En proceso",
  "Esperando respuesta": "Pendiente de confirmación del cliente",
  Resuelto: "Resuelto",
  Cerrado: "Cerrado",
};
export const STATUSES = Object.keys(STATUS_LABELS);
export const PRIORITIES = ["Normal", "Alta", "Urgente"];
export const CATEGORIES = ["Windows / Sistema operativo", "Hardware", "Software", "Internet / Wi-Fi / Redes", "Seguridad / Malware", "Rendimiento", "Instalación / Configuración", "Otro / no estoy seguro"];
export const DEVICES = ["PC sobremesa", "Portátil", "Tablet", "Smartphone", "Router / Red", "Periférico", "Otro / no estoy seguro"];
export const SERVICES = ["Diagnóstico previo", "Configuración básica / periféricos / impresoras", "Optimización y puesta a punto de PC lento", "Desinfección de malware / virus", "Instalación de sistema operativo sin formateo", "Formateo completo e instalación limpia", "Otro / no estoy seguro"];
export const PRICES = [
  ["Diagnóstico previo", 10, "Descontable si se repara"],
  ["Configuración básica, periféricos o impresoras", 15, "Instalación y ajustes esenciales"],
  ["Optimización de PC lento", 20, "Limpieza lógica y puesta a punto"],
  ["Desinfección de malware o virus", 25, "Análisis, eliminación y comprobación"],
  ["Instalación de SO sin formateo", 25, "Actualización conservando datos"],
  ["Formateo e instalación limpia", 35, "Instalación completa desde cero"],
];
function hour(value, fallback) {
  const result = Number(value ?? fallback);
  if (!Number.isInteger(result) || result < 0 || result > 24) throw new Error("Horario no válido");
  return result;
}
export function supportConfig(env = process.env) {
  const startHour = hour(env.SUPPORT_START_HOUR, 10);
  const endHour = hour(env.SUPPORT_END_HOUR, 15);
  if (startHour >= endHour) throw new Error("El inicio debe preceder al fin del horario");
  const timeZone = env.SUPPORT_TIMEZONE || "Europe/Madrid";
  new Intl.DateTimeFormat("es-ES", { timeZone }).format();
  const urgencyFeeCents = Number(env.URGENCY_FEE_CENTS ?? 1000);
  if (!Number.isSafeInteger(urgencyFeeCents) || urgencyFeeCents < 0) throw new Error("Suplemento no válido");
  return { startHour, endHour, timeZone, urgencyFeeCents, days: [6, 0] };
}
export function isWithinHours(date, config) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: config.timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map(part => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return ["Sat", "Sun"].includes(parts.weekday) && minutes >= config.startHour * 60 && minutes < config.endHour * 60;
}
export function urgencyFor(body, date, config) {
  const requested = body.urgencyRequested === true || body.urgencyRequested === "true";
  if (body.urgencyRequested !== undefined && ![true, false, "true", "false"].includes(body.urgencyRequested)) throw new Error("Selección de urgencia no válida.");
  const outsideHours = !isWithinHours(date, config);
  if (!requested) return { requested: false, outsideHours, feeCents: 0 };
  if (!outsideHours) throw new Error("Estamos dentro del horario ordinario. Revisa la solicitud de urgencia.");
  if (body.urgencyAccepted !== true || body.urgencyFeeCents !== config.urgencyFeeCents) {
    throw new Error("Revisa y acepta el importe actualizado del suplemento.");
  }
  return { requested: true, outsideHours, feeCents: config.urgencyFeeCents };
}
