// thank heavens for chatGPT <3

/*==============================================================*
 *                    ACTIVE STARFIELD
 *==============================================================*
 *  Requires Starfield Setup.js loaded first.
 *
 *  Contains:
 *   1) Physics (updateStarPhysics)
 *   2) Rendering (renderStarsAndLinks)
 *   3) User input (updatePointerSpeed + listeners)
 *
 *  PERF:
 *   - Links rebuild every 3 frames (fast pointer forces immediate rebuild)
 *   - Debug DOM refs cached + updated at ~10fps (if debug elements exist)
 *   - Star sprites (WebP) with opacity/twinkle preserved
 *   - Darkness driven by STAR.redValue (no extra per-star fields)
 *   - Faster edge fade (keeps radius in edge check)
 *   - Physics is time-scaled (dt normalized to 60fps units)
 *==============================================================*/

//alert("Debug HAT");

/*========================================*
//#region 0) PERF HELPERS
 *========================================*/

var S = window.STARFIELD;

/*---------- Debug refs cached (NOT on STARFIELD) ----------*/
const DBG = {
  misc: null,
  circle: null,
  speed: null,
  poke: null,
  lastMs: 0
};

// Debug elements only exist on one page, so null is fine.
DBG.misc = document.getElementById("dbgMisc");
DBG.circle = document.getElementById("dbgCircle");
DBG.speed = document.getElementById("dbgSpeed");
DBG.poke = document.getElementById("dbgPoke");

/*---------- Sprite stars (WebP) ----------*/
const STAR_SPRITES = {
  ready: false,
  img: null
};

(function loadStarSpriteNow() {
  const IMG = new Image();
  IMG.decoding = "async";
  IMG.loading = "eager";
  IMG.onload = () => { STAR_SPRITES.ready = true; };
  IMG.onerror = () => { STAR_SPRITES.ready = false; };
  IMG.src = "/Resources/Star.webp";
  STAR_SPRITES.img = IMG;
})();

/*---------- Link throttle state ----------*/
let LINK_FRAME = 0;
let LINKS_DIRTY = true;

/*---------- Faster edge fade (keeps radius) ----------*/
function getEdgeFadeFastWithRadius(STAR) {
  const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

  const DIST_LEFT = STAR.x + STAR_RADIUS;
  const DIST_RIGHT = (S.canvasWidth + STAR_RADIUS) - STAR.x;
  const DIST_TOP = STAR.y + STAR_RADIUS;
  const DIST_BOTTOM = (S.canvasHeight + STAR_RADIUS) - STAR.y;

  const MIN_EDGE_DISTANCE = Math.min(DIST_LEFT, DIST_RIGHT, DIST_TOP, DIST_BOTTOM);

  const FADE_BAND = Math.min(90, S.screenPerimeter * 0.03) || 1;

  let t = MIN_EDGE_DISTANCE <= 0 ? 0 : MIN_EDGE_DISTANCE >= FADE_BAND ? 1 : (MIN_EDGE_DISTANCE / FADE_BAND);
  return t * t;
}

/*---------- Time scaling helpers ----------*/
const FRAME_MS = 1000 / 60;

function clampDtMs(dtMs) {
  // prevents tab-sleep teleport + mega forces
  if (dtMs < 0) return 0;
  if (dtMs > 50) return 50; // ~3 frames at 60fps
  return dtMs;
}

function decayPerFrameToDt(basePerFrame, dtFrames) {
  // convert "multiply by basePerFrame each frame" to time-based
  // e.g. 0.98 per frame -> 0.98^dtFrames
  return Math.pow(basePerFrame, dtFrames);
}

/* #endregion 0) PERF HELPERS */



/*========================================*
//#region 1) PHYSICS
 *========================================*/

S.updateStarPhysics = function updateStarPhysics() {
  if (!S.starList.length) return;

  // dt in ms, then normalized to "60fps frames"
  const NOW = S.getNowMs();
  const LAST = S.lastPhysicsMs || NOW;
  const dtMs = clampDtMs(NOW - LAST);
  S.lastPhysicsMs = NOW;

  const dt = dtMs / FRAME_MS; // 1.0 at 60fps
  if (dt <= 0) return;

  const INFLUENCE_RANGE = S.screenPerimeter * 0.2;
  const INFLUENCE_RANGE_SQ = INFLUENCE_RANGE * INFLUENCE_RANGE;

  const WRAP_DISTANCE_SQ = 200 * 200;

  const SETTINGS = S.interactionSettings;
  const SCALE = S.screenScalePowers;

  // time-based decays derived from your per-frame tuning
  const MOMENTUM_DECAY = decayPerFrameToDt(0.98, dt);
  const WHITE_DECAY = decayPerFrameToDt(0.98, dt);
  const POINTER_SPEED_DECAY = decayPerFrameToDt(0.5, dt);
  const RING_DECAY = decayPerFrameToDt(0.95, dt);
  const POKE_DECAY = decayPerFrameToDt(0.85, dt);

  // Step 2: update each star
  for (const STAR of S.starList) {
    const POINTER_DELTA_X = S.pointerClientX - STAR.x;
    const POINTER_DELTA_Y = S.pointerClientY - STAR.y;

    const DISTANCE_SQ = POINTER_DELTA_X * POINTER_DELTA_X + POINTER_DELTA_Y * POINTER_DELTA_Y;

    if (DISTANCE_SQ < INFLUENCE_RANGE_SQ) {
      const DISTANCE = Math.sqrt(DISTANCE_SQ) + 0.0001;

      const UNIT_TO_POINTER_X = POINTER_DELTA_X / DISTANCE;
      const UNIT_TO_POINTER_Y = POINTER_DELTA_Y / DISTANCE;

      let ATTRACTION_GRADIENT =
        1 - (DISTANCE / (((SETTINGS.attractRadius * 5.2) * SCALE.attractionGradient) || 1));

      let REPULSION_GRADIENT =
        1 - (DISTANCE / (((SETTINGS.repelRadius * 2.8) * SCALE.repulsionGradient) || 1));

      ATTRACTION_GRADIENT = Math.max(0, ATTRACTION_GRADIENT);
      REPULSION_GRADIENT = Math.max(0, REPULSION_GRADIENT);

      const ATTRACTION_SHAPE = Math.pow(
        ATTRACTION_GRADIENT,
        Math.max(0.1, ((SETTINGS.attractScale * 0.48) * SCALE.attractionShape))
      );

      const REPULSION_SHAPE = Math.pow(
        REPULSION_GRADIENT,
        Math.max(0.1, (SETTINGS.repelScale * 0.64))
      );

      const ATTRACTION_FORCE =
        ((SETTINGS.attractStrength * 0.004) * SCALE.attractionForce) *
        S.pointerSpeedUnits *
        ATTRACTION_SHAPE;

      const REPULSION_FORCE =
        ((SETTINGS.repelStrength * 0.0182) * SCALE.repulsionForce) *
        S.pointerSpeedUnits *
        REPULSION_SHAPE;

      // APPLY dt so force feels consistent across FPS
      STAR.momentumX += (ATTRACTION_FORCE * UNIT_TO_POINTER_X) * dt;
      STAR.momentumY += (ATTRACTION_FORCE * UNIT_TO_POINTER_Y) * dt;

      STAR.momentumX += (REPULSION_FORCE * -UNIT_TO_POINTER_X) * dt;
      STAR.momentumY += (REPULSION_FORCE * -UNIT_TO_POINTER_Y) * dt;

      const POKE_FORCE = (0.01 * SETTINGS.pokeStrength) * S.pokeImpulseTimer * REPULSION_SHAPE;
      STAR.momentumX += (POKE_FORCE * -UNIT_TO_POINTER_X) * dt;
      STAR.momentumY += (POKE_FORCE * -UNIT_TO_POINTER_Y) * dt;
    }

    // baseline drift boosted by interaction (dt-scaled)
    const DRIFT_BOOST = Math.min(7, 0.01 * S.pointerSpeedUnits);
    STAR.momentumX += (STAR.vx * DRIFT_BOOST) * dt;
    STAR.momentumY += (STAR.vy * DRIFT_BOOST) * dt;

    // keyboard influence is “instant”, leave it unscaled
    STAR.momentumX *= window.KEYBOARD.multX;
    STAR.momentumY *= window.KEYBOARD.multY;
    STAR.momentumX += window.KEYBOARD.addX;
    STAR.momentumY += window.KEYBOARD.addY;

    // clamp momentum magnitude (keep behavior stable)
    const MOMENTUM_LIMIT = 2 * SETTINGS.clamp * SCALE.forceClamp;
    const MOMENTUM_MAG = Math.sqrt(STAR.momentumX * STAR.momentumX + STAR.momentumY * STAR.momentumY);

    if (MOMENTUM_MAG > MOMENTUM_LIMIT) {
      const MOMENTUM_SCALE = MOMENTUM_LIMIT / MOMENTUM_MAG;
      STAR.momentumX *= MOMENTUM_SCALE;
      STAR.momentumY *= MOMENTUM_SCALE;
    }

    // integrate (dt-scaled)
    STAR.x += (STAR.vx + STAR.momentumX) * dt;
    STAR.y += (STAR.vy + STAR.momentumY) * dt;

    // friction (time-based)
    STAR.momentumX *= MOMENTUM_DECAY;
    STAR.momentumY *= MOMENTUM_DECAY;

    // wrap vs bounce (radius check prevents pop)
    if (S.pointerRingTimer === 0 || DISTANCE_SQ > WRAP_DISTANCE_SQ || S.pokeImpulseTimer > 10) {
      const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

      if (STAR.x < -STAR_RADIUS) STAR.x = S.canvasWidth + STAR_RADIUS;
      else if (STAR.x > S.canvasWidth + STAR_RADIUS) STAR.x = -STAR_RADIUS;

      if (STAR.y < -STAR_RADIUS) STAR.y = S.canvasHeight + STAR_RADIUS;
      else if (STAR.y > S.canvasHeight + STAR_RADIUS) STAR.y = -STAR_RADIUS;
    } else {
      const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

      if (STAR.x < STAR_RADIUS) { STAR.x = 2 * STAR_RADIUS - STAR.x; STAR.momentumX = -STAR.momentumX; }
      else if (STAR.x > S.canvasWidth - STAR_RADIUS) { STAR.x = 2 * (S.canvasWidth - STAR_RADIUS) - STAR.x; STAR.momentumX = -STAR.momentumX; }

      if (STAR.y < STAR_RADIUS) { STAR.y = 2 * STAR_RADIUS - STAR.y; STAR.momentumY = -STAR.momentumY; }
      else if (STAR.y > S.canvasHeight - STAR_RADIUS) { STAR.y = 2 * (S.canvasHeight - STAR_RADIUS) - STAR.y; STAR.momentumY = -STAR.momentumY; }
    }

    // flash decay (time-based)
    if (STAR.whiteValue > 0) {
      STAR.whiteValue *= WHITE_DECAY;
      if (STAR.whiteValue < 0.001) STAR.whiteValue = 0;
    }

    // opacity cycle (time-based)
    // previously: -0.005*fadeSpeed per frame when >0.02
    // now: multiply by dt
    if (STAR.opacity <= 0.005) {
      STAR.opacity = 1;
      if (Math.random() < 0.07) STAR.whiteValue = 1;
    } else if (STAR.opacity > 0.02) {
      STAR.opacity -= (0.005 * STAR.fadeSpeed) * dt;
    } else {
      STAR.opacity -= 0.0001 * dt;
    }
  }

  // reset keyboard forces
  window.KEYBOARD.multX = 1;
  window.KEYBOARD.multY = 1;
  window.KEYBOARD.addX = 0;
  window.KEYBOARD.addY = 0;

  // global decay (time-based)
  S.pointerSpeedUnits *= POINTER_SPEED_DECAY;
  if (S.pointerSpeedUnits < 0.001) S.pointerSpeedUnits = 0;

  S.pointerRingTimer *= RING_DECAY;
  if (S.pointerRingTimer < 1) S.pointerRingTimer = 0;

  S.pokeImpulseTimer *= POKE_DECAY;
  if (S.pokeImpulseTimer < 1) S.pokeImpulseTimer = 0;

  // debug readouts (10fps) if elements exist
  if (DBG.misc || DBG.circle || DBG.speed || DBG.poke) {
    if (NOW - DBG.lastMs >= 100) {
      DBG.lastMs = NOW;
      if (DBG.misc) DBG.misc.textContent = S.starList[0].momentumX;
      if (DBG.circle) DBG.circle.textContent = S.pointerRingTimer.toFixed(3);
      if (DBG.speed) DBG.speed.textContent = S.pointerSpeedUnits.toFixed(3);
      if (DBG.poke) DBG.poke.textContent = S.pokeImpulseTimer.toFixed(1);
    }
  }
};

/* #endregion 1) PHYSICS */



/*========================================*
//#region 2) RENDERING
 *========================================*/

const LINK_BUCKET_COUNT = 18;
let LINK_PATHS_BY_BUCKET = Array.from({ length: LINK_BUCKET_COUNT }, () => new Path2D());

function resetLinkPaths() {
  for (let BUCKET_INDEX = 0; BUCKET_INDEX < LINK_BUCKET_COUNT; BUCKET_INDEX++) {
    LINK_PATHS_BY_BUCKET[BUCKET_INDEX] = new Path2D();
  }
}

S.renderStarsAndLinks = function renderStarsAndLinks() {
  const CONTEXT = S.drawingContext;

  CONTEXT.clearRect(0, 0, S.canvasWidth, S.canvasHeight);

  const TARGET_RING_RADIUS = Math.max(0, S.screenScaleUp * 100 - 40);

  let RING_RADIUS = TARGET_RING_RADIUS * (S.pointerRingTimer / 50);
  let RING_WIDTH = S.pointerRingTimer * 0.15;
  let RING_ALPHA = Math.min(S.pointerRingTimer * 0.07, 1);

  if (S.pointerSpeedUnits == 0) {
    const NORMALIZED_POKE = Math.min(1, Math.max(0, S.pokeImpulseTimer / 200));
    const INVERTED_POKE = 1 - NORMALIZED_POKE;

    RING_RADIUS = TARGET_RING_RADIUS * INVERTED_POKE;
    RING_WIDTH = NORMALIZED_POKE * 7;
    RING_ALPHA = NORMALIZED_POKE;
  }

  if (RING_ALPHA > 0.001) {
    CONTEXT.save();
    CONTEXT.lineWidth = RING_WIDTH;
    CONTEXT.strokeStyle = "rgba(189, 189, 189, 1)";
    CONTEXT.globalAlpha = RING_ALPHA;

    CONTEXT.beginPath();
    CONTEXT.arc(S.pointerClientX, S.pointerClientY, RING_RADIUS, 0, Math.PI * 2);
    CONTEXT.stroke();
    CONTEXT.restore();
  }

  // links
  CONTEXT.lineWidth = 1;

  const STAR_COUNT = S.starList.length;
  if (STAR_COUNT) {
    LINK_FRAME++;

    if (S.pointerSpeedUnits > 10) LINKS_DIRTY = true;

    const SHOULD_REBUILD_LINKS = LINKS_DIRTY || (LINK_FRAME % 3 === 0);

    if (SHOULD_REBUILD_LINKS) {
      LINKS_DIRTY = false;

      for (let i = 0; i < STAR_COUNT; i++) {
        S.starList[i].edge = getEdgeFadeFastWithRadius(S.starList[i]);
      }

      const DISTANCE_SCALE = S.screenPerimeter / 500;
      const RAW_CUTOFF = S.maxLinkDistance / DISTANCE_SCALE;
      const CUTOFF_DISTANCE_SQ = RAW_CUTOFF * RAW_CUTOFF;

      resetLinkPaths();

      for (let a = 0; a < STAR_COUNT; a++) {
        const STAR_A = S.starList[a];
        const AX = STAR_A.x;
        const AY = STAR_A.y;
        const OPACITY_A = STAR_A.opacity;
        const EDGE_A = STAR_A.edge;

        for (let b = a + 1; b < STAR_COUNT; b++) {
          const STAR_B = S.starList[b];

          const dx = AX - STAR_B.x;
          const dy = AY - STAR_B.y;
          const d2 = dx * dx + dy * dy;

          if (d2 > CUTOFF_DISTANCE_SQ) continue;

          const SCALED_DISTANCE = Math.sqrt(d2) * DISTANCE_SCALE;

          const MIN_OPACITY = OPACITY_A < STAR_B.opacity ? OPACITY_A : STAR_B.opacity;
          const MIN_EDGE = EDGE_A < STAR_B.edge ? EDGE_A : STAR_B.edge;
          const DISTANCE_FADE = 1 - (SCALED_DISTANCE / S.maxLinkDistance);

          let LINK_ALPHA = (DISTANCE_FADE > 0 ? DISTANCE_FADE : 0) * MIN_OPACITY * MIN_EDGE;
          if (LINK_ALPHA <= 0.002) continue;

          let BUCKET_INDEX = (LINK_ALPHA * (LINK_BUCKET_COUNT - 1)) | 0;
          if (BUCKET_INDEX < 0) BUCKET_INDEX = 0;
          if (BUCKET_INDEX >= LINK_BUCKET_COUNT) BUCKET_INDEX = LINK_BUCKET_COUNT - 1;

          LINK_PATHS_BY_BUCKET[BUCKET_INDEX].moveTo(AX, AY);
          LINK_PATHS_BY_BUCKET[BUCKET_INDEX].lineTo(STAR_B.x, STAR_B.y);
        }
      }
    }

    for (let i = 0; i < LINK_BUCKET_COUNT; i++) {
      const A = i / (LINK_BUCKET_COUNT - 1);
      if (A <= 0) continue;

      CONTEXT.strokeStyle = `rgba(100, 100, 100, ${A})`;
      CONTEXT.stroke(LINK_PATHS_BY_BUCKET[i]);
    }
  }

  // stars
  if (!STAR_SPRITES.ready) return;
  const IMG = STAR_SPRITES.img;

  for (const STAR of S.starList) {
    const R = (STAR.whiteValue * 2 + STAR.size) || 1;
    const SIZE = Math.max(2, R * 2.4);

    const X = STAR.x - SIZE / 2;
    const Y = STAR.y - SIZE / 2;

    CONTEXT.save();
    CONTEXT.globalAlpha = STAR.opacity;
    CONTEXT.drawImage(IMG, X, Y, SIZE, SIZE);

    let t = (STAR.redValue - 50) / 150;
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    const DARKNESS = 0.15 + 0.55 * (1 - t);

    const CX = STAR.x;
    const CY = STAR.y;
    const CR = SIZE * 0.48;

    CONTEXT.globalCompositeOperation = "source-atop";
    CONTEXT.globalAlpha = STAR.opacity * DARKNESS;
    CONTEXT.fillStyle = "rgba(0, 0, 0, 1)";
    CONTEXT.beginPath();
    CONTEXT.arc(CX, CY, CR, 0, Math.PI * 2);
    CONTEXT.fill();

    if (STAR.whiteValue > 0.01) {
      CONTEXT.globalCompositeOperation = "lighter";
      CONTEXT.globalAlpha = STAR.opacity * (STAR.whiteValue > 1 ? 1 : STAR.whiteValue);
      CONTEXT.fillStyle = "rgba(255, 255, 255, 1)";
      CONTEXT.beginPath();
      CONTEXT.arc(CX, CY, CR, 0, Math.PI * 2);
      CONTEXT.fill();
    }

    CONTEXT.restore();
  }
};

/* #endregion 2) RENDERING */



/*========================================*
//#region 3) USER INPUT
 *========================================*/

S.updatePointerSpeed = function updatePointerSpeed(CURRENT_X, CURRENT_Y) {
  const NOW_MS = S.getNowMs();

  if (!S.lastPointerTimeMs) {
    S.pointerClientX = CURRENT_X;
    S.pointerClientY = CURRENT_Y;
    S.lastPointerTimeMs = NOW_MS;
    S.pointerSpeedUnits = 0;
    return;
  }

  const DT = Math.max(1, NOW_MS - S.lastPointerTimeMs);

  const DX = CURRENT_X - S.pointerClientX;
  const DY = CURRENT_Y - S.pointerClientY;

  const RAW_SPEED = Math.sqrt(DX * DX + DY * DY) / DT;
  S.pointerSpeedUnits = S.screenScaleDown * Math.min(RAW_SPEED * 50, 50);

  S.pointerRingTimer = Math.max(S.pointerRingTimer, S.pointerSpeedUnits);

  if (S.pointerSpeedUnits > 10) LINKS_DIRTY = true;

  S.pointerClientX = CURRENT_X;
  S.pointerClientY = CURRENT_Y;
  S.lastPointerTimeMs = NOW_MS;
};

S.beginPointerInteraction = function beginPointerInteraction(START_X, START_Y) {
  S.pokeImpulseTimer = 200;
  S.lastPointerTimeMs = 0;
  S.updatePointerSpeed(START_X, START_Y);
};

// Mouse
window.addEventListener("mousedown", (EVENT) =>
  S.beginPointerInteraction(EVENT.clientX, EVENT.clientY)
);

// Pointer move (mouse, stylus, trackpad)
window.addEventListener("pointermove", (EVENT) => {
  if (EVENT.pointerType === "touch") return;
  S.updatePointerSpeed(EVENT.clientX, EVENT.clientY);
});

// Touch
window.addEventListener(
  "touchstart",
  (EVENT) => {
    const TOUCH = EVENT.touches[0];
    if (!TOUCH) return;
    S.beginPointerInteraction(TOUCH.clientX, TOUCH.clientY);
  },
  { passive: true }
);

// Touch
window.addEventListener(
  "touchmove",
  (EVENT) => {
    const TOUCH = EVENT.touches[0];
    if (!TOUCH) return;
    S.updatePointerSpeed(TOUCH.clientX, TOUCH.clientY);
  },
  { passive: true }
);

/* #endregion 3) USER INPUT */