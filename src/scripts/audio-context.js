// The one AudioContext for the whole page. The lab and the studio theme
// both play through it. Two separate contexts on one page could not both
// be heard on iPhones and iPads; one shared context has no such contest.
//
// It is made on first use, which must be inside a touch or a click, and it
// says once that what it plays is meant to be heard: without that, those
// devices cut a page's sound with the silent switch.

let context = null;

export function sharedContext() {
  if (context) return context;
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    // older systems have no such setting; nothing to do
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  context = new Ctx();
  return context;
}
