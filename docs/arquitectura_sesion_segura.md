# Arquitectura de sesion segura

## Motivo del rediseño

La pagina oficial incorporo:

- Cloudflare Turnstile.
- Token CSRF de corta duracion.
- Fingerprint del dispositivo.
- Restriccion CORS al origen `https://comedor.uncp.edu.pe`.
- Campo honeypot.

El endpoint visible `POST https://comensales.uncp.edu.pe/api/registros` no es una API
publica para integraciones. La cola Railway y los disparos directos quedan
desactivados porque producirian respuestas `403` y no pueden completar Turnstile.

## Flujo actual

1. El alumno verifica su autorizacion.
2. Pulsa `Preparar registro` entre las 06:57 y las 06:59.
3. Railway crea una preparacion idempotente y entrega un token de reporte.
4. Android abre una sola WebView en la URL oficial.
5. La pagina oficial conserva su sesion y consulta internamente cuándo abre el formulario.
6. La app completa DNI y codigo mediante eventos normales del formulario.
7. La app espera que el widget oficial de Turnstile indique que la seguridad esta lista.
8. Al llegar la hora objetivo realiza un unico clic, sin forzar el boton.
9. La app detecta el resultado visible, guarda una captura y reporta el estado.
10. Railway descuenta el cupo interno solo despues de una confirmacion visible.

## Garantias

- No hay solicitudes directas al endpoint protegido.
- No hay refrescos repetidos.
- No hay reutilizacion ni lectura externa del token Turnstile.
- No hay multiples clics.
- El exito es inmutable frente a reportes tardios.
- Una preparacion repetida reutiliza la misma sesion logica.
- El token de reporte es necesario para actualizar estados.
- El codigo de matricula se compara sin diferenciar mayusculas y minusculas.

## Limite inevitable

Turnstile puede aprobar la sesion automaticamente o solicitar interaccion. La
aplicacion no puede garantizar un proceso desatendido cuando Cloudflare exige una
comprobacion manual. Este comportamiento depende exclusivamente de Cloudflare y
no debe evadirse.

## Estados

```text
prepared
page_loading
form_waiting
security_pending
security_ready
ready_to_submit
submitted
success
already_issued
sold_out
closed
invalid_student
restricted
manual_required
timeout
cancelled
failed
```

## Pruebas

```bash
npm run test:server
npm run build
npm run cap:sync
npm run android:debug
```
