// Procesador de audio de Teclea: recoge la entrada (cable o micrófono), la pasa a mono y la envía
// en bloques al hilo de análisis por el puerto que le da la app. No modifica el sonido.
class TecleaCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.blockSize = 1024;
    this.buffer = new Float32Array(this.blockSize);
    this.filled = 0;
    this.target = null;
    this.port.onmessage = (e) => {
      if (e.data && e.data.port) this.target = e.data.port;
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !this.target) return true;
    const channels = input.length;
    const frames = input[0].length;
    for (let i = 0; i < frames; i++) {
      let v = 0;
      for (let c = 0; c < channels; c++) v += input[c][i];
      this.buffer[this.filled++] = v / channels;
      if (this.filled === this.blockSize) {
        this.target.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(this.blockSize);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('teclea-capture', TecleaCapture);
