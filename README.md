# Teclea

App personal para aprender a tocar la organeta **Yamaha PSR-E283**: las notas caen hacia un teclado
de 61 teclas y la app comprueba lo que tocas.

El PSR-E283 no tiene USB ni MIDI, así que la entrada principal será el **audio** del teclado
(cable desde PHONES/OUTPUT a la entrada de línea del PC, o micrófono). MIDI USB y el teclado del
ordenador también estarán disponibles.

## Requisitos

- Node.js 20 o superior (probado con Node 24).
- Para la app de escritorio (Tauri 2), además:
  - **Rust**: instálalo desde <https://rustup.rs> (en Windows, `rustup-init.exe`).
  - **Microsoft C++ Build Tools** con la carga de trabajo "Desarrollo para el escritorio con C++"
    (el instalador de Rust te lo ofrece).
  - **WebView2**: ya viene con Windows 11.

## Comandos

```powershell
npm install          # dependencias
npm run dev          # versión web en http://localhost:1420 (Chrome/Edge)
npm test             # tests (Vitest)
npm run lint         # ESLint
npm run build        # compila la parte web en dist/
npm run tauri dev    # app de escritorio (necesita Rust)
npm run tauri build  # instalador .msi / .exe (necesita Rust)
```

## Estructura

```
src/
  core/music/   teoría de notas y del teclado de 61 teclas
  core/song/    modelo de canción, importadores MIDI y MusicXML (.musicxml/.xml/.mxl),
                ajuste al rango del teclado y canciones de ejemplo
  core/transport/ reloj de reproducción (velocidad, saltos, bucle) y programador de notas
  render/       notas que caen sobre el teclado (PixiJS / WebGL) y su geometría
  audio/        sonido de piano (Tone.js)
  playback/     motor que une transporte, programador y sonido
  core/practice/ sesión de práctica: modos Espera y Ritmo, manos, aciertos, fallos y puntuación
  practice/     controlador que une la práctica con las entradas, el motor y el detector
  core/sheet/   partitura MusicXML generada a partir de las notas (para canciones MIDI)
  core/progress/ rachas, días practicados y resumen por canción
  state/        estado de la app (Zustand): biblioteca, ajustes, práctica y progreso
  storage/      base de datos local (IndexedDB con Dexie): canciones importadas e historial
  progress/     contador del tiempo practicado y de las notas acertadas
  input/        entradas de notas: audio del PSR-E283 (cable o micrófono), teclado del PC,
                ratón o táctil y MIDI (Web MIDI), unidas en un centro común
  audio-detect/ reconocimiento de notas por audio: FFT, espectro en semitonos, huellas de
                cada tecla, separación de acordes (NMF), detector y calibración
  ui/           componentes de interfaz
src-tauri/      envoltorio de escritorio (Rust)
```

## Practicar

- **Espera**: la canción se para en cada nota hasta que la tocas. Importa el orden, no el ritmo.
- **Ritmo**: la canción sigue; cada nota se puntúa (Perfecto < 50 ms, Bien < 100 ms, margen de ±200 ms).
- **Escuchar**: la app lo toca todo.
- Elige qué mano practicas: la otra la toca la app y sus notas se ven tenues. Al terminar verás la
  precisión, las estrellas y si has batido tu marca.

## Biblioteca, progreso y partitura

- Las canciones importadas se guardan en el equipo (IndexedDB) junto con el papel de cada pista, y
  Teclea abre la última canción que tenías. Se pueden quitar desde la biblioteca.
- **Progreso** (arriba a la derecha): racha de días, tiempo de hoy y de la semana, gráfica de las dos
  últimas semanas, mejor y última precisión de cada canción e historial de las últimas veces.
- **Vista** (barra de reproducción): _Notas_, _Las dos_ o _Partitura_. La partitura usa el MusicXML
  original si lo importaste; para MIDI se genera una a partir de las notas. Marca el compás que suena y
  pulsando un compás saltas a él.
- **Ajustes**: volumen del piano, metrónomo, clics en la cuenta atrás, atajos de teclado y borrar el
  progreso.

## Escuchar el PSR-E283 por audio

1. Conecta la salida **PHONES/OUTPUT** del teclado a la entrada de línea (o de micrófono) del PC con
   un cable jack 6,3 mm → 3,5 mm. También vale un micrófono, aunque es menos fiable.
2. En Teclea: **Entrada** (arriba a la derecha) → _Tu Yamaha PSR-E283_ → activa «Escuchar mi teclado
   por audio» y elige la entrada.
3. Pulsa **Calibrar**: mide el ruido, la afinación, la huella de cada tecla (21 o 61) y la latencia.
   Sin calibrar funciona con huellas genéricas, pero falla más en acordes con octavas.

Si Windows no deja usar el audio: _Configuración › Privacidad y seguridad › Micrófono_ y permite el
acceso a las aplicaciones de escritorio.

## Plan de trabajo

| Fase | Contenido                                                               |
| ---- | ----------------------------------------------------------------------- |
| 0    | Base: Vite, React, TypeScript, Tailwind, Vitest, Tauri                  |
| 1    | Canciones: importar MIDI y MusicXML, reproducción con sonido            |
| 2    | Notas que caen (PixiJS) sobre el teclado de 61 teclas                   |
| 3    | Entradas: teclado del PC y MIDI USB                                     |
| 4    | Audio del PSR-E283: cable o micrófono, calibración y detección de notas |
| 5    | Práctica: modos Espera y Ritmo, manos separadas, puntuación             |
| 6    | Biblioteca, progreso, vista de partitura, pulido                        |
| 7    | Instalador para Windows                                                 |

El prototipo interactivo de la interfaz está en `teclea-prototipo.html`.
