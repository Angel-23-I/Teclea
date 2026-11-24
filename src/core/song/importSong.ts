import { ImportError } from './importError';
import { importMidi } from './midiImporter';
import { decodeXml, importMusicXml, importMxl, mxlScore } from './musicxmlImporter';
import type { Song } from './types';

export const ACCEPTED_EXTENSIONS = ['.mid', '.midi', '.musicxml', '.xml', '.mxl'];

type FileKind = 'midi' | 'mxl' | 'musicxml' | null;

function fileKind(fileName: string, bytes: Uint8Array): FileKind {
  const ext = /\.[^.]+$/.exec(fileName.toLowerCase())?.[0] ?? '';
  const startsWith = (s: string) => s.split('').every((c, i) => bytes[i] === c.charCodeAt(0));
  if (ext === '.mid' || ext === '.midi' || startsWith('MThd')) return 'midi';
  if (ext === '.mxl' || startsWith('PK')) return 'mxl';
  if (ext === '.musicxml' || ext === '.xml') return 'musicxml';
  return null;
}

/** Importa un archivo de canción según su extensión o, si no la tiene, según su contenido. */
export function importSongFile(fileName: string, bytes: Uint8Array): Song {
  switch (fileKind(fileName, bytes)) {
    case 'midi':
      return importMidi(bytes, fileName);
    case 'mxl':
      return importMxl(bytes, fileName);
    case 'musicxml':
      return importMusicXml(decodeXml(bytes), fileName, bytes);
    default:
      throw new ImportError(
        'Formato no reconocido. Usa archivos MIDI (.mid) o MusicXML (.musicxml, .xml, .mxl).',
      );
  }
}

/** Texto MusicXML original de un archivo importado (para dibujar su partitura), o null si es MIDI. */
export function musicXmlOf(fileName: string, bytes: Uint8Array): string | null {
  const kind = fileKind(fileName, bytes);
  if (kind === 'musicxml') return decodeXml(bytes);
  if (kind === 'mxl') return decodeXml(mxlScore(bytes));
  return null;
}
