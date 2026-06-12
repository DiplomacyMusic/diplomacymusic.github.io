// The graphic score layer: hand drawn notation gestures that appear
// where the music happens, in the lineage of Xenakis line fields,
// Crumb's wavering vibrato lines, Ligeti cluster bands, and Cage's
// scattered indeterminacy. Thin ink with a tremor in every line.
//
// Glyphs arrive quickly and stay a long while, so a few minutes of
// play leaves an almost readable record of everything you chose:
// dynamics under the hits, accidentals by the swells, fermatas over
// the landings, beams across the throws.

const NS = 'http://www.w3.org/2000/svg';
const INK = '#302d26';
const MAX_GLYPHS = 36;

// how long a mark stays legible before it breathes away
const HOLD_MS = () => 5000 + Math.random() * 5000;
const FADE_MS = () => 6000 + Math.random() * 5000;

function jitter(amount = 1.6) {
  return (Math.random() - 0.5) * amount;
}

export function createScoreLayer(container) {
  const svg = document.createElementNS(NS, 'svg');
  svg.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
  container.appendChild(svg);

  let live = 0;

  function retire(node, totalMs) {
    setTimeout(() => {
      node.remove();
      live -= 1;
    }, totalMs + 60);
  }

  // a path that draws itself on, holds, then breathes away
  function ink(d, { width = 1.1, drawMs = 350, holdMs, fadeMs, delay = 0, opacity = 0.62 } = {}) {
    if (live >= MAX_GLYPHS) return;
    live += 1;
    holdMs = holdMs ?? HOLD_MS();
    fadeMs = fadeMs ?? FADE_MS();

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', INK);
    path.setAttribute('stroke-width', width);
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);

    const length = path.getTotalLength();
    path.style.strokeDasharray = String(length);

    const total = drawMs + holdMs + fadeMs;
    path.animate(
      [
        { strokeDashoffset: length, opacity: 0 },
        { strokeDashoffset: 0, opacity, offset: drawMs / total },
        { strokeDashoffset: 0, opacity, offset: (drawMs + holdMs) / total },
        { strokeDashoffset: 0, opacity: 0 },
      ],
      { duration: total, delay, easing: 'linear', fill: 'both' }
    );
    retire(path, delay + total);
  }

  // a small filled mark: a notehead, leaning the way written ones lean
  function mark(cx, cy, r, { holdMs, fadeMs, delay = 0, opacity = 0.65 } = {}) {
    if (live >= MAX_GLYPHS) return;
    live += 1;
    holdMs = holdMs ?? HOLD_MS();
    fadeMs = fadeMs ?? FADE_MS();
    const dot = document.createElementNS(NS, 'ellipse');
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', cy);
    dot.setAttribute('rx', r * (1.1 + jitter(0.3)));
    dot.setAttribute('ry', r * (0.8 + jitter(0.2)));
    dot.setAttribute('transform', `rotate(${-20 + jitter(14)} ${cx} ${cy})`);
    dot.setAttribute('fill', INK);
    svg.appendChild(dot);
    const total = holdMs + fadeMs;
    dot.animate(
      [
        { opacity: 0 },
        { opacity, offset: 0.04 },
        { opacity, offset: holdMs / total },
        { opacity: 0 },
      ],
      { duration: total, delay, fill: 'both' }
    );
    retire(dot, delay + total);
  }

  // written words from the score's margins: dynamics, accidentals
  function inscribe(x, y, text, { size = 15, holdMs, fadeMs, delay = 0, opacity = 0.7, italic = true } = {}) {
    if (live >= MAX_GLYPHS) return;
    live += 1;
    holdMs = holdMs ?? HOLD_MS();
    fadeMs = fadeMs ?? FADE_MS();
    const node = document.createElementNS(NS, 'text');
    node.setAttribute('x', x + jitter(3));
    node.setAttribute('y', y + jitter(3));
    node.setAttribute('fill', INK);
    node.setAttribute('transform', `rotate(${jitter(8)} ${x} ${y})`);
    node.style.cssText = `font-family: Georgia, 'Times New Roman', serif; font-size:${size}px; ${italic ? 'font-style:italic;' : ''} font-weight:600;`;
    node.textContent = text;
    svg.appendChild(node);
    const total = holdMs + fadeMs;
    node.animate(
      [
        { opacity: 0 },
        { opacity, offset: 0.06 },
        { opacity, offset: holdMs / total },
        { opacity: 0 },
      ],
      { duration: total, delay, fill: 'both' }
    );
    retire(node, delay + total);
  }

  function dynamicFor(gain) {
    if (gain < 0.2) return 'pp';
    if (gain < 0.35) return 'p';
    if (gain < 0.5) return 'mf';
    if (gain < 0.7) return 'f';
    return Math.random() < 0.4 ? 'sfz' : 'ff';
  }

  return {
    // Xenakis: a fan of glissando lines spraying from the hit, with the
    // dynamic written underneath the way a hand would
    gliss(x, y, gain = 0.5) {
      const lines = 4 + Math.round(gain * 4);
      const baseAngle = -0.5 + Math.random();
      for (let i = 0; i < lines; i++) {
        const angle = baseAngle + (i / lines) * 1.2 + jitter(0.12);
        const reach = 70 + gain * 130 + Math.random() * 60;
        const x2 = x + Math.cos(angle) * reach;
        const y2 = y - Math.sin(angle) * reach * 0.7;
        const mx = (x + x2) / 2 + jitter(8);
        const my = (y + y2) / 2 + jitter(8);
        ink(`M ${x + jitter(3)} ${y + jitter(3)} Q ${mx} ${my} ${x2} ${y2}`, {
          drawMs: 300 + i * 50,
          delay: i * 35,
          width: 0.9 + Math.random() * 0.7,
        });
      }
      inscribe(x - 14 + jitter(6), y + 30 + jitter(4), dynamicFor(gain), { size: 16 + gain * 6 });
      // an accent wedge over a real hit
      if (gain > 0.55) {
        ink(`M ${x - 10} ${y - 22} L ${x + 4} ${y - 17} L ${x - 10} ${y - 12}`, {
          drawMs: 180,
          width: 1.4,
        });
      }
    },

    // Crumb: a long wavering vibrato line creeping out while a note
    // swells, sometimes with an accidental floating beside it
    squiggle(x, y, durationMs = 1600) {
      let d = `M ${x} ${y}`;
      let px = x;
      const segments = 13 + Math.round(Math.random() * 5);
      for (let i = 1; i <= segments; i++) {
        px += 10 + jitter(3);
        const py = y + Math.sin(i * 1.9) * (4 + i * 0.5) + jitter(2.5);
        d += ` L ${px} ${py}`;
      }
      ink(d, { drawMs: durationMs, width: 1 });
      if (Math.random() < 0.5) {
        inscribe(px + 8, y - 8 + jitter(6), Math.random() < 0.5 ? '♯' : '♮', {
          size: 17,
          italic: false,
          delay: durationMs * 0.6,
        });
      }
    },

    // Ligeti: a tight stack of cluster ticks with its bracket, and a
    // fermata resting over the whole settled thing
    cluster(x, y, gain = 0.3) {
      const rows = 5 + Math.round(gain * 7);
      for (let i = 0; i < rows; i++) {
        const yy = y - i * 5.5 + jitter(1.5);
        const w = 20 + Math.random() * 20;
        ink(`M ${x - w / 2 + jitter(2)} ${yy} L ${x + w / 2 + jitter(2)} ${yy}`, {
          drawMs: 150,
          delay: i * 50,
          width: 0.9 + Math.random() * 0.5,
        });
      }
      const top = y - rows * 5.5;
      ink(`M ${x - 28} ${y + 7} L ${x - 33 + jitter(2)} ${y + 7} L ${x - 33 + jitter(2)} ${top - 4} L ${x - 28} ${top - 4}`, {
        drawMs: 320,
        delay: rows * 50,
        width: 1.2,
      });
      // fermata: the pause over the landing
      ink(`M ${x - 13} ${top - 12} Q ${x} ${top - 26} ${x + 13} ${top - 12}`, {
        drawMs: 260,
        delay: rows * 50 + 200,
        width: 1.3,
      });
      mark(x, top - 14, 1.8, { delay: rows * 50 + 380 });
    },

    // Cage: a long slur through the air, stray noteheads along it, and
    // a beamed stem group landing where the throw was headed
    arc(x, y, dx, dy) {
      const reach = Math.min(360, Math.hypot(dx, dy) * 24 + 100);
      const nx = dx / (Math.hypot(dx, dy) || 1);
      const ny = dy / (Math.hypot(dx, dy) || 1);
      const x2 = x + nx * reach;
      const y2 = y + ny * reach;
      const bend = 55 + jitter(28);
      const mx = (x + x2) / 2 - ny * bend;
      const my = (y + y2) / 2 + nx * bend;
      ink(`M ${x} ${y} Q ${mx} ${my} ${x2} ${y2}`, { drawMs: 500, width: 1.2 });
      for (let i = 0; i < 4; i++) {
        const t = 0.22 + i * 0.21 + jitter(0.07);
        const px = x * (1 - t) * (1 - t) + 2 * mx * t * (1 - t) + x2 * t * t + jitter(12);
        const py = y * (1 - t) * (1 - t) + 2 * my * t * (1 - t) + y2 * t * t + jitter(12);
        mark(px, py, 2.6, { delay: 220 + i * 160 });
      }
      // the beamed group where it lands: stems under a slanted beam
      const stems = 3 + Math.round(Math.random());
      const beamY = y2 - 26 + jitter(4);
      for (let i = 0; i < stems; i++) {
        const sx = x2 + i * 9 + jitter(1.5);
        ink(`M ${sx} ${beamY + i * 2.2} L ${sx} ${beamY + 24 + jitter(3)}`, {
          drawMs: 160,
          delay: 600 + i * 70,
          width: 1.1,
        });
        mark(sx - 2.5, beamY + 26 + i * 1.5, 2.4, { delay: 700 + i * 70 });
      }
      ink(`M ${x2 - 2} ${beamY} L ${x2 + stems * 9 + 2} ${beamY + stems * 2.2}`, {
        drawMs: 200,
        delay: 600 + stems * 70,
        width: 2.2,
      });
    },
  };
}
