// thank heavens for chatGPT <3

/*==============================================================*
 *                      STARFIELD SETUP
 *==============================================================*
 *  This file owns:
 *   1) STARFIELD namespace + canvas wiring
 *   2) Storage (save/restore)
 *   3) Utilities (time normalization, edge fade, random)
 *   4) Init/create stars
 *   5) UI controls (sliders + steppers)
 *   6) Resize + animation loop
 *   7) Bootstrap
 *
 *  Active Starfield.js owns:
 *    Physics (updateStarPhysics)
 *    Rendering (renderStarsAndLinks)
 *    Pointer input (updatePointerSpeed + listeners)
 *==============================================================*/

//alert("Debug can"); // Optional debug tripwire: confirms this file loaded

/*========================================*
//#region 1) STARFIELD NAMESPACE + CANVAS
 *========================================*/

/* GLOBAL CONTAINERS */
// Create the global STARFIELD namespace container
window.STARFIELD = {};

// Create the global keyboard impulse container used by the Active file each frame
window.KEYBOARD = {
  multX: 1,
  multY: 1,
  addX: 0,
  addY: 0,
  paddlesX: 50,
  paddlesY: 50,
  paddlesTimer: 0,
  magnetPointer: false,
  magnetX: 0,
  magnetY: 0
};

// Create a short alias for the STARFIELD namespace
var S = window.STARFIELD;

/* CANVAS WIRING */
// Find the canvas element by id (required for the starfield)
S.constellationCanvas = document.getElementById("constellations");

// Get the 2D drawing context if canvas exists and supports getContext
S.drawingContext =
  S.constellationCanvas && S.constellationCanvas.getContext
    ? S.constellationCanvas.getContext("2d")
    : null;

// Record whether canvas drawing is actually available
S.isCanvasReady = !!(S.constellationCanvas && S.drawingContext);

// Warn and disable starfield behavior when canvas is missing or unsupported
if (!S.isCanvasReady) {
  console.warn("Constellation canvas not found or unsupported; starfield disabled.");
}

// Track whether the simulation should pause (ex: navigation / transitions)
S.isFrozen = false;

/* POINTER STATE (Active updates these) */
// Track the current pointer X position in client coordinates
S.pointerClientX = 0;

// Track the current pointer Y position in client coordinates
S.pointerClientY = 0;

// Track the last pointer timestamp baseline (perf-style ms)
S.lastPointerTimeMs = 0;

// Track the current pointer speed in normalized "energy" units
S.pointerSpeedUnits = 0;

// Track the poke impulse timer used by the poke burst
S.pokeImpulseTimer = 0;

// Track the ring timer used to animate the pointer ring
S.pointerRingTimer = 0;

/* CANVAS METRICS (Setup updates these) */
// Track the current canvas pixel width used for physics + drawing
S.canvasWidth = 0;

// Track the current canvas pixel height used for physics + drawing
S.canvasHeight = 0;

// Track a simple "screen size" proxy used for scaling (width + height)
S.screenPerimeter = 0;

// Track the scale-up factor used to grow values on large screens
S.screenScaleUp = 0;

// Track the scale-down factor used to normalize values on small screens
S.screenScaleDown = 0;

// Track the computed maximum number of stars allowed for this screen size
S.starCountLimit = 0;

// Track the computed maximum link distance for this screen size
S.maxLinkDistance = 0;
S.goalLinkDistance = 0;

/* PRECOMPUTED PHYSICS SCALING POWERS (Setup writes, Active reads) */
// Store scaling multipliers so physics stays screen-consistent without recomputing exponents per star
S.screenScalePowers = {
  attractionGradient: 1, // Scales attraction radius math for larger screens
  repulsionGradient: 1,  // Scales repulsion radius math for larger screens
  attractionShape: 1,    // Scales attraction falloff curve shaping
  attractionForce: 1,    // Scales attraction force strength across screens
  repulsionForce: 1,     // Scales repulsion force strength across screens
  forceClamp: 1          // Scales the global momentum clamp across screens
};

// Store the active star objects array (created/restored by Setup)
S.starList = [];

/* BOOTSTRAP GUARDS */
// Prevent starting the animation loop more than once
S.hasAnimationLoopStarted = false;

// Prevent wiring the resize listener more than once
S.hasResizeListenerWired = false;

// Prevent restoring/creating stars more than once
S.hasStarsInitialized = false;

/* #endregion 1) STARFIELD NAMESPACE + CANVAS */



/*========================================*
//#region 2) STORAGE (localStorage)
 *========================================*/

// Save stars + meta state so the starfield persists across reloads
S.saveStarfieldToStorage = function saveStarfieldToStorage() {
  // Bail if canvas isn't active so we don't save unusable state
  if (!S.isCanvasReady) return;

  try {
    // Persist the star list under a stable key (kept for compatibility)
    localStorage.setItem("constellationStars", JSON.stringify(S.starList));

    // Persist the meta object under a stable key (kept for compatibility)
    localStorage.setItem(
      "constellationMeta",
      JSON.stringify({
        /* CANVAS SIZE (used to rescale stars on restore) */
        width: S.canvasWidth,   // Save canvas width so we can rescale X later
        height: S.canvasHeight, // Save canvas height so we can rescale Y later

        /* POINTER + TIMERS (used to resume interaction visuals smoothly) */
        pokeTimer: S.pokeImpulseTimer,   // Save poke timer so poke resumes smoothly
        userSpeed: S.pointerSpeedUnits,  // Save pointer speed so energy resumes smoothly
        userX: S.pointerClientX,         // Save pointer X so ring resumes at correct position
        userY: S.pointerClientY,         // Save pointer Y so ring resumes at correct position
        userTime: S.lastPointerTimeMs,   // Save pointer time baseline (legacy / optional)
        ringTimer: S.pointerRingTimer,   // Save ring timer so ring resumes smoothly

        /* UI PARAMS (restore controller settings across reloads) */
        attractStrength: S.interactionSettings.attractStrength, // Save attraction strength slider value
        attractRadius: S.interactionSettings.attractRadius,     // Save attraction radius slider value
        attractScale: S.interactionSettings.attractScale,       // Save attraction curve slider value
        clamp: S.interactionSettings.clamp,                     // Save clamp slider value
        repelStrength: S.interactionSettings.repelStrength,     // Save repulsion strength slider value
        repelRadius: S.interactionSettings.repelRadius,         // Save repulsion radius slider value
        repelScale: S.interactionSettings.repelScale,           // Save repulsion curve slider value
        pokeStrength: S.interactionSettings.pokeStrength        // Save poke strength slider value
      })
    );
  } catch (ERROR) {
    // Storage can fail (private mode, quota, blocked), so warn and continue
    console.warn("Could not save stars:", ERROR);
  }
};

/* #endregion 2) STORAGE */



/*========================================*
//#region 3) UTILITIES
 *========================================*/

/* TIME BASE */
// Return a high-resolution timestamp in milliseconds when possible
S.getNowMs = function getNowMs() {
  // Prefer performance.now() for stable deltas, fallback to Date.now()
  return window.performance && performance.now ? performance.now() : Date.now();
};

/**
 * SAFARI TIMESTAMP NORMALIZATION
 * Convert pointer event timestamps into the same "perf-style ms" space as performance.now().
 */
S.normalizePointerTimestampMs = function normalizePointerTimestampMs(RAW_TIMESTAMP) {
  // Use "now" when the timestamp is missing/invalid so deltas stay safe
  if (!Number.isFinite(RAW_TIMESTAMP) || RAW_TIMESTAMP <= 0) return S.getNowMs();

  // Translate epoch-style timestamps into perf-style ms using timeOrigin when possible
  if (RAW_TIMESTAMP > 1e12) {
    // Convert epoch ms into performance.now() space when timeOrigin exists
    if (performance && Number.isFinite(performance.timeOrigin)) {
      return RAW_TIMESTAMP - performance.timeOrigin;
    }

    // Fallback to "now" if timeOrigin is unavailable
    return S.getNowMs();
  }

  // Return as-is when it already looks like a perf.now timestamp
  return RAW_TIMESTAMP;
};

/* RANDOM HELPERS */
// Return a random float between MIN_VALUE and MAX_VALUE
S.randomBetween = (MIN_VALUE, MAX_VALUE) =>
  Math.random() * (MAX_VALUE - MIN_VALUE) + MIN_VALUE;

/* EDGE FADE */
/** Return 0 at/beyond wrap threshold, 1 safely away from edges */
S.getEdgeFadeFactor = function getEdgeFadeFactor(STAR) {
  // Approximate star "radius" based on how large it draws on screen
  const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

  // Measure padded distance to the left edge
  const DIST_LEFT = STAR.x + STAR_RADIUS;

  // Measure padded distance to the right edge
  const DIST_RIGHT = S.canvasWidth + STAR_RADIUS - STAR.x;

  // Measure padded distance to the top edge
  const DIST_TOP = STAR.y + STAR_RADIUS;

  // Measure padded distance to the bottom edge
  const DIST_BOTTOM = S.canvasHeight + STAR_RADIUS - STAR.y;

  // Find the closest edge distance (worst-case direction)
  const MIN_EDGE_DISTANCE = Math.min(DIST_LEFT, DIST_RIGHT, DIST_TOP, DIST_BOTTOM);

  // Define how wide the fade band is near edges (cap keeps it stable and cheap)
  const FADE_BAND = Math.min(90, S.screenPerimeter * 0.03);

  // Convert closest distance into a 0..1 fade factor
  let T = MIN_EDGE_DISTANCE / FADE_BAND;

  // Clamp fade factor at the low end
  if (T < 0) T = 0;

  // Clamp fade factor at the high end
  if (T > 1) T = 1;

  // Smoothstep the fade so it eases instead of linear snapping
  return T * T * (3 - 2 * T);
};

/* #endregion 3) UTILITIES */



/*========================================*
//#region 4) INIT: RESTORE OR CREATE STARS
 *========================================*/

// Restore saved stars if possible, otherwise create a fresh random field
S.restoreOrCreateStars = function restoreOrCreateStars() {
  // Bail if canvas isn't active so we don't create unusable state
  if (!S.isCanvasReady) return;

  /* LOAD STAR LIST */
  // Attempt to read saved stars from localStorage
  let RAW_STARS_JSON = null;

  // Read the saved star JSON (storage can throw in private mode)
  try { RAW_STARS_JSON = localStorage.getItem("constellationStars"); } catch {}

  // Create new stars when no saved data exists
  if (!RAW_STARS_JSON) {
    S.createNewStars();
    return;
  }

  try {
    // Parse saved star list from JSON
    const PARSED_STARS = JSON.parse(RAW_STARS_JSON);

    // Regenerate if parsed data is not a usable array
    if (!Array.isArray(PARSED_STARS) || !PARSED_STARS.length) {
      S.createNewStars();
      return;
    }

    // Adopt saved stars (keep star object shape unchanged for compatibility)
    S.starList = PARSED_STARS;

    /* LOAD META */
    // Attempt to read saved meta from localStorage
    let RAW_META_JSON = null;

    // Read the meta JSON (storage can throw in private mode)
    try { RAW_META_JSON = localStorage.getItem("constellationMeta"); } catch {}

    // Skip meta restore when meta is missing (stars alone are still valid)
    if (!RAW_META_JSON) return;

    try {
      // Parse saved meta object from JSON
      const META = JSON.parse(RAW_META_JSON);

      /* RESCALE STARS */
      // Rescale stars to current canvas to prevent “corner spawning” after resize
      if (META.width > 0 && META.height > 0) {
        // Compute X scale ratio from old canvas to new canvas
        const SCALE_X = S.canvasWidth / META.width;

        // Compute Y scale ratio from old canvas to new canvas
        const SCALE_Y = S.canvasHeight / META.height;

        // Compute a size scale ratio from old perimeter to new perimeter
        const SIZE_SCALE = (S.canvasWidth + S.canvasHeight) / (META.width + META.height);

        // Apply rescale to each star position and size
        for (const STAR of S.starList) {
          STAR.x *= SCALE_X;       // Scale X position into the new canvas space
          STAR.y *= SCALE_Y;       // Scale Y position into the new canvas space
          STAR.size *= SIZE_SCALE; // Scale size so stars feel consistent after resize
        }
      }

      /* RESTORE INTERACTION STATE */
      // Restore poke timer (or default to 0)
      S.pokeImpulseTimer = META.pokeTimer ?? 0;

      // Restore pointer speed energy (or default to 0)
      S.pointerSpeedUnits = META.userSpeed ?? 0;

      // Restore ring timer (or default to 0)
      S.pointerRingTimer = META.ringTimer ?? 0;

      /* RESTORE UI SETTINGS */
      // Restore attraction strength (fallback to current)
      S.interactionSettings.attractStrength =
        META.attractStrength ?? S.interactionSettings.attractStrength;

      // Restore attraction radius (fallback to current)
      S.interactionSettings.attractRadius =
        META.attractRadius ?? S.interactionSettings.attractRadius;

      // Restore attraction curve (fallback to current)
      S.interactionSettings.attractScale =
        META.attractScale ?? S.interactionSettings.attractScale;

      // Restore momentum clamp (fallback to current)
      S.interactionSettings.clamp =
        META.clamp ?? S.interactionSettings.clamp;

      // Restore repulsion strength (fallback to current)
      S.interactionSettings.repelStrength =
        META.repelStrength ?? S.interactionSettings.repelStrength;

      // Restore repulsion radius (fallback to current)
      S.interactionSettings.repelRadius =
        META.repelRadius ?? S.interactionSettings.repelRadius;

      // Restore repulsion curve (fallback to current)
      S.interactionSettings.repelScale =
        META.repelScale ?? S.interactionSettings.repelScale;

      // Restore poke strength (fallback to current)
      S.interactionSettings.pokeStrength =
        META.pokeStrength ?? S.interactionSettings.pokeStrength;

      /* RESTORE POINTER POSITION */
      // Restore pointer X if it was saved as a number
      if (typeof META.userX === "number") S.pointerClientX = META.userX;

      // Restore pointer Y if it was saved as a number
      if (typeof META.userY === "number") S.pointerClientY = META.userY;

      /* RESET POINTER TIME BASELINE */
      // Reset pointer timing baseline to “now” so the next delta is sane
      S.lastPointerTimeMs = S.getNowMs();
    } catch (ERROR) {
      // Meta can be corrupted, so warn and keep stars
      console.warn("Could not parse constellationMeta; skipping meta restore.", ERROR);
    }
  } catch (ERROR) {
    // Stars JSON can be corrupted, so warn and regenerate
    console.warn("Could not parse constellationStars; recreating.", ERROR);
    S.createNewStars();
  }
};

// Create a fresh randomized set of stars sized for the current screen
S.createNewStars = function createNewStars() {
  // Bail if canvas isn't active so we don't create unusable state
  if (!S.isCanvasReady) return;

  // Clear any existing stars before rebuilding
  S.starList = [];

  /* STAR SIZE LIMITS */
  // Define the minimum allowed star size
  const MIN_SIZE = 3;

  // Define the maximum allowed star size (scaled by screen)
  const MAX_SIZE = S.screenPerimeter / 400 || 3;

  /* BUILD STARS */
  // Create each star object (keep fields stable for storage compatibility)
  for (let STAR_INDEX = 0; STAR_INDEX < S.starCountLimit; STAR_INDEX++) {
    S.starList.push({
      x: Math.random() * S.canvasWidth, // Spawn X uniformly across the canvas
      y: Math.random() * S.canvasHeight, // Spawn Y uniformly across the canvas

      vx: S.randomBetween(-0.15, 0.15), // Passive drift velocity X
      vy: S.randomBetween(-0.15, 0.15), // Passive drift velocity Y

      size: S.randomBetween(
        Math.min(MIN_SIZE, MAX_SIZE),
        Math.max(MIN_SIZE, MAX_SIZE)
      ), // Base size used by rendering

      // Rotation
      rotation: Math.random() * Math.PI * 2,

      opacity: S.randomBetween(0.005, 1.8), // Start opacity for twinkle cycle
      fadeSpeed: S.randomBetween(1, 2.1), // Twinkle fade speed multiplier

      redValue: S.randomBetween(50, 200), // Redness used by the darkness overlay
      whiteValue: 0, // White flash intensity (set by Active physics/twinkle)

      momentumX: 0, // Accumulated momentum X (forces add here)
      momentumY: 0, // Accumulated momentum Y (forces add here)

      edge: 1, // Cached edge fade factor used by link brightness
      keyboardForceX: 0, // Keyboard force X (legacy/optional)
      keyboardForceY: 0 // Keyboard force Y (legacy/optional)
    });
  }
  // Consistant speed for paddles ball
if (S.starList.length) {
  S.starList[0].vx = 0.25;
  S.starList[0].vy = 0.25;
}
};

/* #endregion 4) INIT */



/*========================================*
//#region 5) UI CONTROLS (STEPPERS + BINDINGS)
 *========================================*/

// Store the interactive settings controlled by sliders and steppers
S.interactionSettings = {
  attractStrength: 50, // How strongly stars are pulled toward the pointer
  attractRadius: 50,   // How far attraction reaches
  attractScale: 5,     // How steep the attraction falloff curve is
  clamp: 5,            // Maximum allowed momentum magnitude

  repelStrength: 50,   // How strongly stars push away from the pointer
  repelRadius: 50,     // How far repulsion reaches
  repelScale: 5,       // How steep the repulsion falloff curve is

  pokeStrength: 5      // Strength of the poke burst on tap/click
};

// Enable "press and hold" repeating behavior for stepper buttons
S.enableHoldToRepeat = function enableHoldToRepeat(BUTTON, onStep) {
  // Track the initial delay timeout handle
  let HOLD_DELAY_TIMER = null;

  // Track the repeating interval handle
  let REPEAT_INTERVAL_TIMER = null;

  /* REPEAT TIMING */
  // Set how long to wait before repeating starts
  const INITIAL_DELAY_MS = 350;

  // Set the initial repeat speed once repeating begins
  const START_INTERVAL_MS = 120;

  // Set the fastest allowed repeat interval
  const MIN_INTERVAL_MS = 40;

  // Set how quickly the repeat accelerates (smaller = faster acceleration)
  const ACCELERATION = 0.88;

  // Start the hold behavior (fire immediately then repeat)
  const startHold = () => {
    // Track the current interval so we can accelerate it over time
    let CURRENT_INTERVAL_MS = START_INTERVAL_MS;

    // Fire once immediately on press
    onStep();

    // After a short delay, begin repeating
    HOLD_DELAY_TIMER = setTimeout(() => {
      // Start repeating at the current interval
      REPEAT_INTERVAL_TIMER = setInterval(() => {
        // Run the step function
        onStep();

        // Accelerate repeat interval down to a minimum
        CURRENT_INTERVAL_MS = Math.max(MIN_INTERVAL_MS, CURRENT_INTERVAL_MS * ACCELERATION);

        // Restart the interval at the new faster speed
        clearInterval(REPEAT_INTERVAL_TIMER);
        REPEAT_INTERVAL_TIMER = setInterval(onStep, CURRENT_INTERVAL_MS);
      }, CURRENT_INTERVAL_MS);
    }, INITIAL_DELAY_MS);
  };

  // Stop the hold behavior and clear timers
  const stopHold = () => {
    // Cancel the delayed start if it hasn't fired yet
    clearTimeout(HOLD_DELAY_TIMER);

    // Cancel the repeating interval if it is running
    clearInterval(REPEAT_INTERVAL_TIMER);

    // Clear stored handles so state is clean
    HOLD_DELAY_TIMER = null;
    REPEAT_INTERVAL_TIMER = null;
  };

  /* MOUSE EVENTS */
  // Start hold-repeat on mouse down
  BUTTON.addEventListener("mousedown", (EVENT) => { EVENT.preventDefault(); startHold(); });

  // Stop hold-repeat on mouse up
  BUTTON.addEventListener("mouseup", stopHold);

  // Stop hold-repeat if the mouse leaves the button
  BUTTON.addEventListener("mouseleave", stopHold);

  /* TOUCH EVENTS */
  // Start hold-repeat on touch start (prevent default to avoid ghost behavior)
  BUTTON.addEventListener("touchstart", (EVENT) => { EVENT.preventDefault(); startHold(); }, { passive: false });

  // Stop hold-repeat on touch end
  BUTTON.addEventListener("touchend", stopHold);

  // Stop hold-repeat on touch cancel
  BUTTON.addEventListener("touchcancel", stopHold);
};

// Bind a slider and optional number input to a setting, plus optional steppers
S.bindSliderAndNumberInput = function bindSliderAndNumberInput(CONTROL_ID, applySettingValue, INITIAL_VALUE) {
  // Find the slider element by id
  const SLIDER = document.getElementById(CONTROL_ID);

  // Bail if the slider does not exist on this page
  if (!SLIDER) return false;

  // Find the matching number input box (optional)
  const NUMBER_INPUT = document.getElementById(CONTROL_ID + "_num");

  // Find the nearest control block wrapper for steppers (optional)
  const CONTROL_BLOCK = SLIDER.closest(".controlBlock");

  // Find stepper buttons inside this control block (optional)
  const STEP_BUTTONS = CONTROL_BLOCK ? CONTROL_BLOCK.querySelectorAll(".stepBtn[data-step]") : [];

  /* RANGE + STEP */
  // Read the minimum allowed value from the slider or number input
  const MIN_VALUE = Number(SLIDER.min || (NUMBER_INPUT && NUMBER_INPUT.min) || 0);

  // Read the maximum allowed value from the slider or number input
  const MAX_VALUE = Number(SLIDER.max || (NUMBER_INPUT && NUMBER_INPUT.max) || 10);

  // Read the raw step value from the slider or number input
  const RAW_STEP = Number(SLIDER.step || (NUMBER_INPUT && NUMBER_INPUT.step) || 1);

  // Use a safe default step size when step is missing or invalid
  const STEP_SIZE = Number.isFinite(RAW_STEP) && RAW_STEP > 0 ? RAW_STEP : 1;

  // Clamp an arbitrary value into the allowed min/max range
  const clampValue = (VALUE) => Math.min(MAX_VALUE, Math.max(MIN_VALUE, VALUE));

  // Snap an arbitrary value to the nearest step increment
  const snapToStep = (VALUE) => {
    // Compute the nearest step-aligned value
    const SNAPPED = MIN_VALUE + Math.round((VALUE - MIN_VALUE) / STEP_SIZE) * STEP_SIZE;

    // Compute how many decimals we need to preserve step precision
    const DECIMAL_PLACES = (String(STEP_SIZE).split(".")[1] || "").length;

    // Return a numeric value rounded to the correct precision
    return Number(SNAPPED.toFixed(DECIMAL_PLACES));
  };

  // Apply a value to UI + settings in a single place
  const applyValue = (VALUE) => {
    // Parse incoming value into a number
    VALUE = Number(VALUE);

    // Bail if the value is not a finite number
    if (!Number.isFinite(VALUE)) return;

    // Clamp and snap the value to the slider's step grid
    VALUE = snapToStep(clampValue(VALUE));

    // Write the slider value as a string
    SLIDER.value = String(VALUE);

    // Write the number input value as a string (if present)
    if (NUMBER_INPUT) NUMBER_INPUT.value = String(VALUE);

    // Write the value into the settings object via callback
    applySettingValue(VALUE);
  };

  // Nudge the value by one step in a direction (+1 or -1)
  const nudgeByStep = (DIRECTION) => applyValue(Number(SLIDER.value) + DIRECTION * STEP_SIZE);

  // Initialize the control with the provided value (or keep slider's current)
  applyValue(INITIAL_VALUE ?? SLIDER.value);

  // Wire slider input changes
  SLIDER.addEventListener("input", () => applyValue(SLIDER.value));

  // Wire number input changes (if present)
  if (NUMBER_INPUT) {
    NUMBER_INPUT.addEventListener("input", () => applyValue(NUMBER_INPUT.value));
    NUMBER_INPUT.addEventListener("change", () => applyValue(NUMBER_INPUT.value));
  }

  // Wire stepper buttons (if present)
  STEP_BUTTONS.forEach((BUTTON) => {
    // Read the direction from the step dataset attribute
    const DIRECTION = Number(BUTTON.dataset.step) || 0;

    // Skip buttons without a valid step direction
    if (!DIRECTION) return;

    // Enable hold-to-repeat behavior using the nudge function
    S.enableHoldToRepeat(BUTTON, () => nudgeByStep(DIRECTION));
  });

  // Return true so callers can know binding succeeded
  return true;
};

// Bind gravity controls only if they exist on the current page
S.initializeGravityControlsIfPresent = function initializeGravityControlsIfPresent() {
  // Skip binding when neither main control exists (page without the controller UI)
  if (
    !document.getElementById("ATTRACT_STRENGTH") &&
    !document.getElementById("REPEL_STRENGTH")
  ) {
    return;
  }

  /* ATTRACT CONTROLS */
  // Bind attraction strength slider to settings
  S.bindSliderAndNumberInput(
    "ATTRACT_STRENGTH",
    (VALUE) => (S.interactionSettings.attractStrength = VALUE),
    S.interactionSettings.attractStrength
  );

  // Bind attraction radius slider to settings
  S.bindSliderAndNumberInput(
    "ATTRACT_RADIUS",
    (VALUE) => (S.interactionSettings.attractRadius = VALUE),
    S.interactionSettings.attractRadius
  );

  // Bind attraction scale slider to settings
  S.bindSliderAndNumberInput(
    "ATTRACT_SCALE",
    (VALUE) => (S.interactionSettings.attractScale = VALUE),
    S.interactionSettings.attractScale
  );

  /* CLAMP CONTROL */
  // Bind clamp slider to settings
  S.bindSliderAndNumberInput(
    "CLAMP",
    (VALUE) => (S.interactionSettings.clamp = VALUE),
    S.interactionSettings.clamp
  );

  /* REPEL CONTROLS */
  // Bind repulsion strength slider to settings
  S.bindSliderAndNumberInput(
    "REPEL_STRENGTH",
    (VALUE) => (S.interactionSettings.repelStrength = VALUE),
    S.interactionSettings.repelStrength
  );

  // Bind repulsion radius slider to settings
  S.bindSliderAndNumberInput(
    "REPEL_RADIUS",
    (VALUE) => (S.interactionSettings.repelRadius = VALUE),
    S.interactionSettings.repelRadius
  );

  // Bind repulsion scale slider to settings
  S.bindSliderAndNumberInput(
    "REPEL_SCALE",
    (VALUE) => (S.interactionSettings.repelScale = VALUE),
    S.interactionSettings.repelScale
  );

  /* POKE CONTROL */
  // Bind poke strength slider to settings
  S.bindSliderAndNumberInput(
    "POKE_STRENGTH",
    (VALUE) => (S.interactionSettings.pokeStrength = VALUE),
    S.interactionSettings.pokeStrength
  );
};

// Wire UI bindings after the DOM is ready
document.addEventListener("DOMContentLoaded", S.initializeGravityControlsIfPresent);

/* #endregion 5) UI CONTROLS */



/*========================================*
//#region 6) RESIZE + ANIMATION
 *========================================*/

// Resize the canvas, recompute scaling, and rescale stars to match the new viewport
S.resizeStarfieldCanvas = function resizeStarfieldCanvas() {
  // Bail if canvas isn't active so we don't work with null refs
  if (!S.isCanvasReady) return;

  /* CAPTURE OLD STATE FOR RESCALE */
  // Capture old canvas width for position rescale
  const OLD_WIDTH = S.canvasWidth;

  // Capture old canvas height for position rescale
  const OLD_HEIGHT = S.canvasHeight;

  // Capture old perimeter for size rescale (fallback to 1 to avoid divide-by-zero)
  const OLD_SCREEN_PERIMETER = S.screenPerimeter || 1;

  /* READ NEW VIEWPORT SIZE */
  // Read current viewport width
  S.canvasWidth = window.innerWidth || 0;

  // Read current viewport height
  S.canvasHeight = window.innerHeight || 0;

  /* RESIZE CANVAS BACKING STORE */
  // Apply new canvas backing width
  S.constellationCanvas.width = S.canvasWidth;

  // Apply new canvas backing height
  S.constellationCanvas.height = S.canvasHeight;

  /* RECOMPUTE SCALING HELPERS */
  // Compute new screen perimeter proxy
  S.screenPerimeter = S.canvasWidth + S.canvasHeight;

  // Compute the scale-up curve used on larger screens
  S.screenScaleUp = Math.pow(S.screenPerimeter / 1200, 0.35);

  // Compute the scale-down curve used on smaller screens
  S.screenScaleDown = Math.pow(1200 / S.screenPerimeter, 0.35);

  /* RECOMPUTE CAPS */
  // Compute the star count cap (clamped for performance)
  S.starCountLimit = Math.min(300, S.screenScaleUp * 70);

  // Compute the maximum link distance for this screen size
  S.maxLinkDistance = S.screenScaleUp ** 7 * 300;
  S.goalLinkDistance = S.maxLinkDistance;

  /* RECOMPUTE PHYSICS SCALING POWERS */
  // Scale attraction radius behavior as screen grows
  S.screenScalePowers.attractionGradient = S.screenScaleUp ** 0.5;

  // Scale repulsion radius behavior as screen grows
  S.screenScalePowers.repulsionGradient = S.screenScaleUp ** 0.66;

  // Scale attraction falloff curve shaping as screen grows
  S.screenScalePowers.attractionShape = S.screenScaleUp ** -8.89;

  // Scale attraction force strength as screen grows
  S.screenScalePowers.attractionForce = S.screenScaleUp ** -6.46;

  // Scale repulsion force strength as screen grows
  S.screenScalePowers.repulsionForce = S.screenScaleUp ** -0.89;

  // Scale the global force clamp as screen grows
  S.screenScalePowers.forceClamp = S.screenScaleUp ** 1.8;

  /* RESCALE EXISTING STARS */
  // Rescale existing stars after resize so the layout stays consistent
  if (OLD_WIDTH !== 0 && OLD_HEIGHT !== 0 && S.starList.length) {
    // Compute X scale ratio from old canvas to new canvas
    const SCALE_X = S.canvasWidth / OLD_WIDTH;

    // Compute Y scale ratio from old canvas to new canvas
    const SCALE_Y = S.canvasHeight / OLD_HEIGHT;

    // Compute size scale ratio from old perimeter to new perimeter
    const SIZE_SCALE = S.screenPerimeter / OLD_SCREEN_PERIMETER;

    // Apply rescale to each star position and size
    for (const STAR of S.starList) {
      STAR.x *= SCALE_X;    // Scale star X into the new canvas space
      STAR.y *= SCALE_Y;    // Scale star Y into the new canvas space
      STAR.size *= SIZE_SCALE; // Scale star size to match new perimeter
    }
  }
};

// Run the main animation loop and call physics + rendering
function runAnimationLoop() {
  if (!S.isCanvasReady) return;

  // ✅ Only run physics if Active has installed it
  if (typeof S.updateStarPhysics === "function") {
    S.updateStarPhysics();
  }

  // ✅ Only run render if Active has installed it
  if (typeof S.renderStarsAndLinks === "function") {
    S.renderStarsAndLinks();
  }

  requestAnimationFrame(runAnimationLoop);
}

// Expose the loop so we can start/inspect it from the console
S._runAnimationLoop = runAnimationLoop;


/* #endregion 6) RESIZE + ANIMATION */



/*========================================*
//#region 7) BOOTSTRAP
 *========================================*/

// Return true when canvas size is stable enough to run the starfield
function isCanvasSizeUsable() {
  return (
    Number.isFinite(S.canvasWidth) &&   // Ensure width is a real number
    Number.isFinite(S.canvasHeight) &&  // Ensure height is a real number
    S.canvasWidth > 50 &&               // Ensure width is non-trivial
    S.canvasHeight > 50                 // Ensure height is non-trivial
  );
}

// Initialize the starfield once the canvas has usable dimensions
function startStarfield() {
  // Resize to the current viewport and compute scaling values
  S.resizeStarfieldCanvas();

  // Wait until sizes are stable/usable (mobile can report 0 briefly)
  if (!isCanvasSizeUsable()) {
    requestAnimationFrame(startStarfield);
    return;
  }

  /* STARS INIT */
  // Restore or create stars once
  if (!S.hasStarsInitialized) {
    S.hasStarsInitialized = true;
    S.restoreOrCreateStars();
  }

  /* START LOOP */
  // Start the animation loop once
  if (!S.hasAnimationLoopStarted) {
    S.hasAnimationLoopStarted = true;
    requestAnimationFrame(S._runAnimationLoop);
  }

  /* RESIZE LISTENER */
  // Wire resize listener once so the starfield stays in sync with viewport changes
  if (!S.hasResizeListenerWired) {
    S.hasResizeListenerWired = true;
    window.addEventListener("resize", S.resizeStarfieldCanvas);
  }
}

// Guard bootstrapping so unexpected errors don't kill the page
try {
  startStarfield();
} catch (ERROR) {
  console.error("Initialization error in Starfield Setup:", ERROR);
}

/* #endregion 7) BOOTSTRAP */