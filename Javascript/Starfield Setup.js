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

//alert("Debug can");

/*========================================*
//#region 1) STARFIELD NAMESPACE + CANVAS
 *========================================*/

window.STARFIELD = {};
window.KEYBOARD = { multX: 1, multY: 1, addX: 0, addY: 0 };
var S = window.STARFIELD;

  // Step 1: Find the canvas element
  S.constellationCanvas = document.getElementById("constellations");

  // Step 2: Get the 2D drawing context (if possible)
  S.drawingContext =
    S.constellationCanvas && S.constellationCanvas.getContext
      ? S.constellationCanvas.getContext("2d")
      : null;

  // Step 3: Record whether canvas drawing is actually available
  S.isCanvasReady = !!(S.constellationCanvas && S.drawingContext);

  // Step 4: If the canvas is missing, warn and silently disable starfield behavior
  if (!S.isCanvasReady) {
    console.warn("Constellation canvas not found or unsupported; starfield disabled.");
  }

  // Step 5: Runtime freeze flag (used when navigating away, etc.)
  S.isFrozen = false;

  // Step 6: Pointer state + interaction timers (Active file updates these)
  S.pointerClientX = 0;
  S.pointerClientY = 0;
  S.lastPointerTimeMs = 0; // perf-style timestamp
  S.pointerSpeedUnits = 0;

  S.pokeImpulseTimer = 0;
  S.pointerRingTimer = 0;

  // Step 7: Canvas sizing + scaling (Setup owns resize)
  S.canvasWidth = 0;
  S.canvasHeight = 0;
  S.screenPerimeter = 0;     // width + height
  S.screenScaleUp = 0;
  S.screenScaleDown = 0;
  S.starCountLimit = 0;
  S.maxLinkDistance = 0;

  // Step 8: Precomputed scaling powers (Setup writes, Physics reads)
  S.screenScalePowers = {
    attractionGradient: 1,
    repulsionGradient: 1,
    attractionShape: 1,
    attractionForce: 1,
    repulsionForce: 1,
    forceClamp: 1
  };

  // Step 9: Star data (array of star objects)
  S.starList = [];

  // Step 10: Bootstrap guards (prevent double-wiring)
  S.hasAnimationLoopStarted = false;
  S.hasResizeListenerWired = false;
  S.hasStarsInitialized = false;

/* #endregion 1) STARFIELD NAMESPACE + CANVAS */



/*========================================*
//#region 2) STORAGE (localStorage)
 *========================================*/

  S.saveStarfieldToStorage = function saveStarfieldToStorage() {
    // Step 1: If canvas isn't active, do nothing
    if (!S.isCanvasReady) return;

    try {
      // Step 2: Save stars (keep key name the same for compatibility)
      localStorage.setItem("constellationStars", JSON.stringify(S.starList));

      // Step 3: Save meta (keep field names the same for compatibility)
      localStorage.setItem(
        "constellationMeta",
        JSON.stringify({
          width: S.canvasWidth,
          height: S.canvasHeight,

          // pointer + timers
          pokeTimer: S.pokeImpulseTimer,
          userSpeed: S.pointerSpeedUnits,
          userX: S.pointerClientX,
          userY: S.pointerClientY,
          userTime: S.lastPointerTimeMs,
          ringTimer: S.pointerRingTimer,

          // UI params
          attractStrength: S.interactionSettings.attractStrength,
          attractRadius: S.interactionSettings.attractRadius,
          attractScale: S.interactionSettings.attractScale,
          clamp: S.interactionSettings.clamp,
          repelStrength: S.interactionSettings.repelStrength,
          repelRadius: S.interactionSettings.repelRadius,
          repelScale: S.interactionSettings.repelScale,
          pokeStrength: S.interactionSettings.pokeStrength
        })
      );
    } catch (ERROR) {
      console.warn("Could not save stars:", ERROR);
    }
  };

/* #endregion 2) STORAGE */



/*========================================*
//#region 3) UTILITIES
 *========================================*/

  S.getNowMs = function getNowMs() {
    // Step 1: Prefer performance.now() when available
    return window.performance && performance.now ? performance.now() : Date.now();
  };

  /**
   * Safari timestamp normalization:
   */
  S.normalizePointerTimestampMs = function normalizePointerTimestampMs(RAW_TIMESTAMP) {
    // Step 1: If the timestamp is missing/invalid, use "now"
    if (!Number.isFinite(RAW_TIMESTAMP) || RAW_TIMESTAMP <= 0) return S.getNowMs();

    // Step 2: If it's epoch-like, convert to perf-style using timeOrigin
    if (RAW_TIMESTAMP > 1e12) {
      if (performance && Number.isFinite(performance.timeOrigin)) {
        return RAW_TIMESTAMP - performance.timeOrigin;
      }
      return S.getNowMs();
    }

    // Step 3: Otherwise it already looks perf-ish, return as-is
    return RAW_TIMESTAMP;
  };

  S.randomBetween = (MIN_VALUE, MAX_VALUE) =>
    Math.random() * (MAX_VALUE - MIN_VALUE) + MIN_VALUE;

  /** 0 at/beyond wrap threshold, 1 safely away from edges */
  S.getEdgeFadeFactor = function getEdgeFadeFactor(STAR) {
    // Step 1: Compute a "radius" that roughly matches how big the star draws
    const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

    // Step 2: Measure distance to each edge
    const DIST_LEFT = STAR.x + STAR_RADIUS;
    const DIST_RIGHT = S.canvasWidth + STAR_RADIUS - STAR.x;
    const DIST_TOP = STAR.y + STAR_RADIUS;
    const DIST_BOTTOM = S.canvasHeight + STAR_RADIUS - STAR.y;

    // Step 3: Find the closest edge distance
    const MIN_EDGE_DISTANCE = Math.min(DIST_LEFT, DIST_RIGHT, DIST_TOP, DIST_BOTTOM);

    // Step 4: Define a fade band (cap at 90px, scale slightly with screen)
    const FADE_BAND = Math.min(90, S.screenPerimeter * 0.03);

    // Step 5: Convert distance into 0..1
    let T = MIN_EDGE_DISTANCE / FADE_BAND;
    if (T < 0) T = 0;
    if (T > 1) T = 1;

    // Step 6: Smoothstep (eases fade)
    return T * T * (3 - 2 * T);
  };

/* #endregion 3) UTILITIES */



/*========================================*
//#region 4) INIT: RESTORE OR CREATE STARS
 *========================================*/

  S.restoreOrCreateStars = function restoreOrCreateStars() {
    // Step 1: If canvas isn't active, do nothing
    if (!S.isCanvasReady) return;

    // Step 2: Attempt to load saved stars
    let RAW_STARS_JSON = null;
    try { RAW_STARS_JSON = localStorage.getItem("constellationStars"); } catch {}

    // Step 3: If no save exists, create new stars
    if (!RAW_STARS_JSON) {
      S.createNewStars();
      return;
    }

    try {
      // Step 4: Parse saved star list
      const PARSED_STARS = JSON.parse(RAW_STARS_JSON);
      if (!Array.isArray(PARSED_STARS) || !PARSED_STARS.length) {
        S.createNewStars();
        return;
      }

      // Step 5: Adopt saved stars (keep star object shape unchanged for compatibility)
      S.starList = PARSED_STARS;

      // Step 6: Attempt to load saved meta
      let RAW_META_JSON = null;
      try { RAW_META_JSON = localStorage.getItem("constellationMeta"); } catch {}

      // Step 7: If no meta, keep stars but skip restoring settings/state
      if (!RAW_META_JSON) return;

      try {
        const META = JSON.parse(RAW_META_JSON);

        // Step 8: Rescale stars to the current canvas (prevents “corner spawning” after resize)
        if (META.width > 0 && META.height > 0) {
          const SCALE_X = S.canvasWidth / META.width;
          const SCALE_Y = S.canvasHeight / META.height;
          const SIZE_SCALE = (S.canvasWidth + S.canvasHeight) / (META.width + META.height);

          for (const STAR of S.starList) {
            STAR.x *= SCALE_X;
            STAR.y *= SCALE_Y;
            STAR.size *= SIZE_SCALE;
          }
        }

        // Step 9: Restore interaction state
        S.pokeImpulseTimer = META.pokeTimer ?? 0;
        S.pointerSpeedUnits = META.userSpeed ?? 0;
        S.pointerRingTimer = META.ringTimer ?? 0;

        // Step 10: Restore UI settings
        S.interactionSettings.attractStrength = META.attractStrength ?? S.interactionSettings.attractStrength;
        S.interactionSettings.attractRadius   = META.attractRadius   ?? S.interactionSettings.attractRadius;
        S.interactionSettings.attractScale    = META.attractScale    ?? S.interactionSettings.attractScale;
        S.interactionSettings.clamp           = META.clamp           ?? S.interactionSettings.clamp;

        S.interactionSettings.repelStrength   = META.repelStrength   ?? S.interactionSettings.repelStrength;
        S.interactionSettings.repelRadius     = META.repelRadius     ?? S.interactionSettings.repelRadius;
        S.interactionSettings.repelScale      = META.repelScale      ?? S.interactionSettings.repelScale;

        S.interactionSettings.pokeStrength    = META.pokeStrength    ?? S.interactionSettings.pokeStrength;

        // Step 11: Restore pointer position (if stored)
        if (typeof META.userX === "number") S.pointerClientX = META.userX;
        if (typeof META.userY === "number") S.pointerClientY = META.userY;

        // Step 12: Reset pointer timing baseline to “now”
        S.lastPointerTimeMs = S.getNowMs();
      } catch (ERROR) {
        console.warn("Could not parse constellationMeta; skipping meta restore.", ERROR);
      }
    } catch (ERROR) {
      console.warn("Could not parse constellationStars; recreating.", ERROR);
      S.createNewStars();
    }
  };

  S.createNewStars = function createNewStars() {
    // Step 1: If canvas isn't active, do nothing
    if (!S.isCanvasReady) return;

    // Step 2: Clear any existing stars
    S.starList = [];

    // Step 3: Choose size range based on screen
    const MIN_SIZE = 3;
    const MAX_SIZE = S.screenPerimeter / 400 || 3;

    // Step 4: Create stars (keep star object fields unchanged for storage compatibility)
    for (let STAR_INDEX = 0; STAR_INDEX < S.starCountLimit; STAR_INDEX++) {
      S.starList.push({
        x: Math.random() * S.canvasWidth,
        y: Math.random() * S.canvasHeight,
        vx: S.randomBetween(-0.25, 0.25),
        vy: S.randomBetween(-0.25, 0.25),
        size: S.randomBetween(Math.min(MIN_SIZE, MAX_SIZE), Math.max(MIN_SIZE, MAX_SIZE)),
        opacity: S.randomBetween(0.005, 1.8),
        fadeSpeed: S.randomBetween(1, 2.1),
        redValue: S.randomBetween(50, 200),
        whiteValue: 0,
        momentumX: 0,
        momentumY: 0,
        edge: 1,
        keyboardForceX: 0,
        keyboardForceY: 0
      });
    }
  };

/* #endregion 4) INIT */



/*========================================*
//#region 5) UI CONTROLS (STEPPERS + BINDINGS)
 *========================================*/

  S.interactionSettings = {
    attractStrength: 50,
    attractRadius: 50,
    attractScale: 5,
    clamp: 5,

    repelStrength: 50,
    repelRadius: 50,
    repelScale: 5,

    pokeStrength: 5
  };

  S.enableHoldToRepeat = function enableHoldToRepeat(BUTTON, onStep) {
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

  S.bindSliderAndNumberInput = function bindSliderAndNumberInput(CONTROL_ID, applySettingValue, INITIAL_VALUE) {
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
      S.enableHoldToRepeat(BUTTON, () => nudgeByStep(DIRECTION));
    });

    return true;
  };

  S.initializeGravityControlsIfPresent = function initializeGravityControlsIfPresent() {
    // Step 1: if controls aren't present, skip binding
    if (
      !document.getElementById("ATTRACT_STRENGTH") &&
      !document.getElementById("REPEL_STRENGTH")
    ) {
      return;
    }

    // Step 2: bind each control to the settings object
    S.bindSliderAndNumberInput("ATTRACT_STRENGTH", (VALUE) => (S.interactionSettings.attractStrength = VALUE), S.interactionSettings.attractStrength);
    S.bindSliderAndNumberInput("ATTRACT_RADIUS",   (VALUE) => (S.interactionSettings.attractRadius   = VALUE), S.interactionSettings.attractRadius);
    S.bindSliderAndNumberInput("ATTRACT_SCALE",    (VALUE) => (S.interactionSettings.attractScale    = VALUE), S.interactionSettings.attractScale);

    S.bindSliderAndNumberInput("CLAMP",            (VALUE) => (S.interactionSettings.clamp           = VALUE), S.interactionSettings.clamp);

    S.bindSliderAndNumberInput("REPEL_STRENGTH",   (VALUE) => (S.interactionSettings.repelStrength   = VALUE), S.interactionSettings.repelStrength);
    S.bindSliderAndNumberInput("REPEL_RADIUS",     (VALUE) => (S.interactionSettings.repelRadius     = VALUE), S.interactionSettings.repelRadius);
    S.bindSliderAndNumberInput("REPEL_SCALE",      (VALUE) => (S.interactionSettings.repelScale      = VALUE), S.interactionSettings.repelScale);

    S.bindSliderAndNumberInput("POKE_STRENGTH",    (VALUE) => (S.interactionSettings.pokeStrength    = VALUE), S.interactionSettings.pokeStrength);
  };

  document.addEventListener("DOMContentLoaded", S.initializeGravityControlsIfPresent);

/* #endregion 5) UI CONTROLS */



/*========================================*
//#region 6) RESIZE + ANIMATION
 *========================================*/

  S.resizeStarfieldCanvas = function resizeStarfieldCanvas() {
    if (!S.isCanvasReady) return;

    // Step 1: capture old sizes for rescaling stars
    const OLD_WIDTH = S.canvasWidth;
    const OLD_HEIGHT = S.canvasHeight;
    const OLD_SCREEN_PERIMETER = S.screenPerimeter || 1;

    // Step 2: read current viewport size
    S.canvasWidth = window.innerWidth || 0;
    S.canvasHeight = window.innerHeight || 0;

    // Step 3: resize the canvas backing store
    S.constellationCanvas.width = S.canvasWidth;
    S.constellationCanvas.height = S.canvasHeight;

    // Step 4: compute scaling helpers
    S.screenPerimeter = S.canvasWidth + S.canvasHeight;
    S.screenScaleUp = Math.pow(S.screenPerimeter / 1200, 0.35);
    S.screenScaleDown = Math.pow(1200 / S.screenPerimeter, 0.35);
    
    // Step 5: compute star/link caps
    S.starCountLimit = Math.min(450, S.screenScaleDown * 126);
    S.maxLinkDistance = S.screenScaleUp * 246;

    // Step 6: compute physics scaling powers
    S.screenScalePowers.attractionGradient = S.screenScaleUp ** 1.11;
    S.screenScalePowers.repulsionGradient  = S.screenScaleUp ** 0.66;
    S.screenScalePowers.attractionShape    = S.screenScaleUp ** -8.89;
    S.screenScalePowers.attractionForce    = S.screenScaleUp ** -8.46;
    S.screenScalePowers.repulsionForce     = S.screenScaleUp ** -0.89;
    S.screenScalePowers.forceClamp         = S.screenScaleUp ** 1.8;

    // Step 7: rescale existing stars after resize (keeps layout consistent)
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

  function runAnimationLoop(NOW) {
    if (!S.isCanvasReady) return;
    
    if (NOW - (S._lastFrameMs || 0) < 60) return requestAnimationFrame(runAnimationLoop);
    S._lastFrameMs = NOW;

    // Step 1: physics update (unless frozen)
    if (!S.isFrozen && typeof S.updateStarPhysics === "function") {
      S.updateStarPhysics();
    }

    // Step 2: render
    if (typeof S.renderStarsAndLinks === "function") {
      S.renderStarsAndLinks();
    }

    // Step 3: schedule next frame
    requestAnimationFrame(runAnimationLoop);
  }

  // Expose for debugging (same idea as before)
  S._runAnimationLoop = runAnimationLoop;

/* #endregion 6) RESIZE + ANIMATION */



/*========================================*
//#region 7) BOOTSTRAP
 *========================================*/

  function isCanvasSizeUsable() {
    return (
      Number.isFinite(S.canvasWidth) &&
      Number.isFinite(S.canvasHeight) &&
      S.canvasWidth > 50 &&
      S.canvasHeight > 50
    );
  }

  function startStarfield() {
    // Step 1: resize to current viewport
    S.resizeStarfieldCanvas();

    // Step 2: wait until sizes are stable/usable (mobile can report 0 briefly)
    if (!isCanvasSizeUsable()) {
      requestAnimationFrame(startStarfield);
      return;
    }

    // Step 3: stars init (restore or create)
    if (!S.hasStarsInitialized) {
      S.hasStarsInitialized = true;
      S.restoreOrCreateStars();
    }

    // Step 4: start the animation loop once
    if (!S.hasAnimationLoopStarted) {
      S.hasAnimationLoopStarted = true;
      S._runAnimationLoop();
    }

    // Step 5: wire resize listener once
    if (!S.hasResizeListenerWired) {
      S.hasResizeListenerWired = true;
      window.addEventListener("resize", S.resizeStarfieldCanvas);
    }
  }

  try {
    startStarfield();
  } catch (ERROR) {
    console.error("Initialization error in Starfield Setup:", ERROR);
  }

/* #endregion 7) BOOTSTRAP */
