# Cambios y verificación

Se conserva Express, PostgreSQL mediante DATABASE_URL (compatible con Supabase), las rutas / y /admin, la autenticación privada y las notificaciones Telegram. No se cambia el proveedor de alojamiento ni se incluyen credenciales.

## Funcionalidad

- Cabecera y navegación móvil, servicios, precios, pie y tres páginas legales.
- Categoría, dispositivo, servicio y prioridad mediante selectores.
- Solicitudes 24/7 y atención ordinaria sábado/domingo 10:00–15:00, Europe/Madrid. Horas y suplemento configurables en el servidor.
- Suplemento predeterminado de 10 €, tomado de la tarifa que ya existía. Solicitud explícita, aceptación e importe validados en servidor. No es una pasarela de cobro; no hay cobro ni promesa de atención inmediata al crear un ticket.
- Seguimiento privado con historial real y seis estados. Los códigos existentes se mantienen: Nuevo → Recibido; Contactado → En espera; En curso → En proceso; Esperando respuesta → Pendiente de confirmación del cliente; Resuelto y Cerrado.
- Dashboard con métricas globales, filtros, tabla adaptable, diálogo para estado y notas privadas.
- Telegram conserva el aviso y el enlace al panel; el mensaje se limita a la referencia, sin contacto ni descripción del cliente.

## Migración

sql/migrations/001_support.sql añade columnas y ticket_events dentro de una transacción con bloqueo asesor. No borra ni reescribe tickets o notas existentes. Admite ejecutar de nuevo la migración. El histórico anterior solo se representa por su último estado conocido, etiquetado como tal; no se inventan transiciones.

Ejecutar npm run migrate con DATABASE_URL apuntando a la base de destino antes de activar la nueva versión. El comando inicializa las tablas base si no existen y aplica la ampliación. Antes de desplegar, probar la migración en una copia de la base real, conservar un respaldo y confirmar permisos DDL. No se ha ejecutado contra producción. La migración habilita RLS en la tabla nueva sin políticas públicas; el backend debe conectarse con el propietario o un rol de servidor autorizado.

Las vistas previas no modifican el esquema automáticamente. AUTO_MIGRATE_SUPPORT=true permite la inicialización automática cuando se decida expresamente; por defecto está desactivada. Una base sin migrar no puede atender los nuevos endpoints de tickets. Usar una base separada para previews.

Para volver al código anterior, conservar las nuevas columnas y tablas. No ejecutar el init.sql antiguo contra una tabla eliminada, ni borrar el historial. Los tickets Cerrado seguirán existiendo aunque el panel anterior no conozca ese estado.

## Despliegue y configuración

Mantener en Vercel la carpeta raíz SolucionaTech-Render y las variables existentes. server.js exporta Express para Vercel y también admite npm start para servidor Node. Se mantienen los archivos de Render del repositorio sin cambios.

Configurar opcionalmente SUPPORT_START_HOUR, SUPPORT_END_HOUR, SUPPORT_TIMEZONE, URGENCY_FEE_CENTS. Empezar con 10:00–15:00; ampliar solo después de medir demanda. Configurar PUBLIC_URL con el dominio real.

Completar LEGAL_NAME, LEGAL_TAX_ID, LEGAL_ADDRESS y LEGAL_EMAIL antes de publicar. Son datos públicos, nunca secretos. Revisar proveedores efectivos, regiones, transferencias y plazos de conservación. Los textos preservan derechos irrenunciables y no incluyen una exención general de responsabilidad.

Fuentes para revisar los textos:

- [AEPD: derecho de información](https://www.aepd.es/derechos-y-deberes/conoce-tus-derechos/derecho-de-informacion).
- [Texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios](https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555).
- [Express en Vercel](https://vercel.com/docs/frameworks/backend/express).

## Pruebas

npm ci; npm run check; npm test.

Las pruebas usan PGlite, motor PostgreSQL local en memoria, y peticiones HTTP a Express. No necesitan secretos. Cubren compatibilidad y repetición de migración, estados, filtros, métricas, autenticación, notas privadas, datos no expuestos en seguimiento, tarifas manipuladas, prioridad sin recargo, horario y horario de verano/invierno. El envío Telegram se intercepta en pruebas; no se envían avisos reales.

En entornos que impidan crear procesos hijos con Node reciente, se pueden ejecutar con node --test --test-isolation=none test/*.test.js.

npm run preview inicia una demostración efímera en http://127.0.0.1:3100 con base en memoria, hora simulada fuera de horario y clave exclusivamente local demo-local. No usar ese servidor de pruebas en producción.

Verificado manualmente en navegador: crear ticket con suplemento, consultar referencia, acceder al panel, cambiar estado, añadir nota y consultar seguimiento. Diseño revisado en escritorio y a 390 px; menú móvil y páginas legales. No se ha verificado todavía un despliegue real de Vercel, ni la configuración o los datos reales de Supabase.
