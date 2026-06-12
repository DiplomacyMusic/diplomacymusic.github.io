// The scrolling score: a grand staff that notates what the room just
// played, with real rhythmic spelling. How fast you play is how the
// notes are written: a barrage reads as beamed sixteenths, a steady
// hand as eighths or quarters, patience as halves and wholes.
//
// Two builds of the same instrument:
//   giant: the structure in the fog, blurred, sandwich cut, heavy
//          parallax (kept behind a flag for easy returns)
//   small: docked just above the sound toggle, plain and legible
//
// Engraving rules followed: noteheads below the middle line take
// stems up on the right side, above the middle line stems down on
// the left, middle line down. For chords and beamed pairs the note
// farthest from the middle line decides, and a beam only joins
// neighbors whose stems agree. After five quiet seconds the page
// breathes away.

const NS = 'http://www.w3.org/2000/svg';
const INK = '#302d26';
const SLOTS = 6;
const SLOT_W = 36;
const X0 = 84;
const STEM_LEN = 26;
const NOTE_OPACITY = 0.9;
const CHROME_OPACITY = 0.22; // the staff itself at a quarter of the notes

// where each rung of the FirstObjects ladder lives on the grand staff
const SPEC = [
  { heads: [{ y: 84 }] },                                      // D3, bass middle line
  { heads: [{ y: 68 }] },                                      // A3, bass top line
  { heads: [{ y: 60, acc: '♯', ledgers: [60] }] },             // C#4, middle C ledger
  { heads: [{ y: 52 }] },                                      // E4, treble bottom line
  { heads: [{ y: 40 }] },                                      // A4
  { heads: [{ y: 36 }] },                                      // B4, middle line
  { heads: [{ y: 24 }] },                                      // E5
  { heads: [{ y: 16, acc: '♯' }] },                            // G#5, above the staff
  { heads: [{ y: 8, ledgers: [12] }, { y: -4, ledgers: [4, -4] }] },               // B5 + E6
  { heads: [{ y: -8, acc: '♯', ledgers: [12, 4, -4] }, { y: -20, ledgers: [-12, -20] }] }, // F#6 + B6
];

// rhythm from density: time since the previous event picks the value.
// level 4 = sixteenth, 3 = eighth, 2 = quarter, 1 = half, 0 = whole
function levelFor(gapMs) {
  if (gapMs < 280) return 4;
  if (gapMs < 650) return 3;
  if (gapMs < 1600) return 2;
  if (gapMs < 3500) return 1;
  return 0;
}

function middleFor(y) {
  return y >= 64 ? 84 : 36; // which staff's middle line governs this head
}

function jitter(amount = 1.2) {
  return (Math.random() - 0.5) * amount;
}

export function createStaffScore(mount = document.body, { giant = false } = {}) {
  const wrap = document.createElement('div');
  if (giant) {
    // the sandwich cut: visible only in a diagonal band, feathered away
    const CUT = 'linear-gradient(135deg, transparent 34%, black 52%, black 80%, transparent 96%)';
    wrap.style.cssText = [
      'position:absolute', 'left:50%', 'top:46%',
      'transform:translate(-50%, -50%)',
      'width:min(150vmax, 2400px)', 'pointer-events:none', 'opacity:0',
      'filter:blur(2.5px)',
      `-webkit-mask-image:${CUT}`,
      `mask-image:${CUT}`,
      'transition:opacity 4000ms ease',
    ].join(';');
  } else {
    wrap.style.cssText = [
      'position:fixed', 'right:1.1rem', 'bottom:4.4rem', 'z-index:9',
      'width:250px', 'pointer-events:none', 'opacity:0',
      'transition:opacity 4000ms ease',
    ].join(';');
  }
  wrap.setAttribute('aria-hidden', 'true');

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 -32 310 146');
  svg.setAttribute('width', '100%');
  svg.style.overflow = 'visible';
  wrap.appendChild(svg);
  if (giant) {
    // behind the shapes: deeper in the fog than they are
    mount.insertBefore(wrap, mount.firstChild || null);
  } else {
    mount.appendChild(wrap);
  }

  if (giant) {
    // heavy parallax: near stillness is what reads as giant and far
    const parallax = () => {
      wrap.style.transform = `translate(-50%, calc(-50% + ${(-window.scrollY * 0.08).toFixed(1)}px))`;
    };
    window.addEventListener('scroll', parallax, { passive: true });
    parallax();
  }

  // the page recedes after five quiet seconds
  const WAKE_OPACITY = giant ? '0.09' : '0.85';
  let idleTimer = null;
  function wake() {
    wrap.style.transition = 'opacity 900ms ease';
    wrap.style.opacity = WAKE_OPACITY;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      wrap.style.transition = 'opacity 4000ms ease';
      wrap.style.opacity = '0';
    }, 5000);
  }

  // ---------------------------------------------------------------------
  // the staff itself, drawn once, far quieter than what lands on it
  // ---------------------------------------------------------------------
  const chrome = document.createElementNS(NS, 'g');
  chrome.setAttribute('stroke', INK);
  chrome.setAttribute('fill', 'none');
  chrome.setAttribute('stroke-width', '0.8');
  chrome.setAttribute('opacity', String(CHROME_OPACITY));

  let chromeD = '';
  for (const y of [20, 28, 36, 44, 52, 68, 76, 84, 92, 100]) {
    chromeD += `M 36 ${y + jitter(0.8)} L 304 ${y + jitter(0.8)} `;
  }
  chromeD += 'M 36 20 L 36 100 ';
  chromeD += 'M 31 20 C 20 38 20 48 28 60 C 20 72 20 82 31 100 ';
  chromeD += 'M 52 58 C 60 52 62 44 56 40 C 50 36 46 42 49 47 C 52 52 60 50 61 38 C 62 28 56 22 52 26 C 47 30 49 44 52 62 C 54 70 50 72 47 69 ';
  chromeD += 'M 50 90 C 48 80 56 76 60 80 C 64 84 60 92 52 97 ';
  const chromePath = document.createElementNS(NS, 'path');
  chromePath.setAttribute('d', chromeD);
  chrome.appendChild(chromePath);
  for (const dy of [-2, 3]) {
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', 65);
    dot.setAttribute('cy', 82 + dy * 2);
    dot.setAttribute('r', 1.1);
    dot.setAttribute('fill', INK);
    dot.setAttribute('stroke', 'none');
    dot.setAttribute('opacity', String(CHROME_OPACITY + 0.1));
    chrome.appendChild(dot);
  }
  svg.appendChild(chrome);

  const notes = []; // { group, x, level, stemDir, stemTipY, stemX, time }
  let lastNoteAt = 0;

  function slide(group, fromX, toX) {
    group.animate(
      [{ transform: `translate(${fromX}px, 0)` }, { transform: `translate(${toX}px, 0)` }],
      { duration: 380, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)', fill: 'both' }
    );
  }

  function inkPath(group, d, width = 1.2) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', INK);
    path.setAttribute('stroke-width', width);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('opacity', String(NOTE_OPACITY));
    group.appendChild(path);
    return path;
  }

  return {
    note(pitch) {
      const spec = SPEC[Math.max(0, Math.min(SPEC.length - 1, pitch))];
      if (!spec) return;
      wake();

      const now = performance.now();
      const level = lastNoteAt ? levelFor(now - lastNoteAt) : 2;
      lastNoteAt = now;

      // the head farthest from its middle line decides the stem
      let decider = spec.heads[0];
      let deciderDistance = -1;
      for (const head of spec.heads) {
        const distance = Math.abs(head.y - middleFor(head.y));
        if (distance > deciderDistance) {
          deciderDistance = distance;
          decider = head;
        }
      }
      const stemDir = decider.y > middleFor(decider.y) ? 'up' : 'down';

      const group = document.createElementNS(NS, 'g');

      for (const head of spec.heads) {
        for (const ly of head.ledgers || []) {
          const ledger = document.createElementNS(NS, 'path');
          ledger.setAttribute('d', `M ${-8 + jitter()} ${ly + jitter(0.8)} L ${8 + jitter()} ${ly + jitter(0.8)}`);
          ledger.setAttribute('stroke', INK);
          ledger.setAttribute('stroke-width', '0.9');
          ledger.setAttribute('opacity', '0.5');
          group.appendChild(ledger);
        }
        const notehead = document.createElementNS(NS, 'ellipse');
        notehead.setAttribute('cx', jitter());
        notehead.setAttribute('cy', head.y + jitter(0.8));
        notehead.setAttribute('rx', level <= 1 ? 4.8 : 4.4);
        notehead.setAttribute('ry', 3.1);
        notehead.setAttribute('transform', `rotate(${-18 + jitter(8)} 0 ${head.y})`);
        notehead.setAttribute('opacity', String(NOTE_OPACITY));
        if (level <= 1) {
          // halves and wholes are open
          notehead.setAttribute('fill', 'none');
          notehead.setAttribute('stroke', INK);
          notehead.setAttribute('stroke-width', '1.6');
        } else {
          notehead.setAttribute('fill', INK);
        }
        group.appendChild(notehead);
        if (head.acc) {
          const acc = document.createElementNS(NS, 'text');
          acc.setAttribute('x', -14);
          acc.setAttribute('y', head.y + 4);
          acc.setAttribute('fill', INK);
          acc.setAttribute('opacity', String(NOTE_OPACITY));
          acc.style.cssText = 'font-family: Georgia, serif; font-size: 12px;';
          acc.textContent = head.acc;
          group.appendChild(acc);
        }
      }

      // the stem, on everything except wholes
      const ys = spec.heads.map((head) => head.y);
      const topY = Math.min(...ys);
      const bottomY = Math.max(...ys);
      let stemTipY = null;
      let stemX = null;
      if (level >= 1) {
        if (stemDir === 'up') {
          stemX = 4.2;
          stemTipY = topY - STEM_LEN;
          inkPath(group, `M ${stemX} ${bottomY - 1} L ${stemX + jitter(0.8)} ${stemTipY}`);
        } else {
          stemX = -4.2;
          stemTipY = bottomY + STEM_LEN;
          inkPath(group, `M ${stemX} ${topY + 1} L ${stemX + jitter(0.8)} ${stemTipY}`);
        }
      }

      // a beam joins fast neighbors whose stems agree; flags otherwise.
      // Eighths take one beam or flag, sixteenths two.
      const prev = notes[notes.length - 1];
      const canBeam =
        level >= 3 &&
        prev &&
        prev.level >= 3 &&
        prev.stemDir === stemDir &&
        prev.stemTipY !== null &&
        now - prev.time < 900;

      if (level >= 3 && canBeam) {
        const beams = Math.min(level, prev.level) - 2;
        const prevLocalX = prev.stemX - SLOT_W;
        for (let b = 0; b < beams; b++) {
          const lift = (stemDir === 'up' ? 1 : -1) * b * 6;
          inkPath(
            group,
            `M ${prevLocalX} ${prev.stemTipY + lift} L ${stemX} ${stemTipY + lift}`,
            3
          );
        }
      } else if (level >= 3) {
        const flags = level - 2;
        for (let f = 0; f < flags; f++) {
          const fy = stemTipY + (stemDir === 'up' ? f * 7 : -f * 7);
          if (stemDir === 'up') {
            inkPath(group, `M ${stemX} ${fy} C ${stemX + 9} ${fy + 5} ${stemX + 9} ${fy + 12} ${stemX + 2} ${fy + 17}`, 1.4);
          } else {
            inkPath(group, `M ${stemX} ${fy} C ${stemX + 9} ${fy - 5} ${stemX + 9} ${fy - 12} ${stemX + 2} ${fy - 17}`, 1.4);
          }
        }
      }

      group.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: 'both' });
      svg.appendChild(group);

      notes.push({ group, x: null, level, stemDir, stemTipY, stemX, time: now });
      if (notes.length > SLOTS) {
        const oldest = notes.shift();
        oldest.group.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'both' })
          .onfinish = () => oldest.group.remove();
      }

      notes.forEach((entry, i) => {
        const targetX = X0 + i * SLOT_W;
        slide(entry.group, entry.x === null ? targetX + 18 : entry.x, targetX);
        entry.x = targetX;
      });
    },
  };
}
