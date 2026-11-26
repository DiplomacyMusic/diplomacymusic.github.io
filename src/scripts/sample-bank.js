// The FirstObjects sample bank: Daniel's recorded single notes, from the
// root up: Db3, Ab3, C4, Eb4, Ab4, Bb4, Eb5, G5, then the dyads Bb5+Eb6
// and F6+Bb6 at the top. Most pitches carry two takes for round robin
// so repeated strikes never sound stamped out.
//
// Generated from the FirstObjects session bounces (June 12, 2026),
// ladder per Daniel, dyads confirmed by spectrum. The recordings were
// made on D (D3, A3, C#4, E4, A4, B4, E5, G#5, B5+E6, F#6+B6) and are
// brought down one semitone, tape style, in one pass (November 26, 2026).
// That puts the ladder on D flat, a D flat major 13 sharp 11, and every
// one of its notes inside A flat major, the key of the site theme (which
// measures A flat major and D flat Lydian, tuned to A440).
//
// Two earlier tries that day were wrong and are worth not repeating. A
// major third down gave the pitches of F major. A further major third,
// eight semitones in all, gave the pitches of D flat major, with a G flat
// that is not in the theme's key. One semitone is the answer.
// Frequencies sit a few cents bright of equal temperament, which is part
// of the charm.

export const SAMPLE_BANK = [
  { note: 'Db3',     freq: 138.3,  files: ['/audio/materials/db3-a.m4a', '/audio/materials/db3-b.m4a'] },
  { note: 'Ab3',     freq: 207.9,  files: ['/audio/materials/ab3-a.m4a', '/audio/materials/ab3-b.m4a'] },
  { note: 'C4',      freq: 262.0,  files: ['/audio/materials/c4-a.m4a', '/audio/materials/c4-b.m4a'] },
  { note: 'Eb4',     freq: 311.9,  files: ['/audio/materials/eb4-a.m4a', '/audio/materials/eb4-b.m4a'] },
  { note: 'Ab4',     freq: 415.9,  files: ['/audio/materials/ab4-a.m4a', '/audio/materials/ab4-b.m4a'] },
  { note: 'Bb4',     freq: 468.4,  files: ['/audio/materials/bb4-a.m4a', '/audio/materials/bb4-b.m4a'] },
  { note: 'Eb5',     freq: 624.8,  files: ['/audio/materials/eb5-a.m4a', '/audio/materials/eb5-b.m4a'] },
  { note: 'G5',      freq: 786.6,  files: ['/audio/materials/g5-a.m4a', '/audio/materials/g5-b.m4a'] },
  { note: 'Bb5+Eb6', freq: 937.2,  files: ['/audio/materials/bb5eb6-a.m4a', '/audio/materials/bb5eb6-b.m4a'] },
  { note: 'F6+Bb6',  freq: 1405.4, files: ['/audio/materials/f6bb6-a.m4a'] },
];
