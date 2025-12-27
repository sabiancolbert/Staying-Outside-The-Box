// thank heavens for chatGPT <3

/*==============================================================*
 *                    ACTIVE STARFIELD
 *==============================================================*
 *  Purpose:
 *   - This file runs the starfield once setup is complete.
 *
 *  Depends on:
 *   - Starfield Setup.js (defines window.STARFIELD and canvas)
 *
 *  Contains:
 *   1) Physics updates (forces, motion, decay, wrapping)
 *   2) Rendering (stars, glow, links, pointer ring)
 *   3) User input (mouse, touch, pointer speed tracking)
 *
 *  Performance notes:
 *   - Expensive work is throttled or bucketed
 *   - All physics is time-scaled (dt) for FPS independence
 *   - Debug DOM reads are optional and rate-limited
 *==============================================================*/

/*========================================*
//#region 0) PERFORMANCE HELPERS
 *========================================*/

/* Pull STARFIELD into a short alias for speed and readability */
var S = window.STARFIELD;

/*---------- Debug element cache ----------*
 * These elements only exist on one page.
 * If they don’t exist, null is fine and checks are skipped.
 *-----------------------------------------*/
const DBG = {
  misc: null,
  circle: null,
  speed: null,
  poke: null,
  lastMs: 0
};

/* Cache debug DOM references once */
DBG.misc = document.getElementById("dbgMisc");
DBG.circle = document.getElementById("dbgCircle");
DBG.speed = document.getElementById("dbgSpeed");
DBG.poke = document.getElementById("dbgPoke");

/*---------- Star sprite preload ----------*
 * Loads the WebP star image immediately.
 * Rendering will skip stars until this is ready.
 *-----------------------------------------*/
const STAR_SPRITES = {
  ready: false,
  img: null
};

(function loadStarSpriteNow() {
  // Create image element
  const IMG = new Image();

  // Hint to browser: decode off main thread if possible
  IMG.decoding = "async";

  // Load immediately, not lazily
  IMG.loading = "eager";

  // Mark ready when loaded
  IMG.onload = () => { STAR_SPRITES.ready = true; };

  // Fail gracefully if image can’t load
  IMG.onerror = () => { STAR_SPRITES.ready = false; };

  // Source path
  IMG.src = "/Resources/Star.webp";

  // Store reference
  STAR_SPRITES.img = IMG;
})();

/*---------- Link rebuild throttling ----------*
 * Controls how often constellation links are recalculated.
 *---------------------------------------------*/
let LINK_FRAME = 0;
let LINKS_DIRTY = true;

/*---------- Fast edge fade ----------*
 * Calculates how close a star is to the canvas edge.
 * Includes star radius to prevent popping.
 *-----------------------------------*/
function getEdgeFadeFastWithRadius(STAR) {
  // Approximate visible radius of the star
  const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

  // Distance from each canvas edge
  const DIST_LEFT   = STAR.x + STAR_RADIUS;
  const DIST_RIGHT  = (S.canvasWidth + STAR_RADIUS) - STAR.x;
  const DIST_TOP    = STAR.y + STAR_RADIUS;
  const DIST_BOTTOM = (S.canvasHeight + STAR_RADIUS) - STAR.y;

  // Find closest edge
  const MIN_EDGE_DISTANCE = Math.min(
    DIST_LEFT,
    DIST_RIGHT,
    DIST_TOP,
    DIST_BOTTOM
  );

  // Width of fade band near edges
  const FADE_BAND = Math.min(90, S.screenPerimeter * 0.03) || 1;

  // Normalize distance into 0–1 range
  let t =
    MIN_EDGE_DISTANCE <= 0 ? 0 :
    MIN_EDGE_DISTANCE >= FADE_BAND ? 1 :
    (MIN_EDGE_DISTANCE / FADE_BAND);

  // Ease the fade for smoother appearance
  return t * t;
}

/*---------- Time scaling ----------*
 * Converts frame-based tuning into time-based behavior.
 *---------------------------------*/
const FRAME_MS = 1000 / 60;

/* Clamp delta time to prevent giant physics jumps */
function clampDtMs(dtMs) {
  if (dtMs < 0) return 0;
  if (dtMs > 50) return 50; // ~3 frames at 60fps
  return dtMs;
}

/* Convert per-frame decay into time-scaled decay */
function decayPerFrameToDt(basePerFrame, dtFrames) {
  return Math.pow(basePerFrame, dtFrames);
}

/* #endregion 0) PERFORMANCE HELPERS */



/*========================================*
//#region 1) PHYSICS
 *========================================*/

S.updateStarPhysics = function updateStarPhysics() {
  // Exit early if no stars exist
  if (!S.starList.length) return;

  /*---------- Time delta ----------*/
  const NOW = S.getNowMs();
  const LAST = S.lastPhysicsMs || NOW;

  // Clamp to avoid tab sleep explosions
  const dtMs = clampDtMs(NOW - LAST);
  S.lastPhysicsMs = NOW;

  // Normalize to 60fps units
  const dt = dtMs / FRAME_MS;
  if (dt <= 0) return;

  /*---------- Interaction ranges ----------*/
  const INFLUENCE_RANGE = S.screenPerimeter * 0.2;
  const INFLUENCE_RANGE_SQ = INFLUENCE_RANGE * INFLUENCE_RANGE;

  const WRAP_DISTANCE_SQ = 200 * 200;

  /*---------- Cached settings ----------*/
  const SETTINGS = S.interactionSettings;
  const SCALE = S.screenScalePowers;

  /*---------- Time-based decay values ----------*/
  const MOMENTUM_DECAY = decayPerFrameToDt(0.98, dt);
  const WHITE_DECAY = decayPerFrameToDt(0.98, dt);
  const POINTER_SPEED_DECAY = decayPerFrameToDt(0.5, dt);
  const RING_DECAY = decayPerFrameToDt(0.95, dt);
  const POKE_DECAY = decayPerFrameToDt(0.85, dt);

  /*---------- Per-star update ----------*/
  for (const STAR of S.starList) {

    /* Pointer vector from star to cursor */
    const POINTER_DELTA_X = S.pointerClientX - STAR.x;
    const POINTER_DELTA_Y = S.pointerClientY - STAR.y;

    /* Squared distance (cheap check) */
    const DISTANCE_SQ =
      POINTER_DELTA_X * POINTER_DELTA_X +
      POINTER_DELTA_Y * POINTER_DELTA_Y;

    /* Only apply pointer forces within influence range */
    if (DISTANCE_SQ < INFLUENCE_RANGE_SQ) {

      /* True distance with epsilon to avoid divide-by-zero */
      const DISTANCE = Math.sqrt(DISTANCE_SQ) + 0.0001;

      /* Unit vector pointing toward pointer */
      const UNIT_TO_POINTER_X = POINTER_DELTA_X / DISTANCE;
      const UNIT_TO_POINTER_Y = POINTER_DELTA_Y / DISTANCE;

      /* Attraction falloff gradient */
      let ATTRACTION_GRADIENT =
        1 - (DISTANCE /
        (((SETTINGS.attractRadius * 5.2) *
          SCALE.attractionGradient) || 1));

      /* Repulsion falloff gradient */
      let REPULSION_GRADIENT =
        1 - (DISTANCE /
        (((SETTINGS.repelRadius * 2.8) *
          SCALE.repulsionGradient) || 1));

      /* Clamp gradients to valid range */
      ATTRACTION_GRADIENT = Math.max(0, ATTRACTION_GRADIENT);
      REPULSION_GRADIENT = Math.max(0, REPULSION_GRADIENT);

      /* Shape curves for smoother force falloff */
      const ATTRACTION_SHAPE = Math.pow(
        ATTRACTION_GRADIENT,
        Math.max(0.1,
          ((SETTINGS.attractScale * 0.48) *
           SCALE.attractionShape))
      );

      const REPULSION_SHAPE = Math.pow(
        REPULSION_GRADIENT,
        Math.max(0.1,
          (SETTINGS.repelScale * 0.64))
      );

      /* Final attraction force */
      const ATTRACTION_FORCE =
        ((SETTINGS.attractStrength * 0.00435) *
         SCALE.attractionForce) *
        S.pointerSpeedUnits *
        ATTRACTION_SHAPE;

      /* Final repulsion force */
      const REPULSION_FORCE =
        ((SETTINGS.repelStrength * 0.0182) *
         SCALE.repulsionForce) *
        S.pointerSpeedUnits *
        REPULSION_SHAPE;

      /* APPLY ATTRACTION */
      STAR.momentumX += (ATTRACTION_FORCE * UNIT_TO_POINTER_X) * dt;
      STAR.momentumY += (ATTRACTION_FORCE * UNIT_TO_POINTER_Y) * dt;

      /* APPLY REPULSION */
      STAR.momentumX += (REPULSION_FORCE * -UNIT_TO_POINTER_X) * dt;
      STAR.momentumY += (REPULSION_FORCE * -UNIT_TO_POINTER_Y) * dt;

      /*============================*
       *        POKE LOGIC
       *============================*/

      // Poke radius is 1/4 of the screen perimeter
      const POKE_RADIUS = S.screenPerimeter * 0.25;

      // Normalize distance into inverted 0–1 gradient
      const POKE_GRADIENT = 1 - (DISTANCE / POKE_RADIUS);

      // Square for sharper center punch
      const POKE_SHAPE = Math.pow(
        Math.max(0, POKE_GRADIENT),
        2
      );

      // Final poke force scaled by timer and strength
      const POKE_FORCE =
        (0.01 * SETTINGS.pokeStrength) *
        S.pokeImpulseTimer *
        POKE_SHAPE;

      /* APPLY POKE FORCE */
      STAR.momentumX += (POKE_FORCE * -UNIT_TO_POINTER_X) * dt;
      STAR.momentumY += (POKE_FORCE * -UNIT_TO_POINTER_Y) * dt;
    }

    /* Baseline drift amplified by interaction */
    const DRIFT_BOOST = Math.min(7, 0.01 * S.pointerSpeedUnits);
    STAR.momentumX += (STAR.vx * DRIFT_BOOST) * dt;
    STAR.momentumY += (STAR.vy * DRIFT_BOOST) * dt;

    /* Keyboard forces are instantaneous */
    STAR.momentumX *= window.KEYBOARD.multX;
    STAR.momentumY *= window.KEYBOARD.multY;
    STAR.momentumX += window.KEYBOARD.addX;
    STAR.momentumY += window.KEYBOARD.addY;

    /* Clamp momentum to prevent runaway stars */
    const MOMENTUM_LIMIT = 2 * SETTINGS.clamp * SCALE.forceClamp;
    const MOMENTUM_MAG = Math.sqrt(
      STAR.momentumX * STAR.momentumX +
      STAR.momentumY * STAR.momentumY
    );

    if (MOMENTUM_MAG > MOMENTUM_LIMIT) {
      const MOMENTUM_SCALE = MOMENTUM_LIMIT / MOMENTUM_MAG;
      STAR.momentumX *= MOMENTUM_SCALE;
      STAR.momentumY *= MOMENTUM_SCALE;
    }

    /* Integrate velocity into position */
    STAR.x += (STAR.vx + STAR.momentumX) * dt;
    STAR.y += (STAR.vy + STAR.momentumY) * dt;

    /* Apply friction */
    STAR.momentumX *= MOMENTUM_DECAY;
    STAR.momentumY *= MOMENTUM_DECAY;

    /* Wrap or bounce depending on interaction state */
    if (
      S.pointerRingTimer === 0 ||
      DISTANCE_SQ > WRAP_DISTANCE_SQ ||
      S.pokeImpulseTimer > 10
    ) {
      const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

      if (STAR.x < -STAR_RADIUS) STAR.x = S.canvasWidth + STAR_RADIUS;
      else if (STAR.x > S.canvasWidth + STAR_RADIUS) STAR.x = -STAR_RADIUS;

      if (STAR.y < -STAR_RADIUS) STAR.y = S.canvasHeight + STAR_RADIUS;
      else if (STAR.y > S.canvasHeight + STAR_RADIUS) STAR.y = -STAR_RADIUS;
    } else {
      const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

      if (STAR.x < STAR_RADIUS) {
        STAR.x = 2 * STAR_RADIUS - STAR.x;
        STAR.momentumX = -STAR.momentumX;
      } else if (STAR.x > S.canvasWidth - STAR_RADIUS) {
        STAR.x = 2 * (S.canvasWidth - STAR_RADIUS) - STAR.x;
        STAR.momentumX = -STAR.momentumX;
      }

      if (STAR.y < STAR_RADIUS) {
        STAR.y = 2 * STAR_RADIUS - STAR.y;
        STAR.momentumY = -STAR.momentumY;
      } else if (STAR.y > S.canvasHeight - STAR_RADIUS) {
        STAR.y = 2 * (S.canvasHeight - STAR_RADIUS) - STAR.y;
        STAR.momentumY = -STAR.momentumY;
      }
    }

    /* White flash decay */
    if (STAR.whiteValue > 0) {
      STAR.whiteValue *= WHITE_DECAY;
      if (STAR.whiteValue < 0.001) STAR.whiteValue = 0;
    }

    /* Opacity cycling (twinkle) */
    if (STAR.opacity <= 0.005) {
      STAR.opacity = 1;
      if (Math.random() < 0.07) STAR.whiteValue = 1;
    } else if (STAR.opacity > 0.02) {
      STAR.opacity -= (0.005 * STAR.fadeSpeed) * dt;
    } else {
      STAR.opacity -= 0.0001 * dt;
    }
  }

  /* Reset keyboard modifiers */
  window.KEYBOARD.multX = 1;
  window.KEYBOARD.multY = 1;
  window.KEYBOARD.addX = 0;
  window.KEYBOARD.addY = 0;

  /* Global decay values */
  S.pointerSpeedUnits *= POINTER_SPEED_DECAY;
  if (S.pointerSpeedUnits < 0.001) S.pointerSpeedUnits = 0;

  S.pointerRingTimer *= RING_DECAY;
  if (S.pointerRingTimer < 1) S.pointerRingTimer = 0;

  S.pokeImpulseTimer *= POKE_DECAY;
  if (S.pokeImpulseTimer < 1) S.pokeImpulseTimer = 0;

  /* Debug output throttled to ~10fps */
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