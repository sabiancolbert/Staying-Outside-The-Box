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
 *  Active S.js owns:
 *    Physics (updateStarPhysics)
 *    Rendering (renderStarsAndLinks)
 *    Pointer input (updatePointerSpeed + listeners)
 *==============================================================*/

//alert("Debug can"); // Optional debug tripwire: confirms this file loaded

/*========================================*
//#region 1) STARFIELD NAMESPACE + CANVAS
 *========================================*/

// Create the global STARFIELD namespace container
window.STARFIELD = {};

// Create the global keyboard impulse container used by the Active file each frame
window.KEYBOARD = { multX: 1, multY: 1, addX: 0, addY: 0 };

// Create a short alias for the STARFIELD namespace
var S = window.STARFIELD;

// Find the canvas element by id (required for the starfield)
S.constellationCanvas = document.getElementById("constellations");

// Get the 2D drawing context if canvas exists and supports getContext
S.drawingContext =
  S.constellationCanvas && S.constellationCanvas.getContext
    ? S.constellationCanvas.getContext("2d")
    : null;

// Record whether canvas drawing is actually available
S.isCanvasReady = !!(S.constellationCanvas && S.drawingContext);

// If the canvas is missing, warn and silently disable starfield behavior
if (!S.isCanvasReady) {
  console.warn("Constellation canvas not found or unsupported; starfield disabled.");
}

// Track whether the simulation should pause (ex: navigation / transitions)
S.isFrozen = false;

/* POINTER STATE (Active file updates these) */
// Track the current pointer position in client coordinates
S.pointerClientX = 0;

// Track the current pointer position in client coordinates
S.pointerClientY = 0;

// Track the last pointer timestamp baseline (perf-style ms)
S.lastPointerTimeMs = 0;

// Track the current pointer speed in normalized "energy" units
S.pointerSpeedUnits = 0;

// Track the poke impulse timer used by the poke burst
S.pokeImpulseTimer = 0;

// Track the ring timer used to animate the pointer ring
S.pointerRingTimer = 0;

/* CANVAS SIZING + SCALING (Setup owns resize) */
// Store the canvas pixel width
S.canvasWidth = 0;

// Store the canvas pixel height
S.canvasHeight = 0;

// Store the screen perimeter proxy used for scaling (width + height)
S.screenPerimeter = 0;

// Store the "scale up" factor used to grow values on large screens
S.screenScaleUp = 0;

// Store the "scale down" factor used to reduce values on small screens
S.screenScaleDown = 0;

// Store the computed maximum number of stars allowed for this screen size
S.starCountLimit = 0;

// Store the computed maximum link distance for this screen size
S.maxLinkDistance = 0;

/* PRECOMPUTED PHYSICS SCALING POWERS (Setup writes, Active reads) */
// Store scaling multipliers used by physics so physics stays screen-consistent
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
    // Save the star list under the legacy key for compatibility
    localStorage.setItem("constellationStars", JSON.stringify(S.starList));

    // Save meta info under the legacy key for compatibility
    localStorage.setItem(
      "constellationMeta",
      JSON.stringify({
        // Save canvas size so we can rescale stars on restore
        width: S.canvasWidth,

        // Save canvas size so we can rescale stars on restore
        height: S.canvasHeight,

        /* POINTER + TIMERS */
        // Save poke timer so poke resumes smoothly
        pokeTimer: S.pokeImpulseTimer,

        // Save pointer speed so motion energy resumes smoothly
        userSpeed: S.pointerSpeedUnits,

        // Save pointer X so the ring resumes at the right position
        userX: S.pointerClientX,

        // Save pointer Y so the ring resumes at the right position
        userY: S.pointerClientY,

        // Save pointer timing baseline (mostly legacy)
        userTime: S.lastPointerTimeMs,

        // Save ring timer so the ring resumes smoothly
        ringTimer: S.pointerRingTimer,

        /* UI PARAMS */
        // Save attraction strength slider value
        attractStrength: S.interactionSettings.attractStrength,

        // Save attraction radius slider value
        attractRadius: S.interactionSettings.attractRadius,

        // Save attraction curve slider value
        attractScale: S.interactionSettings.attractScale,

        // Save clamp slider value
        clamp: S.interactionSettings.clamp,

        // Save repulsion strength slider value
        repelStrength: S.interactionSettings.repelStrength,

        // Save repulsion radius slider value
        repelRadius: S.interactionSettings.repelRadius,

        // Save repulsion curve slider value
        repelScale: S.interactionSettings.repelScale,

        // Save poke strength slider value
        pokeStrength: S.interactionSettings.pokeStrength
      })
    );
  } catch (ERROR) {
    // Warn but do not crash if storage is blocked or full
    console.warn("Could not save stars:", ERROR);
  }
};

/* #endregion 2) STORAGE */



/*========================================*
//#region 3) UTILITIES
 *========================================*/

// Return a high-resolution timestamp in milliseconds when possible
S.getNowMs = function getNowMs() {
  // Prefer performance.now() for stable deltas, fallback to Date.now()
  return window.performance && performance.now ? performance.now() : Date.now();
};

/**
 * Safari timestamp normalization:
 * Convert pointer event timestamps into the same "perf-style ms" space as performance.now().
 */
S.normalizePointerTimestampMs = function normalizePointerTimestampMs(RAW_TIMESTAMP) {
  // If the timestamp is missing/invalid, use "now" so deltas stay safe
  if (!Number.isFinite(RAW_TIMESTAMP) || RAW_TIMESTAMP <= 0) return S.getNowMs();

  // If it's epoch-like, convert to perf-style using timeOrigin when available
  if (RAW_TIMESTAMP > 1e12) {
    // Use timeOrigin to translate epoch ms into performance.now ms space
    if (performance && Number.isFinite(performance.timeOrigin)) {
      return RAW_TIMESTAMP - performance.timeOrigin;
    }

    // Fallback to "now" if timeOrigin is unavailable
    return S.getNowMs();
  }

  // Otherwise it already looks perf-ish, return as-is
  return RAW_TIMESTAMP;
};

// Return a random float between MIN_VALUE and MAX_VALUE
S.randomBetween = (MIN_VALUE, MAX_VALUE) =>
  Math.random() * (MAX_VALUE - MIN_VALUE) + MIN_VALUE;

/** Return 0 at/beyond wrap threshold, 1 safely away from edges */
S.getEdgeFadeFactor = function getEdgeFadeFactor(STAR) {
  // Compute a "radius" that roughly matches how big the star draws
  const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

  // Measure padded distance to the left edge
  const DIST_LEFT = STAR.x + STAR_RADIUS;

  // Measure padded distance to the right edge
  const DIST_RIGHT = S.canvasWidth + STAR_RADIUS - STAR.x;

  // Measure padded distance to the top edge
  const DIST_TOP = STAR.y + STAR_RADIUS;

  // Measure padded distance to the bottom edge
  const DIST_BOTTOM = S.canvasHeight + STAR_RADIUS - STAR.y;

  // Find the closest edge distance (worst case)
  const MIN_EDGE_DISTANCE = Math.min(DIST_LEFT, DIST_RIGHT, DIST_TOP, DIST_BOTTOM);

  // Define a fade band (cap at 90px, scale slightly with screen)
  const FADE_BAND = Math.min(90, S.screenPerimeter * 0.03);

  // Convert distance into a 0..1 factor
  let T = MIN_EDGE_DISTANCE / FADE_BAND;

  // Clamp the factor to 0 at the low end
  if (T < 0) T = 0;

  // Clamp the factor to 1 at the high end
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

  // Attempt to read saved stars from localStorage
  let RAW_STARS_JSON = null;

  // Read the saved star JSON (storage can throw in private mode)
  try { RAW_STARS_JSON = localStorage.getItem("constellationStars"); } catch {}

  // If no save exists, create new stars and exit
  if (!RAW_STARS_JSON) {
    S.createNewStars();
    return;
  }

  try {
    // Parse saved star list
    const PARSED_STARS = JSON.parse(RAW_STARS_JSON);

    // Validate the parsed data before adopting it
    if (!Array.isArray(PARSED_STARS) || !PARSED_STARS.length) {
      S.createNewStars();
      return;
    }

    // Adopt saved stars (keep star object shape unchanged for compatibility)
    S.starList = PARSED_STARS;

    // Attempt to read saved meta from localStorage
    let RAW_META_JSON = null;

    // Read the meta JSON (storage can throw in private mode)
    try { RAW_META_JSON = localStorage.getItem("constellationMeta"); } catch {}

    // If no meta exists, keep stars but skip restoring UI/state
    if (!RAW_META_JSON) return;

    try {
      // Parse saved meta object
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
          STAR.x *= SCALE_X;
          STAR.y *= SCALE_Y;
          STAR.size *= SIZE_SCALE;
        }
      }

      /* RESTORE INTERACTION STATE */
      // Restore poke timer (or default to 0)
      S.pokeImpulseTimer = META.pokeTimer ?? 0;

      // Restore pointer speed (or default to 0)
      S.pointerSpeedUnits = META.userSpeed ?? 0;

      // Restore ring timer (or default to 0)
      S.pointerRingTimer = META.ringTimer ?? 0;

      /* RESTORE UI SETTINGS */
      // Restore attraction strength slider value (fallback to current)
      S.interactionSettings.attractStrength =
        META.attractStrength ?? S.interactionSettings.attractStrength;

      // Restore attraction radius slider value (fallback to current)
      S.interactionSettings.attractRadius =
        META.attractRadius ?? S.interactionSettings.attractRadius;

      // Restore attraction curve slider value (fallback to current)
      S.interactionSettings.attractScale =
        META.attractScale ?? S.interactionSettings.attractScale;

      // Restore clamp slider value (fallback to current)
      S.interactionSettings.clamp =
        META.clamp ?? S.interactionSettings.clamp;

      // Restore repulsion strength slider value (fallback to current)
      S.interactionSettings.repelStrength =
        META.repelStrength ?? S.interactionSettings.repelStrength;

      // Restore repulsion radius slider value (fallback to current)
      S.interactionSettings.repelRadius =
        META.repelRadius ?? S.interactionSettings.repelRadius;

      // Restore repulsion curve slider value (fallback to current)
      S.interactionSettings.repelScale =
        META.repelScale ?? S.interactionSettings.repelScale;

      // Restore poke strength slider value (fallback to current)
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
      // Warn but keep stars if meta is corrupted
      console.warn("Could not parse constellationMeta; skipping meta restore.", ERROR);
    }
  } catch (ERROR) {
    // Warn and regenerate if stars JSON is corrupted
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

  // Define the minimum allowed star size
  const MIN_SIZE = 3;

  // Define the maximum allowed star size (scaled by screen)
  const MAX_SIZE = S.screenPerimeter / 400 || 3;

  // Create each star object (keep fields stable for storage compatibility)
  for (let STAR_INDEX = 0; STAR_INDEX < S.starCountLimit; STAR_INDEX++) {
    S.starList.push({
      x: Math.random() * S.canvasWidth,                                        // Random start X
      y: Math.random() * S.canvasHeight,                                       // Random start Y
      vx: S.randomBetween(-0.25, 0.25),                                        // Passive drift X
      vy: S.randomBetween(-0.25, 0.25),                                        // Passive drift Y
      size: S.randomBetween(Math.min(MIN_SIZE, MAX_SIZE), Math.max(MIN_SIZE, MAX_SIZE)), // Base size
      opacity: S.randomBetween(0.005, 1.8),                                    // Start opacity for twinkle cycle
      fadeSpeed: S.randomBetween(1, 2.1),                                      // Twinkle fade speed
      redValue: S.randomBetween(50, 200),                                      // Redness used for darkness overlay
      whiteValue: 0,                                                           // White flash intensity
      momentumX: 0,                                                            // Accumulated momentum X
      momentumY: 0,                                                            // Accumulated momentum Y
      edge: 1,                                                                 // Cached edge fade factor
      keyboardForceX: 0,                                                       // Keyboard force X (legacy/optional)
      keyboardForceY: 0                                                        // Keyboard force Y (legacy/optional)
    });
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
  // Start hold-repeat on touch start (prevent default to avoid text selection / ghost clicks)
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

    // Re-emit input event so other listeners stay in sync
    SLIDER.dispatchEvent(new Event("input", { bubbles: true }));
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
  S.starCountLimit = Math.min(450, S.screenScaleDown * 126);

  // Compute the maximum link distance for this screen size
  S.maxLinkDistance = S.screenScaleUp ** 3 * 246;

  /* RECOMPUTE PHYSICS SCALING POWERS */
  // Scale attraction radius behavior as screen grows
  S.screenScalePowers.attractionGradient = S.screenScaleUp ** 1.11;

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
      STAR.x *= SCALE_X;
      STAR.y *= SCALE_Y;
      STAR.size *= SIZE_SCALE;
    }
  }
};

// Run the main animation loop and call physics + rendering
function runAnimationLoop(NOW) {
  // Bail if canvas isn't active so we don't draw into null context
  if (!S.isCanvasReady) return;

  // Throttle to reduce CPU on slow devices (skip frames under ~18ms)
  if (NOW - (S._lastFrameMs || 0) < 18) return requestAnimationFrame(runAnimationLoop);

  // Store last frame time for throttling comparisons
  S._lastFrameMs = NOW;

  /* PHYSICS */
  // Run physics update if not frozen and Active file has installed the function
  if (!S.isFrozen && typeof S.updateStarPhysics === "function") {
    S.updateStarPhysics();
  }

  /* RENDER */
  // Run render step if Active file has installed the function
  if (typeof S.renderStarsAndLinks === "function") {
    S.renderStarsAndLinks();
  }

  /* NEXT FRAME */
  // Schedule the next animation frame
  requestAnimationFrame(runAnimationLoop);
}

// Expose the loop for debugging hooks and legacy parity
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
    S._runAnimationLoop();
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