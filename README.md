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
  core/song/    modelo de canción y ajuste de rango (más adelante: importadores MIDI y MusicXML)
  input/        contrato común para audio, MIDI y teclado del PC
  ui/           componentes de interfaz
src-tauri/      envoltorio de escritorio (Rust)
```

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
