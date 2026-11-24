import { ImportError } from './importError';
import { importMidi } from './midiImporter';
import { decodeXml, importMusicXml, importMxl } from './musicxmlImporter';
import type { Song } from './types';

export const ACCEPTED_EXTENSIONS = ['.mid', '.midi', '.musicxml', '.xml', '.mxl'];

/** Importa un archivo de canción según su extensión o, si no la tiene, según su contenido. */
export function importSongFile(fileName: string, bytes: Uint8Array): Song {
  const ext = /\.[^.]+$/.exec(fileName.toLowerCase())?.[0] ?? '';
  const startsWith = (s: string) => s.split('').every((c, i) => bytes[i] === c.charCodeAt(0));

  if (ext === '.mid' || ext === '.midi' || startsWith('MThd')) return importMidi(bytes, fileName);
  if (ext === '.mxl' || startsWith('PK')) return importMxl(bytes, fileName);
  if (ext === '.musicxml' || ext === '.xml') return importMusicXml(decodeXml(bytes), fileName, bytes);
  throw new ImportError(
    'Formato no reconocido. Usa archivos MIDI (.mid) o MusicXML (.musicxml, .xml, .mxl).',
  );
}
