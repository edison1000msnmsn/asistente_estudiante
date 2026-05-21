# Arquitectura

```text
lib/
  main.dart
  app/
    app.dart
    constants.dart
    router.dart
    theme.dart
  core/
    gamification/
    storage/
    services/
    utils/
    widgets/
  features/
    onboarding/
    profile/
    home/
    math/
    letters/
    art/
    logic/
    progress/
    parent_dashboard/
    settings/
    world_map/
    reward/
    academic_info/
  shared/
    models/
    widgets/
    animations/
```

## Decisiones tecnicas

- Riverpod centraliza estado de perfil, configuracion y refresco de progreso.
- Hive guarda mapas simples para evitar generacion de adaptadores en el MVP.
- Las actividades se precargan en `SeedData` para funcionamiento offline.
- La pantalla `ActivityScreen` reutiliza la logica comun de pregunta, opciones, feedback y registro.

## Capa futura Firebase

La sincronizacion puede agregarse creando un repositorio remoto que implemente los mismos casos de uso del repositorio local, sin modificar las pantallas.
