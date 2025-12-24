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



/*========================================*
//#region 1) STARFIELD NAMESPACE + CANVAS
 *========================================*/

window.STARFIELD = window.STARFIELD || {};

(() => {
  const STARFIELD = window.STARFIELD;

  // Step 1: Find the canvas element
  STARFIELD.constellationCanvas = document.getElementById("constellations");

  // Step 2: Get the 2D drawing context (if possible)
  STARFIELD.drawingContext =
    STARFIELD.constellationCanvas && STARFIELD.constellationCanvas.getContext
      ? STARFIELD.constellationCanvas.getContext("2d")
      : null;

  // Step 3: Record whether canvas drawing is actually available
  STARFIELD.isCanvasReady = !!(STARFIELD.constellationCanvas && STARFIELD.drawingContext);

  // Step 4: If the canvas is missing, warn and silently disable starfield behavior
  if (!STARFIELD.isCanvasReady) {
    console.warn("Constellation canvas not found or unsupported; starfield disabled.");
  }

  // Step 5: Runtime freeze flag (used when navigating away, etc.)
  STARFIELD.isFrozen = false;

  // Step 6: Pointer state + interaction timers (Active file updates these)
  STARFIELD.pointerClientX = 0;
  STARFIELD.pointerClientY = 0;
  STARFIELD.lastPointerTimeMs = 0; // perf-style timestamp
  STARFIELD.pointerSpeedUnits = 0;

  STARFIELD.pokeImpulseTimer = 0;
  STARFIELD.pointerRingTimer = 0;

  // Step 7: Canvas sizing + scaling (Setup owns resize)
  STARFIELD.canvasWidth = 0;
  STARFIELD.canvasHeight = 0;
  STARFIELD.screenPerimeter = 0;     // width + height
  STARFIELD.screenScale = 0;         // main scale factor
  STARFIELD.starCountLimit = 0;
  STARFIELD.maxLinkDistance = 0;

  // Step 8: Precomputed scaling powers (Setup writes, Physics reads)
  STARFIELD.screenScalePowers = {
    attractionGradient: 1,
    repulsionGradient: 1,
    attractionShape: 1,
    attractionForce: 1,
    repulsionForce: 1,
    forceClamp: 1
  };

  // Step 9: Star data (array of star objects)
  STARFIELD.starList = [];

  // Step 10: Bootstrap guards (prevent double-wiring)
  STARFIELD.hasAnimationLoopStarted = false;
  STARFIELD.hasResizeListenerWired = false;
  STARFIELD.hasStarsInitialized = false;
})();

/* #endregion 1) STARFIELD NAMESPACE + CANVAS */



/*========================================*
//#region 2) STORAGE (localStorage)
 *========================================*/

(() => {
  const STARFIELD = window.STARFIELD;

  STARFIELD.saveStarfieldToStorage = function saveStarfieldToStorage() {
    // Step 1: If canvas isn't active, do nothing
    if (!STARFIELD.isCanvasReady) return;

    try {
      // Step 2: Save stars (keep key name the same for compatibility)
      localStorage.setItem("constellationStars", JSON.stringify(STARFIELD.starList));

      // Step 3: Save meta (keep field names the same for compatibility)
      localStorage.setItem(
        "constellationMeta",
        JSON.stringify({
          width: STARFIELD.canvasWidth,
          height: STARFIELD.canvasHeight,

          // pointer + timers
          pokeTimer: STARFIELD.pokeImpulseTimer,
          userSpeed: STARFIELD.pointerSpeedUnits,
          userX: STARFIELD.pointerClientX,
          userY: STARFIELD.pointerClientY,
          userTime: STARFIELD.lastPointerTimeMs,
          ringTimer: STARFIELD.pointerRingTimer,

          // UI params
          attractStrength: STARFIELD.interactionSettings.attractStrength,
          attractRadius: STARFIELD.interactionSettings.attractRadius,
          attractScale: STARFIELD.interactionSettings.attractScale,
          clamp: STARFIELD.interactionSettings.clamp,
          repelStrength: STARFIELD.interactionSettings.repelStrength,
          repelRadius: STARFIELD.interactionSettings.repelRadius,
          repelScale: STARFIELD.interactionSettings.repelScale,
          pokeStrength: STARFIELD.interactionSettings.pokeStrength
        })
      );
    } catch (ERROR) {
      console.warn("Could not save stars:", ERROR);
    }
  };
})();

/* #endregion 2) STORAGE */



/*========================================*
//#region 3) UTILITIES
 *========================================*/

(() => {
  const STARFIELD = window.STARFIELD;

  STARFIELD.getNowMs = function getNowMs() {
    // Step 1: Prefer performance.now() when available
    return window.performance && performance.now ? performance.now() : Date.now();
  };

  /**
   * Safari timestamp normalization:
   * Some browsers give epoch-ish event.timeStamp, others perf-ish, some 0.
   * Output is always perf.now()-style.
   */
  STARFIELD.normalizePointerTimestampMs = function normalizePointerTimestampMs(RAW_TIMESTAMP) {
    // Step 1: If the timestamp is missing/invalid, use "now"
    if (!Number.isFinite(RAW_TIMESTAMP) || RAW_TIMESTAMP <= 0) return STARFIELD.getNowMs();

    // Step 2: If it's epoch-like, convert to perf-style using timeOrigin
    if (RAW_TIMESTAMP > 1e12) {
      if (performance && Number.isFinite(performance.timeOrigin)) {
        return RAW_TIMESTAMP - performance.timeOrigin;
      }
      return STARFIELD.getNowMs();
    }

    // Step 3: Otherwise it already looks perf-ish, return as-is
    return RAW_TIMESTAMP;
  };

  STARFIELD.randomBetween = (MIN_VALUE, MAX_VALUE) =>
    Math.random() * (MAX_VALUE - MIN_VALUE) + MIN_VALUE;

  /** 0 at/beyond wrap threshold, 1 safely away from edges */
  STARFIELD.getEdgeFadeFactor = function getEdgeFadeFactor(STAR) {
    // Step 1: Compute a "radius" that roughly matches how big the star draws
    const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

    // Step 2: Measure distance to each edge
    const DIST_LEFT = STAR.x + STAR_RADIUS;
    const DIST_RIGHT = STARFIELD.canvasWidth + STAR_RADIUS - STAR.x;
    const DIST_TOP = STAR.y + STAR_RADIUS;
    const DIST_BOTTOM = STARFIELD.canvasHeight + STAR_RADIUS - STAR.y;

    // Step 3: Find the closest edge distance
    const MIN_EDGE_DISTANCE = Math.min(DIST_LEFT, DIST_RIGHT, DIST_TOP, DIST_BOTTOM);

    // Step 4: Define a fade band (cap at 90px, scale slightly with screen)
    const FADE_BAND = Math.min(90, STARFIELD.screenPerimeter * 0.03);

    // Step 5: Convert distance into 0..1
    let T = MIN_EDGE_DISTANCE / FADE_BAND;
    if (T < 0) T = 0;
    if (T > 1) T = 1;

    // Step 6: Smoothstep (eases fade)
    return T * T * (3 - 2 * T);
  };
})();

/* #endregion 3) UTILITIES */



/*========================================*
//#region 4) INIT: RESTORE OR CREATE STARS
 *========================================*/

(() => {
  const STARFIELD = window.STARFIELD;

  STARFIELD.restoreOrCreateStars = function restoreOrCreateStars() {
    // Step 1: If canvas isn't active, do nothing
    if (!STARFIELD.isCanvasReady) return;

    // Step 2: Attempt to load saved stars
    let RAW_STARS_JSON = null;
    try { RAW_STARS_JSON = localStorage.getItem("constellationStars"); } catch {}

    // Step 3: If no save exists, create new stars
    if (!RAW_STARS_JSON) {
      STARFIELD.createNewStars();
      return;
    }

    try {
      // Step 4: Parse saved star list
      const PARSED_STARS = JSON.parse(RAW_STARS_JSON);
      if (!Array.isArray(PARSED_STARS) || !PARSED_STARS.length) {
        STARFIELD.createNewStars();
        return;
      }

      // Step 5: Adopt saved stars (keep star object shape unchanged for compatibility)
      STARFIELD.starList = PARSED_STARS;

      // Step 6: Attempt to load saved meta
      let RAW_META_JSON = null;
      try { RAW_META_JSON = localStorage.getItem("constellationMeta"); } catch {}

      // Step 7: If no meta, keep stars but skip restoring settings/state
      if (!RAW_META_JSON) return;

      try {
        const META = JSON.parse(RAW_META_JSON);

        // Step 8: Rescale stars to the current canvas (prevents “corner spawning” after resize)
        if (META.width > 0 && META.height > 0) {
          const SCALE_X = STARFIELD.canvasWidth / META.width;
          const SCALE_Y = STARFIELD.canvasHeight / META.height;
          const SIZE_SCALE = (STARFIELD.canvasWidth + STARFIELD.canvasHeight) / (META.width + META.height);

          for (const STAR of STARFIELD.starList) {
            STAR.x *= SCALE_X;
            STAR.y *= SCALE_Y;
            STAR.size *= SIZE_SCALE;
          }
        }

        // Step 9: Restore interaction state
        STARFIELD.pokeImpulseTimer = META.pokeTimer ?? 0;
        STARFIELD.pointerSpeedUnits = META.userSpeed ?? 0;
        STARFIELD.pointerRingTimer = META.ringTimer ?? 0;

        // Step 10: Restore UI settings
        STARFIELD.interactionSettings.attractStrength = META.attractStrength ?? STARFIELD.interactionSettings.attractStrength;
        STARFIELD.interactionSettings.attractRadius   = META.attractRadius   ?? STARFIELD.interactionSettings.attractRadius;
        STARFIELD.interactionSettings.attractScale    = META.attractScale    ?? STARFIELD.interactionSettings.attractScale;
        STARFIELD.interactionSettings.clamp           = META.clamp           ?? STARFIELD.interactionSettings.clamp;

        STARFIELD.interactionSettings.repelStrength   = META.repelStrength   ?? STARFIELD.interactionSettings.repelStrength;
        STARFIELD.interactionSettings.repelRadius     = META.repelRadius     ?? STARFIELD.interactionSettings.repelRadius;
        STARFIELD.interactionSettings.repelScale      = META.repelScale      ?? STARFIELD.interactionSettings.repelScale;

        STARFIELD.interactionSettings.pokeStrength    = META.pokeStrength    ?? STARFIELD.interactionSettings.pokeStrength;

        // Step 11: Restore pointer position (if stored)
        if (typeof META.userX === "number") STARFIELD.pointerClientX = META.userX;
        if (typeof META.userY === "number") STARFIELD.pointerClientY = META.userY;

        // Step 12: Reset pointer timing baseline to “now”
        STARFIELD.lastPointerTimeMs = STARFIELD.getNowMs();
      } catch (ERROR) {
        console.warn("Could not parse constellationMeta; skipping meta restore.", ERROR);
      }
    } catch (ERROR) {
      console.warn("Could not parse constellationStars; recreating.", ERROR);
      STARFIELD.createNewStars();
    }
  };

  STARFIELD.createNewStars = function createNewStars() {
    // Step 1: If canvas isn't active, do nothing
    if (!STARFIELD.isCanvasReady) return;

    // Step 2: Clear any existing stars
    STARFIELD.starList = [];

    // Step 3: Choose size range based on screen
    const MIN_SIZE = 3;
    const MAX_SIZE = STARFIELD.screenPerimeter / 400 || 3;

    // Step 4: Create stars (keep star object fields unchanged for storage compatibility)
    for (let STAR_INDEX = 0; STAR_INDEX < STARFIELD.starCountLimit; STAR_INDEX++) {
      STARFIELD.starList.push({
        x: Math.random() * STARFIELD.canvasWidth,
        y: Math.random() * STARFIELD.canvasHeight,
        vx: STARFIELD.randomBetween(-0.25, 0.25),
        vy: STARFIELD.randomBetween(-0.25, 0.25),
        size: STARFIELD.randomBetween(Math.min(MIN_SIZE, MAX_SIZE), Math.max(MIN_SIZE, MAX_SIZE)),
        opacity: STARFIELD.randomBetween(0.005, 1.8),
        fadeSpeed: STARFIELD.randomBetween(1, 2.1),
        redValue: STARFIELD.randomBetween(100, 200),
        whiteValue: 0,
        momentumX: 0,
        momentumY: 0,
        edge: 1,
        keyboardForceX: 0,
        keyboardForceY: 0
      });
    }
  };
})();

/* #endregion 4) INIT */



/*========================================*
//#region 5) UI CONTROLS (STEPPERS + BINDINGS)
 *========================================*/

(() => {
  const STARFIELD = window.STARFIELD;

  STARFIELD.interactionSettings = {
    attractStrength: 50,
    attractRadius: 50,
    attractScale: 5,
    clamp: 5,

    repelStrength: 50,
    repelRadius: 50,
    repelScale: 5,

    pokeStrength: 5
  };

  STARFIELD.enableHoldToRepeat = function enableHoldToRepeat(BUTTON, onStep) {
    let HOLD_DELAY_TIMER = null;
    let REPEAT_INTERVAL_TIMER = null;

    const INITIAL_DELAY_MS = 350;
    const START_INTERVAL_MS = 120;
    const MIN_INTERVAL_MS = 40;
    const ACCELERATION = 0.88;

    const startHold = () => {
      let CURRENT_INTERVAL_MS = START_INTERVAL_MS;

      // Step 1: fire once immediately
      onStep();

      // Step 2: after a short delay, begin repeating
      HOLD_DELAY_TIMER = setTimeout(() => {
        REPEAT_INTERVAL_TIMER = setInterval(() => {
          // Step 3: run the step
          onStep();

          // Step 4: accelerate repeat interval down to a minimum
          CURRENT_INTERVAL_MS = Math.max(MIN_INTERVAL_MS, CURRENT_INTERVAL_MS * ACCELERATION);

          // Step 5: restart interval at the new faster speed
          clearInterval(REPEAT_INTERVAL_TIMER);
          REPEAT_INTERVAL_TIMER = setInterval(onStep, CURRENT_INTERVAL_MS);
        }, CURRENT_INTERVAL_MS);
      }, INITIAL_DELAY_MS);
    };

    const stopHold = () => {
      clearTimeout(HOLD_DELAY_TIMER);
      clearInterval(REPEAT_INTERVAL_TIMER);
      HOLD_DELAY_TIMER = null;
      REPEAT_INTERVAL_TIMER = null;
    };

    // Mouse
    BUTTON.addEventListener("mousedown", (EVENT) => { EVENT.preventDefault(); startHold(); });
    BUTTON.addEventListener("mouseup", stopHold);
    BUTTON.addEventListener("mouseleave", stopHold);

    // Touch
    BUTTON.addEventListener("touchstart", (EVENT) => { EVENT.preventDefault(); startHold(); }, { passive: false });
    BUTTON.addEventListener("touchend", stopHold);
    BUTTON.addEventListener("touchcancel", stopHold);
  };

  STARFIELD.bindSliderAndNumberInput = function bindSliderAndNumberInput(CONTROL_ID, applySettingValue, INITIAL_VALUE) {
    const SLIDER = document.getElementById(CONTROL_ID);
    if (!SLIDER) return false;

    const NUMBER_INPUT = document.getElementById(CONTROL_ID + "_num");

    const CONTROL_BLOCK = SLIDER.closest(".controlBlock");
    const STEP_BUTTONS = CONTROL_BLOCK ? CONTROL_BLOCK.querySelectorAll(".stepBtn[data-step]") : [];

    const MIN_VALUE = Number(SLIDER.min || (NUMBER_INPUT && NUMBER_INPUT.min) || 0);
    const MAX_VALUE = Number(SLIDER.max || (NUMBER_INPUT && NUMBER_INPUT.max) || 10);

    const RAW_STEP = Number(SLIDER.step || (NUMBER_INPUT && NUMBER_INPUT.step) || 1);
    const STEP_SIZE = Number.isFinite(RAW_STEP) && RAW_STEP > 0 ? RAW_STEP : 1;

    const clampValue = (VALUE) => Math.min(MAX_VALUE, Math.max(MIN_VALUE, VALUE));

    const snapToStep = (VALUE) => {
      const SNAPPED = MIN_VALUE + Math.round((VALUE - MIN_VALUE) / STEP_SIZE) * STEP_SIZE;
      const DECIMAL_PLACES = (String(STEP_SIZE).split(".")[1] || "").length;
      return Number(SNAPPED.toFixed(DECIMAL_PLACES));
    };

    const applyValue = (VALUE) => {
      // Step 1: parse and validate
      VALUE = Number(VALUE);
      if (!Number.isFinite(VALUE)) return;

      // Step 2: clamp and snap to step
      VALUE = snapToStep(clampValue(VALUE));

      // Step 3: write UI values
      SLIDER.value = String(VALUE);
      if (NUMBER_INPUT) NUMBER_INPUT.value = String(VALUE);

      // Step 4: write into settings
      applySettingValue(VALUE);

      // Step 5: re-emit input event (keeps any other listeners in sync)
      SLIDER.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const nudgeByStep = (DIRECTION) => applyValue(Number(SLIDER.value) + DIRECTION * STEP_SIZE);

    // Step 6: initialize with provided value (or slider's current)
    applyValue(INITIAL_VALUE ?? SLIDER.value);

    // Step 7: wire slider input
    SLIDER.addEventListener("input", () => applyValue(SLIDER.value));

    // Step 8: wire number box (if present)
    if (NUMBER_INPUT) {
      NUMBER_INPUT.addEventListener("input", () => applyValue(NUMBER_INPUT.value));
      NUMBER_INPUT.addEventListener("change", () => applyValue(NUMBER_INPUT.value));
    }

    // Step 9: wire stepper buttons (if present)
    STEP_BUTTONS.forEach((BUTTON) => {
      const DIRECTION = Number(BUTTON.dataset.step) || 0;
      if (!DIRECTION) return;
      STARFIELD.enableHoldToRepeat(BUTTON, () => nudgeByStep(DIRECTION));
    });

    return true;
  };

  STARFIELD.initializeGravityControlsIfPresent = function initializeGravityControlsIfPresent() {
    // Step 1: if controls aren't present, skip binding
    if (
      !document.getElementById("ATTRACT_STRENGTH") &&
      !document.getElementById("REPEL_STRENGTH")
    ) {
      return;
    }

    // Step 2: bind each control to the settings object
    STARFIELD.bindSliderAndNumberInput("ATTRACT_STRENGTH", (VALUE) => (STARFIELD.interactionSettings.attractStrength = VALUE), STARFIELD.interactionSettings.attractStrength);
    STARFIELD.bindSliderAndNumberInput("ATTRACT_RADIUS",   (VALUE) => (STARFIELD.interactionSettings.attractRadius   = VALUE), STARFIELD.interactionSettings.attractRadius);
    STARFIELD.bindSliderAndNumberInput("ATTRACT_SCALE",    (VALUE) => (STARFIELD.interactionSettings.attractScale    = VALUE), STARFIELD.interactionSettings.attractScale);

    STARFIELD.bindSliderAndNumberInput("CLAMP",            (VALUE) => (STARFIELD.interactionSettings.clamp           = VALUE), STARFIELD.interactionSettings.clamp);

    STARFIELD.bindSliderAndNumberInput("REPEL_STRENGTH",   (VALUE) => (STARFIELD.interactionSettings.repelStrength   = VALUE), STARFIELD.interactionSettings.repelStrength);
    STARFIELD.bindSliderAndNumberInput("REPEL_RADIUS",     (VALUE) => (STARFIELD.interactionSettings.repelRadius     = VALUE), STARFIELD.interactionSettings.repelRadius);
    STARFIELD.bindSliderAndNumberInput("REPEL_SCALE",      (VALUE) => (STARFIELD.interactionSettings.repelScale      = VALUE), STARFIELD.interactionSettings.repelScale);

    STARFIELD.bindSliderAndNumberInput("POKE_STRENGTH",    (VALUE) => (STARFIELD.interactionSettings.pokeStrength    = VALUE), STARFIELD.interactionSettings.pokeStrength);
  };

  document.addEventListener("DOMContentLoaded", STARFIELD.initializeGravityControlsIfPresent);
})();

/* #endregion 5) UI CONTROLS */



/*========================================*
//#region 6) RESIZE + ANIMATION
 *========================================*/

(() => {
  const STARFIELD = window.STARFIELD;

  STARFIELD.resizeStarfieldCanvas = function resizeStarfieldCanvas() {
    if (!STARFIELD.isCanvasReady) return;

    // Step 1: capture old sizes for rescaling stars
    const OLD_WIDTH = STARFIELD.canvasWidth;
    const OLD_HEIGHT = STARFIELD.canvasHeight;
    const OLD_SCREEN_PERIMETER = STARFIELD.screenPerimeter || 1;

    // Step 2: read current viewport size
    STARFIELD.canvasWidth = window.innerWidth || 0;
    STARFIELD.canvasHeight = window.innerHeight || 0;

    // Step 3: resize the canvas backing store
    STARFIELD.constellationCanvas.width = STARFIELD.canvasWidth;
    STARFIELD.constellationCanvas.height = STARFIELD.canvasHeight;

    // Step 4: compute scaling helpers
    STARFIELD.screenPerimeter = STARFIELD.canvasWidth + STARFIELD.canvasHeight;
    STARFIELD.screenScale = Math.pow(STARFIELD.screenPerimeter / 1200, 0.35);

    // Step 5: compute star/link caps
    STARFIELD.starCountLimit = Math.min(450, STARFIELD.screenPerimeter / 10);
    STARFIELD.maxLinkDistance = STARFIELD.screenPerimeter / 5;

    // Step 6: compute physics scaling powers
    STARFIELD.screenScalePowers.attractionGradient = STARFIELD.screenScale ** 1.11;
    STARFIELD.screenScalePowers.repulsionGradient  = STARFIELD.screenScale ** 0.66;
    STARFIELD.screenScalePowers.attractionShape    = STARFIELD.screenScale ** -8.89;
    STARFIELD.screenScalePowers.attractionForce    = STARFIELD.screenScale ** -8.46;
    STARFIELD.screenScalePowers.repulsionForce     = STARFIELD.screenScale ** -0.89;
    STARFIELD.screenScalePowers.forceClamp         = STARFIELD.screenScale ** 1.8;

    // Step 7: rescale existing stars after resize (keeps layout consistent)
    if (OLD_WIDTH !== 0 && OLD_HEIGHT !== 0 && STARFIELD.starList.length) {
      const SCALE_X = STARFIELD.canvasWidth / OLD_WIDTH;
      const SCALE_Y = STARFIELD.canvasHeight / OLD_HEIGHT;
      const SIZE_SCALE = STARFIELD.screenPerimeter / OLD_SCREEN_PERIMETER;

      for (const STAR of STARFIELD.starList) {
        STAR.x *= SCALE_X;
        STAR.y *= SCALE_Y;
        STAR.size *= SIZE_SCALE;
      }
    }
  };

  function runAnimationLoop() {
    if (!STARFIELD.isCanvasReady) return;

    // Step 1: physics update (unless frozen)
    if (!STARFIELD.isFrozen && typeof STARFIELD.updateStarPhysics === "function") {
      STARFIELD.updateStarPhysics();
    }

    // Step 2: render
    if (typeof STARFIELD.renderStarsAndLinks === "function") {
      STARFIELD.renderStarsAndLinks();
    }

    // Step 3: schedule next frame
    requestAnimationFrame(runAnimationLoop);
  }

  // Expose for debugging (same idea as before)
  STARFIELD._runAnimationLoop = runAnimationLoop;
})();

/* #endregion 6) RESIZE + ANIMATION */



/*========================================*
//#region 7) BOOTSTRAP
 *========================================*/

(() => {
  const STARFIELD = window.STARFIELD;

  function isCanvasSizeUsable() {
    return (
      Number.isFinite(STARFIELD.canvasWidth) &&
      Number.isFinite(STARFIELD.canvasHeight) &&
      STARFIELD.canvasWidth > 50 &&
      STARFIELD.canvasHeight > 50
    );
  }

  function startStarfield() {
    // Step 1: resize to current viewport
    STARFIELD.resizeStarfieldCanvas();

    // Step 2: wait until sizes are stable/usable (mobile can report 0 briefly)
    if (!isCanvasSizeUsable()) {
      requestAnimationFrame(startStarfield);
      return;
    }

    // Step 3: stars init (restore or create)
    if (!STARFIELD.hasStarsInitialized) {
      STARFIELD.hasStarsInitialized = true;
      STARFIELD.restoreOrCreateStars();
    }

    // Step 4: start the animation loop once
    if (!STARFIELD.hasAnimationLoopStarted) {
      STARFIELD.hasAnimationLoopStarted = true;
      STARFIELD._runAnimationLoop();
    }

    // Step 5: wire resize listener once
    if (!STARFIELD.hasResizeListenerWired) {
      STARFIELD.hasResizeListenerWired = true;
      window.addEventListener("resize", STARFIELD.resizeStarfieldCanvas);
    }
  }

  try {
    startStarfield();
  } catch (ERROR) {
    console.error("Initialization error in Starfield Setup:", ERROR);
  }
})();

/* #endregion 7) BOOTSTRAP */
