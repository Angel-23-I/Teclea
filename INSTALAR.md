# Instalar Teclea en otro PC

## 1. Solo para usarla (lo normal)

No hace falta instalar Node, Rust ni Visual Studio: basta con el instalador.

1. Copia `Teclea_1.0.0_x64-setup.exe` al otro PC (por USB, nube…). Se genera en
   `D:\DevCache\cargo-target\release\bundle\nsis\` con `npm run tauri build`.
2. Ábrelo. Como no está firmado, Windows puede mostrar **«Windows protegió su PC»**: pulsa
   _Más información_ → _Ejecutar de todas formas_.
3. Se instala solo para tu usuario (no pide permisos de administrador) y crea el acceso en el menú
   Inicio. Necesita WebView2, que ya viene con Windows 10 y 11; si faltara, el instalador lo descarga.

Para desinstalar: _Configuración › Aplicaciones › Aplicaciones instaladas › Teclea_.

Las canciones importadas, el progreso y la calibración se guardan en cada PC (no viajan con el
instalador). Vuelve a importar tus archivos MIDI o MusicXML en el PC nuevo.

## 2. Primera prueba con el PSR-E283

Hasta ahora todo se ha probado con el teclado del ordenador y con audio simulado. En el PC nuevo:

1. **Conexión.** Cable de la salida **PHONES/OUTPUT** del teclado (jack 6,3 mm) a la entrada de línea o
   de micrófono del PC (3,5 mm), o una interfaz de audio USB. Con micrófono también funciona, peor;
   usa entonces auriculares en el PC para que no capte el sonido de la app.
2. **Permiso de Windows.** _Configuración › Privacidad y seguridad › Micrófono_: activa el acceso al
   micrófono y el de las aplicaciones de escritorio. La primera vez Teclea puede pedir permiso.
3. **En Teclea:** _Entrada_ (arriba a la derecha) → activa «Escuchar mi teclado por audio» y elige la
   entrada. El medidor debe moverse al tocar. Si usas cable, sube «Oír el teclado por el PC» (los
   altavoces del teclado se apagan con el jack puesto).
4. **Calibrar** (en la misma ventana): mejor la calibración completa de 61 teclas. Toca cada tecla
   cuando lo pida, con fuerza normal, y deja sonar.
5. **Prueba:** _Escala de Do mayor_ en modo **Espera**, luego _Para Elisa_ en modo **Ritmo**, y
   algún acorde de tres notas.
6. Si detecta notas que no tocas, baja la **Sensibilidad**; si se le escapan notas suaves, súbela.

Apunta lo que falle (notas que no detecta, notas fantasma, octavas confundidas, retraso que se nota)
para ajustarlo.

## 3. Para seguir desarrollando en el otro PC (opcional)

1. **Git** y **Node.js 22** o superior.
2. **Rust**: instala `rustup` desde https://rustup.rs (elige la opción por defecto, `x86_64-pc-windows-msvc`).
3. **Herramientas de C++ de Visual Studio** (Build Tools 2022, carga de trabajo «Desarrollo para el
   escritorio con C++»). Si C: va justo de espacio, instálalas en D: con
   `vs_BuildTools.exe --installPath D:\VisualStudio\BuildTools`.
4. Lleva la compilación de Rust a D: (ocupa varios GB): crea la variable de entorno de usuario
   `CARGO_TARGET_DIR=D:\DevCache\cargo-target` y abre una consola nueva.
5. Descarga el código e instala las dependencias:

   ```powershell
   git clone https://github.com/Angel-23-I/Teclea.git
   cd Teclea
   npm.cmd ci
   ```

6. `npm.cmd run tauri dev` abre la app en modo desarrollo; `npm.cmd run tauri build` crea el
   instalador. En PowerShell usa `npm.cmd` si la política de ejecución bloquea `npm`.
