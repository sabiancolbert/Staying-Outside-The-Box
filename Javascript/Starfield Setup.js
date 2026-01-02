// thank heavens for chatGPT <3
// Starfield Setup: builds the STARFIELD namespace, storage, utilities, UI bindings,
// resize math, animation loop bootstrap. Active Starfield owns physics/render/input.

/*======================================================================
 *  MENU
 *----------------------------------------------------------------------
 *  1) STARFIELD NAMESPACE + CANVAS
 *     - Create window.STARFIELD + window.KEYBOARD
 *     - Wire canvas + context
 *     - Create shared state buckets (pointer, metrics, scaling, guards)
 *
 *  2) STORAGE (localStorage)
 *     - Save stars + meta so sessions persist
 *
 *  3) UTILITIES
 *     - Time helpers + Safari timestamp normalization
 *     - Random helper
 *     - Edge fade helper
 *
 *  4) INIT: RESTORE OR CREATE STARS
 *     - Restore star list + meta, rescale to new canvas
 *     - Create fresh stars if missing/corrupt
 *
 *  5) UI CONTROLS (STEPPERS + BINDINGS)
 *     - Slider/number binding
 *     - Hold-to-repeat steppers
 *     - DOMContentLoaded wiring
 *
 *  6) RESIZE + ANIMATION
 *     - Resize canvas backing store
 *     - Recompute scaling powers and caps
 *     - Rescale existing stars for continuity
 *     - Run animation loop (calls Active functions if installed)
 *
 *  7) BOOTSTRAP
 *     - Wait for usable canvas size
 *     - Initialize stars once
 *     - Start loop once
 *     - Wire resize listener once
 *====================================================================*/


/*======================================================================
 * #region 1) STARFIELD NAMESPACE + CANVAS
 *====================================================================*/

/* GROUP: Global containers */
// Create the global STARFIELD namespace container.
window.STARFIELD = {};

// Create the global keyboard impulse container.
// Active Starfield reads this each frame to apply keyboard-driven forces.
window.KEYBOARD = {

  // Multiply star passive velocity X by this factor (ex: slow/fast modes).
  multX: 1,

  // Multiply star passive velocity Y by this factor (ex: slow/fast modes).
  multY: 1,

  // Add a global drift impulse on X (ex: WASD movement).
  addX: 0,

  // Add a global drift impulse on Y (ex: WASD movement).
  addY: 0,

  // Paddles: X position (0..100 style “percent” space used by your pong logic).
  paddlesX: 50,

  // Paddles: Y position (0..100 style “percent” space used by your pong logic).
  paddlesY: 50,

  // Paddles: timer that keeps paddles “active” briefly after input.
  paddlesTimer: 0,

  // When true, magnet targets pointer instead of quadrant coordinates.
  magnetPointer: false,

  // Magnet target X in percent space (0..100).
  magnetX: 0,

  // Magnet target Y in percent space (0..100).
  magnetY: 0
};

// Create a short alias for the STARFIELD namespace.
// We use S everywhere to keep code compact and consistent.
var S = window.STARFIELD;

/* GROUP: Canvas wiring */
// Find the canvas element by id (required for the starfield).
S.constellationCanvas = document.getElementById("constellations");

// Get a 2D drawing context if canvas exists and supports getContext.
S.drawingContext =
  S.constellationCanvas && S.constellationCanvas.getContext
    ? S.constellationCanvas.getContext("2d")
    : null;

// Record whether canvas drawing is actually available.
S.isCanvasReady = !!(S.constellationCanvas && S.drawingContext);

// Warn when canvas is missing or unsupported.
// We keep the page alive, but starfield setup/loop will bail early.
if (!S.isCanvasReady) {
  console.warn("Constellation canvas not found or unsupported; starfield disabled.");
}

// Track whether the simulation should pause.
// Layout transitions or visibility changes toggle this.
S.isFrozen = false;

/* GROUP: Pointer state (Active updates these) */
// Track the current pointer X position in client coordinates.
S.pointerClientX = 0;

// Track the current pointer Y position in client coordinates.
S.pointerClientY = 0;

// Track the last pointer timestamp baseline in “perf-style ms”.
S.lastPointerTimeMs = 0;

// Track the current pointer speed in normalized “energy” units.
S.pointerSpeedUnits = 0;

// Track the poke impulse timer used by the poke burst effect.
S.pokeImpulseTimer = 0;

// Track the ring timer used to animate the pointer ring.
S.pointerRingTimer = 0;

/* GROUP: Canvas metrics (Setup updates these) */
// Track current canvas pixel width used for physics + drawing.
S.canvasWidth = 0;

// Track current canvas pixel height used for physics + drawing.
S.canvasHeight = 0;

// Track a “screen size” proxy used for scaling (width + height).
S.screenPerimeter = 0;

// Track the scale-up factor used to grow values on large screens.
S.screenScaleUp = 0;

// Track the scale-down factor used to normalize values on small screens.
S.screenScaleDown = 0;

// Track the computed maximum number of stars allowed for this screen size.
S.starCountLimit = 0;

// Track the computed maximum link distance for this screen size.
S.maxLinkDistance = 0;

// Track the current target link distance (lets Active animate link distance smoothly).
S.goalLinkDistance = 0;

// Track the timer used to rebuild links after certain effects.
S.linkRebuildTimer = 0;

/* GROUP: Precomputed physics scaling powers */
// Store scaling multipliers so physics stays screen-consistent.
// Setup writes these, Active reads them each frame.
S.screenScalePowers = {

  // Scales attraction radius math for larger screens.
  attractionGradient: 1,

  // Scales repulsion radius math for larger screens.
  repulsionGradient: 1,

  // Scales attraction falloff curve shaping.
  attractionShape: 1,
  
  // Scales repel falloff curve shaping.
  repulsionShape: 1,

  // Scales attraction force strength across screens.
  attractionForce: 1,

  // Scales repulsion force strength across screens.
  repulsionForce: 1,

  // Scales the global momentum clamp across screens.
  forceClamp: 1
};

/* GROUP: Star storage */
// Store the active star objects array.
// Setup creates/restores, Active updates, Render draws.
S.starList = [];

/* GROUP: Bootstrap guards */
// Prevent starting the animation loop more than once.
S.hasAnimationLoopStarted = false;

// Prevent wiring the resize listener more than once.
S.hasResizeListenerWired = false;

// Prevent restoring/creating stars more than once.
S.hasStarsInitialized = false;

/* #endregion 1) STARFIELD NAMESPACE + CANVAS */



/*======================================================================
 * #region 2) STORAGE (localStorage)
 *====================================================================*/

/* GROUP: Save stars + meta */
// Persist stars and meta state so the starfield survives reloads.
// This is “best effort”: storage can fail in private mode or with quota limits.
S.saveStarfieldToStorage = function saveStarfieldToStorage() {

  // Bail if canvas isn't active so we don't save unusable state.
  if (!S.isCanvasReady) return;

  try {
    // Save the star list under a stable key (kept for compatibility).
    localStorage.setItem("constellationStars", JSON.stringify(S.starList));

    // Save meta under a stable key (kept for compatibility).
    localStorage.setItem(
      "constellationMeta",
      JSON.stringify({

        /* CANVAS SIZE */
        // Save canvas width so we can rescale X later on restore.
        width: S.canvasWidth,

        // Save canvas height so we can rescale Y later on restore.
        height: S.canvasHeight,

        /* POINTER + TIMERS */
        // Save poke timer so poke resumes smoothly after reload.
        pokeTimer: S.pokeImpulseTimer,

        // Save pointer speed so interaction “energy” resumes smoothly.
        userSpeed: S.pointerSpeedUnits,

        // Save pointer X so ring resumes at correct position.
        userX: S.pointerClientX,

        // Save pointer Y so ring resumes at correct position.
        userY: S.pointerClientY,

        // Save pointer time baseline (legacy/optional field).
        userTime: S.lastPointerTimeMs,

        // Save ring timer so ring resumes smoothly.
        ringTimer: S.pointerRingTimer,

        /* UI PARAMS */
        // Save attraction strength slider value.
        attractStrength: S.interactionSettings.attractStrength,

        // Save attraction radius slider value.
        attractRadius: S.interactionSettings.attractRadius,

        // Save attraction curve slider value.
        attractScale: S.interactionSettings.attractScale,

        // Save clamp slider value.
        clamp: S.interactionSettings.clamp,

        // Save repulsion strength slider value.
        repelStrength: S.interactionSettings.repelStrength,

        // Save repulsion radius slider value.
        repelRadius: S.interactionSettings.repelRadius,

        // Save repulsion curve slider value.
        repelScale: S.interactionSettings.repelScale,

        // Save poke strength slider value.
        pokeStrength: S.interactionSettings.pokeStrength
      })
    );
  } catch (ERROR) {

    // Storage can fail (private mode, quota, blocked), so warn and continue.
    console.warn("Could not save stars:", ERROR);
  }
};

/* #endregion 2) STORAGE */



/*======================================================================
 * #region 3) UTILITIES
 *====================================================================*/

/* GROUP: Time base */
// Return a high-resolution timestamp in milliseconds when possible.
S.getNowMs = function getNowMs() {

  // Prefer performance.now() for stable frame deltas.
  if (window.performance && performance.now) return performance.now();

  // Fallback to Date.now() when performance.now is unavailable.
  return Date.now();
};

/* GROUP: Safari timestamp normalization */
/**
 * Convert pointer event timestamps into the same “perf-style ms” space as performance.now().
 * Some browsers provide epoch-style timestamps; this normalizes into a consistent space.
 */
S.normalizePointerTimestampMs = function normalizePointerTimestampMs(RAW_TIMESTAMP) {

  // If missing/invalid, use “now” so time deltas stay safe.
  if (!Number.isFinite(RAW_TIMESTAMP) || RAW_TIMESTAMP <= 0) return S.getNowMs();

  // Epoch ms is usually huge (ex: 1700000000000).
  // If we detect epoch-style values, translate to perf-space when possible.
  if (RAW_TIMESTAMP > 1e12) {

    // Use timeOrigin to convert epoch ms into performance.now() space.
    if (performance && Number.isFinite(performance.timeOrigin)) {
      return RAW_TIMESTAMP - performance.timeOrigin;
    }

    // If timeOrigin is unavailable, fall back to “now”.
    return S.getNowMs();
  }

  // Otherwise it already looks like performance.now() space.
  return RAW_TIMESTAMP;
};

/* GROUP: Random helpers */
// Return a random float between MIN_VALUE and MAX_VALUE.
S.randomBetween = (MIN_VALUE, MAX_VALUE) =>
  Math.random() * (MAX_VALUE - MIN_VALUE) + MIN_VALUE;

/* GROUP: Edge fade */
/** Return 0 at/beyond wrap threshold, 1 safely away from edges. */
S.getEdgeFadeFactor = function getEdgeFadeFactor(STAR) {

  // Approximate star radius based on how large it draws.
  const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

  // Distance to left edge (including star padding).
  const DIST_LEFT = STAR.x + STAR_RADIUS;

  // Distance to right edge (including star padding).
  const DIST_RIGHT = S.canvasWidth + STAR_RADIUS - STAR.x;

  // Distance to top edge (including star padding).
  const DIST_TOP = STAR.y + STAR_RADIUS;

  // Distance to bottom edge (including star padding).
  const DIST_BOTTOM = S.canvasHeight + STAR_RADIUS - STAR.y;

  // Find the closest edge distance (worst-case direction).
  const MIN_EDGE_DISTANCE = Math.min(DIST_LEFT, DIST_RIGHT, DIST_TOP, DIST_BOTTOM);

  // Define fade band size near edges (cap keeps it stable and cheap).
  const FADE_BAND = Math.min(90, S.screenPerimeter * 0.03);

  // Convert closest distance into 0..1 interpolation factor.
  let T = MIN_EDGE_DISTANCE / FADE_BAND;

  // Clamp low end.
  if (T < 0) T = 0;

  // Clamp high end.
  if (T > 1) T = 1;

  // Smoothstep easing so fade is gentle instead of linear.
  return T * T * (3 - 2 * T);
};

/* #endregion 3) UTILITIES */



/*======================================================================
 * #region 4) INIT: RESTORE OR CREATE STARS
 *====================================================================*/

/* GROUP: Restore or create */
// Restore saved stars if possible, otherwise create a fresh random field.
S.restoreOrCreateStars = function restoreOrCreateStars() {

  // Bail if canvas isn't active so we don't create unusable state.
  if (!S.isCanvasReady) return;

  /* GROUP: Load star list */
  // Attempt to read saved stars from localStorage.
  let RAW_STARS_JSON = null;

  // Read saved star JSON (storage can throw in private mode).
  try { RAW_STARS_JSON = localStorage.getItem("constellationStars"); } catch {}

  // If there is no saved data, generate a new starfield.
  if (!RAW_STARS_JSON) {
    S.createNewStars();
    return;
  }

  try {
    // Parse saved star list from JSON.
    const PARSED_STARS = JSON.parse(RAW_STARS_JSON);

    // Regenerate if parsed data is not a usable array.
    if (!Array.isArray(PARSED_STARS) || !PARSED_STARS.length) {
      S.createNewStars();
      return;
    }

    // Adopt saved stars (keep object shape stable for compatibility).
    S.starList = PARSED_STARS;

    /* GROUP: Load meta */
    // Attempt to read saved meta from localStorage.
    let RAW_META_JSON = null;

    // Read meta JSON (storage can throw in private mode).
    try { RAW_META_JSON = localStorage.getItem("constellationMeta"); } catch {}

    // If meta is missing, keep stars and exit.
    if (!RAW_META_JSON) return;

    try {
      // Parse saved meta object from JSON.
      const SAVED_META = JSON.parse(RAW_META_JSON);

      /* GROUP: Rescale stars */
      // Rescale stars to current canvas so they don’t “corner spawn” after resize.
      if (SAVED_META.width > 0 && SAVED_META.height > 0) {

        // Compute X scale ratio from old canvas to new canvas.
        const SCALE_X = S.canvasWidth / SAVED_META.width;

        // Compute Y scale ratio from old canvas to new canvas.
        const SCALE_Y = S.canvasHeight / SAVED_META.height;

        // Compute a size scale ratio from old perimeter to new perimeter.
        const SIZE_SCALE =
          (S.canvasWidth + S.canvasHeight) / (SAVED_META.width + SAVED_META.height);

        // Apply rescale to each star position and size.
        for (const STAR of S.starList) {
          STAR.x *= SCALE_X;        // Scale X into new canvas space.
          STAR.y *= SCALE_Y;        // Scale Y into new canvas space.
          STAR.size *= SIZE_SCALE;  // Scale size for consistent feel.
        }
      }

      /* GROUP: Restore interaction state */
      // Restore poke timer (fallback to 0).
      S.pokeImpulseTimer = SAVED_META.pokeTimer ?? 0;

      // Restore pointer speed “energy” (fallback to 0).
      S.pointerSpeedUnits = SAVED_META.userSpeed ?? 0;

      // Restore ring timer (fallback to 0).
      S.pointerRingTimer = SAVED_META.ringTimer ?? 0;

      /* GROUP: Restore UI settings */
      // Restore attraction strength (fallback to current).
      S.interactionSettings.attractStrength =
        SAVED_META.attractStrength ?? S.interactionSettings.attractStrength;

      // Restore attraction radius (fallback to current).
      S.interactionSettings.attractRadius =
        SAVED_META.attractRadius ?? S.interactionSettings.attractRadius;

      // Restore attraction curve (fallback to current).
      S.interactionSettings.attractScale =
        SAVED_META.attractScale ?? S.interactionSettings.attractScale;

      // Restore clamp (fallback to current).
      S.interactionSettings.clamp =
        SAVED_META.clamp ?? S.interactionSettings.clamp;

      // Restore repulsion strength (fallback to current).
      S.interactionSettings.repelStrength =
        SAVED_META.repelStrength ?? S.interactionSettings.repelStrength;

      // Restore repulsion radius (fallback to current).
      S.interactionSettings.repelRadius =
        SAVED_META.repelRadius ?? S.interactionSettings.repelRadius;

      // Restore repulsion curve (fallback to current).
      S.interactionSettings.repelScale =
        SAVED_META.repelScale ?? S.interactionSettings.repelScale;

      // Restore poke strength (fallback to current).
      S.interactionSettings.pokeStrength =
        SAVED_META.pokeStrength ?? S.interactionSettings.pokeStrength;

      /* GROUP: Restore pointer position */
      // Restore pointer X when saved as a number.
      if (typeof SAVED_META.userX === "number") S.pointerClientX = SAVED_META.userX;

      // Restore pointer Y when saved as a number.
      if (typeof SAVED_META.userY === "number") S.pointerClientY = SAVED_META.userY;

      /* GROUP: Reset pointer time baseline */
      // Reset timing baseline to “now” so next delta is sane.
      S.lastPointerTimeMs = S.getNowMs();

    } catch (ERROR) {

      // Meta can be corrupted, so warn and keep stars.
      console.warn("Could not parse constellationMeta; skipping meta restore.", ERROR);
    }
  } catch (ERROR) {

    // Stars JSON can be corrupted, so warn and regenerate.
    console.warn("Could not parse constellationStars; recreating.", ERROR);
    S.createNewStars();
  }
};

/* GROUP: Create new stars */
// Create a fresh randomized set of stars sized for the current screen.
S.createNewStars = function createNewStars() {

  // Bail if canvas isn't active so we don't create unusable state.
  if (!S.isCanvasReady) return;

  // Clear any existing stars before rebuilding.
  S.starList = [];

  /* GROUP: Star size limits */
  // Define minimum allowed star size.
  const MIN_SIZE = 3;

  // Define maximum allowed star size (scaled by screen).
  const MAX_SIZE = S.screenPerimeter / 400 || 3;

  /* GROUP: Build stars */
  // Create each star object (keep fields stable for storage compatibility).
  for (let STAR_INDEX = 0; STAR_INDEX < S.starCountLimit; STAR_INDEX++) {
    S.starList.push({

      // Spawn X uniformly across the canvas.
      x: Math.random() * S.canvasWidth,

      // Spawn Y uniformly across the canvas.
      y: Math.random() * S.canvasHeight,

      // Passive drift velocity X.
      vx: S.randomBetween(-0.15, 0.15),

      // Passive drift velocity Y.
      vy: S.randomBetween(-0.15, 0.15),

      // Base size used by rendering.
      size: S.randomBetween(
        Math.min(MIN_SIZE, MAX_SIZE),
        Math.max(MIN_SIZE, MAX_SIZE)
      ),

      // Rotation (used by line-y sprite / starburst style).
      rotation: Math.random() * Math.PI * 2,

      // Twinkle opacity baseline.
      opacity: S.randomBetween(0.005, 1.8),

      // Twinkle fade speed multiplier.
      fadeSpeed: S.randomBetween(1, 2.1),

      // Redness used by darkness overlay.
      redValue: S.randomBetween(50, 200),

      // White flash intensity (Active updates this).
      whiteValue: 0,

      // Accumulated momentum X (forces add here).
      momentumX: 0,

      // Accumulated momentum Y (forces add here).
      momentumY: 0,

      // Cached edge fade factor used by link brightness.
      edge: 1,

      // Keyboard force X (legacy/optional).
      keyboardForceX: 0,

      // Keyboard force Y (legacy/optional).
      keyboardForceY: 0
    });
  }

  /* GROUP: Pong ball consistency */
  // Force star[0] to have a consistent velocity for the paddles ball.
  if (S.starList.length) {
    S.starList[0].vx = 0.25;
    S.starList[0].vy = 0.25;
  }
};

/* #endregion 4) INIT */



/*======================================================================
 * #region 5) UI CONTROLS (STEPPERS + BINDINGS)
 *====================================================================*/

/* GROUP: Settings object */
// Store interactive settings controlled by sliders and steppers.
S.interactionSettings = {

  // How strongly stars are pulled toward the pointer.
  attractStrength: 50,

  // How far attraction reaches.
  attractRadius: 50,

  // How steep the attraction falloff curve is.
  attractScale: 5,

  // Maximum allowed momentum magnitude.
  clamp: 5,

  // How strongly stars push away from the pointer.
  repelStrength: 50,

  // How far repulsion reaches.
  repelRadius: 50,

  // How steep the repulsion falloff curve is.
  repelScale: 5,

  // Strength of poke burst on tap/click.
  pokeStrength: 5
};

/* GROUP: Hold-to-repeat steppers */
// Enable “press and hold” repeating behavior for stepper buttons.
S.enableHoldToRepeat = function enableHoldToRepeat(BUTTON, ON_STEP) {

  // Track initial delay timeout handle.
  let HOLD_DELAY_TIMER = null;

  // Track repeating interval handle.
  let REPEAT_INTERVAL_TIMER = null;

  /* GROUP: Repeat timing */
  // Wait time before repeating begins.
  const INITIAL_DELAY_MS = 350;

  // Initial repeat interval once repeating begins.
  const START_INTERVAL_MS = 120;

  // Fastest allowed repeat interval.
  const MIN_INTERVAL_MS = 40;

  // Acceleration multiplier (smaller = faster acceleration).
  const ACCELERATION = 0.88;

  // Start hold behavior: fire immediately, then repeat.
  const START_HOLD = () => {

    // Track current interval so we can accelerate over time.
    let CURRENT_INTERVAL_MS = START_INTERVAL_MS;

    // Fire once immediately on press.
    ON_STEP();

    // After a short delay, begin repeating.
    HOLD_DELAY_TIMER = setTimeout(() => {

      // Start repeating at current interval.
      REPEAT_INTERVAL_TIMER = setInterval(() => {

        // Execute one step.
        ON_STEP();

        // Accelerate interval down to minimum.
        CURRENT_INTERVAL_MS = Math.max(MIN_INTERVAL_MS, CURRENT_INTERVAL_MS * ACCELERATION);

        // Restart interval at the new faster speed.
        clearInterval(REPEAT_INTERVAL_TIMER);
        REPEAT_INTERVAL_TIMER = setInterval(ON_STEP, CURRENT_INTERVAL_MS);

      }, CURRENT_INTERVAL_MS);

    }, INITIAL_DELAY_MS);
  };

  // Stop hold behavior and clear timers.
  const STOP_HOLD = () => {

    // Cancel delayed start if it hasn't fired.
    clearTimeout(HOLD_DELAY_TIMER);

    // Cancel repeating interval if running.
    clearInterval(REPEAT_INTERVAL_TIMER);

    // Clear handles so state is clean.
    HOLD_DELAY_TIMER = null;
    REPEAT_INTERVAL_TIMER = null;
  };

  /* GROUP: Mouse events */
  // Start hold-repeat on mouse down.
  BUTTON.addEventListener("mousedown", (EVENT) => { EVENT.preventDefault(); START_HOLD(); });

  // Stop hold-repeat on mouse up.
  BUTTON.addEventListener("mouseup", STOP_HOLD);

  // Stop hold-repeat if mouse leaves button.
  BUTTON.addEventListener("mouseleave", STOP_HOLD);

  /* GROUP: Touch events */
  // Start hold-repeat on touch start (prevent ghost clicks).
  BUTTON.addEventListener(
    "touchstart",
    (EVENT) => { EVENT.preventDefault(); START_HOLD(); },
    { passive: false }
  );

  // Stop hold-repeat on touch end.
  BUTTON.addEventListener("touchend", STOP_HOLD);

  // Stop hold-repeat on touch cancel.
  BUTTON.addEventListener("touchcancel", STOP_HOLD);
};

/* GROUP: Slider + number binding */
// Bind a slider and optional number input to a setting, plus optional steppers.
S.bindSliderAndNumberInput = function bindSliderAndNumberInput(
  CONTROL_ID,
  APPLY_SETTING_VALUE,
  INITIAL_VALUE
) {

  // Find the slider element by id.
  const SLIDER = document.getElementById(CONTROL_ID);

  // Bail if slider does not exist on this page.
  if (!SLIDER) return false;

  // Find the matching number input box (optional).
  const NUMBER_INPUT = document.getElementById(CONTROL_ID + "_num");

  // Find the nearest control block wrapper for steppers (optional).
  const CONTROL_BLOCK = SLIDER.closest(".controlBlock");

  // Find stepper buttons inside this control block (optional).
  const STEP_BUTTONS = CONTROL_BLOCK
    ? CONTROL_BLOCK.querySelectorAll(".stepBtn[data-step]")
    : [];

  /* GROUP: Range + step */
  // Read min value from slider or number input.
  const MIN_VALUE = Number(SLIDER.min || (NUMBER_INPUT && NUMBER_INPUT.min) || 0);

  // Read max value from slider or number input.
  const MAX_VALUE = Number(SLIDER.max || (NUMBER_INPUT && NUMBER_INPUT.max) || 10);

  // Read raw step from slider or number input.
  const RAW_STEP_SIZE = Number(SLIDER.step || (NUMBER_INPUT && NUMBER_INPUT.step) || 1);

  // Use safe step default when missing/invalid.
  const STEP_SIZE =
    Number.isFinite(RAW_STEP_SIZE) && RAW_STEP_SIZE > 0
      ? RAW_STEP_SIZE
      : 1;

  // Clamp value into allowed min/max range.
  const CLAMP_VALUE = (VALUE) => Math.min(MAX_VALUE, Math.max(MIN_VALUE, VALUE));

  // Snap value to nearest step increment.
  const SNAP_TO_STEP = (VALUE) => {

    // Compute nearest step-aligned value.
    const SNAPPED = MIN_VALUE + Math.round((VALUE - MIN_VALUE) / STEP_SIZE) * STEP_SIZE;

    // Determine decimal places needed for step precision.
    const DECIMAL_PLACES = (String(STEP_SIZE).split(".")[1] || "").length;

    // Return numeric value rounded to correct precision.
    return Number(SNAPPED.toFixed(DECIMAL_PLACES));
  };

  // Apply a value to UI + settings in one place.
  const APPLY_VALUE = (VALUE) => {

    // Convert incoming value to number.
    VALUE = Number(VALUE);

    // Bail if value is not a finite number.
    if (!Number.isFinite(VALUE)) return;

    // Clamp + snap to the step grid.
    VALUE = SNAP_TO_STEP(CLAMP_VALUE(VALUE));

    // Write slider value.
    SLIDER.value = String(VALUE);

    // Write number input value if present.
    if (NUMBER_INPUT) NUMBER_INPUT.value = String(VALUE);

    // Apply into settings via callback.
    APPLY_SETTING_VALUE(VALUE);
  };

  // Nudge current value by one step in a direction.
  const NUDGE_BY_STEP = (DIRECTION) =>
    APPLY_VALUE(Number(SLIDER.value) + DIRECTION * STEP_SIZE);

  // Initialize control with provided value (or keep slider's current).
  APPLY_VALUE(INITIAL_VALUE ?? SLIDER.value);

  // Wire slider changes.
  SLIDER.addEventListener("input", () => APPLY_VALUE(SLIDER.value));

  // Wire number input changes if present.
  if (NUMBER_INPUT) {
    NUMBER_INPUT.addEventListener("input", () => APPLY_VALUE(NUMBER_INPUT.value));
    NUMBER_INPUT.addEventListener("change", () => APPLY_VALUE(NUMBER_INPUT.value));
  }

  // Wire stepper buttons if present.
  STEP_BUTTONS.forEach((BUTTON) => {

    // Read direction from data-step attribute.
    const DIRECTION = Number(BUTTON.dataset.step) || 0;

    // Skip buttons without a valid direction.
    if (!DIRECTION) return;

    // Enable hold-to-repeat using the nudge function.
    S.enableHoldToRepeat(BUTTON, () => NUDGE_BY_STEP(DIRECTION));
  });

  // Report success to caller.
  return true;
};

/* GROUP: Control initialization */
// Bind gravity controls only if they exist on the current page.
S.initializeGravityControlsIfPresent = function initializeGravityControlsIfPresent() {

  // Skip when neither major control exists (page without controller UI).
  if (
    !document.getElementById("ATTRACT_STRENGTH") &&
    !document.getElementById("REPEL_STRENGTH")
  ) {
    return;
  }

  /* GROUP: Attract controls */
  S.bindSliderAndNumberInput(
    "ATTRACT_STRENGTH",
    (VALUE) => (S.interactionSettings.attractStrength = VALUE),
    S.interactionSettings.attractStrength
  );

  S.bindSliderAndNumberInput(
    "ATTRACT_RADIUS",
    (VALUE) => (S.interactionSettings.attractRadius = VALUE),
    S.interactionSettings.attractRadius
  );

  S.bindSliderAndNumberInput(
    "ATTRACT_SCALE",
    (VALUE) => (S.interactionSettings.attractScale = VALUE),
    S.interactionSettings.attractScale
  );

  /* GROUP: Clamp control */
  S.bindSliderAndNumberInput(
    "CLAMP",
    (VALUE) => (S.interactionSettings.clamp = VALUE),
    S.interactionSettings.clamp
  );

  /* GROUP: Repel controls */
  S.bindSliderAndNumberInput(
    "REPEL_STRENGTH",
    (VALUE) => (S.interactionSettings.repelStrength = VALUE),
    S.interactionSettings.repelStrength
  );

  S.bindSliderAndNumberInput(
    "REPEL_RADIUS",
    (VALUE) => (S.interactionSettings.repelRadius = VALUE),
    S.interactionSettings.repelRadius
  );

  S.bindSliderAndNumberInput(
    "REPEL_SCALE",
    (VALUE) => (S.interactionSettings.repelScale = VALUE),
    S.interactionSettings.repelScale
  );

  /* GROUP: Poke control */
  S.bindSliderAndNumberInput(
    "POKE_STRENGTH",
    (VALUE) => (S.interactionSettings.pokeStrength = VALUE),
    S.interactionSettings.pokeStrength
  );
};

// Wire UI bindings after the DOM is ready.
document.addEventListener("DOMContentLoaded", S.initializeGravityControlsIfPresent);

/* #endregion 5) UI CONTROLS */



/*======================================================================
 * #region 6) RESIZE + ANIMATION
 *====================================================================*/

/* GROUP: Resize canvas + recompute scaling */
// Resize canvas, recompute scaling, and rescale stars to match new viewport.
S.resizeStarfieldCanvas = function resizeStarfieldCanvas() {

  // Bail if canvas isn't active so we don't work with null refs.
  if (!S.isCanvasReady) return;

  /* GROUP: Capture old state for rescale */
  const OLD_WIDTH = S.canvasWidth;
  const OLD_HEIGHT = S.canvasHeight;
  const OLD_SCREEN_PERIMETER = S.screenPerimeter || 1;

  /* GROUP: Read new viewport size */
  S.canvasWidth = window.innerWidth || 0;
  S.canvasHeight = window.innerHeight || 0;

  /* GROUP: Resize canvas backing store */
  S.constellationCanvas.width = S.canvasWidth;
  S.constellationCanvas.height = S.canvasHeight;

  /* GROUP: Recompute scaling helpers */
  S.screenPerimeter = S.canvasWidth + S.canvasHeight;
  S.screenScaleUp = Math.pow(S.screenPerimeter / 1200, 0.35);
  S.screenScaleDown = Math.pow(1200 / S.screenPerimeter, 0.35);

  /* GROUP: Recompute caps */
  S.starCountLimit = Math.min(300, S.screenScaleUp * 70);
  S.maxLinkDistance = S.screenScaleUp ** 6.5 * 275;
  S.goalLinkDistance = S.maxLinkDistance;

  /* GROUP: Recompute physics scaling powers */
  S.screenScalePowers.attractionGradient = 5.51 * S.screenScaleUp ** 0.5;
  S.screenScalePowers.repulsionGradient = 2.8 * S.screenScaleUp ** 0.66;
  S.screenScalePowers.attractionShape = 0.48 * S.screenScaleDown ** 8.89;
  S.screenScalePowers.repulsionShape = 0.64;
  S.screenScalePowers.attractionForce = 0.0053 * S.screenScaleDown ** 6.46;
  S.screenScalePowers.repulsionForce = 0.0171 * S.screenScaleDown ** 0.89;
  S.screenScalePowers.forceClamp = S.screenScaleUp ** 1.8;

  /* GROUP: Rescale existing stars */
  if (OLD_WIDTH !== 0 && OLD_HEIGHT !== 0 && S.starList.length) {

    const SCALE_X = S.canvasWidth / OLD_WIDTH;
    const SCALE_Y = S.canvasHeight / OLD_HEIGHT;
    const SIZE_SCALE = S.screenPerimeter / OLD_SCREEN_PERIMETER;

    for (const STAR of S.starList) {
      STAR.x *= SCALE_X;
      STAR.y *= SCALE_Y;
      STAR.size *= SIZE_SCALE;
    }
  }
};

/* GROUP: Animation loop */
// Main animation loop that calls Active physics + render when present.
function runAnimationLoop() {

  if (!S.isCanvasReady) return;

  if (S.isFrozen) {
    requestAnimationFrame(runAnimationLoop);
    return;
  }

  if (typeof S.updateStarPhysics === "function") {
    S.updateStarPhysics();
  }

  if (typeof S.renderStarsAndLinks === "function") {
    S.renderStarsAndLinks();
  }

  requestAnimationFrame(runAnimationLoop);
}

// Expose loop for debugging and manual starts.
S._runAnimationLoop = runAnimationLoop;

/* #endregion 6) RESIZE + ANIMATION */



/*======================================================================
 * #region 7) BOOTSTRAP
 *====================================================================*/

/* GROUP: Canvas usability check */
// Return true when canvas size is stable enough to run starfield.
function isCanvasSizeUsable() {
  return (
    Number.isFinite(S.canvasWidth) &&
    Number.isFinite(S.canvasHeight) &&
    S.canvasWidth > 50 &&
    S.canvasHeight > 50
  );
}

/* GROUP: Start function */
// Initialize starfield once the canvas has usable dimensions.
function startStarfield() {

  S.resizeStarfieldCanvas();

  if (!isCanvasSizeUsable()) {
    requestAnimationFrame(startStarfield);
    return;
  }

  /* GROUP: Stars init */
  if (!S.hasStarsInitialized) {
    S.hasStarsInitialized = true;
    S.restoreOrCreateStars();
  }

  /* GROUP: Start loop */
  if (!S.hasAnimationLoopStarted) {
    S.hasAnimationLoopStarted = true;
    requestAnimationFrame(S._runAnimationLoop);
  }

  /* GROUP: Resize listener */
  if (!S.hasResizeListenerWired) {
    S.hasResizeListenerWired = true;
    window.addEventListener("resize", S.resizeStarfieldCanvas);
  }
}

/* GROUP: Bootstrap guard */
try {
  startStarfield();
} catch (ERROR) {
  console.error("Initialization error in Starfield Setup:", ERROR);
}

/* #endregion 7) BOOTSTRAP */