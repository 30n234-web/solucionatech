# SolucionaTech

Sistema de ticketing para soporte informático freelance. Incluye página pública, panel privado, PostgreSQL y alertas de Telegram.

## Despliegue en Render

1. Sube este repositorio a GitHub.
2. En Render selecciona **New → Blueprint** y conecta el repositorio.
3. Render leerá `render.yaml` y creará el servicio web y PostgreSQL.
4. Introduce `ADMIN_PASSWORD`, `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` cuando se soliciten.
5. La web quedará disponible en `https://solucionatech.onrender.com` o en la variante libre que asigne Render.

La página pública está en `/` y el panel privado en `/admin`.
