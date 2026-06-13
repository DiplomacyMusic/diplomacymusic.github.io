// The explorable shell, now a resonant little solar system.
//
// "Sound is listening" made physical: every shape is a planet with mass
// and a material voice. They pull on each other, collide, and ring.
// Striking one makes the others of the same material answer, quieter
// with distance, the way sympathetic strings do. Grab one, throw it,
// and the collisions play the room.
//
// Pitch comes from mass, so the big planets speak low. The voices are
// the FirstObjects recordings, a D major 13 sharp 11 ladder, so anything
// touching anything lands inside one chord.
//
// Loads lazily, degrades gracefully, never runs for reduced motion.

import { engine, PITCH_COUNT } from './audio-engine.js';
import { SAMPLE_BANK } from './sample-bank.js';
import { createScoreLayer } from './score-layer.js';
import { createStaffScore } from './staff-score.js';

// The hand drawn glyph layer is resting, not gone. Flip this on to
// bring the Xenakis fans and fermatas back.
const GRAPHIC_SCORE = false;

// The staff has two builds and Daniel keeps going back and forth,
// reasonably. true: the gigantic blurred structure in the fog.
// false: the small legible one docked above the sound toggle.
const GIANT_STAFF = false;

// every interaction is broadcast as a log line; the Build section
// types them out as they happen, a real transcript of the room
const SHAPE_NAMES = ['icosa', 'torus', 'capsule', 'octa'];
function logLine(text) {
  window.dispatchEvent(new CustomEvent('diplomacy:log', { detail: text }));
}
function noteOf(pitch) {
  return SAMPLE_BANK[Math.max(0, Math.min(SAMPLE_BANK.length - 1, pitch))].note;
}

export function shouldAnimate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const connection = navigator.connection;
  if (connection && (connection.saveData || /2g/.test(connection.effectiveType || ''))) return false;
  if (navigator.deviceMemory && navigator.deviceMemory < 2) return false;
  return true;
}

// physics tuning, all in world units
const GRAVITY = 0.6;          // pull between planets
const SOFTEN = 4;             // keeps close passes from slingshotting
const HOME_PULL = 0.18;       // gentle leash back to each home position
const DAMPING = 0.955;        // water drag, but throws still carry
const RESTITUTION = 0.45;     // collisions in water are soft
const BOUNDS = { x: 13, y: 8, zNear: 4, zFar: -9 };
const RESONANCE_RADIUS = 15;  // how far sympathy travels
const STRIKE_COOLDOWN = 0.13; // seconds between strikes per shape
const SCROLL_INERTIA = 0.004; // how hard scrolling drags the planets
const FLOOR_Y = -6.5;         // where they land at the bottom of the page
const FALL_PULL = 9;          // gravity once the bottom of the page arrives
const TILT_PULL = 5;          // how hard a tilted phone pulls
const DRAG_RADIUS = 6.5;      // how close a dragged shape must come to wake another
const HOLD_PULL_BOOST = 12;   // a held shape pulls like something far heavier
const STIR = 0.12;            // dragging stirs the water, momentum passed by proximity
const TAP_DRIFT = 0.25;       // world units a mouse may wander before a press is a drag
const TAP_DRIFT_TOUCH = 0.7;  // fingers wobble more than mice do
const LONG_PRESS_MS = 300;    // a finger that stays this long starts the slow swell

export async function startEnvironment(container) {
  const THREE = await import('three');

  // a phone is a different room: tall, narrow, touched with fingers
  const portrait = container.clientWidth < container.clientHeight;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf2f1f0, 10, 34);

  const camera = new THREE.PerspectiveCamera(
    42,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  // pulled back a step on portrait so the field reads whole
  camera.position.set(0, 0, portrait ? 19 : 16);

  // the desktop constants were tuned by eye for a wide frame; portrait
  // derives its room from the camera frustum instead, so the shapes,
  // the walls, and the floor all live where the screen actually is
  const halfH = camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
  const halfW = halfH * camera.aspect;
  const field = portrait
    ? {
        count: 10,
        spreadX: halfW * 2.2,
        spreadY: halfH * 1.7,
        spreadZ: 7,
        bounds: { x: halfW + 1.5, y: halfH + 1, zNear: BOUNDS.zNear, zFar: BOUNDS.zFar },
        floor: -(halfH * 0.9),
      }
    : {
        count: 14,
        spreadX: 22,
        spreadY: 11,
        spreadZ: 10,
        bounds: BOUNDS,
        floor: FLOOR_Y,
      };

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.25 : 1.5));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.domElement.style.touchAction = 'pan-y'; // page scroll still works on touch
  container.appendChild(renderer.domElement);

  // the graphic score: small hand drawn gestures where the music happens
  const score = GRAPHIC_SCORE
    ? createScoreLayer(container)
    : { gliss() {}, squiggle() {}, cluster() {}, arc() {} };

  // the scrolling score, built on the first note: either the giant in
  // the fog or the small page by the sound toggle, per the flag
  let staffImpl = null;
  const staff = {
    note(pitch) {
      // the score only transcribes what it can hear
      if (!engine.isOn()) return;
      if (!staffImpl) {
        staffImpl = GIANT_STAFF
          ? createStaffScore(container, { giant: true })
          : createStaffScore(document.body, { giant: false });
      }
      staffImpl.note(pitch);
    },
  };

  function screenOf(mesh) {
    const v = mesh.position.clone().project(camera);
    const rect = container.getBoundingClientRect();
    return [((v.x + 1) / 2) * rect.width, ((1 - v.y) / 2) * rect.height];
  }

  // light like early morning: one warm sun, one cool sky
  scene.add(new THREE.HemisphereLight(0xf2f1f0, 0x849396, 1.1));
  const sun = new THREE.DirectionalLight(0xd9d7c2, 1.4);
  sun.position.set(6, 8, 10);
  scene.add(sun);

  // the planet population, in the official palette
  const palette = [0x849396, 0x4e433d, 0xd9d7c2, 0x979595];
  const geometries = [
    new THREE.IcosahedronGeometry(1, 0),   // crystal
    new THREE.TorusGeometry(0.8, 0.28, 32, 64), // ring metal
    new THREE.CapsuleGeometry(0.45, 1.1, 8, 16), // wood
    new THREE.OctahedronGeometry(1, 0),    // glass
  ];
  // bounding sphere per geometry, for collisions
  const baseRadii = [1, 1.08, 1.05, 1];

  const shapes = [];
  for (let i = 0; i < field.count; i++) {
    const type = i % geometries.length;
    const material = new THREE.MeshStandardMaterial({
      color: palette[i % palette.length],
      roughness: 0.55,
      metalness: 0.05,
      transparent: true,
      opacity: 0.92,
      flatShading: true,
      emissive: 0xd9d7c2,
      emissiveIntensity: 0,
    });
    const mesh = new THREE.Mesh(geometries[type], material);

    mesh.position.set(
      (Math.random() - 0.5) * field.spreadX,
      (Math.random() - 0.5) * field.spreadY,
      // portrait sits the family a step deeper, so nothing parks on
      // the lens of a narrow frame
      (Math.random() - 0.5) * field.spreadZ - (portrait ? 3.5 : 2)
    );
    const scale = 0.5 + Math.random() * 1.3;
    mesh.scale.setScalar(scale);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);

    // mass follows volume, and pitch follows mass: big planets speak low
    const mass = scale ** 3;
    const noteSpread = PITCH_COUNT - 1;
    const noteIndex = Math.round(noteSpread * (1 - (scale - 0.5) / 1.3));

    mesh.userData = {
      type,
      index: i,
      mass,
      radius: baseRadii[type] * scale,
      pitch: Math.max(0, Math.min(noteSpread, noteIndex)),
      velocity: new THREE.Vector3(),
      home: mesh.position.clone(),
      spin: (Math.random() - 0.5) * 0.05,
      bobSpeed: 0.12 + Math.random() * 0.18,
      bobPhase: Math.random() * Math.PI * 2,
      baseScale: scale,
      scaleTarget: scale,
      glow: 0,
      lastStrike: -1,
      grounded: 0, // ramps to 1 on floor contact, weight follows it
    };

    shapes.push(mesh);
    scene.add(mesh);
  }

  // -------------------------------------------------------------------------
  // sound: strike a planet, and its material family answers
  // -------------------------------------------------------------------------

  function panOf(mesh) {
    const projected = mesh.position.clone().project(camera);
    return Math.max(-1, Math.min(1, projected.x));
  }

  function strike(mesh, gain, time, withResonance = true, force = false) {
    const data = mesh.userData;
    if (!force && time - data.lastStrike < STRIKE_COOLDOWN) return;
    data.lastStrike = time;

    engine.strike({ pitch: data.pitch, gain, pan: panOf(mesh) });
    staff.note(data.pitch);
    logLine(
      engine.isOn()
        ? `strike(${SHAPE_NAMES[data.type]}.${data.index}, { note: '${noteOf(data.pitch)}', gain: ${gain.toFixed(2)} })`
        : `hit(${SHAPE_NAMES[data.type]}.${data.index}, { muted: true })`
    );
    data.glow = Math.min(1, data.glow + gain);
    const [sx, sy] = screenOf(mesh);
    score.gliss(sx, sy, gain);

    if (!withResonance) return;
    for (const other of shapes) {
      if (other === mesh || other.userData.type !== data.type) continue;
      const distance = mesh.position.distanceTo(other.position);
      if (distance > RESONANCE_RADIUS) continue;
      const sympathy = gain * (1 - distance / RESONANCE_RADIUS) * 0.55;
      if (sympathy < 0.03) continue;
      engine.strike({
        pitch: other.userData.pitch,
        gain: sympathy,
        pan: panOf(other),
        delay: distance * 0.045, // sound takes time to travel the room
      });
      other.userData.glow = Math.min(1, other.userData.glow + sympathy * 0.8);
      other.userData.resonateUntil = time + 1 + sympathy;
    }
  }

  // The landing voice: the shape's note with its diatonic neighbors
  // close around it, quiet and staggered. Stacked seconds, the warm
  // cluster shimmer of Adams and Whitacre, never a thud.
  function clusterStrike(mesh, gain, time) {
    const data = mesh.userData;
    if (time - data.lastStrike < STRIKE_COOLDOWN) return;
    data.lastStrike = time;

    const steps = [0, 1, -1, 2];
    steps.forEach((step, voice) => {
      const index = Math.max(0, Math.min(PITCH_COUNT - 1, data.pitch + step));
      engine.strike({
        pitch: index,
        gain: voice === 0 ? gain : gain * (0.55 - voice * 0.1),
        pan: panOf(mesh),
        delay: voice * 0.07 + Math.random() * 0.05,
      });
    });
    staff.note(data.pitch);
    data.glow = Math.min(1, data.glow + gain);
    const [sx, sy] = screenOf(mesh);
    score.cluster(sx, sy, gain);
    if (engine.isOn()) {
      logLine(`cluster(${SHAPE_NAMES[data.type]}.${data.index}, '${noteOf(data.pitch)}' ± neighbors)`);
    }
  }

  // A tap wakes the whole family: every shape of the same kind swells
  // in softly, glowing while it sounds, then lets go on its own.
  function familySwell(mesh, time) {
    for (const other of shapes) {
      if (other === mesh || other.userData.type !== mesh.userData.type) continue;
      const voice = engine.swellStart({
        pitch: other.userData.pitch,
        pan: panOf(other),
      });
      if (voice) staff.note(other.userData.pitch);
      const distance = mesh.position.distanceTo(other.position);
      if (voice) setTimeout(() => engine.swellEnd(voice), 1900 + distance * 90);
      other.userData.resonateUntil = time + 2.1;
      const [sx, sy] = screenOf(other);
      score.squiggle(sx, sy, 1600);
    }
  }

  // -------------------------------------------------------------------------
  // pointer: hover glows, click strikes, hold and fling throws
  // -------------------------------------------------------------------------

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-2, -2);
  let hovered = null;
  let hoverLostAt = 0;
  let held = null;
  // the room only speaks when someone is in it: collisions may sound
  // for a few seconds after a grab, a throw, a scroll, or a tilt
  let lastEnergyAt = -10;
  const holdPlane = new THREE.Plane();
  const holdPoint = new THREE.Vector3();
  const grabOffset = new THREE.Vector3();
  const lastHoldPoint = new THREE.Vector3();
  let holdPointSeen = false;
  let holdMoved = 0;
  let holdStartedAt = 0;
  let heldPointerId = null;
  let heldIsTouch = false;
  let tapDrift = TAP_DRIFT;
  let longPressTimer = 0;
  const throwVelocity = new THREE.Vector3();

  let tiltX = 0;
  let tiltY = 0;

  function updatePointer(event) {
    const rect = container.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  window.addEventListener('pointermove', (event) => {
    // only a mouse steers the camera; a dragging finger should not
    if (event.pointerType === 'mouse') {
      tiltX = (event.clientX / window.innerWidth - 0.5) * 1.6;
      tiltY = (event.clientY / window.innerHeight - 0.5) * 0.9;
    }
    // while a shape is held, only the grabbing finger speaks
    if (heldPointerId !== null && event.pointerId !== heldPointerId) return;
    updatePointer(event);
  });

  // The rule on touch: a finger that lands on a shape owns the gesture.
  // Claiming it here, before scrolling can start, is the only reliable
  // way to keep a vertical drag from scrolling the page instead.
  window.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (event.target.closest && event.target.closest('a, button')) return;
    const rect = container.getBoundingClientRect();
    if (touch.clientY < rect.top || touch.clientY > rect.bottom) return;
    updatePointer(touch);
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObjects(shapes, false)[0]) event.preventDefault();
  }, { passive: false });

  // Listen on the window so shapes behind the hero text stay grabbable,
  // but never steal a press meant for a link or a button.
  window.addEventListener('pointerdown', (event) => {
    if (held) return; // one hand at a time
    if (event.target.closest('a, button')) return;
    const rect = container.getBoundingClientRect();
    if (event.clientY < rect.top || event.clientY > rect.bottom) return;
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(shapes, false)[0];
    if (!hit) return;
    held = hit.object;
    heldPointerId = event.pointerId;
    heldIsTouch = event.pointerType !== 'mouse';
    tapDrift = heldIsTouch ? TAP_DRIFT_TOUCH : TAP_DRIFT;
    lastEnergyAt = performance.now() / 1000;
    holdMoved = 0;
    holdPointSeen = false;
    holdStartedAt = performance.now();
    throwVelocity.set(0, 0, 0);
    // touch has no hover, so the slow swell lives on the long press:
    // a finger that stays leans in, and release is the gentle off
    if (heldIsTouch) {
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        if (!held || holdMoved > tapDrift || held.userData.swellVoice) return;
        held.userData.swellVoice = engine.swellStart({
          pitch: held.userData.pitch,
          pan: panOf(held),
        });
        if (held.userData.swellVoice) {
          staff.note(held.userData.pitch);
          logLine(`swell(${SHAPE_NAMES[held.userData.type]}.${held.userData.index}, { note: '${noteOf(held.userData.pitch)}', held: true })`);
          const [sx, sy] = screenOf(held);
          score.squiggle(sx, sy, 1600);
        }
      }, LONG_PRESS_MS);
    }
    holdPlane.setFromNormalAndCoplanarPoint(
      camera.getWorldDirection(new THREE.Vector3()),
      held.position
    );
    // hold the shape where it was grabbed, not by its center
    if (raycaster.ray.intersectPlane(holdPlane, holdPoint)) {
      grabOffset.subVectors(held.position, holdPoint);
    } else {
      grabOffset.set(0, 0, 0);
    }
    // a drag is a drag, never a text selection
    event.preventDefault();
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    container.style.cursor = 'grabbing';
  });

  function releaseHold(event) {
    if (!held) return;
    if (heldPointerId !== null && event.pointerId !== heldPointerId) return;
    clearTimeout(longPressTimer);
    lastEnergyAt = performance.now() / 1000;
    const heldFor = performance.now() - holdStartedAt;
    // on touch a live swellVoice means the long press already spoke
    const pressSwell = heldIsTouch && !!held.userData.swellVoice;
    if (held.userData.swellVoice) {
      engine.swellEnd(held.userData.swellVoice);
      held.userData.swellVoice = null;
    }
    if (holdMoved < tapDrift && heldFor < 350 && !pressSwell) {
      // a tap, not a throw: the hard attack cuts through, and the
      // rest of the family answers with its soft one
      const tNow = performance.now() / 1000;
      strike(held, 0.75, tNow, false, true);
      familySwell(held, tNow);
      held.userData.velocity.multiplyScalar(0);
    } else if (pressSwell && holdMoved < tapDrift) {
      // the long press was the swell; letting go lets it breathe out
      logLine(`release(${SHAPE_NAMES[held.userData.type]}.${held.userData.index})`);
      held.userData.velocity.multiplyScalar(0);
    } else {
      held.userData.velocity.copy(throwVelocity).clampLength(0, 12);
      logLine(`throw(${SHAPE_NAMES[held.userData.type]}.${held.userData.index}, v = ${held.userData.velocity.length().toFixed(1)})`);
      const [sx, sy] = screenOf(held);
      score.arc(sx, sy, throwVelocity.x, -throwVelocity.y);
    }
    for (const other of shapes) {
      if (other.userData.dragVoice) {
        engine.swellEnd(other.userData.dragVoice);
        other.userData.dragVoice = null;
      }
    }
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    // no phantom hover where the finger lifted
    if (heldIsTouch) pointer.set(-2, -2);
    heldPointerId = null;
    held = null;
    container.style.cursor = hovered ? 'grab' : '';
  }
  window.addEventListener('pointerup', releaseHold);
  window.addEventListener('pointercancel', releaseHold);

  // scroll moves the camera, and perspective does the parallax honestly.
  // It also drags the planets: scroll down and they lag toward the top
  // of the screen, and at the bottom of the page the floor arrives.
  let scrollY = window.scrollY;
  let scrollVelocity = 0;
  window.addEventListener('scroll', () => {
    scrollY = window.scrollY;
  }, { passive: true });

  function scrollProgress() {
    const span = document.documentElement.scrollHeight - window.innerHeight;
    return span > 0 ? scrollY / span : 0;
  }

  // phone tilt steers gravity. iOS only allows this after a tap.
  let tiltGravityX = 0;
  let tiltGravityY = 0;
  let restingBeta = null;
  function onOrientation(event) {
    if (event.beta === null || event.beta === undefined) return;
    if (restingBeta === null) restingBeta = event.beta; // how they hold it is level
    const beta = Math.max(-50, Math.min(50, event.beta - restingBeta));
    const gamma = Math.max(-50, Math.min(50, event.gamma || 0));
    tiltGravityX = Math.sin((gamma * Math.PI) / 180);
    tiltGravityY = -Math.sin((beta * Math.PI) / 180);
  }
  if ('DeviceOrientationEvent' in window) {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const askOnce = () => {
        DeviceOrientationEvent.requestPermission()
          .then((answer) => {
            if (answer === 'granted') window.addEventListener('deviceorientation', onOrientation);
          })
          .catch(() => {});
      };
      window.addEventListener('pointerdown', askOnce, { once: true });
    } else {
      window.addEventListener('deviceorientation', onOrientation);
    }
  }

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  // -------------------------------------------------------------------------
  // the loop
  // -------------------------------------------------------------------------

  const force = new THREE.Vector3();
  const between = new THREE.Vector3();
  let lastFrameAt = performance.now();
  let lastScrollY = window.scrollY;
  let pile = 0; // eases toward 1 when the bottom of the page arrives

  function frame() {
    const now = performance.now();
    const t = now / 1000;
    const dt = Math.min((now - lastFrameAt) / 1000, 0.033);
    lastFrameAt = now;

    // smoothed scroll speed, the inertia the planets feel
    const rawScrollSpeed = (scrollY - lastScrollY) / Math.max(dt, 0.008);
    lastScrollY = scrollY;
    scrollVelocity += (rawScrollSpeed - scrollVelocity) * 0.15;
    if (Math.abs(scrollVelocity) > 120) lastEnergyAt = t;
    if (Math.abs(tiltGravityX) + Math.abs(tiltGravityY) > 0.08) lastEnergyAt = t;

    // the floor fades in near the bottom of the page, fades out on the way up
    const pileTarget = scrollProgress() > 0.85 ? 1 : 0;
    pile += (pileTarget - pile) * 0.04;

    // hover feedback, only where hover exists: on touch the slow
    // swell belongs to the long press instead
    raycaster.setFromCamera(pointer, camera);
    const hit = canHover ? raycaster.intersectObjects(shapes, false)[0] || null : null;
    const hitMesh = hit ? hit.object : null;
    if (hitMesh) {
      hoverLostAt = 0;
      if (hitMesh !== hovered) {
        if (hovered && hovered.userData.swellVoice) {
          engine.swellEnd(hovered.userData.swellVoice);
          hovered.userData.swellVoice = null;
        }
        hovered = hitMesh;
        // leaning in: the pitch blooms slowly under the pointer
        hovered.userData.swellVoice = engine.swellStart({
          pitch: hovered.userData.pitch,
          pan: panOf(hovered),
        });
        if (hovered.userData.swellVoice) {
          staff.note(hovered.userData.pitch);
          logLine(`swell(${SHAPE_NAMES[hovered.userData.type]}.${hovered.userData.index}, { note: '${noteOf(hovered.userData.pitch)}' })`);
          const [sx, sy] = screenOf(hovered);
          score.squiggle(sx, sy, 1600);
        }
        if (!held) container.style.cursor = 'grab';
      }
    } else if (hovered) {
      // let go only after a beat, so the edge of a shape does not flicker
      if (!hoverLostAt) hoverLostAt = t;
      if (t - hoverLostAt > 0.12) {
        if (hovered.userData.swellVoice) {
          engine.swellEnd(hovered.userData.swellVoice);
          hovered.userData.swellVoice = null;
        }
        hovered = null;
        if (!held) container.style.cursor = '';
      }
    }

    // forces and integration
    for (const mesh of shapes) {
      const data = mesh.userData;
      if (mesh === held) continue;

      force.set(0, 0, 0);

      // every other planet pulls, by mass and distance. A held shape
      // pulls far harder, and its motion stirs everything near it, so
      // dragging circles can spin the whole collection into a whirlpool
      for (const other of shapes) {
        if (other === mesh) continue;
        between.subVectors(other.position, mesh.position);
        const d2 = between.lengthSq() + SOFTEN;
        const dragging = other === held && holdMoved > tapDrift;
        const boost = dragging ? HOLD_PULL_BOOST : 1;
        const pull = (GRAVITY * boost * data.mass * other.userData.mass) / d2;
        force.addScaledVector(between.normalize(), pull);
        if (dragging) {
          force.addScaledVector(
            throwVelocity,
            (STIR * data.mass * other.userData.mass) / d2
          );
        }
      }

      // the leash home keeps the system composed, until the floor arrives
      between.subVectors(data.home, mesh.position);
      force.addScaledVector(between, HOME_PULL * data.mass * (1 - pile));

      // a faint idle breath so rest never looks frozen
      force.y += Math.sin(t * data.bobSpeed + data.bobPhase) * 0.12 * data.mass;

      // scrolling down leaves them behind, drifting toward the top
      force.y += scrollVelocity * SCROLL_INERTIA * data.mass;

      // a tilted phone is a tilted room
      force.x += tiltGravityX * TILT_PULL * data.mass;
      force.y += tiltGravityY * TILT_PULL * data.mass;

      // at the bottom of the page, real gravity, and a lean to the corners.
      // A shape that has touched down weighs three times what it did in
      // the air, so the pile sits like a pile, not like balloons.
      const nearFloor = mesh.position.y - data.radius < field.floor + 1.5;
      const groundedTarget = pile > 0.3 && nearFloor ? 1 : 0;
      data.grounded += (groundedTarget - data.grounded) * (groundedTarget ? 0.5 : 0.03);
      if (pile > 0.01) {
        force.y -= FALL_PULL * data.mass * pile * (1 + 2 * data.grounded);
        force.x += Math.sign(mesh.position.x || 1) * 0.8 * data.mass * pile;
      }

      // soft walls
      if (Math.abs(mesh.position.x) > field.bounds.x)
        force.x -= Math.sign(mesh.position.x) * data.mass * 2;
      if (Math.abs(mesh.position.y) > field.bounds.y)
        force.y -= Math.sign(mesh.position.y) * data.mass * 2;
      if (mesh.position.z > field.bounds.zNear) force.z -= data.mass * 2;
      if (mesh.position.z < field.bounds.zFar) force.z += data.mass * 2;

      data.velocity.addScaledVector(force, dt / data.mass);
      data.velocity.multiplyScalar(DAMPING ** (dt * 60));
      mesh.position.addScaledVector(data.velocity, dt);

      // the floor is real once the pile begins: land, settle, and sing
      if (pile > 0.3 && mesh.position.y - data.radius < field.floor) {
        mesh.position.y = field.floor + data.radius;
        if (data.velocity.y < 0) {
          const impact = -data.velocity.y;
          data.velocity.y *= -0.22;
          data.velocity.x *= 0.9;
          data.velocity.z *= 0.9;
          if (impact > 0.9 && t - lastEnergyAt < 5) {
            logLine(`land(${SHAPE_NAMES[data.type]}.${data.index}, impact = ${impact.toFixed(1)})`);
            clusterStrike(mesh, Math.min(0.32, impact * 0.05), t);
          }
        }
      }

      mesh.rotation.x += data.spin * dt;
      mesh.rotation.y += data.spin * 1.4 * dt;
    }

    // the held planet follows the pointer, and remembers its speed
    if (held) {
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(holdPlane, holdPoint)) {
        if (holdPointSeen) {
          between.subVectors(holdPoint, lastHoldPoint);
          holdMoved += between.length();
          throwVelocity.lerp(between.clone().divideScalar(Math.max(dt, 0.008)), 0.35);
        }
        lastHoldPoint.copy(holdPoint);
        holdPointSeen = true;
        between.copy(holdPoint).add(grabOffset);
        held.position.lerp(between, 0.4);

        // a dragged shape wakes only what it passes close to: each
        // neighbor swells in as you approach and lets go as you leave
        if (holdMoved > tapDrift) {
          // once a press becomes a drag, the long press swell steps
          // aside; mouse hover swells keep their old behavior
          if (heldIsTouch && held.userData.swellVoice) {
            engine.swellEnd(held.userData.swellVoice);
            held.userData.swellVoice = null;
          }
          clearTimeout(longPressTimer);
          for (const other of shapes) {
            if (other === held) continue;
            const od = other.userData;
            const near = held.position.distanceTo(other.position) < DRAG_RADIUS;
            if (near) {
              if (!od.dragVoice) {
                od.dragVoice = engine.swellStart({
                  pitch: od.pitch,
                  pan: panOf(other),
                  peak: 0.2,
                });
                if (od.dragVoice) staff.note(od.pitch);
              }
              od.resonateUntil = t + 0.35;
            } else if (od.dragVoice) {
              engine.swellEnd(od.dragVoice);
              od.dragVoice = null;
            }
          }
        }
      }
    }

    // collisions ring both parties
    for (let a = 0; a < shapes.length; a++) {
      for (let b = a + 1; b < shapes.length; b++) {
        const A = shapes[a];
        const B = shapes[b];
        between.subVectors(B.position, A.position);
        const distance = between.length();
        const minDistance = A.userData.radius + B.userData.radius;
        if (distance >= minDistance || distance === 0) continue;

        const normal = between.divideScalar(distance);
        const invMassA = A === held ? 0 : 1 / A.userData.mass;
        const invMassB = B === held ? 0 : 1 / B.userData.mass;
        if (invMassA + invMassB === 0) continue;

        // push them apart
        const overlap = minDistance - distance;
        A.position.addScaledVector(normal, -overlap * (invMassA / (invMassA + invMassB)));
        B.position.addScaledVector(normal, overlap * (invMassB / (invMassA + invMassB)));

        // exchange momentum along the normal
        const relative = new THREE.Vector3()
          .copy(B === held ? new THREE.Vector3() : B.userData.velocity)
          .sub(A === held ? new THREE.Vector3() : A.userData.velocity);
        const closing = relative.dot(normal);
        if (closing < 0) {
          const impulse = (-(1 + RESTITUTION) * closing) / (invMassA + invMassB);
          if (invMassA) A.userData.velocity.addScaledVector(normal, -impulse * invMassA);
          if (invMassB) B.userData.velocity.addScaledVector(normal, impulse * invMassB);

          // idle drift grazes stay silent: a collision speaks only when
          // it is a real impact, and only while the visitor is present
          const speed = Math.abs(closing);
          if (speed > 0.9 && t - lastEnergyAt < 5) {
            const hitGain = Math.min(0.9, 0.1 + (speed - 0.9) * 0.28);
            if (pile > 0.5) {
              // tumbling at the bottom speaks in soft clusters, not strikes
              clusterStrike(A, hitGain * 0.45, t);
              clusterStrike(B, hitGain * 0.45, t);
            } else {
              strike(A, hitGain, t);
              strike(B, hitGain, t);
            }
          }
        }
      }
    }

    // ease the glows and scales, never snap
    for (const mesh of shapes) {
      const data = mesh.userData;
      data.glow *= 0.92;
      const resonating = t < (data.resonateUntil || 0);
      const target = (hovered === mesh || held === mesh || resonating)
        ? data.baseScale * 1.12
        : data.baseScale;
      const next = mesh.scale.x + (target - mesh.scale.x) * 0.05;
      mesh.scale.setScalar(next);
      data.hoverGlow = data.hoverGlow || 0;
      const resonateGlow = t < (data.resonateUntil || 0) ? 0.85 : 0;
      // a long pressed shape glows like a hovered one while it swells
      const pressGlow = held === mesh && data.swellVoice ? 0.55 : 0;
      const wantsGlow = Math.max(hovered === mesh ? 0.4 : 0, pressGlow, resonateGlow);
      data.hoverGlow += (wantsGlow - data.hoverGlow) * (wantsGlow ? 0.06 : 0.025);
      mesh.material.emissiveIntensity = data.glow * 0.6 + data.hoverGlow;
    }

    // pointer tilts the view, scroll sinks it, perspective does the rest
    camera.position.x += (tiltX - camera.position.x) * 0.02;
    camera.position.y += (-tiltY - scrollY * 0.004 - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  renderer.setAnimationLoop(frame);

  // do not burn battery in a background tab
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : frame);
  });

  container.classList.add('is-live');
}
