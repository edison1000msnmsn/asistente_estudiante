# Asistente de estudiantes

Aplicacion web con backend publico para Railway y empaquetado Android con Capacitor.

## Ejecucion local

```bash
npm install
cp .env.example .env
npm run server
npm run dev
```

La app del alumno abre en `http://localhost:5173`.
El panel administrador abre en `http://localhost:5173/#admin`.

## Produccion

Configura en Railway las variables de `.env.example`. No publiques `ADMIN_TOKEN`, `ADMIN_PASSWORD` ni `TARGET_API_TOKEN` en el frontend.

## Modo recomendado

Usa `TARGET_MODE=api` siempre que tengas un endpoint oficial. El backend ejecuta los intentos con:

- limite por alumno
- limite global
- `idempotencyKey`
- `stopOnFirstSuccess`
- timeout
- backoff corto en errores
- logs completos en `server/data/db.json`

## Modo WebView

El modo WebView queda gobernado por selectores configurables:

- `input[name="dni"], input[placeholder*="DNI"], input[placeholder*="Documento"]`
- `input[name="codigo"], input[name="matricula"], input[placeholder*="Código"], input[placeholder*="Matricula"], input[placeholder*="Matrícula"]`
- `button[type="submit"], button, input[type="submit"]`

En Android con Capacitor, la pagina oficial debe abrirse dentro del contenedor nativo para permitir automatizacion controlada. Una PWA abierta en navegador normal no puede inyectar datos en otra pagina si el sitio bloquea iframe o acceso cross-origin.

## Android

Despues de instalar dependencias:

```bash
npm run build
npx cap add android
npx cap sync android
cd capacitor/android
gradlew assembleDebug
```

El APK debug se genera dentro de `capacitor/android/app/build/outputs/apk/debug/`.
