// The FirstObjects sample bank: Daniel's recorded single notes, from the
// root up: Gb2, Db3, F3, Ab3, Db4, Eb4, Ab4, C5, then the dyads Eb5+Ab5
// and Bb5+Eb6 at the top. Most pitches carry two takes for round robin
// so repeated strikes never sound stamped out.
//
// Generated from the FirstObjects session bounces (June 12, 2026),
// ladder per Daniel, dyads confirmed by spectrum. The recordings were
// made on D (D3, A3, C#4, E4, A4, B4, E5, G#5, B5+E6, F#6+B6) and are
// brought down eight semitones, tape style, in one pass (November 26,
// 2026) so the room sits in the key of the site theme, A flat major and
// D flat Lydian. The bottom rung is rare: it only speaks for the very
// largest shape, so the lowest note usually heard is the D flat above
// it, and everything from there up is inside A flat major. The G flat
// itself is the one note outside that key. Frequencies sit a few cents
// bright of equal temperament, which is part of the charm.

export const SAMPLE_BANK = [
  { note: 'Gb2',     freq: 92.3,  files: ['/audio/materials/gb2-a.m4a', '/audio/materials/gb2-b.m4a'] },
  { note: 'Db3',     freq: 138.7, files: ['/audio/materials/db3-a.m4a', '/audio/materials/db3-b.m4a'] },
  { note: 'F3',      freq: 174.9, files: ['/audio/materials/f3-a.m4a', '/audio/materials/f3-b.m4a'] },
  { note: 'Ab3',     freq: 208.1, files: ['/audio/materials/ab3-a.m4a', '/audio/materials/ab3-b.m4a'] },
  { note: 'Db4',     freq: 277.6, files: ['/audio/materials/db4-a.m4a', '/audio/materials/db4-b.m4a'] },
  { note: 'Eb4',     freq: 312.6, files: ['/audio/materials/eb4-a.m4a', '/audio/materials/eb4-b.m4a'] },
  { note: 'Ab4',     freq: 417.0, files: ['/audio/materials/ab4-a.m4a', '/audio/materials/ab4-b.m4a'] },
  { note: 'C5',      freq: 525.1, files: ['/audio/materials/c5-a.m4a', '/audio/materials/c5-b.m4a'] },
  { note: 'Eb5+Ab5', freq: 625.1, files: ['/audio/materials/eb5ab5-a.m4a', '/audio/materials/eb5ab5-b.m4a'] },
  { note: 'Bb5+Eb6', freq: 938.0, files: ['/audio/materials/bb5eb6-a.m4a'] },
];
