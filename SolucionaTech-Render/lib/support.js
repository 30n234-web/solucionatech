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
export const SERVICE_GROUPS = {
  "Sistema y programas": [
    "Windows no inicia o muestra errores",
    "Equipo lento u optimización",
    "Instalación o configuración de programas",
    "Formateo e instalación limpia",
    "Drivers, actualizaciones o BIOS / UEFI",
  ],
  "Internet y redes": [
    "Problemas de Wi-Fi o conexión por cable",
    "Configuración de router o red doméstica",
    "Conexión lenta, inestable o sin acceso",
    "Configuración de impresora en red",
  ],
  "Seguridad, cuentas y correo": [
    "Virus, malware o ventanas sospechosas",
    "Problemas de acceso, contraseña o permisos",
    "Configuración o errores de correo electrónico",
    "Configuración de antivirus y seguridad",
  ],
  "Hardware (solo Madrid)": [
    "Diagnóstico o revisión física del equipo (solo Madrid)",
    "Reparación de hardware (solo Madrid)",
    "Instalación o sustitución de componentes (solo Madrid)",
    "Montaje completo de ordenador (solo Madrid)",
    "Temperaturas, ruidos o problemas de encendido (solo Madrid)",
  ],
  "Periféricos y dispositivos": [
    "Impresora o escáner",
    "Monitor, teclado, ratón, webcam o micrófono",
    "Dispositivo no reconocido",
    "Configuración de móvil o tablet",
  ],
  "Archivos, discos y copias": [
    "Disco lleno, particiones o almacenamiento",
    "Copia de seguridad o restauración",
    "Migración de archivos o cambio de disco",
    "Nube y sincronización",
  ],
  "Asesoramiento y compra": [
    "Asesoramiento para montaje de PC (10 €)",
    "Elección de ordenador, componente o periférico",
    "Actualización o ampliación de un PC",
  ],
  "Otro / no estoy seguro": [
    "No sé identificar el problema",
    "Otro servicio o presupuesto personalizado",
  ],
};
export const CATEGORIES = Object.keys(SERVICE_GROUPS);
export const DEVICES = ["PC sobremesa", "Portátil", "Tablet", "Smartphone", "Router / Red", "Impresora", "Otro periférico", "Servicio o cuenta online", "Otro / no estoy seguro"];
export const SERVICES = Object.values(SERVICE_GROUPS).flat();
export const PRICES = [
  ["Diagnóstico previo", 10, "Descontable si se repara"],
  ["Asesoramiento para montaje de PC", 10, "Selección de componentes compatibles según presupuesto y necesidades · servicio remoto"],
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
