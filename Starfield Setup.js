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
 *    Physics (moveStars)
 *    Rendering (drawStarsWithLines)
 *    Pointer input (updateSpeed + listeners)
 *==============================================================*/


//#region 1) STARFIELD NAMESPACE + CANVAS
/*========================================*
 *  1) STARFIELD NAMESPACE + CANVAS
 *========================================*/

window.STARFIELD = window.STARFIELD || {};

(() => {
  const SF = window.STARFIELD;

  // Canvas wiring
  SF.canvas = document.getElementById("constellations");
  SF.brush = SF.canvas && SF.canvas.getContext ? SF.canvas.getContext("2d") : null;
  SF.hasCanvas = !!(SF.canvas && SF.brush);

  if (!SF.hasCanvas) {
    console.warn("Constellation canvas not found or unsupported; starfield disabled.");
  }

  // Runtime flag
  SF.freeze = false;

  // Pointer state + timers (Active updates these)
  SF.pointerX = 0;
  SF.pointerY = 0;
  SF.pointerTime = 0; // perf-style timestamp
  SF.pointerSpeed = 0;

  SF.pokeTimer = 0;
  SF.ringTimer = 0;

  // Canvas sizing + scaling (Setup owns resize)
  SF.w = 0;
  SF.h = 0;
  SF.screenSum = 0;       // w + h
  SF.scaleToScreen = 0;   // main scale factor
  SF.maxStars = 0;
  SF.maxLinkDist = 0;

  // Precomputed scaling powers (Setup writes, Physics reads)
  SF.scalePow = {
    attGrad: 1,
    repGrad: 1,
    attShape: 1,
    att: 1,
    rep: 1,
    limit: 1
  };

  // Star data
  SF.stars = [];

  // Bootstrap guards
  SF._animStarted = false;
  SF._resizeWired = false;
  SF._starsInit = false;

  // Debug toggles
  SF.debug = {
    enabled: true
  };
})();

/* #endregion 1) STARFIELD NAMESPACE + CANVAS */



//#region 2) STORAGE (localStorage)
/*========================================*
 *  2) STORAGE
 *========================================*/

(() => {
  const SF = window.STARFIELD;

  SF.saveToStorage = function saveToStorage() {
    if (!SF.hasCanvas) return;

    try {
      localStorage.setItem("constellationStars", JSON.stringify(SF.stars));

      localStorage.setItem(
        "constellationMeta",
        JSON.stringify({
          width: SF.w,
          height: SF.h,

          // pointer + timers
          pokeTimer: SF.pokeTimer,
          userSpeed: SF.pointerSpeed,
          userX: SF.pointerX,
          userY: SF.pointerY,
          userTime: SF.pointerTime,
          ringTimer: SF.ringTimer,

          // UI params
          attractStrength: SF.params.attractStrength,
          attractRadius: SF.params.attractRadius,
          attractScale: SF.params.attractScale,
          clamp: SF.params.clamp,
          repelStrength: SF.params.repelStrength,
          repelRadius: SF.params.repelRadius,
          repelScale: SF.params.repelScale,
          pokeStrength: SF.params.pokeStrength
        })
      );
    } catch (ERR) {
      console.warn("Could not save stars:", ERR);
    }
  };
})();

/* #endregion 2) STORAGE */



//#region 3) UTILITIES
/*========================================*
 *  3) UTILITIES
 *========================================*/

(() => {
  const SF = window.STARFIELD;

  SF.nowMs = function nowMs() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  };

  /**
   * Safari timestamp normalization:
   * Some browsers give epoch-ish event.timeStamp, others perf-ish, some 0.
   * Output is always perf.now()-style.
   */
  SF.normalizeEventTime = function normalizeEventTime(TS) {
    if (!Number.isFinite(TS) || TS <= 0) return SF.nowMs();

    if (TS > 1e12) {
      if (performance && Number.isFinite(performance.timeOrigin)) {
        return TS - performance.timeOrigin;
      }
      return SF.nowMs();
    }

    return TS;
  };

  SF.randBetween = (MIN, MAX) => Math.random() * (MAX - MIN) + MIN;

  /** 0 at/beyond wrap threshold, 1 safely away from edges */
  SF.edgeFactor = function edgeFactor(star) {
    const r = (star.whiteValue * 2 + star.size) || 0;

    const left = star.x + r;
    const right = SF.w + r - star.x;
    const top = star.y + r;
    const bottom = SF.h + r - star.y;

    const minEdgeDist = Math.min(left, right, top, bottom);
    const fadeBand = Math.min(90, SF.screenSum * 0.03);

    let t = minEdgeDist / fadeBand;
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    return t * t * (3 - 2 * t); // smoothstep
  };
})();

/* #endregion 3) UTILITIES */



//#region 4) INIT: RESTORE OR CREATE STARS
/*========================================*
 *  4) INIT STARS
 *========================================*/

(() => {
  const SF = window.STARFIELD;

  SF.initStars = function initStars() {
    if (!SF.hasCanvas) return;

    let rawStars = null;
    try { rawStars = localStorage.getItem("constellationStars"); } catch {}

    if (!rawStars) {
      SF.createStars();
      return;
    }

    try {
      const parsed = JSON.parse(rawStars);
      if (!Array.isArray(parsed) || !parsed.length) {
        SF.createStars();
        return;
      }

      SF.stars = parsed;

      let rawMeta = null;
      try { rawMeta = localStorage.getItem("constellationMeta"); } catch {}

      if (!rawMeta) return;

      try {
        const meta = JSON.parse(rawMeta);

        // Rescale star positions/sizes to the current canvas
        if (meta.width > 0 && meta.height > 0) {
          const sx = SF.w / meta.width;
          const sy = SF.h / meta.height;
          const sizeScale = (SF.w + SF.h) / (meta.width + meta.height);

          for (const star of SF.stars) {
            star.x *= sx;
            star.y *= sy;
            star.size *= sizeScale;
          }
        }

        // Restore interaction state
        SF.pokeTimer = meta.pokeTimer ?? 0;
        SF.pointerSpeed = meta.userSpeed ?? 0;
        SF.ringTimer = meta.ringTimer ?? 0;

        // Restore params
        SF.params.attractStrength = meta.attractStrength ?? SF.params.attractStrength;
        SF.params.attractRadius   = meta.attractRadius   ?? SF.params.attractRadius;
        SF.params.attractScale    = meta.attractScale    ?? SF.params.attractScale;
        SF.params.clamp           = meta.clamp           ?? SF.params.clamp;

        SF.params.repelStrength   = meta.repelStrength   ?? SF.params.repelStrength;
        SF.params.repelRadius     = meta.repelRadius     ?? SF.params.repelRadius;
        SF.params.repelScale      = meta.repelScale      ?? SF.params.repelScale;
        SF.params.pokeStrength    = meta.pokeStrength    ?? SF.params.pokeStrength;

        if (typeof meta.userX === "number") SF.pointerX = meta.userX;
        if (typeof meta.userY === "number") SF.pointerY = meta.userY;

        SF.pointerTime = SF.nowMs();
      } catch (ERR) {
        console.warn("Could not parse constellationMeta; skipping meta restore.", ERR);
      }
    } catch (ERR) {
      console.warn("Could not parse constellationStars; recreating.", ERR);
      SF.createStars();
    }
  };

  SF.createStars = function createStars() {
    if (!SF.hasCanvas) return;

    SF.stars = [];

    const minSize = 3;
    const maxSize = SF.screenSum / 400 || 3;

    for (let i = 0; i < SF.maxStars; i++) {
      SF.stars.push({
        x: Math.random() * SF.w,
        y: Math.random() * SF.h,
        vx: SF.randBetween(-0.25, 0.25),
        vy: SF.randBetween(-0.25, 0.25),
        size: SF.randBetween(Math.min(minSize, maxSize), Math.max(minSize, maxSize)),
        opacity: SF.randBetween(0.005, 1.8),
        fadeSpeed: SF.randBetween(1, 2.1),
        redValue: SF.randBetween(100, 200),
        whiteValue: 0,
        momentumX: 0,
        momentumY: 0,
        edge: 1
      });
    }
  };
})();

/* #endregion 4) INIT */



//#region 5) UI CONTROLS (STEPPERS + BINDINGS)
/*========================================*
 *  5) UI CONTROLS
 *========================================*/

(() => {
  const SF = window.STARFIELD;

  SF.params = {
    attractStrength: 50,
    attractRadius: 50,
    attractScale: 5,
    clamp: 5,

    repelStrength: 50,
    repelRadius: 50,
    repelScale: 5,

    pokeStrength: 5
  };

  SF.enableStepperHold = function enableStepperHold(button, onStep) {
    let holdTimer = null;
    let repeatTimer = null;

    const INITIAL_DELAY_MS = 350;
    const START_INTERVAL_MS = 120;
    const MIN_INTERVAL_MS = 40;
    const ACCELERATION = 0.88;

    const startHold = () => {
      let interval = START_INTERVAL_MS;
      onStep();

      holdTimer = setTimeout(() => {
        repeatTimer = setInterval(() => {
          onStep();
          interval = Math.max(MIN_INTERVAL_MS, interval * ACCELERATION);
          clearInterval(repeatTimer);
          repeatTimer = setInterval(onStep, interval);
        }, interval);
      }, INITIAL_DELAY_MS);
    };

    const stopHold = () => {
      clearTimeout(holdTimer);
      clearInterval(repeatTimer);
      holdTimer = null;
      repeatTimer = null;
    };

    button.addEventListener("mousedown", (e) => { e.preventDefault(); startHold(); });
    button.addEventListener("mouseup", stopHold);
    button.addEventListener("mouseleave", stopHold);

    button.addEventListener("touchstart", (e) => { e.preventDefault(); startHold(); }, { passive: false });
    button.addEventListener("touchend", stopHold);
    button.addEventListener("touchcancel", stopHold);
  };

  SF.bindControl = function bindControl(id, setterFn, initialValue) {
    const slider = document.getElementById(id);
    if (!slider) return false;

    const numberInput = document.getElementById(id + "_num");

    const block = slider.closest(".controlBlock");
    const stepBtns = block ? block.querySelectorAll(".stepBtn[data-step]") : [];

    const min = Number(slider.min || (numberInput && numberInput.min) || 0);
    const max = Number(slider.max || (numberInput && numberInput.max) || 10);

    const rawStep = Number(slider.step || (numberInput && numberInput.step) || 1);
    const step = Number.isFinite(rawStep) && rawStep > 0 ? rawStep : 1;

    const clampValue = (v) => Math.min(max, Math.max(min, v));

    const snapToStep = (v) => {
      const snapped = min + Math.round((v - min) / step) * step;
      const dec = (String(step).split(".")[1] || "").length;
      return Number(snapped.toFixed(dec));
    };

    const applyValue = (v) => {
      v = Number(v);
      if (!Number.isFinite(v)) return;

      v = snapToStep(clampValue(v));

      slider.value = String(v);
      if (numberInput) numberInput.value = String(v);

      setterFn(v);

      slider.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const nudge = (dir) => applyValue(Number(slider.value) + dir * step);

    applyValue(initialValue ?? slider.value);

    slider.addEventListener("input", () => applyValue(slider.value));

    if (numberInput) {
      numberInput.addEventListener("input", () => applyValue(numberInput.value));
      numberInput.addEventListener("change", () => applyValue(numberInput.value));
    }

    stepBtns.forEach((btn) => {
      const dir = Number(btn.dataset.step) || 0;
      if (!dir) return;
      SF.enableStepperHold(btn, () => nudge(dir));
    });

    return true;
  };

  SF.initGravityControlsIfPresent = function initGravityControlsIfPresent() {
    if (!document.getElementById("ATTRACT_STRENGTH") &&
        !document.getElementById("REPEL_STRENGTH")) {
      return;
    }

    SF.bindControl("ATTRACT_STRENGTH", (v) => (SF.params.attractStrength = v), SF.params.attractStrength);
    SF.bindControl("ATTRACT_RADIUS",   (v) => (SF.params.attractRadius   = v), SF.params.attractRadius);
    SF.bindControl("ATTRACT_SCALE",    (v) => (SF.params.attractScale    = v), SF.params.attractScale);

    SF.bindControl("CLAMP",            (v) => (SF.params.clamp           = v), SF.params.clamp);

    SF.bindControl("REPEL_STRENGTH",   (v) => (SF.params.repelStrength   = v), SF.params.repelStrength);
    SF.bindControl("REPEL_RADIUS",     (v) => (SF.params.repelRadius     = v), SF.params.repelRadius);
    SF.bindControl("REPEL_SCALE",      (v) => (SF.params.repelScale      = v), SF.params.repelScale);

    SF.bindControl("POKE_STRENGTH",    (v) => (SF.params.pokeStrength    = v), SF.params.pokeStrength);
  };

  document.addEventListener("DOMContentLoaded", SF.initGravityControlsIfPresent);
})();

/* #endregion 5) UI CONTROLS */



//#region 6) RESIZE + ANIMATION
/*========================================*
 *  6) RESIZE + ANIMATION
 *========================================*/

(() => {
  const SF = window.STARFIELD;

  SF.resizeCanvas = function resizeCanvas() {
    if (!SF.hasCanvas) return;

    const oldW = SF.w;
    const oldH = SF.h;
    const oldSum = SF.screenSum || 1;

    SF.w = window.innerWidth || 0;
    SF.h = window.innerHeight || 0;

    SF.canvas.width = SF.w;
    SF.canvas.height = SF.h;

    SF.screenSum = SF.w + SF.h;
    SF.scaleToScreen = Math.pow(SF.screenSum / 1200, 0.35);

    SF.maxStars = Math.min(450, SF.screenSum / 10);
    SF.maxLinkDist = SF.screenSum / 5;

    SF.scalePow.attGrad  = SF.scaleToScreen ** 1.11;
    SF.scalePow.repGrad  = SF.scaleToScreen ** 0.66;
    SF.scalePow.attShape = SF.scaleToScreen ** -8.89;
    SF.scalePow.att      = SF.scaleToScreen ** -8.46;
    SF.scalePow.rep      = SF.scaleToScreen ** -0.89;
    SF.scalePow.limit    = SF.scaleToScreen ** 1.8;

    // Rescale existing stars after resize
    if (oldW !== 0 && oldH !== 0 && SF.stars.length) {
      const sx = SF.w / oldW;
      const sy = SF.h / oldH;
      const sizeScale = SF.screenSum / oldSum;

      for (const star of SF.stars) {
        star.x *= sx;
        star.y *= sy;
        star.size *= sizeScale;
      }
    }
  };

  function animate() {
    if (!SF.hasCanvas) return;

    if (!SF.freeze && typeof SF.moveStars === "function") SF.moveStars();
    if (typeof SF.drawStarsWithLines === "function") SF.drawStarsWithLines();

    requestAnimationFrame(animate);
  }

  SF._animate = animate; // for debugging if needed
})();

/* #endregion 6) RESIZE + ANIMATION */



//#region 7) BOOTSTRAP
/*========================================*
 *  7) BOOTSTRAP
 *========================================*/

(() => {
  const SF = window.STARFIELD;

  function sizesReady() {
    return (
      Number.isFinite(SF.w) &&
      Number.isFinite(SF.h) &&
      SF.w > 50 &&
      SF.h > 50
    );
  }

  function start() {
    SF.resizeCanvas();

    if (!sizesReady()) {
      requestAnimationFrame(start);
      return;
    }

    if (!SF._starsInit) {
      SF._starsInit = true;
      SF.initStars();
    }

    if (!SF._animStarted) {
      SF._animStarted = true;
      SF._animate();
    }

    if (!SF._resizeWired) {
      SF._resizeWired = true;
      window.addEventListener("resize", SF.resizeCanvas);
    }
  }

  try {
    start();
  } catch (ERR) {
    console.error("Initialization error in Starfield Setup:", ERR);
  }
})();

/* #endregion 7) BOOTSTRAP */