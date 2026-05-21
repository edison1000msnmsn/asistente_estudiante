# AprendeJugando Kids

Aplicacion movil educativa gamificada para ninos de 4 a 8 anos. Fortalece aprendizajes basicos mediante actividades cortas, visuales, offline y seguras en matematicas, letras, arte y logica.

## Objetivo

Desarrollar un prototipo funcional en Flutter que permita crear un perfil infantil, resolver actividades educativas, recibir retroalimentacion inmediata, ganar estrellas y consultar progreso desde un panel para padres o docentes.

## Tecnologias

- Flutter 3.x o superior
- Dart
- Material 3
- go_router
- Riverpod
- Hive local
- Arquitectura modular por capas

## Modulos

- Matematicas: 20 retos de conteo, suma, resta, cantidades faltantes, comparacion y secuencias numericas.
- Letras: 20 retos de vocales, silabas, palabra-imagen, completar palabras, rimas, lectura y arrastrar palabras.
- Arte: 20 retos de pintura, colores, formas, mezcla de colores, patrones visuales y retos creativos.
- Logica: 20 retos de memoria, patrones, secuencias, clasificacion, intrusos y arrastrar respuestas.
- Progreso: estrellas, niveles, medallas y avance por modulo.
- Panel adulto: PIN demo `1234`, recomendaciones y resumen local.

Cada modulo tiene progresion de 10 niveles y actividades interactivas con contador, pintura, arrastrar y soltar, cartas de memoria y seleccion de opciones.

## Instalacion y ejecucion

```bash
flutter pub get
flutter analyze
flutter test
flutter run
```

## Compilar APK

```bash
flutter build apk --release
```

El APK se genera normalmente en `build/app/outputs/flutter-apk/app-release.apk`.

## Estructura

```text
lib/
  app/
  core/
  features/
  shared/
test/
docs/
```

## Usuarios de prueba

- Perfil infantil: apodo `Nico`, edad `6`, nivel `Inicial`, avatar libre.
- PIN adulto: `1234`.

## Consideraciones eticas

La app no usa publicidad, compras internas, chat, redes sociales, camara, microfono ni ubicacion. No solicita nombre completo. La informacion queda en almacenamiento local del dispositivo.

## Limitaciones

Es un MVP academico offline. La capa de sincronizacion con Firebase queda como mejora futura y no es obligatoria para ejecutar el prototipo.

## Mejoras futuras

- Sincronizacion opcional con Firebase.
- Audio real de instrucciones.
- Exportacion CSV formal.
- Mas bancos de preguntas por edad.
- Reportes graficos avanzados.

## Capturas sugeridas

Splash, onboarding, perfil, home, actividad de matematicas, actividad de letras, recompensa, progreso, panel adulto y configuracion.
