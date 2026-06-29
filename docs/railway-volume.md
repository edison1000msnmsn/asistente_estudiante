# Persistencia en Railway

El backend guarda alumnos, cupos, solicitudes y sesiones en `db.json`. El disco normal de un despliegue de Railway es efimero.

1. Abra el proyecto en Railway.
2. En el servicio `asistente_estudiante`, cree o adjunte un Volume.
3. Use `/data` como Mount Path.
4. Aplique los cambios y espere el nuevo despliegue.
5. Abra `/health` y confirme:

```json
{
  "storage": "railway_volume",
  "persistentStorage": true
}
```

Railway proporciona `RAILWAY_VOLUME_MOUNT_PATH` automaticamente. No es necesario crear esa variable manualmente.
