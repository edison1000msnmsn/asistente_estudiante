# Manual tecnico

## Arquitectura

El proyecto usa arquitectura modular por capas. `app` contiene tema y rutas, `core` servicios transversales, `features` pantallas y modulos, `shared` modelos y widgets reutilizables.

## Librerias

- `go_router`: navegacion declarativa.
- `flutter_riverpod`: estado global.
- `hive`: persistencia local offline.
- `uuid`: identificadores.
- `intl`: formateo de fechas.

## Modelos

Incluye `ChildProfile`, `LearningModule`, `LearningActivity`, `ActivityAttempt`, `ModuleProgress`, `Achievement`, `AppSettings` y `PrePostTestRecord`.

## Repositorios

`AppRepository` abstrae Hive y expone metodos para perfil, configuracion, intentos, progreso, logros, reinicio y resumen local.

## Flujo de actividades

El banco `SeedData` contiene 80 retos offline distribuidos en 20 por modulo. La pantalla `ActivityScreen` selecciona el siguiente reto segun `completedActivities` del progreso local y renderiza una interaccion adecuada al tipo: contador, pintado, arrastrar y soltar, memoria o seleccion.

## Flujo de datos

UI -> Riverpod provider -> AppRepository -> Hive. Tras registrar un intento se recalcula progreso, estrellas y posible medalla.

## Persistencia

Hive guarda cajas para perfiles, progreso, intentos, logros, configuracion y sesiones. No se almacenan datos sensibles.

## Navegacion

`app/router.dart` define rutas para splash, onboarding, perfil, home, modulos, recompensa, progreso, panel adulto, mapa, configuracion e informacion academica.

## Pruebas

Ejecutar:

```bash
flutter test
```

Incluye pruebas de gamificacion, validacion de respuesta, progreso y widgets.

## Compilacion Android

```bash
flutter build apk --release
```
