# Asistente de estudiantes

App web + backend Node.js para administrar alumnos autorizados, cupos, solicitudes, configuracion de hora objetivo e intentos controlados contra la pagina oficial.

## Scripts

```bash
npm install
npm run build
npm run server
```

## Railway

El servicio esta preparado para Nixpacks:

- Build: `npm install && npm run build`
- Start: `npm run server`
- Branch: `main`
- Root directory: vacio o `/`

Variables obligatorias:

```env
ADMIN_EMAIL=tu-correo-admin
ADMIN_PASSWORD=una-contrasena-segura
ADMIN_TOKEN=un-token-largo-seguro
ALLOWED_ORIGINS=https://tu-dominio-railway.up.railway.app,capacitor://localhost,http://localhost
TARGET_ENDPOINT=https://comedor.uncp.edu.pe/charola
TARGET_PAGE=https://comedor.uncp.edu.pe/charola
TARGET_MODE=webview
TARGET_API_TOKEN=
TZ=America/Lima
```

Cuando Railway genere el dominio publico, actualiza `ALLOWED_ORIGINS` y usa esa URL como backend para la app Android.
Para la web desplegada en el mismo servicio, deja `VITE_API_BASE` vacio o sin configurar; asi el frontend usa la misma URL de Railway.

## Pantallas

- Alumno: `/`
- Administrador: `/#admin`
- Salud del backend: `/health`

## Android

```bash
npm run build
npx cap sync android
cd capacitor/android
gradlew assembleDebug
```

APK debug:

```text
capacitor/android/app/build/outputs/apk/debug/app-debug.apk
```

## Seguridad

No subas `.env` al repositorio. Las credenciales admin se configuran solo en Railway.
