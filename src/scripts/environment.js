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
// With the lake world the shapes are not held to the screen: their room is
// the lake itself, a drum of air as wide as the water and this tall.
const LAKE_RADIUS = 30;
const LAKE_KEEP = 1.5;         // a shape's edge stays this far inside the shore
const LAKE_CEILING = 20;       // world units of sky above the water they may use
const LENS_KEEP = 2.5;         // and never closer to the camera than this
// The world is an island in the sky: land out to ISLAND_RADIUS, rock
// hanging beneath it, and open air all round, so a pinch can pull right
// back and see the whole of it floating.
const ISLAND_RADIUS = 90;
const ISLAND_DEPTH = 64;       // how far the rock hangs below the water
const SKY_RADIUS = 520;        // the air the island floats in
const ABOVE_WATER = 0.8;       // the camera never comes nearer the water than this, let alone under

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
const SIBLING_PULL = 2;        // like draws like twice as hard as plain gravity would, charged or not
const REPEL = 0.22;           // how hard unlike shapes push apart, as a share of the pull between like ones
const IDLE_PULL = 0.2;        // the share of that pull left once the room is alone, so a
                              // huddle lets go and everything drifts back to its own place
const SOFTEN = 2.5;           // close passes may slingshot a little
const HOME_PULL = 0.12;       // a long leash back to each home position
// Left alone, the room tidies itself: once nobody has touched it for
// HANDS_SECONDS, the leash home tightens, faster and faster, until every
// shape is back in its place in the middle, and there it settles.
const RESET_RATE = 1.1;       // how quickly the tightening grows, per second (exponential)
const RESET_MOST = 60;        // the tightest it gets, as a multiple of the usual leash
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
const CALL_EVEN = 12;         // world units at which a charged shape's call is as strong as its old pull was there
const CALL_SLOPE = 1 / (CALL_EVEN * (CALL_EVEN * CALL_EVEN + 2.5)); // and from there it grows in step with distance
// Charge: a held shape carries the energy of the hand moving it, the way
// a wet finger round the rim of a glass makes it sing. It is the speed of
// the hand right now, squared, as kinetic energy is. The faster the hand,
// the harder it draws its own kind, the farther its call reaches, and the
// louder they all ring; slow down and all of it falls away at once.
const CHARGE_SPEED = 14;      // world units a second of hand speed that is a full charge
const CHARGE_PULL = 15;       // a full charge pulls sixteen times harder than an empty one: it gathers its whole family fast
const CHARGE_REACH = 1.2;     // and its call reaches this much farther again
const CHARGE_RETRIGGER = 1.6; // seconds between fresh breaths of the held shape's own ring
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
// The room turns like a playground roundabout: a flick across empty space
// sets it going and it carries on by itself; flick it again while it is
// going and it goes faster. The faster it goes the longer it takes to come
// to rest, since most of what slows it is in proportion to its speed.
const SPIN_PUSH = 0.25;        // how much of a flick's speed it takes on: it is heavy
// and the faster it already goes, the less each push adds, so the top
// speed is earned with many hard flicks, never reached by accident
const SPIN_HEAVY = 2;
const SPIN_MAX = 8;            // radians a second; it will go no faster
const SPIN_DRAG = 0.16;        // the share of its speed it loses each second
const SPIN_FRICTION = 0.025;   // and a little more, so in the end it does stop
// A hand dragging against the turn brakes it, there and then, in
// proportion to how fast the hand is going: a slow drag against it eases
// it down, a hard one stops it short. It brakes to a standstill and no
// further; only a flick let go of after that sends it the other way.
const SPIN_BRAKE = 4;          // radians a second taken off per radian a second of counter movement, each second
// A turning room makes every shape in it sing, like glasses on a turning
// tray: the faster the whole scene goes round, the louder all of them
// ring, each on its own note, breathing in and out at its own pace.
const WHIRL_FULL = 4;          // radians a second of turn at which they ring their loudest
const WHIRL_PEAK = 0.32;       // each shape's loudest, as a share of a full swell (there are many)
const WHIRL_START = 0.2;       // below this share of the full turn the room is quiet
const SWIRL_MAX = 4;           // radians a second; past this the water stops keeping up
const GRAB_SLACK = 26;          // px a finger may miss a shape by and still take hold of it
const HANDS_SECONDS = 4;       // how long after a hand leaves the room still counts as playing
const WORDS_BACK_SECONDS = 2;   // how long after a hand leaves before the words and the log return
const DRIFT = 0.03;            // radians: how far the never-still camera wanders, about two degrees
const ZOOM_NEAR = 0.7;         // a pinch may bring the camera this much closer
const ZOOM_FAR = 13.5;          // or push it this much farther away: far enough to see the island whole
const ZOOM_FAR_PORTRAIT = 19.5;  // a narrow screen has to stand farther back to take it in
const TAP_DRIFT = 0.25;       // world units a mouse may wander before a press is a drag
const TAP_DRIFT_TOUCH = 0.7;  // fingers wobble more than mice do
const HOVER_SWELLS = false;    // the pointer passing over a shape no longer makes it sound
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
    LAKE_WORLD && options.room === true ? SKY_RADIUS * 2 : 100
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
        count: 15,
        spreadX: halfW * 1.7,
        spreadY: halfH * 1.6,
        spreadZ: 10, // deep, so the dolly streaks near shapes past far ones
        bounds: BOUNDS,
        floor: -(halfH * 0.9),
      }
    : {
        count: 21,
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
      if (ridge) ridge.heard(pitch);
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
  const skyLight = new THREE.HemisphereLight(0xf2f1f0, 0x849396, 1.1);
  scene.add(skyLight);
  const sun = new THREE.DirectionalLight(0xd9d7c2, 1.4);
  // In the lab the sun stands beyond the lake, ahead of the camera and a
  // little to the right, so the first view is into the light: the water
  // glints and the shapes are rimmed. (It is where the old sun, behind the
  // camera, appeared once the room had been turned about 140 degrees.)
  if (options.room === true && LAKE_WORLD) sun.position.set(1.8, 8, -11.5);
  else sun.position.set(6, 8, 10);
  scene.add(sun);

  const glass = room && LAKE_WORLD;
  // The living world: mountains, trees and foothills drawn from the sound,
  // day and night, and water that answers. ?classic gives the fixed
  // landscape it replaced.
  const LIVE_RIDGE = !new URLSearchParams(window.location.search).has('classic');
  const DEV = !!(import.meta.env && import.meta.env.DEV);
  let ridge = null;
  let liveWater = null; // the lake when it answers the room: whirlpool and ripples
  let night = 0; // 0 by day, 1 in the dark; only the live ridge moves it
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
    let moonDisc = null;

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

    // the sky: a sphere of air the island floats in, deep overhead, pale
    // at the horizon, and below the island a cooler haze going down
    const dome = new THREE.SphereGeometry(SKY_RADIUS, 24, 16);
    {
      const at = dome.getAttribute('position');
      const colors = new Float32Array(at.count * 3);
      const zenith = new THREE.Color(0x7b919a); // a pale, misted blue overhead
      const depths = new THREE.Color(0x96a6aa); // the air far under the island
      const color = new THREE.Color();
      for (let i = 0; i < at.count; i++) {
        const y = at.getY(i) / SKY_RADIUS;
        if (y >= 0) color.copy(HAZE).lerp(zenith, Math.pow(y, 0.8));
        else color.copy(HAZE).lerp(depths, Math.pow(-y, 0.7));
        color.toArray(colors, i * 3);
      }
      dome.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const sky = new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
    sky.position.y = lakeY;
    world.add(sky);

    // the moon: a flat, painted disc hung in the sky the way an old
    // console game hangs one, a small blurry picture always turned to face
    // you, far beyond the peaks. Its texture is tiny on purpose; the
    // smoothing that stretches it is the look.
    {
      const MOON_PX = 48;
      const face = document.createElement('canvas');
      face.width = face.height = MOON_PX;
      const pen = face.getContext('2d');
      const mid = MOON_PX / 2;
      const body = pen.createRadialGradient(mid - 6, mid - 7, 2, mid, mid, mid - 1);
      body.addColorStop(0, '#f6f4ec');
      body.addColorStop(0.7, '#e3e0d2');
      body.addColorStop(1, '#c9c8bc');
      pen.fillStyle = body;
      pen.beginPath();
      pen.arc(mid, mid, mid - 1, 0, Math.PI * 2);
      pen.fill();
      // the seas and craters, the same few every visit
      pen.save();
      pen.clip();
      for (let i = 0; i < 11; i++) {
        const x = 8 + rand() * (MOON_PX - 16);
        const y = 8 + rand() * (MOON_PX - 16);
        const r = 1.5 + rand() * (i < 3 ? 7 : 3);
        pen.fillStyle = `rgba(132, 147, 150, ${0.18 + rand() * 0.2})`;
        pen.beginPath();
        pen.arc(x, y, r, 0, Math.PI * 2);
        pen.fill();
      }
      pen.restore();
      const moonMap = new THREE.CanvasTexture(face);
      moonMap.generateMipmaps = false;
      moonMap.minFilter = THREE.LinearFilter;
      moonMap.magFilter = THREE.LinearFilter;
      const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonMap, fog: false, transparent: true }));
      const toward = new THREE.Vector3(0.1, 0.2, -1).normalize();
      moon.position.copy(toward).multiplyScalar(SKY_RADIUS * 0.8);
      moon.position.y += lakeY;
      moon.scale.setScalar(70);
      world.add(moon);
      moonDisc = moon;
    }

    // the lake: a disc of facets, each a slightly different water
    // (the live lake is cut finer, so a ripple has facets to travel through)
    const water = LIVE_RIDGE ? new THREE.RingGeometry(0.01, LAKE_RADIUS, 48, 15) : new THREE.RingGeometry(0.01, LAKE_RADIUS, 30, 7);
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
    if (LIVE_RIDGE) liveWater = buildLiveWater(lake);

    // The water answers the room. Turn the room and the lake is stirred
    // into a whirlpool: the middle sinks, the facets are dragged round it,
    // and arms run out from the centre. Strike a shape and a ring spreads
    // from under it. Only the heights (and for the twist, the places) of
    // the lake's own corners are moved; the flat shading does the rest.
    function buildLiveWater(mesh) {
      const at = mesh.geometry.getAttribute('position');
      at.setUsage(THREE.DynamicDrawUsage);
      const rest = at.array.slice();
      const count = at.count;
      const reach = new Float32Array(count);   // how far out each corner is
      const bearing = new Float32Array(count); // and in which direction
      const hold = new Float32Array(count);    // 0 at the shore, where the water must meet the land
      for (let i = 0; i < count; i++) {
        const x = rest[i * 3];
        const z = rest[i * 3 + 2];
        reach[i] = Math.hypot(x, z);
        bearing[i] = Math.atan2(z, x);
        hold[i] = Math.max(0, Math.min(1, (LAKE_RADIUS - 0.6 - reach[i]) / 4));
      }
      // everything about a corner that never changes is worked out once
      const twist = new Float32Array(count);
      const funnel = new Float32Array(count);
      const arm = new Float32Array(count);
      const armAt = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const r = reach[i];
        twist[i] = 0.7 * Math.exp(-r / 9) * hold[i];
        funnel[i] = (1.6 * hold[i]) / (1 + (r * r) / 14);
        arm[i] = 0.12 * hold[i] * Math.exp(-r / 16);
        armAt[i] = 3 * bearing[i] + r * 0.55;
      }
      // The singularity. Spin the room hard enough and the funnel stops
      // being a dip and becomes a hole: a narrow throat that falls away
      // to a point far below the lake, wound tight, and dark at the bottom.
      const THROAT_FROM = 0.85; // the share of a full spin at which it begins to open
      const THROAT_FULL = 1.8;  // and at which it is all the way down
      const THROAT_DEEP = 17;   // world units the point falls
      const throat = new Float32Array(count);
      const wind = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const r = reach[i];
        throat[i] = (THROAT_DEEP * hold[i]) / Math.pow(1 + (r / 2.2) * (r / 2.2), 0.9);
        wind[i] = 2.8 * Math.exp(-r / 4.5) * hold[i];
      }
      // White caps: a facet that is tipped steeply enough turns to foam.
      // Each facet's own colour is kept, and its width, so steepness is
      // just how far apart in height its three corners are for its size.
      const CAP_FROM = 0.13;  // rise over run at which foam begins
      const CAP_FULL = 0.36; // and at which the facet is all white
      const tint = mesh.geometry.getAttribute('color');
      tint.setUsage(THREE.DynamicDrawUsage);
      const calm = tint.array.slice();
      const facets = count / 3;
      const across = new Float32Array(facets);
      const restRise = new Float32Array(facets); // the little tilt each facet has anyway
      for (let f = 0; f < facets; f++) {
        const o = f * 9;
        const ab = Math.hypot(rest[o + 3] - rest[o], rest[o + 5] - rest[o + 2]);
        const bc = Math.hypot(rest[o + 6] - rest[o + 3], rest[o + 8] - rest[o + 5]);
        const ca = Math.hypot(rest[o] - rest[o + 6], rest[o + 2] - rest[o + 8]);
        across[f] = Math.max(0.4, (ab + bc + ca) / 3);
        restRise[f] = Math.max(rest[o + 1], rest[o + 4], rest[o + 7]) - Math.min(rest[o + 1], rest[o + 4], rest[o + 7]);
      }
      const liveX = new Float32Array(8);
      const liveZ = new Float32Array(8);
      const liveFront = new Float32Array(8);
      const liveTall = new Float32Array(8);
      const RINGS = 8;
      const RING_SPEED_OUT = 4.5;   // world units a second a ripple travels
      const RING_LIFE = 7;      // seconds before it is gone
      const RING_WIDTH = 1.5;
      const rings = Array.from({ length: RINGS }, () => ({ x: 0, z: 0, born: -100, tall: 0 }));
      let next = 0;
      let whirl = 0;     // the turn, smoothed, signed, 1 at a full spin
      let still = true;  // nothing to draw and already flat
      const cost = { frames: 0, ms: 0, whirl: 0, force: null };
      if (DEV) window.__water = cost;
      return {
        ripple(x, z, gain) {
          const ring = rings[next];
          next = (next + 1) % RINGS;
          ring.x = x;
          ring.z = z;
          ring.born = performance.now() / 1000;
          ring.tall = 0.06 + 0.23 * Math.min(1, gain);
        },
        update(dt, t, turnPerSecond) {
          const began = performance.now();
          const want = cost.force !== null ? cost.force : Math.max(-2, Math.min(2, turnPerSecond / WHIRL_FULL));
          whirl += (want - whirl) * Math.min(1, dt * 0.55); // slow to gather, slow to let go
          cost.whirl = whirl;
          const now = performance.now() / 1000;
          let live = 0;
          for (const ring of rings) {
            const age = now - ring.born;
            if (age >= RING_LIFE) continue;
            // it swells up out of nothing and dies away just as gently
            const rise = Math.min(1, age / 0.9);
            const fall = 1 - age / RING_LIFE;
            const fade = Math.sqrt(rise * rise * (3 - 2 * rise) * fall * fall * (3 - 2 * fall));
            liveX[live] = ring.x;
            liveZ[live] = ring.z;
            liveFront[live] = age * RING_SPEED_OUT;
            liveTall[live] = ring.tall * fade * fade;
            live++;
          }
          const stirred = Math.abs(whirl) > 0.004;
          if (!stirred && !live) {
            if (still) return;
            still = true; // one last pass to lay it flat
          } else still = false;
          const power = whirl * whirl;
          let hole = (Math.abs(whirl) - THROAT_FROM) / (THROAT_FULL - THROAT_FROM);
          hole = hole <= 0 ? 0 : hole >= 1 ? 1 : hole * hole * (3 - 2 * hole);
          const holeWind = hole * Math.sign(whirl);
          const armTurn = t * 2.2 * Math.sign(whirl);
          const armTall = Math.abs(whirl);
          const ahead = RING_WIDTH * 2.5;
          const behind = -RING_WIDTH * 4;
          const spread = 1 / (2 * RING_WIDTH * RING_WIDTH);
          const pos = at.array;
          for (let i = 0; i < count; i++) {
            const o = i * 3;
            const h = hold[i];
            let x = rest[o];
            let y = rest[o + 1];
            let z = rest[o + 2];
            if (h > 0) {
              if (stirred) {
                // dragged round, most near the middle; the funnel; the arms
                const a = bearing[i] + whirl * twist[i] + holeWind * wind[i];
                x = Math.cos(a) * reach[i];
                z = Math.sin(a) * reach[i];
                y += armTall * arm[i] * Math.sin(armAt[i] - armTurn) - power * funnel[i] - hole * throat[i];
              }
              for (let k = 0; k < live; k++) {
                const dx = x - liveX[k];
                const dz = z - liveZ[k];
                const off = Math.sqrt(dx * dx + dz * dz) - liveFront[k];
                if (off > ahead || off < behind) continue;
                y += liveTall[k] * h * Math.exp(-off * off * spread) * Math.cos(off * 1.6);
              }
            }
            pos[o] = x;
            pos[o + 1] = y;
            pos[o + 2] = z;
          }
          const paintOn = tint.array;
          for (let f = 0; f < facets; f++) {
            const o = f * 9;
            const a = pos[o + 1];
            const b = pos[o + 4];
            const c = pos[o + 7];
            const rise = Math.max(a, b, c) - Math.min(a, b, c) - restRise[f];
            let foam = (rise / across[f] - CAP_FROM) / (CAP_FULL - CAP_FROM);
            foam = foam <= 0 ? 0 : foam >= 1 ? 1 : foam * foam * (3 - 2 * foam);
            // down the throat the light goes: black by the bottom
            let dark = hole ? (-(a + b + c) / 3 - 2.5) / 11 : 0;
            dark = dark <= 0 ? 0 : dark >= 1 ? 1 : dark;
            const lit = 1 - 0.97 * dark;
            for (let k = 0; k < 9; k++) paintOn[o + k] = (calm[o + k] + (1.08 - calm[o + k]) * foam * 0.55 * (1 - dark)) * lit; // a pale wash, never solid white
          }
          tint.needsUpdate = true;
          at.needsUpdate = true;
          cost.frames++;
          cost.ms += performance.now() - began;
        },
      };
    }

    // the shore and the land behind it
    const ground = new THREE.RingGeometry(LAKE_RADIUS - 0.6, ISLAND_RADIUS, 40, 5);
    ground.rotateX(-Math.PI / 2);
    const land = new THREE.Mesh(
      paint(ground, (centre) => far(shade(0x4c5a4c, 0.06), Math.hypot(centre.x, centre.z))),
      flat()
    );
    land.position.y = lakeY + 0.12;
    world.add(land);

    // beneath it all, the rock the island is torn from: a rough cone
    // hanging point down, earth under the grass, stone below, paling into
    // the air toward the tip
    const rock = new THREE.ConeGeometry(ISLAND_RADIUS + 0.4, ISLAND_DEPTH, 18, 7, true);
    rock.rotateX(Math.PI);
    {
      const at = rock.getAttribute('position');
      for (let i = 0; i < at.count; i++) {
        const down = 0.5 - at.getY(i) / ISLAND_DEPTH; // 0 at the rim, 1 at the tip
        if (down > 0.02 && down < 0.98) {
          const jag = 0.78 + rand() * 0.44;
          at.setX(i, at.getX(i) * jag);
          at.setZ(i, at.getZ(i) * jag);
          at.setY(i, at.getY(i) + (rand() - 0.5) * 4);
        }
      }
    }
    const underside = new THREE.Mesh(
      paint(rock, (centre) => {
        const down = 0.5 - centre.y / ISLAND_DEPTH;
        const hex = down < 0.12 ? 0x4e433d : down < 0.55 ? 0x5f5a52 : 0x6c6a64;
        return shade(hex, 0.08).lerp(HAZE, Math.min(0.85, 0.35 + down * 0.5));
      }),
      flat()
    );
    underside.position.y = lakeY + 0.1 - ISLAND_DEPTH / 2;
    world.add(underside);

    // and a few stones that came loose, hanging in the air nearby
    for (let i = 0; i < 9; i++) {
      const size = 2 + rand() * 6;
      const stone = new THREE.DodecahedronGeometry(size, 0);
      stone.scale(1, 0.7 + rand() * 0.5, 1);
      const angle = rand() * Math.PI * 2;
      const out = ISLAND_RADIUS * (1.15 + rand() * 0.5);
      const mesh = new THREE.Mesh(
        paint(stone, () => shade(0x5f5a52, 0.1).lerp(HAZE, 0.45)),
        flat()
      );
      mesh.position.set(Math.cos(angle) * out, lakeY - 8 - rand() * 40, Math.sin(angle) * out);
      mesh.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      world.add(mesh);
    }

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
    if (LIVE_RIDGE) ridge = buildRidge();
    else {
      for (let i = 0; i < 15; i++) peak((i / 15) * Math.PI * 2 + rand() * 0.25, 42 + rand() * 7, 8 + rand() * 11);
      for (let i = 0; i < 9; i++) peak((i / 9) * Math.PI * 2 + rand() * 0.4, 56 + rand() * 4, 17 + rand() * 9);
    }

    // The live ridge: one ring of mountains that is a recording. A write
    // head goes round it; where it passes, the range is redrawn at the
    // height of the sound at that moment. It is a ring buffer you can see.
    // One mesh, one draw call, and each frame only the few columns the
    // head crossed are sent to the card again.
    function buildRidge() {
      const COLS = 90;           // columns round the ring: the resolution of the range
      const RADIUS = 50;
      const GAP = 3;             // columns ahead of the head that are wiped: the edge of time
      const LOUD_SPEED = 10;     // columns a second at full activity; in silence the head stands still
      const STILL = 0.004;       // below this the room is silent and time stops
      const TALLEST = 36;
      const GAIN = 2.6;          // how hard the sound is leaned on before it is height
      const VERTS = 24;          // eight triangles between each pair of columns
      const height = new Float32Array(COLS);
      const jag = new Float32Array(COLS);     // each column's own roughness, fixed
      const wobble = new Float32Array(COLS);  // and how far its crest stands off the ring
      for (let i = 0; i < COLS; i++) {
        jag[i] = 0.6 + rand() * 0.4;
        wobble[i] = (rand() - 0.5) * 5;
        height[i] = 1.2 + jag[i] * 2.2;       // before anything is played: low hills
      }
      // The cut-away. A peak the camera comes right up against bows down
      // out of its way, and stands up again when it moves on. Nothing that was drawn is lost:
      // each column keeps its height and only how much of it is standing
      // changes.
      const stand = new Float32Array(COLS).fill(1);
      const CUT_NEAR = 16;    // world units: a peak this close to the camera is all the way down
      const CUT_FAR = 34;     // and one this far or farther stands whole
      const CUT_LEAST = 0.14; // how much of a peak is left at the middle of the gap
      const dirty = new Uint8Array(COLS);
      const positions = new Float32Array(COLS * VERTS * 3);
      const colors = new Float32Array(COLS * VERTS * 3);
      const geometry = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
      const colAttr = new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('position', posAttr);
      geometry.setAttribute('color', colAttr);
      const material = flat();
      material.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.position.y = lakeY - 0.4;
      world.add(mesh);

      const FOREST = far(new THREE.Color(0x41584a), RADIUS);
      const ROCK = far(new THREE.Color(0x6c7479), RADIUS);
      // snow is kept nearly out of the haze, or it would not read as white
      const SNOW = new THREE.Color(1.35, 1.35, 1.38); // brighter than paper, so it stays white in shade
      const pts = new Float32Array(10 * 3); // foot, shoulder, crest, far shoulder, far foot, for two columns
      const corner = (slot, col) => {
        const angle = (col / COLS) * Math.PI * 2;
        const h = height[col] * stand[col];
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        // broad in the back: the far side runs out a long way toward the
        // edge of the island over a heavy shoulder
        const radii = [
          RADIUS - 3 - h * 0.55,
          RADIUS - 1 - h * 0.22 + wobble[col] * 0.5,
          RADIUS + wobble[col],
          RADIUS + 5 + h * 0.4 - wobble[col] * 0.6,
          Math.min(ISLAND_RADIUS - 2, RADIUS + 9 + h * 0.95),
        ];
        const ys = [0, h * (0.38 + jag[col] * 0.2), h, h * (0.34 + (1 - jag[col]) * 0.5), 0];
        for (let k = 0; k < 5; k++) {
          const o = (slot * 5 + k) * 3;
          pts[o] = cos * radii[k];
          pts[o + 1] = ys[k];
          pts[o + 2] = sin * radii[k];
        }
      };
      // the eight triangles, as indices into pts (a: 0..4, b: 5..9)
      const TRIS = [0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 8, 3, 8, 4, 4, 8, 9];
      const segment = (s) => {
        const a = ((s % COLS) + COLS) % COLS;
        const b = (a + 1) % COLS;
        corner(0, a);
        corner(1, b);
        const base = a * VERTS * 3;
        for (let tri = 0; tri < 8; tri++) {
          let mid = 0;
          for (let k = 0; k < 3; k++) {
            const from = TRIS[tri * 3 + k] * 3;
            const to = base + (tri * 3 + k) * 3;
            positions[to] = pts[from];
            positions[to + 1] = pts[from + 1];
            positions[to + 2] = pts[from + 2];
            mid += pts[from + 1] / 3;
          }
          const tint = mid > 17.5 ? SNOW : mid > 2.6 ? ROCK : FOREST;
          const light = 0.94 + ((a * 7 + tri * 3) % 5) * 0.03;
          for (let k = 0; k < 3; k++) {
            const to = base + (tri * 3 + k) * 3;
            colors[to] = tint.r * light;
            colors[to + 1] = tint.g * light;
            colors[to + 2] = tint.b * light;
          }
        }
        posAttr.addUpdateRange(base, VERTS * 3);
        colAttr.addUpdateRange(base, VERTS * 3);
      };
      for (let s = 0; s < COLS; s++) segment(s);
      posAttr.clearUpdateRanges();
      colAttr.clearUpdateRanges();

      // The trees are drawn by pitch. Each column has room for a thick
      // stand of them; how many are standing is how high the notes were
      // when the head went by. The lowest notes leave bare ground.
      const STAND = 32; // trees a column can hold
      // A stand: so many of one small thing to a column, kept in order, of
      // which the first few are standing. Trees and foothills are both one.
      const makeStand = (geometry, per, put, tintOf, outward = false) => {
        const mesh = new THREE.InstancedMesh(
          geometry,
          new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95, fog: false }),
          COLS * per
        );
        mesh.frustumCulled = false;
        const planted = new Float32Array(COLS * per * 16); // each as it stands when it is there
        const place = new THREE.Object3D();
        for (let c = 0; c < COLS; c++) {
          // outward: nearest first, so more of them reach farther out
          const radii = Array.from({ length: per }, () => rand());
          if (outward) radii.sort((x, y) => x - y);
          for (let k = 0; k < per; k++) {
            const i = c * per + k;
            const radius = put(place, ((c + rand()) / COLS) * Math.PI * 2, radii[k]);
            place.updateMatrix();
            place.matrix.toArray(planted, i * 16);
            mesh.setColorAt(i, tintOf(radius));
          }
        }
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const standing = mesh.instanceMatrix.array;
        const plant = (col, density) => {
          const c = ((col % COLS) + COLS) % COLS;
          const count = Math.round(per * Math.max(0, Math.min(1, density)));
          const from = c * per * 16;
          for (let k = 0; k < per; k++) {
            const o = from + k * 16;
            if (k < count) for (let m = 0; m < 16; m++) standing[o + m] = planted[o + m];
            else standing.fill(0, o, o + 16);
          }
          mesh.instanceMatrix.addUpdateRange(from, per * 16);
          mesh.instanceMatrix.needsUpdate = true;
        };
        world.add(mesh);
        return { plant, standing, planted, mesh, clear: () => mesh.instanceMatrix.clearUpdateRanges() };
      };
      const trees = makeStand(
        new THREE.ConeGeometry(0.6, 2.4, 5, 1),
        STAND,
        (place, angle, out) => {
          const radius = LAKE_RADIUS + 0.6 + Math.pow(out, 1.4) * 11;
          const size = 0.8 + rand() * 1.2;
          place.position.set(Math.cos(angle) * radius, lakeY + 0.12 + 1.2 * size, Math.sin(angle) * radius);
          place.scale.set(size, size, size);
          place.rotation.set(0, rand() * Math.PI, 0);
          return radius;
        },
        // a real green, and held back from the haze so it stays one
        (radius) => far(shade(0x2e623e, 0.09), radius, 0.61)
      );
      const plant = trees.plant;
      const standing = trees.standing;
      // Foothills: loose low peaks thrown out behind the range toward the
      // edge of the island. The harder the room is played, the more of
      // them there are and the farther out they reach.
      const HILLS = 9;
      const hills = makeStand(
        new THREE.ConeGeometry(1, 1, 5, 1),
        HILLS,
        (place, angle, out) => {
          const radius = RADIUS + 12 + out * (ISLAND_RADIUS - RADIUS - 15);
          const tall = (2.5 + rand() * 6.5) * (1 - out * 0.45); // smaller toward the edge
          const wide = tall * (0.9 + rand() * 0.7);
          place.position.set(Math.cos(angle) * radius, lakeY + tall / 2 - 0.3, Math.sin(angle) * radius);
          place.scale.set(wide, tall, wide * (0.8 + rand() * 0.4));
          place.rotation.set((rand() - 0.5) * 0.25, rand() * Math.PI, (rand() - 0.5) * 0.25);
          return radius;
        },
        (radius) => far(shade(rand() < 0.4 ? 0x41584a : 0x6c7479, 0.07), radius),
        true
      );
      // and a foothill the camera comes up against lies down the same way
      const duck = new Float32Array(COLS * HILLS).fill(1);
      const hillBase = lakeY - 0.3;
      const plantHills = (col, density) => {
        hills.plant(col, density);
        const c = ((col % COLS) + COLS) % COLS;
        for (let k = 0; k < HILLS; k++) duck[c * HILLS + k] = 1; // freshly written: stood up, to be laid down again if near
      };
      const duckHills = (camX, camZ, camUp, ease) => {
        const over = Math.max(0, camUp - 13); // clear of the tallest foothill
        const live = hills.standing;
        const from = hills.planted;
        let changed = false;
        for (let i = 0; i < COLS * HILLS; i++) {
          const o = i * 16;
          if (!live[o + 15]) continue; // not standing
          const near = Math.hypot(from[o + 12] - camX, from[o + 14] - camZ, over);
          const want = 0.08 + 0.92 * smooth(14, 32, near);
          const next = duck[i] + (want - duck[i]) * ease;
          if (Math.abs(next - duck[i]) < 0.002 && Math.abs(want - duck[i]) < 0.002) continue;
          duck[i] = next;
          // squash it toward the ground it stands on
          live[o + 4] = from[o + 4] * next;
          live[o + 5] = from[o + 5] * next;
          live[o + 6] = from[o + 6] * next;
          live[o + 13] = hillBase + (from[o + 13] - hillBase) * next;
          hills.mesh.instanceMatrix.addUpdateRange(o, 16);
          changed = true;
        }
        if (changed) hills.mesh.instanceMatrix.needsUpdate = true;
      };
      for (let c = 0; c < COLS; c++) {
        plant(c, 0.25);
        hills.plant(c, 0.12);
      }
      trees.clear();
      hills.clear();
      let tone = 0.5; // how high the room has been singing, 0 the lowest note, 1 the highest

      // Day and night, told by the head: three times round the ring is
      // twelve hours. The one lamp in the scene is the sun by day and the
      // moon by night, and the sky, the fog and the air dim with it.
      const TURNS_A_DAY = 6;
      const DAWN_HOUR = 8;       // the hour the room opens on
      const sunFace = document.createElement('canvas');
      sunFace.width = sunFace.height = 64;
      {
        const pen = sunFace.getContext('2d');
        const glow = pen.createRadialGradient(32, 32, 4, 32, 32, 31);
        glow.addColorStop(0, '#fffaf0');
        glow.addColorStop(0.45, '#fbe9c4');
        glow.addColorStop(1, 'rgba(251, 233, 196, 0)');
        pen.fillStyle = glow;
        pen.fillRect(0, 0, 64, 64);
      }
      const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sunFace), fog: false, transparent: true, depthWrite: false }));
      sunDisc.scale.setScalar(90);
      world.add(sunDisc);
      const sunMap = sunDisc.material.map;
      const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunMap, color: 0xbfd2ec, fog: false, transparent: true, depthWrite: false, opacity: 0 }));
      moonHalo.scale.setScalar(260);
      world.add(moonHalo);
      const DAY_SUN = new THREE.Color(0xd9d7c2);
      const LOW_SUN = new THREE.Color(0xf0a068);
      const MOONLIGHT = new THREE.Color(0xa9c0e6);
      const NIGHT_SKY = new THREE.Color(0x243450);
      const DUSK_SKY = new THREE.Color(0xf2b890);
      const WHITE = new THREE.Color(0xffffff);
      const fogBase = scene.fog.color.clone();
      const tint = new THREE.Color();
      const sunDir = new THREE.Vector3();
      const moonDir = new THREE.Vector3();
      const smooth = (a, b, x) => {
        const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return u * u * (3 - 2 * u);
      };
      const daylight = (turns) => {
        const hour = (DAWN_HOUR + (turns / TURNS_A_DAY) * 24) % 24;
        const arc = ((hour - 6) / 24) * Math.PI * 2; // up at six, down at eighteen
        sunDir.set(Math.cos(arc) * 0.9, Math.sin(arc), -0.45).normalize();
        moonDir.set(-Math.cos(arc) * 0.9, -Math.sin(arc), -0.45).normalize();
        const day = smooth(-0.14, 0.22, sunDir.y);
        const low = day * (1 - smooth(0.05, 0.5, sunDir.y)); // the sun near the horizon
        sunDisc.position.copy(sunDir).multiplyScalar(SKY_RADIUS * 0.8);
        sunDisc.position.y += lakeY;
        sunDisc.material.color.copy(WHITE).lerp(LOW_SUN, low);
        if (moonDisc) {
          moonDisc.position.copy(moonDir).multiplyScalar(SKY_RADIUS * 0.8);
          moonDisc.position.y += lakeY;
          moonDisc.material.opacity = 0.35 + 0.65 * (1 - day);
          moonHalo.position.copy(moonDir).multiplyScalar(SKY_RADIUS * 0.81);
          moonHalo.position.y += lakeY;
          moonHalo.material.opacity = 0.75 * (1 - day);
        }
        night = 1 - day;
        // the lamp: whichever of the two is up
        const lamp = day > 0.25 || sunDir.y > moonDir.y ? sunDir : moonDir;
        sun.position.copy(lamp).multiplyScalar(14);
        if (sun.position.y < 2) sun.position.y = 2;
        sun.color.copy(MOONLIGHT).lerp(tint.copy(DAY_SUN).lerp(LOW_SUN, low), day);
        sun.intensity = 0.95 + 0.45 * day;
        skyLight.intensity = 1.1 * (0.34 + 0.66 * day);
        tint.copy(NIGHT_SKY).lerp(WHITE, day).lerp(DUSK_SKY, low * 0.55);
        sky.material.color.copy(tint);
        scene.fog.color.copy(fogBase).multiply(tint);
        stats.hour = hour;
      };

      const HEAD_START = COLS * 0.75; // straight ahead of the first view
      let head = HEAD_START;
      let written = Math.floor(head);
      let loudest = 0;         // the loudest moment since the last column was written
      let activity = 0;
      const stats = { frames: 0, ms: 0, columns: 0, peak: 0, height, at: () => head % COLS, offset: 0, hills: () => Array.from({ length: COLS }, (_, c) => { let n = 0; for (let k = 0; k < HILLS; k++) if (hills.standing[(c * HILLS + k) * 16 + 15]) n++; return n; }), trees: () => Array.from({ length: COLS }, (_, c) => { let n = 0; for (let k = 0; k < STAND; k++) if (standing[(c * STAND + k) * 16 + 15]) n++; return n; }) };
      if (DEV) window.__ridge = stats;
      const set = (col, h) => {
        const c = ((col % COLS) + COLS) % COLS;
        height[c] = h;
        segment(c - 1);
        segment(c);
      };
      return {
        // every note the room sounds, as its rung of the ladder
        heard(pitch) {
          tone += (pitch / (PITCH_COUNT - 1) - tone) * 0.7;
          stats.tone = tone;
        },
        update(dt) {
          const began = performance.now();
          const level = engine.level();
          if (level > stats.peak) stats.peak = level;
          if (level > loudest) loudest = level;
          activity = level > activity ? level : activity * Math.exp(-dt / 0.96);
          if (activity < STILL) activity = 0;
          head += LOUD_SPEED * Math.min(1, activity * GAIN) * dt;
          const reached = Math.floor(head);
          if (written < reached) posAttr.needsUpdate = colAttr.needsUpdate = true;
          while (written < reached) {
            written++;
            const c = written % COLS;
            // leaned on, but never clipped: it flattens toward the top and
            // each column's own roughness keeps that from being a mesa
            const drive = 1 - Math.exp(-loudest * GAIN);
            set(c, 1.2 + jag[c] * (2.2 + TALLEST * drive));
            plant(c, tone * tone);
            plantHills(c, drive * 1.25);
            for (let g = 1; g <= GAP; g++) {
              plant(c + g, 0);
              plantHills(c + g, 0);
            }
            // and the ground ahead is cleared, falling away to nothing
            for (let g = 1; g <= GAP; g++) set(c + g, Math.min(height[(c + g) % COLS], 0.2 + (GAP - g) * 0.4));
            loudest = level;
            stats.columns++;
          }
          // the cut-away, by nearness alone: only a peak the camera is
          // right up against gives way, so from a landscape distance the
          // range is always whole
          const camX = camera.position.x;
          const camZ = camera.position.z;
          const camUp = camera.position.y - lakeY;
          const ease = Math.min(1, dt * 3.2);
          let moved = false;
          for (let c = 0; c < COLS; c++) {
            // nearness to the whole of the peak's footprint, from its foot
            // by the lake to the end of its long back slope
            const angle = (c / COLS) * Math.PI * 2;
            const dirX = Math.cos(angle);
            const dirZ = Math.sin(angle);
            const back = Math.min(ISLAND_RADIUS - 2, RADIUS + 9 + height[c] * 0.95);
            const along = Math.max(RADIUS - 10, Math.min(back, camX * dirX + camZ * dirZ));
            // (a camera well above a peak is not up against it)
            const near = Math.hypot(dirX * along - camX, dirZ * along - camZ, Math.max(0, camUp - height[c] - 4));
            const want = CUT_LEAST + (1 - CUT_LEAST) * smooth(CUT_NEAR, CUT_FAR, near);
            const next = stand[c] + (want - stand[c]) * ease;
            if (Math.abs(next - stand[c]) > 0.0015) {
              stand[c] = next;
              dirty[c] = 1;
              dirty[(c + COLS - 1) % COLS] = 1;
              moved = true;
            }
          }
          duckHills(camX, camZ, camUp, ease);
          if (moved) {
            for (let c = 0; c < COLS; c++) {
              if (!dirty[c]) continue;
              dirty[c] = 0;
              segment(c);
            }
            posAttr.needsUpdate = colAttr.needsUpdate = true;
          }
          daylight((head - HEAD_START) / COLS + stats.offset);
          stats.frames++;
          stats.ms += performance.now() - began;
        },
      };
    }

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
    if (LIVE_RIDGE) forest.visible = false; // the live ridge plants its own

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

  // The notes are the recordings, exactly as they were played: nothing is
  // retuned (each shape carries a tune of 0, and the engine can move a
  // recording by semitones when Daniel decides to use that). There are ten of them and more shapes than that, so they are
  // shared. Each family keeps its own rungs of the ladder, and its shapes
  // are dealt across those rungs as evenly as they will go, the big ones
  // low. Two shapes on one note is the cost of having ten recordings.
  FAMILY_RUNGS.forEach((rungs, type) => {
    const family = shapes.filter((m) => m.userData.type === type).sort((x, y) => y.userData.baseScale - x.userData.baseScale);
    family.forEach((mesh, k) => {
      const pitch = rungs[Math.min(rungs.length - 1, Math.floor((k * rungs.length) / family.length))];
      mesh.userData.pitch = pitch;
      mesh.userData.tune = 0; // the retuning path is kept for later and is not used: 0 is the recording as played
      mesh.userData.note = SAMPLE_BANK[pitch].note;
    });
  });

  // Shadows the old way: a soft dark spot on the water under each shape,
  // cast along the line of the sun, spreading and fading as the shape
  // rises. No second drawing of the scene, just one small disc each.
  const blobs = [];
  const shapeLamp = new THREE.PointLight(0xe8dcc0, 0, 70, 1.3);
  if (LIVE_RIDGE && glass) scene.add(shapeLamp);
  const blobSun = sun.position.clone().normalize();
  if (glass) {
    const spot = document.createElement('canvas');
    spot.width = spot.height = 64;
    const paintSpot = spot.getContext('2d');
    const fall = paintSpot.createRadialGradient(32, 32, 0, 32, 32, 32);
    fall.addColorStop(0, 'rgba(255,255,255,1)');
    fall.addColorStop(0.55, 'rgba(255,255,255,0.7)');
    fall.addColorStop(1, 'rgba(255,255,255,0)');
    paintSpot.fillStyle = fall;
    paintSpot.fillRect(0, 0, 64, 64);
    const spotMap = new THREE.CanvasTexture(spot);
    const disc = new THREE.PlaneGeometry(2, 2);
    disc.rotateX(-Math.PI / 2);
    for (const mesh of shapes) {
      const blob = new THREE.Mesh(
        disc,
        new THREE.MeshBasicMaterial({ map: spotMap, color: 0x1c2a30, transparent: true, depthWrite: false, fog: false })
      );
      blob.renderOrder = 1;
      blobs.push(blob);
      scene.add(blob);
    }
  }
  const BLOB_DARK = 0.5;   // how dark a shape's shadow is when it sits on the water
  const BLOB_FADE = 14;    // world units of height at which it has faded away
  function placeBlobs() {
    const water = field.floor + 0.09; // just clear of the ripples in the lake
    for (let i = 0; i < blobs.length; i++) {
      const p = shapes[i].position;
      const radius = shapes[i].userData.radius;
      const up = Math.max(0, p.y - field.floor - radius);
      const along = (p.y - field.floor) / Math.max(0.2, blobSun.y);
      const blob = blobs[i];
      // By day it is a shadow. In the dark it is the other thing: the
      // shape's own light lying on the water under it.
      const lit = night > 0.5;
      const turn = Math.abs(night - 0.5) * 2;
      if (lit !== blob.userData.lit) {
        blob.userData.lit = lit;
        blob.material.blending = lit ? THREE.AdditiveBlending : THREE.NormalBlending;
        blob.material.color.set(lit ? (shapes[i].userData.clearColor || 0xd9d7c2) : 0x1c2a30);
      }
      if (lit) {
        blob.position.set(p.x, water, p.z);
        blob.scale.setScalar(radius * 2.8 * (1 + up * 0.08));
        blob.material.opacity = 0.13 * turn * Math.max(0, 1 - up / (BLOB_FADE * 1.4));
      } else {
        blob.position.set(p.x - blobSun.x * along, water, p.z - blobSun.z * along);
        blob.scale.setScalar(radius * 1.15 * (1 + up * 0.06));
        blob.material.opacity = BLOB_DARK * turn * Math.max(0, 1 - up / BLOB_FADE);
      }
      blob.visible = blob.material.opacity > 0.01 && Math.hypot(blob.position.x, blob.position.z) < LAKE_RADIUS;
    }
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
    // a turning room is a pad, not a rattle: while it swirls, and for a
    // moment after, nothing knocks. Only a deliberate touch still strikes.
    if (!force && (whirling || time - whirlEndedAt < WHIRL_HUSH)) return;
    if (!force && time - data.lastStrike < STRIKE_COOLDOWN) return;
    data.lastStrike = time;
    if (liveWater) liveWater.ripple(mesh.position.x, mesh.position.z, gain);

    engine.strike({ pitch: data.pitch, tune: data.tune, gain, pan: panOf(mesh) });
    staff.note(data.pitch);
    logLine(
      engine.isOn()
        ? `strike(${SHAPE_NAMES[data.type]}.${data.index}, { note: '${data.note}', gain: ${gain.toFixed(2)} })`
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
        pitch: other.userData.pitch, tune: other.userData.tune,
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
    if (whirling || time - whirlEndedAt < WHIRL_HUSH) return;
    if (time - data.lastStrike < STRIKE_COOLDOWN) return;
    data.lastStrike = time;
    if (liveWater) liveWater.ripple(mesh.position.x, mesh.position.z, gain);

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
      logLine(`cluster(${SHAPE_NAMES[data.type]}.${data.index}, '${data.note}' ± neighbors)`);
    }
  }

  // A tap wakes the whole family: every shape of the same kind swells
  // in softly, glowing while it sounds, then lets go on its own.
  function familySwell(mesh, time) {
    for (const other of shapes) {
      if (other === mesh || other.userData.type !== mesh.userData.type) continue;
      const voice = engine.swellStart({
        pitch: other.userData.pitch, tune: other.userData.tune,
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
  let charge = 0;          // 0..1, the energy the held shape has built up
  let chargeVoice = null;  // the held shape's own ring while it is charged
  let chargeVoiceAt = -10;

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
  let orbitSpeed = 0; // radians a second the hand is turning the room
  let spin = 0;       // radians a second the room is turning on its own
  let stoppedByHand = false; // this drag braked the turn to a standstill
  let whirl = 0;      // 0..1, how hard the whole room is turning, eased
  let whirling = false;
  let whirlEndedAt = -10;
  const WHIRL_HUSH = 0.9; // seconds after the turn dies away before knocks are heard again
  let whirlSince = 0;
  let tidy = 0; // how much tighter than usual the leash home is right now
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
      const movedAt = performance.now();
      const instant = (dx * ORBIT_TURN * 1000) / Math.max(8, movedAt - orbitMovedAt);
      orbitSpeed = movedAt - orbitMovedAt > 120 ? instant : orbitSpeed * 0.5 + instant * 0.5;
      orbitMovedAt = movedAt;
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
    zoomTarget = Math.max(ZOOM_NEAR, Math.min(portrait ? ZOOM_FAR_PORTRAIT : ZOOM_FAR, (zoomTarget * gesture.spread) / now.spread));
    gesture = now;
    lastEnergyAt = performance.now() / 1000;
  }, { passive: false });

  // Zoom on a desktop. A trackpad pinch (which reaches the page as a wheel
  // with the control key held, or as a gesture in Safari) zooms the room
  // at any time. Plain scrolling keeps scrolling the page, until the page
  // has run out at the bottom: the lab is the last thing on it, so going
  // on scrolling down pulls the camera back, and scrolling up brings it in
  // again, all the way to where it started, before the page moves.
  if (room) {
    const zoomFar = portrait ? ZOOM_FAR_PORTRAIT : ZOOM_FAR;
    const zoomBy = (factor, least) => {
      zoomTarget = Math.max(least, Math.min(zoomFar, zoomTarget * factor));
      lastEnergyAt = performance.now() / 1000;
      lastHandsAt = lastEnergyAt; // zooming is a hand on the room: it does not drift back yet
    };
    let bottomSince = 0;
    window.addEventListener('wheel', (event) => {
      const rect = container.getBoundingClientRect();
      if (event.clientY < rect.top || event.clientY > rect.bottom) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      const dy = Math.max(-120, Math.min(120, event.deltaY * unit));
      if (event.ctrlKey || event.altKey) {
        // a pinch, or the wheel with option held: the room zooms and the
        // page stays put, never the browser's own page zoom
        event.preventDefault();
        zoomBy(Math.exp(dy * 0.012), ZOOM_NEAR);
        return;
      }
      const doc = document.documentElement;
      const atBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 2;
      const now = performance.now();
      if (!atBottom) {
        bottomSince = 0;
        return;
      }
      // a fling that runs into the bottom of the page settles there first;
      // only a scroll that carries on after that pulls the camera back
      if (!bottomSince) bottomSince = now;
      if (now - bottomSince < 350 && zoomTarget <= 1.001) return;
      if (dy > 0 || zoomTarget > 1.001) {
        event.preventDefault();
        // coming back in stops at where the room started, then the page scrolls
        zoomBy(Math.exp(dy * 0.004), dy < 0 ? Math.min(1, zoomTarget) : ZOOM_NEAR);
      }
    }, { passive: false });

    // Safari on a Mac reports a trackpad pinch as a gesture, not a wheel.
    // On a touch screen the two finger handling above owns the pinch.
    if (window.matchMedia('(pointer: fine)').matches) {
      let gestureFrom = 1;
      const overRoom = (event) => {
        const rect = container.getBoundingClientRect();
        return event.clientY === undefined || (event.clientY >= rect.top && event.clientY <= rect.bottom);
      };
      window.addEventListener('gesturestart', (event) => {
        if (!overRoom(event)) return;
        event.preventDefault();
        gestureFrom = zoomTarget;
      });
      window.addEventListener('gesturechange', (event) => {
        if (!overRoom(event)) return;
        event.preventDefault();
        zoomTarget = Math.max(ZOOM_NEAR, Math.min(zoomFar, gestureFrom / Math.max(0.05, event.scale)));
        lastEnergyAt = performance.now() / 1000;
        lastHandsAt = lastEnergyAt;
      });
      window.addEventListener('gestureend', (event) => {
        if (overRoom(event)) event.preventDefault();
      });
    }
  }

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
      orbitSpeed = 0;
      stoppedByHand = false;
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
          pitch: held.userData.pitch, tune: held.userData.tune,
          pan: panOf(held),
        });
        if (held.userData.swellVoice) {
          staff.note(held.userData.pitch);
          logLine(`swell(${SHAPE_NAMES[held.userData.type]}.${held.userData.index}, { note: '${held.userData.note}', held: true })`);
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
      // let go in the middle of a turn and the room is pushed: it takes on
      // the speed of the flick on top of whatever it already had, so a
      // flick the same way speeds it up and one against it slows it down
      // A flick against a turn has already done its work as a brake.
      const against = spin && Math.sign(orbitSpeed) !== Math.sign(spin);
      if (event.type === 'pointerup' && performance.now() - orbitMovedAt < 80 && !against && !stoppedByHand) {
        const headroom = Math.max(0, 1 - Math.abs(spin) / SPIN_MAX) ** SPIN_HEAVY;
        spin = Math.max(-SPIN_MAX, Math.min(SPIN_MAX, spin + orbitSpeed * SPIN_PUSH * headroom));
      }
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
      // a tap, not a throw: one note, the shape's own, and nothing else.
      // The family answers a hand in motion, not a touch.
      const tNow = performance.now() / 1000;
      strike(held, 0.75, tNow, false, true);
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
    if (chargeVoice) engine.swellEnd(chargeVoice);
    chargeVoice = null;
    if (charge > 0.05) logLine(`release(${SHAPE_NAMES[held.userData.type]}.${held.userData.index}, { charge: ${charge.toFixed(2)} })`);
    charge = 0;
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
    // the room tidying itself away is silent: only a hand's doing rings
    if (t - lastEnergyAt >= LISTEN_SECONDS || tidy > 0) return;
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
    // the room tidying itself away is silent: only a hand's doing rings
    if (t - lastEnergyAt >= LISTEN_SECONDS || tidy > 0) return;
    strike(mesh, Math.min(0.9, 0.1 + (impact - RING_SPEED) * 0.28), t, false); // one note, no answer
  }

  // take away the speed a shape has toward an edge, and give some back
  function turnBack(data, normal, bounce) {
    const outward = data.velocity.dot(normal);
    if (outward > 0) data.velocity.addScaledVector(normal, -(1 + bounce) * outward);
    return outward;
  }

  // The lake room: a drum as wide as the lake. A shape bounces off the
  // shore, off the water, and off the top of the sky it is allowed, and
  // never comes onto the lens. Everything inside is play space, wherever
  // the camera has been turned or pulled back to.
  const lakeOut = new THREE.Vector3();
  function keepInLake(mesh, t, dt) {
    const data = mesh.userData;
    const p = mesh.position;
    const reach = LAKE_RADIUS - LAKE_KEEP - data.radius;
    const across = Math.hypot(p.x, p.z);
    if (across > reach) {
      lakeOut.set(p.x / across, 0, p.z / across);
      p.x = lakeOut.x * reach;
      p.z = lakeOut.z * reach;
      edgeHit(mesh, turnBack(data, lakeOut, WALL_BOUNCE), t);
    }
    const low = field.floor + data.radius;
    if (p.y < low) {
      p.y = low;
      const landing = pile > 0.3;
      const impact = turnBack(data, lakeOut.set(0, -1, 0), landing ? 0.22 : WALL_BOUNCE);
      if (landing) touchDown(mesh, impact, t, dt);
      else edgeHit(mesh, impact, t);
    }
    const high = field.floor + LAKE_CEILING - data.radius;
    if (p.y > high) {
      p.y = high;
      edgeHit(mesh, turnBack(data, lakeOut.set(0, 1, 0), WALL_BOUNCE), t);
    }
    lakeOut.subVectors(p, camera.position);
    const gap = lakeOut.length();
    const least = LENS_KEEP + data.radius;
    if (gap < least && gap > 0.0001) {
      lakeOut.divideScalar(gap);
      p.addScaledVector(lakeOut, least - gap);
      turnBack(data, lakeOut.negate(), WALL_BOUNCE);
    }
  }

  function keepInView(mesh, t, dt) {
    if (glass) {
      keepInLake(mesh, t, dt);
      return;
    }
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

  // Two guards so the shapes are not lost. A shape that is on screen and
  // travels to the edge of the view meets it like a wall. A shape left
  // outside because the view itself moved (a zoom in, a turn) is adrift:
  // it is drawn back to the nearest edge at three times the usual rate of
  // settling, which is nine times the pull.
  const CATCH_UP = HOME_PULL * 9;
  let viewMoving = false;
  function keepOnScreen(mesh, t, dt) {
    const data = mesh.userData;
    fromCam.subVectors(mesh.position, camera.position);
    const depth = -fromCam.dot(camBack);
    if (depth < 0.5) return;
    const halfY = Math.max(0.5, depth * tanHalf - data.radius * EDGE_KEEP);
    const halfX = Math.max(0.5, depth * tanHalf * camera.aspect - data.radius * EDGE_KEEP);
    const x = fromCam.dot(camRight);
    const y = fromCam.dot(camUp);
    const overX = Math.abs(x) > halfX ? x - Math.sign(x) * halfX : 0;
    const overY = Math.abs(y) > halfY ? y - Math.sign(y) * halfY : 0;
    if (!overX && !overY) {
      data.adrift = false;
      data.onScreen = true;
      return;
    }
    if (data.onScreen && !data.adrift && !viewMoving) {
      // it went there itself: the edge is a wall
      if (overX) {
        mesh.position.addScaledVector(camRight, -overX);
        edgeHit(mesh, turnBack(data, edge.copy(camRight).multiplyScalar(Math.sign(overX)), WALL_BOUNCE), t);
      }
      if (overY) {
        mesh.position.addScaledVector(camUp, -overY);
        edgeHit(mesh, turnBack(data, edge.copy(camUp).multiplyScalar(Math.sign(overY)), WALL_BOUNCE), t);
      }
      return;
    }
    // the view left it behind: bring it back, quickly and without swing,
    // aiming a little inside the edge so it does arrive
    data.adrift = true;
    data.onScreen = false;
    const inX = overX ? overX + Math.sign(overX) * Math.min(halfX, data.radius + 0.6) : 0;
    const inY = overY ? overY + Math.sign(overY) * Math.min(halfY, data.radius + 0.6) : 0;
    data.velocity.addScaledVector(camRight, -inX * CATCH_UP * dt);
    data.velocity.addScaledVector(camUp, -inY * CATCH_UP * dt);
    data.velocity.multiplyScalar(Math.exp(-2 * Math.sqrt(CATCH_UP) * dt));
  }

  if (DEV) {
    window.__labView = {
      view: () => ({ zoom: zoomTarget, pitch: pitchTarget, roll: rollTarget, tidy }),
      shapes: () => ({ all: shapes.length, off: shapes.filter((m) => !m.userData.onScreen).length, adrift: shapes.filter((m) => m.userData.adrift).length }),
    };
  }

  let lastFrameAt = performance.now();
  let lastScrollY = window.scrollY;
  let pile = 0; // eases toward 1 when the bottom of the page arrives
  let pileAsked = 0; // the last answer to "is the floor wanted", to catch the change
  let presence = IDLE_PULL; // eases toward 1 while someone is playing
  let wasPlaying = false;
  let hintDone = false;

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
    // on a touch screen the hint has done its work once the sound is on
    // and a hand is in the room: it goes, and does not come back
    const playing = t - lastHandsAt < WORDS_BACK_SECONDS;
    if (!hintDone && coarse && playing && engine.awake()) {
      hintDone = true;
      container.classList.add('hint-done');
    }
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
        // Leaning in used to bloom the pitch under the pointer. It is off:
        // a shape now sounds only when it is touched or moved, so passing
        // over one is silent and a click is one note. It still glows.
        hovered.userData.swellVoice = HOVER_SWELLS
          ? engine.swellStart({ pitch: hovered.userData.pitch, tune: hovered.userData.tune, pan: panOf(hovered) })
          : null;
        if (hovered.userData.swellVoice) {
          staff.note(hovered.userData.pitch);
          logLine(`swell(${SHAPE_NAMES[hovered.userData.type]}.${hovered.userData.index}, { note: '${hovered.userData.note}' })`);
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
    // a hand moving against the turn brakes it, by how fast it moves
    if (spin && orbitPointer !== null && now - orbitMovedAt < 100 && Math.sign(orbitSpeed) !== Math.sign(spin)) {
      const brake = SPIN_BRAKE * Math.abs(orbitSpeed) * dt;
      if (Math.abs(spin) <= brake) {
        spin = 0;
        stoppedByHand = true;
      } else {
        spin -= Math.sign(spin) * brake;
      }
    }
    // the roundabout carries on, slowing as it goes
    if (spin) {
      yawTarget += spin * dt;
      const slow = (SPIN_DRAG * Math.abs(spin) + SPIN_FRICTION) * dt;
      spin = Math.abs(spin) <= slow ? 0 : spin - Math.sign(spin) * slow;
      lastEnergyAt = t;
    }
    yaw += (yawTarget - yaw) * 0.14;
    pitch += (pitchTarget - pitch) * 0.14;
    roll += (rollTarget - roll) * 0.14;
    zoom += (zoomTarget - zoom) * 0.14;
    turned.yaw = yaw - before.yaw;
    turned.pitch = pitch - before.pitch;
    turned.roll = roll - before.roll;

    // the whole room turning sets every shape ringing
    const turnRate = Math.abs(turned.yaw) / Math.max(dt, 0.008);
    whirl += (Math.min(1, turnRate / WHIRL_FULL) - whirl) * 0.08;
    if (whirl > WHIRL_START) {
      if (!whirling) {
        logLine(`resonate(room, { turn: ${turnRate.toFixed(1)} })`);
        whirlSince = t;
      }
      whirling = true;
      for (const mesh of shapes) {
        const data = mesh.userData;
        const peak = WHIRL_PEAK * whirl;
        // each shape breathes at its own pace, so the ring shimmers
        const breath = 2 + (data.index % 7) * 0.35;
        // they come in one after another, not all on the same instant
        if (!data.whirlVoice && t - whirlSince < (data.index % 7) * 0.15) continue;
        if (!data.whirlVoice || t - data.whirlAt > breath) {
          if (data.whirlVoice) engine.swellEnd(data.whirlVoice);
          data.whirlVoice = engine.swellStart({ pitch: data.pitch, tune: data.tune, pan: panOf(mesh), peak });
          data.whirlAt = t - (data.whirlVoice ? 0 : breath - 0.5);
        } else if (t - data.whirlAt > 0.7) {
          engine.swellLevel(data.whirlVoice, peak);
        }
        data.glow = Math.max(data.glow, whirl * 0.5);
      }
    } else if (whirling) {
      whirling = false;
      whirlEndedAt = t;
      for (const mesh of shapes) {
        if (mesh.userData.whirlVoice) engine.swellEnd(mesh.userData.whirlVoice);
        mesh.userData.whirlVoice = null;
      }
    }
    // The camera is never quite still: it breathes, a slow drift of a degree
    // or two made of waves that never line up, like being held by a hand.
    // It is only the view; the water does not feel it.
    const driftYaw = DRIFT * (Math.sin(t * 0.11) + 0.45 * Math.sin(t * 0.27 + 1.3));
    const driftPitch = DRIFT * 0.6 * (Math.sin(t * 0.09 + 0.7) + 0.4 * Math.sin(t * 0.23 + 2.1));
    const driftRoll = DRIFT * 0.18 * Math.sin(t * 0.07 + 0.4);
    camera.position
      .copy(rig)
      .multiplyScalar(zoom * (1 + DRIFT * 0.35 * Math.sin(t * 0.06 + 2.6)))
      .applyAxisAngle(AXIS_X, -Math.max(pitchMin, pitch + driftPitch))
      .applyAxisAngle(AXIS_Y, -(yaw + driftYaw));
    if (glass) {
      // never under the lake: when a turn and a pinch together would take
      // the camera below the water, it comes in closer instead
      const lowest = field.floor + ABOVE_WATER;
      if (camera.position.y < lowest && camera.position.y < 0) camera.position.multiplyScalar(lowest / camera.position.y);
      // the shapes' own fog stands back as the camera does, so pulling
      // away shows them small, not gone
      const away = camera.position.length() / Math.max(1, rig.length());
      scene.fog.near = 16 * away;
      scene.fog.far = 70 * away;
    }
    camera.lookAt(0, 0, 0);
    if (roll + driftRoll) camera.rotateZ(roll + driftRoll);

    // where the camera is looking from, for the edges of the room
    camera.updateMatrixWorld();
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    camBack.setFromMatrixColumn(camera.matrixWorld, 2);

    // how fast the room was turned this frame, as one spin: around the
    // upright for a sideways turn, around the camera's own level for a tip
    // over the top, and around the line of sight for a twist
    // how tight the leash home is: nothing while anyone is in the room,
    // then growing exponentially once they have left it alone
    const idleFor = t - lastHandsAt - HANDS_SECONDS;
    tidy = idleFor > 0 && pile < 0.01 ? Math.min(RESET_MOST, Math.exp(idleFor * RESET_RATE) - 1) : 0;
    // and the camera comes back to where it started with them, at an
    // eighth of the rate the shapes settle, and it eases into the move
    // over ten seconds: one long curve, slow to start and slow to arrive
    if (tidy > 0 && glass) {
      const on = Math.min(1, idleFor / 10);
      const ease = Math.exp(-0.125 * 2 * Math.sqrt(HOME_PULL * (1 + tidy)) * on * on * (3 - 2 * on) * dt);
      zoomTarget = Math.exp(Math.log(zoomTarget) * ease);
      pitchTarget *= ease;
      rollTarget *= ease;
    }
    viewMoving =
      Math.abs(zoomTarget - zoom) > 0.002 * zoom ||
      Math.abs(turned.yaw) + Math.abs(turned.pitch) + Math.abs(turned.roll) > 0.0004;
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
        // the held shape's extra pull is only the energy the hand has put
        // into it: an empty charge pulls like any other shape
        let pull = ((kin ? GRAVITY * SIBLING_PULL : -GRAVITY * REPEL) * presence * data.mass * other.userData.mass) / d2;
        // The call of a charged shape to its own kind runs the other way
        // from gravity: it grows with distance. The farther a sibling has
        // to come, the harder it is drawn, so the far ones fly and the
        // near ones only lean, and the family arrives together.
        if (dragging && kin) {
          pull +=
            GRAVITY * SIBLING_PULL * presence * HOLD_PULL_BOOST * (1 + CHARGE_PULL) * charge * data.mass * other.userData.mass *
            Math.sqrt(d2) * CALL_SLOPE;
        }
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
      if (!data.adrift) force.addScaledVector(between, HOME_PULL * (1 + tidy) * data.mass * (1 - pile));

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
      // as the leash tightens the water thickens with it, so they come home
      // and settle there rather than swinging through
      if (tidy > 0) data.velocity.multiplyScalar(Math.exp(-2 * Math.sqrt(HOME_PULL * (1 + tidy)) * dt));
      mesh.position.addScaledVector(data.velocity, dt);
      keepInView(mesh, t, dt);
      if (glass && pile < 0.01) keepOnScreen(mesh, t, dt);
      else data.adrift = false;

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
        if (glass) {
          // the hand may lead it anywhere on the lake, no farther
          const hp = held.position;
          const reach = LAKE_RADIUS - LAKE_KEEP - held.userData.radius;
          const across = Math.hypot(hp.x, hp.z);
          if (across > reach) {
            hp.x *= reach / across;
            hp.z *= reach / across;
          }
          hp.y = Math.max(field.floor + held.userData.radius, Math.min(field.floor + LAKE_CEILING - held.userData.radius, hp.y));
        }

        // the charge is the hand's kinetic energy right now, nothing
        // stored: it goes with the square of the speed, so a slow drag
        // barely registers and a fast spin is full, and it falls the moment
        // the hand slows
        const speed = holdMoved > tapDrift ? Math.min(1, throwVelocity.length() / CHARGE_SPEED) : 0;
        charge = speed * speed;
        const hd = held.userData;
        // a charged shape spins on its own axis and glows from inside
        held.rotation.y += charge * 7 * dt;
        held.rotation.x += charge * 2.5 * dt;
        hd.glow = Math.max(hd.glow, charge * 0.85);
        // and rings: a fresh breath of its own note every so often, louder
        // the fuller it is, so a steady circle keeps it singing
        if (charge > 0.12) {
          const peak = 0.25 + 0.95 * charge;
          if (!chargeVoice || t - chargeVoiceAt > CHARGE_RETRIGGER) {
            if (chargeVoice) engine.swellEnd(chargeVoice);
            chargeVoice = engine.swellStart({ pitch: hd.pitch, tune: hd.tune, pan: panOf(held), peak });
            chargeVoiceAt = t;
          } else if (t - chargeVoiceAt > 0.7) {
            engine.swellLevel(chargeVoice, peak);
          }
        } else if (chargeVoice) {
          engine.swellEnd(chargeVoice);
          chargeVoice = null;
        }

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
            const reach = DRAG_RADIUS * (1 + CHARGE_REACH * charge);
            const near = od.type === held.userData.type && held.position.distanceTo(other.position) < reach;
            if (near) {
              const peak = 0.7 * (0.6 + 0.9 * charge);
              if (!od.dragVoice) {
                od.dragVoice = engine.swellStart({
                  pitch: od.pitch, tune: od.tune,
                  pan: panOf(other),
                  peak,
                });
                od.dragVoiceAt = t;
                if (od.dragVoice) staff.note(od.pitch);
              } else if (t - (od.dragVoiceAt || 0) > 0.7) {
                engine.swellLevel(od.dragVoice, peak);
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
          if (speed > RING_SPEED + restingSpeed(dt) && t - lastEnergyAt < LISTEN_SECONDS && tidy === 0) {
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
              // The family answers only a hand in motion: a collision calls
              // its kin when one of the two is being dragged with some speed.
              // Anything else is two single notes.
              const handed = (A === held || B === held) && charge > 0.15;
              strike(A, hitGain, t, handed && aLeads);
              strike(B, hitGain, t, handed && !aLeads);
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
        if (ridge) {
          // in the dark every shape is a lantern, brighter when it speaks
          mesh.material.emissive.copy(data.clearColor);
          mesh.material.emissiveIntensity += night * (0.14 + 0.45 * active);
        }
      } else {
        mesh.material.emissiveIntensity = data.glow * 0.6 + data.hoverGlow;
      }
    }

    if (blobs.length) placeBlobs();
    if (liveWater) liveWater.update(dt, t, turned.yaw / Math.max(dt, 0.008));
    if (ridge) {
      ridge.update(dt);
      blobSun.copy(sun.position).normalize();
      // one lamp stands for all the lanterns: it sits in the middle of
      // the shapes and lights the water and the shore around them
      shapeLamp.position.set(0, 0, 0);
      for (const mesh of shapes) shapeLamp.position.addScaledVector(mesh.position, 1 / shapes.length);
      shapeLamp.position.y += 3;
      shapeLamp.intensity = night * 9;
    }
    renderer.render(scene, camera);
    if (room) shadeWords();
  }

  // Each word over the room reads the picture just drawn behind it and
  // takes white over the dark water and shapes, ink over the pale sky,
  // the way the volume line turns from white to ink. A few times a
  // second is plenty: CSS eases between the two.
  const shaded = room ? [...container.querySelectorAll('[data-shade]')] : [];
  const gl = renderer.getContext();
  let shadeTick = 0;
  let shadeBytes = new Uint8Array(0);
  const shadeRange = document.createRange();
  function shadeWords() {
    if (!shaded.length || ++shadeTick % 8) return;
    const canvas = renderer.domElement;
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    const scale = canvas.width / box.width;
    for (const el of shaded) {
      // the words themselves, not the width of the block they sit in
      shadeRange.selectNodeContents(el);
      const r = shadeRange.getBoundingClientRect();
      const x = Math.max(0, Math.floor((r.left - box.left) * scale));
      const y = Math.max(0, Math.floor((box.bottom - r.bottom) * scale));
      const w = Math.min(canvas.width - x, Math.ceil(r.width * scale));
      const h = Math.min(canvas.height - y, Math.ceil(r.height * scale));
      if (w <= 0 || h <= 0) continue;
      if (shadeBytes.length < w * h * 4) shadeBytes = new Uint8Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, shadeBytes);
      let sum = 0;
      let n = 0;
      for (let i = 0; i < w * h * 4; i += 4 * 7) {
        sum += 0.2126 * shadeBytes[i] + 0.7152 * shadeBytes[i + 1] + 0.0722 * shadeBytes[i + 2];
        n++;
      }
      const light = sum / n / 255;
      // 0 is a dark ground (white words), 1 a pale one (ink words). Never
      // a grey in between: the words turn only once the ground has clearly
      // crossed where white and ink read equally well, and CSS eases the turn.
      const was = el.style.getPropertyValue('--shade');
      const shade = light > 0.54 ? '1' : light < 0.46 ? '0' : was || '0';
      if (shade !== was) el.style.setProperty('--shade', shade);
    }
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
