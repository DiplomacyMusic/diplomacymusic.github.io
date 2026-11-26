// The explorable shell, now a resonant little solar system.
//
// "Sound is listening" made physical: every shape is a planet with mass
// and a material voice. They pull on each other, collide, and ring.
// Striking one makes the others of the same material answer, quieter
// with distance, the way sympathetic strings do. Grab one, throw it,
// and the collisions play the room.
//
// Pitch comes from mass, so the big planets speak low. The voices are
// the FirstObjects recordings, a D flat major 13 sharp 11 ladder, so anything
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

// The lake world: a low poly world around the lab's shapes, the lake and
// mountains of the site's video with forest along the shore, in flat
// facets like an old console game. It is part of the same 3D space as the
// shapes, so turning the room turns it too. It started as a mock-up and
// stayed. Flip this off and the lab is the shapes alone again.
const LAKE_WORLD = true;

// The staff has two builds and Daniel keeps going back and forth,
// reasonably. true: the gigantic blurred structure in the fog.
// false: the small legible one docked above the sound toggle.
const GIANT_STAFF = false;

// every interaction is broadcast as a log line; the Build section
// types them out as they happen, a real transcript of the room
const SHAPE_NAMES = ['icosa', 'torus', 'capsule', 'octa'];
// The rungs of the ladder each family owns, low to high. On the D flat
// ladder (Db3 Ab3 C4 Eb4 Ab4 Bb4 Eb5 G5 Bb5+Eb6 F6+Bb6):
//   icosa   C4, Eb4, G5        a C minor triad
//   torus   Db3, Ab3, Ab4      open fifths on D flat, the low ground
//   capsule Bb4, Eb5           a bare fourth
//   octa    Bb5+Eb6, F6+Bb6    the high shimmer
const FAMILY_RUNGS = [[2, 3, 7], [0, 1, 4], [5, 6], [8, 9]];
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

// physics tuning, all in world units. Loosened on November 26, 2026 so
// the room is easier to whip up: less drag, livelier bounces, a longer
// leash, and quieter touches allowed to ring.
const GRAVITY = 1.5;          // pull between planets while someone is playing: they find each other
const REPEL = 0.22;           // how hard unlike shapes push apart, as a share of the pull between like ones
const IDLE_PULL = 0.2;        // the share of that pull left once the room is alone, so a
                              // huddle lets go and everything drifts back to its own place
const SOFTEN = 2.5;           // close passes may slingshot a little
const HOME_PULL = 0.12;       // a long leash back to each home position
const DAMPING = 0.975;        // thin water: a throw carries about twice as far
const RESTITUTION = 0.82;     // collisions bounce on, so one hit starts others
// Depth of the room; its sides are the edges of the screen. Nearly the
// same in front of the middle as behind it, so the room can be turned
// right round without the shapes piling against the lens.
const BOUNDS = { zNear: 5, zFar: -8 };
const RESONANCE_RADIUS = 15;  // how far sympathy travels
const STRIKE_COOLDOWN = 0.08; // seconds between strikes per shape
const SCROLL_INERTIA = 0.006; // how hard scrolling drags the planets
const SCROLL_INERTIA_TOUCH = 0.011; // on a phone the scroll is the current: it plays the room
const SCROLL_CLAMP = 2200;          // px/s; the current still saturates, later than it did
const FLOOR_Y = -6.5;         // where they land at the bottom of the page
const FALL_PULL = 9;          // gravity once the bottom of the page arrives
const TILT_PULL = 5;          // how hard a tilted phone pulls
const DRAG_RADIUS = 6.5;      // how close a dragged shape must come to wake another
const HOLD_PULL_BOOST = 16;   // a held shape pulls like something far heavier
const STIR = 0.2;             // dragging stirs the water, momentum passed by proximity
const THROW_MAX = 20;         // the fastest a thrown shape may leave the hand
const RING_SPEED = 0.5;       // how hard two things must meet before they speak
const LISTEN_SECONDS = 9;     // how long after a touch the room keeps sounding
const WALL_BOUNCE = 0.6;       // how much speed a shape keeps off the edge of the screen
const EDGE_KEEP = 0.4;         // a shape's centre stays this share of its radius inside the edge
const ORBIT_TURN = 0.0045;     // radians of turn per pixel dragged across empty space
const ORBIT_PITCH_MAX = 1.05;  // how far over the top or under the view may go
const WORLD_PITCH_MIN = -0.28; // with the lake world, the camera stays above the water
const SWIRL = 1.4;             // how hard a turning room drags the shapes round with it
const SWIRL_MAX = 4;           // radians a second; past this the water stops keeping up
const GRAB_SLACK = 26;          // px a finger may miss a shape by and still take hold of it
const HANDS_SECONDS = 4;       // how long after a hand leaves the room still counts as playing
const ZOOM_NEAR = 0.7;         // a pinch may bring the camera this much closer
const ZOOM_FAR = 1.3;          // or push it this much farther away, short of the fog
const TAP_DRIFT = 0.25;       // world units a mouse may wander before a press is a drag
const TAP_DRIFT_TOUCH = 0.7;  // fingers wobble more than mice do
const LONG_PRESS_MS = 300;    // a finger that stays this long starts the slow swell

// options.room: the environment lives inside one section instead of
// behind a whole page. The camera stops following the page scroll, the
// floor arrives when options.pile() says so, and the loop rests while
// the section is off screen. With no options, nothing changes.
export async function startEnvironment(container, options = {}) {
  const THREE = await import('three');
  const room = options.room === true;

  // a phone is a different room: tall, narrow, touched with fingers
  const portrait = container.clientWidth < container.clientHeight;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const scene = new THREE.Scene();
  // distant shapes fade into the room's own colour; a room says which
  // (--room-fog in the styles), anywhere else it is the paper
  const fogColor = getComputedStyle(container).getPropertyValue('--room-fog').trim();
  // With the lake world behind them the shapes keep nearly all of their
  // own colour at any depth, so they stand sharp against the fogged land.
  const crisp = options.room === true && LAKE_WORLD;
  scene.fog = new THREE.Fog(fogColor ? new THREE.Color(fogColor) : 0xf2f1f0, crisp ? 16 : 10, crisp ? 70 : 34);

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
        spreadX: halfW * 1.7,
        spreadY: halfH * 1.6,
        spreadZ: 10, // deep, so the dolly streaks near shapes past far ones
        bounds: BOUNDS,
        floor: -(halfH * 0.9),
      }
    : {
        count: 14,
        spreadX: Math.min(22, halfW * 1.7),
        spreadY: Math.min(11, halfH * 1.6),
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
      if (portrait) return; // the score is hidden on phones for now
      if (!staffImpl) {
        staffImpl = GIANT_STAFF
          ? createStaffScore(container, { giant: true })
          : room
            ? createStaffScore(container, {
                room: true,
                ink: getComputedStyle(container).getPropertyValue('--room-ink').trim() || undefined,
              })
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
  // In the lab the sun stands beyond the lake, ahead of the camera and a
  // little to the right, so the first view is into the light: the water
  // glints and the shapes are rimmed. (It is where the old sun, behind the
  // camera, appeared once the room had been turned about 140 degrees.)
  if (options.room === true && LAKE_WORLD) sun.position.set(1.8, 8, -11.5);
  else sun.position.set(6, 8, 10);
  scene.add(sun);

  const glass = room && LAKE_WORLD;
  if (glass) buildLakeWorld();

  // The lake world. Everything is flat shaded and coloured face by face,
  // and nothing here is touched by the scene's fog (which is tuned for the
  // shapes, close in): distance is painted in instead, each face blended
  // toward the colour of the horizon the farther it stands from the middle
  // of the room. The water lies exactly where the floor arrives, so shapes
  // that are let fall come down onto the lake.
  function buildLakeWorld() {
    // the same landscape on every visit
    let seed = 20261126;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const lakeY = field.floor - 0.05;
    // Haze. The world is seen through a lot of soft air, the way the flat
    // background it replaced was all soft light: every face is washed
    // toward the colour of the horizon, a little even close in and most of
    // the way by the far peaks. HAZE_LEAST and HAZE_REACH are the two
    // numbers to turn if it should be clearer or mistier.
    const HAZE = new THREE.Color(0xcbcfc6);
    const HAZE_LEAST = 0.3; // even the water at your feet is this far gone into the fog
    const HAZE_REACH = 62;  // world units from the middle at which nothing is left but fog
    // The world is kept deep in fog on purpose: it is the soft ground the
    // shapes are seen against, and they stay crisp in front of it.
    const far = (color, radius, most = 0.93) =>
      color.clone().lerp(HAZE, Math.min(most, HAZE_LEAST + (1 - HAZE_LEAST) * Math.min(1, radius / HAZE_REACH)));
    const flat = () =>
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0, fog: false });
    const world = new THREE.Group();

    // give every triangle one colour of its own, chosen by where it sits
    const paint = (geometry, choose) => {
      const faces = geometry.index ? geometry.toNonIndexed() : geometry;
      const at = faces.getAttribute('position');
      const colors = new Float32Array(at.count * 3);
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      for (let i = 0; i < at.count; i += 3) {
        a.fromBufferAttribute(at, i);
        b.fromBufferAttribute(at, i + 1);
        c.fromBufferAttribute(at, i + 2);
        const color = choose(a.add(b).add(c).multiplyScalar(1 / 3));
        for (let k = 0; k < 3; k++) color.toArray(colors, (i + k) * 3);
      }
      faces.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return faces;
    };
    const shade = (hex, spread) => {
      const color = new THREE.Color(hex);
      color.offsetHSL(0, 0, (rand() - 0.5) * spread);
      return color;
    };

    // the sky: a dome, deep overhead and pale at the horizon
    const dome = new THREE.SphereGeometry(72, 18, 12);
    {
      const at = dome.getAttribute('position');
      const colors = new Float32Array(at.count * 3);
      const zenith = new THREE.Color(0x7b919a); // a pale, misted blue overhead
      const color = new THREE.Color();
      for (let i = 0; i < at.count; i++) {
        const up = Math.max(0, at.getY(i) / 72);
        color.copy(HAZE).lerp(zenith, Math.pow(up, 0.8));
        color.toArray(colors, i * 3);
      }
      dome.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const sky = new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
    sky.position.y = lakeY;
    world.add(sky);

    // the lake: a disc of facets, each a slightly different water
    const LAKE_RADIUS = 30;
    const water = new THREE.RingGeometry(0.01, LAKE_RADIUS, 30, 7);
    water.rotateX(-Math.PI / 2);
    {
      const at = water.getAttribute('position');
      for (let i = 0; i < at.count; i++) {
        const radius = Math.hypot(at.getX(i), at.getZ(i));
        if (radius < LAKE_RADIUS - 0.5) at.setY(i, (rand() - 0.5) * 0.14);
      }
    }
    const lake = new THREE.Mesh(
      paint(water, (centre) => far(shade(0x3f6f86, 0.07), Math.hypot(centre.x, centre.z), 0.72)),
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.35, metalness: 0.15, fog: false })
    );
    lake.position.y = lakeY;
    world.add(lake);

    // the shore and the land behind it
    const ground = new THREE.RingGeometry(LAKE_RADIUS - 0.6, 71, 36, 4);
    ground.rotateX(-Math.PI / 2);
    const land = new THREE.Mesh(
      paint(ground, (centre) => far(shade(0x4c5a4c, 0.06), Math.hypot(centre.x, centre.z))),
      flat()
    );
    land.position.y = lakeY + 0.12;
    world.add(land);

    // the mountains: two rings of peaks, forest at the foot, rock above,
    // snow on the tall ones. The far ring is bigger and paler.
    const peak = (angle, radius, height) => {
      const base = height * (0.7 + rand() * 0.45);
      const cone = new THREE.ConeGeometry(base, height, 5 + Math.floor(rand() * 3), 3);
      const at = cone.getAttribute('position');
      for (let i = 0; i < at.count; i++) {
        // knock the sides about, but leave the summit and the foot alone
        const up = at.getY(i) / height + 0.5;
        if (up > 0.05 && up < 0.95) {
          at.setX(i, at.getX(i) * (0.82 + rand() * 0.36));
          at.setZ(i, at.getZ(i) * (0.82 + rand() * 0.36));
        }
      }
      const snowy = height > 15;
      const mesh = new THREE.Mesh(
        paint(cone, (centre) => {
          const up = centre.y / height + 0.5;
          const hex = up < 0.3 ? 0x41584a : up < (snowy ? 0.68 : 2) ? 0x6c7479 : 0xe9e7df;
          return far(shade(hex, 0.07), radius);
        }),
        flat()
      );
      mesh.position.set(Math.cos(angle) * radius, lakeY + height / 2 - 0.4, Math.sin(angle) * radius);
      mesh.rotation.y = rand() * Math.PI * 2;
      world.add(mesh);
    };
    for (let i = 0; i < 15; i++) peak((i / 15) * Math.PI * 2 + rand() * 0.25, 42 + rand() * 7, 8 + rand() * 11);
    for (let i = 0; i < 9; i++) peak((i / 9) * Math.PI * 2 + rand() * 0.4, 56 + rand() * 4, 17 + rand() * 9);

    // the forest: one small tree, placed four hundred times along the shore
    const TREES = 420;
    const tree = new THREE.ConeGeometry(0.6, 2.4, 5, 1);
    const forest = new THREE.InstancedMesh(tree, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95, fog: false }), TREES);
    const place = new THREE.Object3D();
    for (let i = 0; i < TREES; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = LAKE_RADIUS + 0.6 + Math.pow(rand(), 1.6) * 13;
      const size = 0.7 + rand() * 1.1;
      place.position.set(Math.cos(angle) * radius, lakeY + 0.12 + 1.2 * size, Math.sin(angle) * radius);
      place.scale.set(size, size, size);
      place.rotation.y = rand() * Math.PI;
      place.updateMatrix();
      forest.setMatrixAt(i, place.matrix);
      forest.setColorAt(i, far(shade(0x2f4a3f, 0.08), radius, 0.8));
    }
    forest.instanceMatrix.needsUpdate = true;
    if (forest.instanceColor) forest.instanceColor.needsUpdate = true;
    world.add(forest);

    scene.add(world);
  }

  // the planet population, in the official palette
  // the brand Blue is nudged a little toward the lake in the video, so
  // the room carries some of that water; the other three are as they were
  const palette = [0x7396a4, 0x4e433d, 0xd9d7c2, 0x979595];
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
    // With the lake world behind them the shapes can be glass: one that is
    // speaking lets the lake and the mountains through, bent by its facets,
    // where it used to light up white. Without the world there is nothing
    // behind a shape to bend, so there it keeps its old glow.
    const material = glass
      ? new THREE.MeshPhysicalMaterial({
          color: palette[i % palette.length],
          roughness: 0.55,
          metalness: 0.05,
          flatShading: true,
          transmission: 0,
          ior: 1.5,
          thickness: 1.6,
          attenuationColor: new THREE.Color(palette[i % palette.length]).lerp(new THREE.Color(0xffffff), 0.55),
          attenuationDistance: 4.5,
          emissive: 0xd9d7c2,
          emissiveIntensity: 0,
        })
      : new THREE.MeshStandardMaterial({
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
      (Math.random() - 0.5) * field.spreadZ - (portrait ? 3 : 1.5)
    );
    const scale = 0.5 + Math.random() * 1.3;
    mesh.scale.setScalar(scale);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);

    // mass follows volume, and pitch follows mass: big planets speak low
    const mass = scale ** 3;
    // Each kind of shape is a family with a tonality of its own: a few
    // rungs of the ladder that no other family uses. Within a family the
    // big ones still speak low. So a family answering one of its own makes
    // one clear chord, and two families meeting are two chords, not a wash.
    const family = FAMILY_RUNGS[type];
    const within = Math.round((family.length - 1) * (1 - (scale - 0.5) / 1.3));
    const noteSpread = PITCH_COUNT - 1;
    const noteIndex = family[Math.max(0, Math.min(family.length - 1, within))];

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
      // the answer is nearly as loud as the call, and fades gently with distance
      const sympathy = gain * (1 - 0.6 * (distance / RESONANCE_RADIUS)) * 0.9;
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

    // the neighbours are the shape's own family's notes, not the ladder's
    const rungs = FAMILY_RUNGS[data.type];
    const home = Math.max(0, rungs.indexOf(data.pitch));
    const steps = [0, 1, -1, 2];
    steps.forEach((step, voice) => {
      const index = rungs[((home + step) % rungs.length + rungs.length) % rungs.length];
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

  // A drag that starts on empty space turns the whole room. The camera
  // swings around the middle of it; the shapes stay where they are, and
  // the edges of the room follow the view. A mouse can also tip the room
  // over; a finger's up and down still belongs to the page.
  const pitchMin = room && LAKE_WORLD ? WORLD_PITCH_MIN : -ORBIT_PITCH_MAX;
  let orbitPointer = null;
  let orbitTouch = false; // a finger whose up and down still scrolls the page
  let orbitMouse = false;
  let orbitX = 0;
  let orbitY = 0;
  let orbitMovedAt = 0;
  let yawDrift = 0;
  let yawTarget = 0;
  let pitchTarget = 0;
  let yaw = 0;
  let pitch = 0;
  // two fingers on a phone do more: their travel turns the room both ways,
  // their twist rolls it, and their pinch moves the camera in and out
  let rollTarget = 0;
  let roll = 0;
  let zoomTarget = 1;
  let zoom = 1;
  let gesture = null;
  // Turning the room stirs it. The turn is an arm swept through a lake:
  // the shapes are leaves caught in the motion, dragged round the middle
  // of the room the same way, the small ones soonest, and left circling
  // after the arm has stopped. This is how fast the water is turning.
  const swirl = new THREE.Vector3();
  const turned = { yaw: 0, pitch: 0, roll: 0 };
  const AXIS_X = new THREE.Vector3(1, 0, 0);
  const AXIS_Y = new THREE.Vector3(0, 1, 0);
  // where the camera would sit if the room had never been turned
  const rig = camera.position.clone();

  // Two guards against the page scrolling away in the middle of playing.
  // A finger does not have to land exactly on a shape: a near miss takes
  // hold of the nearest one. And while shapes are being moved, and for a
  // few seconds after, the room keeps every touch that lands on it, so a
  // miss turns the room instead of scrolling the page. Leave the room
  // alone for those few seconds and the page scrolls as usual again.
  let lastHandsAt = -10; // when a hand was last on a shape or on the room
  const playingNow = () => performance.now() / 1000 - lastHandsAt < HANDS_SECONDS;
  const slackPoint = new THREE.Vector2();
  function pick(clientX, clientY, forgiving) {
    const rect = container.getBoundingClientRect();
    const tryAt = (x, y) => {
      slackPoint.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(slackPoint, camera);
      return raycaster.intersectObjects(shapes, false)[0] || null;
    };
    const direct = tryAt(clientX, clientY);
    if (direct || !forgiving) return direct;
    for (let step = 0; step < 8; step++) {
      const angle = (step / 8) * Math.PI * 2;
      const near = tryAt(clientX + Math.cos(angle) * GRAB_SLACK, clientY + Math.sin(angle) * GRAB_SLACK);
      if (near) return near;
    }
    return null;
  }

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
    if (event.pointerId === orbitPointer) {
      const dx = event.clientX - orbitX;
      const dy = event.clientY - orbitY;
      orbitX = event.clientX;
      orbitY = event.clientY;
      yawTarget += dx * ORBIT_TURN;
      yawDrift = dx * ORBIT_TURN;
      orbitMovedAt = performance.now();
      if (!orbitTouch) {
        pitchTarget = Math.max(pitchMin, Math.min(ORBIT_PITCH_MAX, pitchTarget + dy * ORBIT_TURN * 0.8));
      }
      // turning the room is being in the room
      lastEnergyAt = performance.now() / 1000;
    }
    // while a shape is held, only the grabbing finger speaks
    if (heldPointerId !== null && event.pointerId !== heldPointerId) return;
    updatePointer(event);
  });

  // The rule on touch: a finger that lands on a shape owns the gesture.
  // Claiming it here, before scrolling can start, is the only reliable
  // way to keep a vertical drag from scrolling the page instead.
  const twoFingers = (touches) => {
    const [a, b] = [touches[0], touches[1]];
    return {
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
      spread: Math.max(24, Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)),
      angle: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX),
    };
  };

  window.addEventListener('touchmove', (event) => {
    if (!gesture || event.touches.length !== 2) return;
    if (event.cancelable) event.preventDefault();
    const now = twoFingers(event.touches);
    yawTarget += (now.x - gesture.x) * ORBIT_TURN;
    pitchTarget = Math.max(pitchMin, Math.min(ORBIT_PITCH_MAX, pitchTarget + (now.y - gesture.y) * ORBIT_TURN * 0.8));
    // the short way round, so a twist never jumps as the fingers cross over
    let twist = now.angle - gesture.angle;
    if (twist > Math.PI) twist -= Math.PI * 2;
    if (twist < -Math.PI) twist += Math.PI * 2;
    rollTarget += twist;
    // fingers apart brings the camera in, fingers together sends it back
    zoomTarget = Math.max(ZOOM_NEAR, Math.min(ZOOM_FAR, (zoomTarget * gesture.spread) / now.spread));
    gesture = now;
    lastEnergyAt = performance.now() / 1000;
  }, { passive: false });

  const endTwoFingers = (event) => {
    if (!gesture || event.touches.length >= 2) return;
    gesture = null;
    const degrees = (radians) => Math.round((radians * 180) / Math.PI);
    logLine(`turn(room, { yaw: ${degrees(yawTarget)}, pitch: ${degrees(pitchTarget)}, roll: ${degrees(rollTarget)}, zoom: ${(1 / zoomTarget).toFixed(2)} })`);
  };
  window.addEventListener('touchend', endTwoFingers);
  window.addEventListener('touchcancel', endTwoFingers);

  window.addEventListener('touchstart', (event) => {
    // two fingers on the empty room claim the gesture for the room: no
    // page scroll, no page zoom, and the one finger turn steps aside
    if (event.touches.length === 2 && !held) {
      const inRoom = [...event.touches].every((touch) => touch.target === renderer.domElement);
      if (inRoom) {
        if (event.cancelable) event.preventDefault();
        gesture = twoFingers(event.touches);
        orbitPointer = null;
        lastEnergyAt = performance.now() / 1000;
      }
      return;
    }
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (event.target.closest && event.target.closest('a, button')) return;
    const rect = container.getBoundingClientRect();
    if (touch.clientY < rect.top || touch.clientY > rect.bottom) return;
    updatePointer(touch);
    const onRoom = touch.target === renderer.domElement;
    if (pick(touch.clientX, touch.clientY, true) || (onRoom && playingNow())) {
      if (event.cancelable) event.preventDefault();
    }
  }, { passive: false });

  // Listen on the window so shapes behind the hero text stay grabbable,
  // but never steal a press meant for a link or a button.
  window.addEventListener('pointerdown', (event) => {
    if (held) return; // one hand at a time
    if (event.target.closest('a, button')) return;
    const rect = container.getBoundingClientRect();
    if (event.clientY < rect.top || event.clientY > rect.bottom) return;
    updatePointer(event);
    const hit = pick(event.clientX, event.clientY, event.pointerType !== 'mouse');
    if (!hit) {
      // empty space: this drag turns the room
      if (event.target !== renderer.domElement || orbitPointer !== null) return;
      orbitPointer = event.pointerId;
      // a finger's up and down belongs to the page, unless the room is
      // keeping its touches because someone is in the middle of playing
      orbitTouch = event.pointerType !== 'mouse' && !playingNow();
      orbitX = event.clientX;
      orbitY = event.clientY;
      yawDrift = 0;
      orbitMouse = event.pointerType === 'mouse';
      if (orbitMouse) {
        event.preventDefault();
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        container.style.cursor = 'grabbing';
      }
      return;
    }
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
    // hold the shape where it was grabbed, not by its center. The ray is
    // aimed again at the finger itself, since a near miss was found by
    // looking a little to one side of it.
    raycaster.setFromCamera(pointer, camera);
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
    if (event.pointerId === orbitPointer) {
      orbitPointer = null;
      // let go in the middle of a turn and the room coasts a little further
      if (event.type === 'pointerup' && performance.now() - orbitMovedAt < 80) yawTarget += yawDrift * 4;
      const degrees = (radians) => Math.round((radians * 180) / Math.PI);
      logLine(`turn(room, { yaw: ${degrees(yawTarget)}, pitch: ${degrees(pitchTarget)} })`);
      if (orbitMouse) {
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
        container.style.cursor = hovered ? 'grab' : '';
      }
    }
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
      held.userData.velocity.copy(throwVelocity).clampLength(0, THROW_MAX);
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

  // The drawing follows the room's own size, not only the window's: on a
  // phone the room grows and shrinks as the browser's bars come and go.
  const fit = () => {
    if (!container.clientWidth || !container.clientHeight) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', fit);
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(container);

  // -------------------------------------------------------------------------
  // the loop
  // -------------------------------------------------------------------------

  const force = new THREE.Vector3();
  const between = new THREE.Vector3();

  // The room is exactly as big as the screen. A shape is held inside what
  // the camera can see, wherever the camera has been turned to: its centre
  // may not pass the edge of the view, so no shape is ever wholly out of
  // sight. The edges are hard and a little bouncy. Hitting one of the four
  // edges of the screen rings the shape; the bottom one becomes the floor
  // once the floor has arrived. The near and far limits stay silent.
  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const camBack = new THREE.Vector3();
  const fromCam = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);

  // A shape lying on the floor is pushed into it by gravity on every
  // frame, and that push alone can look like a small landing. So a touch
  // down only counts as a landing when the shape has been off the floor
  // for a moment, and when it arrives faster than gravity could have
  // made it in a single frame.
  function restingSpeed(dt) {
    return FALL_PULL * 3 * pile * dt * 1.5;
  }
  function touchDown(mesh, impact, t, dt) {
    const data = mesh.userData;
    const fresh = t - (data.floorAt === undefined ? -10 : data.floorAt) > 0.25;
    data.floorAt = t;
    if (!fresh || impact <= RING_SPEED + restingSpeed(dt)) return;
    if (t - lastEnergyAt >= LISTEN_SECONDS) return;
    logLine(`land(${SHAPE_NAMES[data.type]}.${data.index}, impact = ${impact.toFixed(1)})`);
    clusterStrike(mesh, Math.min(0.45, impact * 0.08), t);
  }

  // A shape that runs into an edge of the screen speaks, the same as when
  // it runs into another shape, and its family answers. One that is only
  // leaning on the edge, or being swept along by it as the room turns,
  // stays quiet: it has to arrive, and it has to have been clear of the
  // edges a moment before.
  function edgeHit(mesh, impact, t) {
    const data = mesh.userData;
    const fresh = t - (data.edgeAt === undefined ? -10 : data.edgeAt) > 0.25;
    data.edgeAt = t;
    if (!fresh || impact <= RING_SPEED) return;
    if (t - lastEnergyAt >= LISTEN_SECONDS) return;
    strike(mesh, Math.min(0.9, 0.1 + (impact - RING_SPEED) * 0.28), t);
  }

  // take away the speed a shape has toward an edge, and give some back
  function turnBack(data, normal, bounce) {
    const outward = data.velocity.dot(normal);
    if (outward > 0) data.velocity.addScaledVector(normal, -(1 + bounce) * outward);
    return outward;
  }

  function keepInView(mesh, t, dt) {
    const data = mesh.userData;
    // The room keeps one size. Its edges are the edges of the view as it
    // is before any pinch, so coming in close looks at part of the room
    // instead of crushing the shapes together, and pulling back shows the
    // whole room with air around it.
    fromCam.copy(camera.position).multiplyScalar(-1 / zoom).add(mesh.position);

    // depth first: never onto the lens, never lost in the fog
    const distance = camera.position.length() / zoom;
    const nearest = distance - field.bounds.zNear;
    const farthest = distance - field.bounds.zFar;
    let depth = -fromCam.dot(camBack);
    if (depth < nearest) {
      mesh.position.addScaledVector(camBack, depth - nearest);
      turnBack(data, camBack, WALL_BOUNCE);
      depth = nearest;
    } else if (depth > farthest) {
      mesh.position.addScaledVector(camBack, depth - farthest);
      turnBack(data, edge.copy(camBack).negate(), WALL_BOUNCE);
      depth = farthest;
    }

    // then the four edges of the screen, which widen with depth
    const halfY = Math.max(0.5, depth * tanHalf - data.radius * EDGE_KEEP);
    const halfX = Math.max(0.5, depth * tanHalf * camera.aspect - data.radius * EDGE_KEEP);
    const x = fromCam.dot(camRight);
    const y = fromCam.dot(camUp);
    if (Math.abs(x) > halfX) {
      const side = Math.sign(x);
      mesh.position.addScaledVector(camRight, side * halfX - x);
      edgeHit(mesh, turnBack(data, edge.copy(camRight).multiplyScalar(side), WALL_BOUNCE), t);
    }
    if (Math.abs(y) > halfY) {
      const side = Math.sign(y);
      mesh.position.addScaledVector(camUp, side * halfY - y);
      // once the floor has arrived, the bottom of the screen is floor too
      const landing = side < 0 && pile > 0.3;
      const impact = turnBack(data, edge.copy(camUp).multiplyScalar(side), landing ? 0.22 : WALL_BOUNCE);
      if (landing) touchDown(mesh, impact, t, dt);
      else edgeHit(mesh, impact, t);
    }
  }

  let lastFrameAt = performance.now();
  let lastScrollY = window.scrollY;
  let pile = 0; // eases toward 1 when the bottom of the page arrives
  let pileAsked = 0; // the last answer to "is the floor wanted", to catch the change
  let presence = IDLE_PULL; // eases toward 1 while someone is playing
  let wasPlaying = false;

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
    const pileTarget = room
      ? (options.pile && options.pile() ? 1 : 0)
      : scrollProgress() > 0.85 ? 1 : 0;
    pile += (pileTarget - pile) * 0.04;
    // Asking for the floor, or sending it away, is being in the room: the
    // fall that follows is heard, landings and all. Without this a press
    // of the button alone left the whole fall silent.
    if (pileTarget !== pileAsked) {
      pileAsked = pileTarget;
      lastEnergyAt = t;
      logLine(pileTarget ? 'fall(room)' : 'float(room)');
    }
    // while the shapes are still coming down, keep listening
    if (pileTarget && pile < 0.98) lastEnergyAt = t;

    // Tell the page while shapes are being moved by hand: held, thrown,
    // or the room turned. The page fades its hint for as long, and a few
    // seconds more.
    if (held || orbitPointer !== null || gesture) lastHandsAt = t;
    const playing = t - lastHandsAt < HANDS_SECONDS;
    if (playing !== wasPlaying) {
      wasPlaying = playing;
      container.classList.toggle('is-playing', playing);
    }

    // the pull between the shapes is full while someone is playing and
    // eases off once they stop
    const presenceTarget = t - lastEnergyAt < LISTEN_SECONDS ? 1 : IDLE_PULL;
    presence += (presenceTarget - presence) * 0.02;

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

    // The camera moves first, so the shapes are held inside the view that
    // is about to be drawn, not the one before it.
    // pointer tilts the view, scroll sinks it, perspective does the rest
    rig.x += (tiltX - rig.x) * 0.02;
    if (portrait) {
      // a dolly down the page: at the top the family is far away, specks
      // in the distance; through the play gap the camera rushes in close
      // so they fill the frame and dance, then eases back a little.
      const vh = window.innerHeight;
      const apex = vh * 1.35; // scroll where the shapes are nearest
      let closeness;
      if (room) {
        closeness = 0.6; // a room holds one distance: near enough to play
      } else if (scrollY <= apex) {
        const u = apex > 0 ? scrollY / apex : 1;
        closeness = u * u * (3 - 2 * u); // smoothstep far to near
      } else {
        const u = Math.min(1, (scrollY - apex) / (vh * 0.9));
        closeness = 1 - 0.55 * (u * u * (3 - 2 * u)); // ease back, stay near
      }
      // 25 keeps them as hazy specks at the top rather than lost in the
      // fog (far plane 34); 12 brings them right up close for the play
      const targetZ = 25 + (12 - 25) * closeness;
      rig.z += (targetZ - rig.z) * 0.08;
      // much stronger parallax, bounded so the bottom pile still composes
      const sink = room ? 0 : Math.min(scrollY, vh * 2.2) * 0.012;
      rig.y += (-tiltY - sink - rig.y) * 0.06;
    } else {
      rig.y += (-tiltY - (room ? 0 : scrollY * 0.004) - rig.y) * 0.05;
    }
    // then the room's own turn: nearer or farther, over the top, around,
    // and last a roll about the line of sight. What moved this frame is
    // kept, because the next frame's water turns by it.
    const before = { yaw, pitch, roll };
    yaw += (yawTarget - yaw) * 0.14;
    pitch += (pitchTarget - pitch) * 0.14;
    roll += (rollTarget - roll) * 0.14;
    zoom += (zoomTarget - zoom) * 0.14;
    turned.yaw = yaw - before.yaw;
    turned.pitch = pitch - before.pitch;
    turned.roll = roll - before.roll;
    camera.position.copy(rig).multiplyScalar(zoom).applyAxisAngle(AXIS_X, -pitch).applyAxisAngle(AXIS_Y, -yaw);
    camera.lookAt(0, 0, 0);
    if (roll) camera.rotateZ(roll);

    // where the camera is looking from, for the edges of the room
    camera.updateMatrixWorld();
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    camBack.setFromMatrixColumn(camera.matrixWorld, 2);

    // how fast the room was turned this frame, as one spin: around the
    // upright for a sideways turn, around the camera's own level for a tip
    // over the top, and around the line of sight for a twist
    const perSecond = 1 / Math.max(dt, 0.008);
    swirl
      .set(0, 0, 0)
      .addScaledVector(AXIS_Y, turned.yaw * perSecond)
      .addScaledVector(camRight, turned.pitch * perSecond)
      .addScaledVector(camBack, -turned.roll * perSecond)
      .clampLength(0, SWIRL_MAX);
    const stirring = swirl.lengthSq() > 0.0004;

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
        // Like draws like: a shape is pulled only toward its own kind, and
        // pushed, weakly, away from every other kind. So the families
        // gather into their own groups and drift apart from each other.
        const kin = other.userData.type === data.type;
        const boost = dragging && kin ? HOLD_PULL_BOOST : 1;
        const pull = ((kin ? GRAVITY : -GRAVITY * REPEL) * presence * boost * data.mass * other.userData.mass) / d2;
        force.addScaledVector(between.normalize(), pull);
        if (dragging) {
          force.addScaledVector(
            throwVelocity,
            (STIR * data.mass * other.userData.mass) / d2
          );
        }
      }

      // the turning water: its speed here is the turn crossed with where
      // the shape sits, and it grips by area, so the small shapes go first
      if (stirring) {
        between.crossVectors(swirl, mesh.position);
        force.addScaledVector(between, (SWIRL * data.mass) / data.radius);
      }

      // the leash home keeps the system composed, until the floor arrives
      between.subVectors(data.home, mesh.position);
      force.addScaledVector(between, HOME_PULL * data.mass * (1 - pile));

      // a faint idle breath so rest never looks frozen
      force.y += Math.sin(t * data.bobSpeed + data.bobPhase) * 0.12 * data.mass;

      // scrolling down leaves them behind, drifting toward the top.
      // On portrait the scroll is the strongest hand in the room, and
      // its drag follows area rather than mass, the way water does:
      // the small shapes fly first, the heavy ones lag, and the
      // difference is what makes the family collide and ring from
      // scrolling alone
      if (portrait) {
        const current = Math.max(-SCROLL_CLAMP, Math.min(SCROLL_CLAMP, scrollVelocity));
        force.y += current * SCROLL_INERTIA_TOUCH * data.radius * data.radius;
      } else {
        force.y += scrollVelocity * SCROLL_INERTIA * data.mass;
      }

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

      data.velocity.addScaledVector(force, dt / data.mass);
      data.velocity.multiplyScalar(DAMPING ** (dt * 60));
      mesh.position.addScaledVector(data.velocity, dt);
      keepInView(mesh, t, dt);

      // the floor is real once the pile begins: land, settle, and sing
      if (pile > 0.3 && mesh.position.y - data.radius < field.floor) {
        mesh.position.y = field.floor + data.radius;
        let impact = 0;
        if (data.velocity.y < 0) {
          impact = -data.velocity.y;
          data.velocity.y *= -0.22;
          data.velocity.x *= 0.9;
          data.velocity.z *= 0.9;
        }
        touchDown(mesh, impact, t, dt);
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
            // a dragged shape wakes only its own kind
            const near = od.type === held.userData.type && held.position.distanceTo(other.position) < DRAG_RADIUS;
            if (near) {
              if (!od.dragVoice) {
                od.dragVoice = engine.swellStart({
                  pitch: od.pitch,
                  pan: panOf(other),
                  peak: 0.7,
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
          if (speed > RING_SPEED + restingSpeed(dt) && t - lastEnergyAt < LISTEN_SECONDS) {
            const hitGain = Math.min(0.9, 0.1 + (speed - RING_SPEED) * 0.28);
            if (pile > 0.5) {
              // tumbling at the bottom speaks in soft clusters, not strikes
              clusterStrike(A, hitGain * 0.45, t);
              clusterStrike(B, hitGain * 0.45, t);
            } else {
              // Both ring, but only the one that was moving faster calls
              // its family to answer, so a single hit is one chord and its
              // echo, not two families speaking over each other.
              const aLeads = A.userData.velocity.lengthSq() >= B.userData.velocity.lengthSq();
              strike(A, hitGain, t, aLeads);
              strike(B, hitGain, t, !aLeads);
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
      if (glass) {
        // how much it is speaking, from a strike, a hover, a hold, or an answer
        const active = Math.min(1, data.glow * 0.9 + data.hoverGlow * 1.1);
        // Glass takes the colour of what is behind it times its own colour,
        // so a dark shape would only turn into dark glass. As a shape wakes
        // its colour clears toward a pale tint of itself, and what shows
        // through is the lake and the mountains, bent, not a shadow.
        if (!data.restColor) {
          data.restColor = mesh.material.color.clone();
          // not all the way to clear: the glass keeps a good deal of its own colour
          data.clearColor = mesh.material.color.clone().lerp(new THREE.Color(0xffffff), 0.62);
        }
        mesh.material.color.copy(data.restColor).lerp(data.clearColor, active);
        mesh.material.transmission = active;
        mesh.material.roughness = 0.55 - 0.47 * active; // clear glass when fully awake
        mesh.material.emissiveIntensity = active * 0.05; // the faintest light of its own
      } else {
        mesh.material.emissiveIntensity = data.glow * 0.6 + data.hoverGlow;
      }
    }

    renderer.render(scene, camera);
  }

  // do not burn battery in a background tab, or while a room is off screen
  let inView = true;
  const run = () => {
    lastFrameAt = performance.now();
    renderer.setAnimationLoop(document.hidden || !inView ? null : frame);
  };
  run();
  document.addEventListener('visibilitychange', run);
  if (room && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries[entries.length - 1].isIntersecting;
      run();
    }).observe(container);
  }

  // a handle for checking the room from the console while developing;
  // the published build does not carry it
  if (import.meta.env && import.meta.env.DEV) window.__room = { shapes, camera, THREE };

  container.classList.add('is-live');
}
