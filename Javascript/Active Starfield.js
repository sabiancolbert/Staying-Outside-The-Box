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
 *==============================================================*/

//alert("Debug HAT");

/*========================================*
//#region 1) PHYSICS
 *========================================*/

  var S = window.STARFIELD;

  S.updateStarPhysics = function updateStarPhysics() {
    // Step 1: bail if nothing to simulate, otherwise get set up
    if (!S.isCanvasReady || !S.starList.length) return;

    const INFLUENCE_RANGE = S.screenPerimeter * 0.2;
    const INFLUENCE_RANGE_SQ = INFLUENCE_RANGE * INFLUENCE_RANGE;

    const WRAP_DISTANCE_SQ = 200 * 200;

    const SETTINGS = S.interactionSettings;
    const SCALE = S.screenScalePowers;

    // Step 2: update each star
    for (const STAR of S.starList) {
      const POINTER_DELTA_X = S.pointerClientX - STAR.x;
      const POINTER_DELTA_Y = S.pointerClientY - STAR.y;

      // Step 3: squared distance first (cheap)
      const DISTANCE_SQ = POINTER_DELTA_X * POINTER_DELTA_X + POINTER_DELTA_Y * POINTER_DELTA_Y;

      // Step 4: only do expensive math if close enough
      if (DISTANCE_SQ < INFLUENCE_RANGE_SQ) {
        const DISTANCE = Math.sqrt(DISTANCE_SQ) + 0.0001;

        const UNIT_TO_POINTER_X = POINTER_DELTA_X / DISTANCE;
        const UNIT_TO_POINTER_Y = POINTER_DELTA_Y / DISTANCE;

        // Step 5: linear falloff gradients (0..1)
        let ATTRACTION_GRADIENT =
          1 - (DISTANCE / (((SETTINGS.attractRadius * 5.2) * SCALE.attractionGradient) || 1));

        let REPULSION_GRADIENT =
          1 - (DISTANCE / (((SETTINGS.repelRadius * 2.8) * SCALE.repulsionGradient) || 1));

        ATTRACTION_GRADIENT = Math.max(0, ATTRACTION_GRADIENT);
        REPULSION_GRADIENT = Math.max(0, REPULSION_GRADIENT);

        // Step 6: curve the gradients into a nicer “shape”
        const ATTRACTION_SHAPE = Math.pow(
          ATTRACTION_GRADIENT,
          Math.max(0.1, ((SETTINGS.attractScale * 0.48) * SCALE.attractionShape))
        );

        const REPULSION_SHAPE = Math.pow(
          REPULSION_GRADIENT,
          Math.max(0.1, (SETTINGS.repelScale * 0.64))
        );

        // Step 7: compute forces
        const ATTRACTION_FORCE =
          ((SETTINGS.attractStrength * 0.006) * SCALE.attractionForce) *
          S.pointerSpeedUnits *
          ATTRACTION_SHAPE;

        const REPULSION_FORCE =
          ((SETTINGS.repelStrength * 0.0182) * SCALE.repulsionForce) *
          S.pointerSpeedUnits *
          REPULSION_SHAPE;

        // Step 8: apply attraction
        STAR.momentumX += ATTRACTION_FORCE * UNIT_TO_POINTER_X;
        STAR.momentumY += ATTRACTION_FORCE * UNIT_TO_POINTER_Y;

        // Step 9: apply repulsion
        STAR.momentumX += REPULSION_FORCE * -UNIT_TO_POINTER_X;
        STAR.momentumY += REPULSION_FORCE * -UNIT_TO_POINTER_Y;

        // Step 10: apply poke impulse (repel-shaped)
        const POKE_FORCE = (0.01 * SETTINGS.pokeStrength) * S.pokeImpulseTimer * REPULSION_SHAPE;
        STAR.momentumX += POKE_FORCE * -UNIT_TO_POINTER_X;
        STAR.momentumY += POKE_FORCE * -UNIT_TO_POINTER_Y;
      }

      // Step 11: baseline drift boosted by user interaction
      STAR.momentumX += STAR.vx * Math.min(10, 0.05 * S.pointerSpeedUnits);
      STAR.momentumY += STAR.vy * Math.min(10, 0.05 * S.pointerSpeedUnits);
      
      // Step 12: add keyboard influence
      STAR.momentumX *= window.KEYBOARD.multX;
      STAR.momentumY *= window.KEYBOARD.multY;
      STAR.momentumX += window.KEYBOARD.addX;
      STAR.momentumY += window.KEYBOARD.addY;
      
      // Step 13: clamp momentum magnitude
      const MOMENTUM_LIMIT = 2 * SETTINGS.clamp * SCALE.forceClamp;
      const MOMENTUM_MAG = Math.sqrt(STAR.momentumX * STAR.momentumX + STAR.momentumY * STAR.momentumY);

      if (MOMENTUM_MAG > MOMENTUM_LIMIT) {
        const MOMENTUM_SCALE = MOMENTUM_LIMIT / MOMENTUM_MAG;
        STAR.momentumX *= MOMENTUM_SCALE;
        STAR.momentumY *= MOMENTUM_SCALE;
      }

      // Step 15: integrate
      STAR.x += STAR.vx + STAR.momentumX;
      STAR.y += STAR.vy + STAR.momentumY;

      // Step 16: friction
      STAR.momentumX *= 0.98;
      STAR.momentumY *= 0.98;

      // Step 17: wrap vs bounce (same conditions as before)
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

      // Step 18: flash decay
      if (STAR.whiteValue > 0) {
        STAR.whiteValue *= 0.98;
        if (STAR.whiteValue < 0.001) STAR.whiteValue = 0;
      }

      // Step 19: opacity cycle
      if (STAR.opacity <= 0.005) {
        STAR.opacity = 1;
        if (Math.random() < 0.07) STAR.whiteValue = 1;
      } else if (STAR.opacity > 0.02) {
        STAR.opacity -= 0.005 * STAR.fadeSpeed;
      } else {
        STAR.opacity -= 0.0001;
      }
    }
    
    // Step 20: reset keyboard forces
    window.KEYBOARD.multX = 1;
    window.KEYBOARD.multY = 1;
    window.KEYBOARD.addX = 0;
    window.KEYBOARD.addY = 0;

    // Step 21: global decay for pointer speed
    S.pointerSpeedUnits *= 0.5;
    if (S.pointerSpeedUnits < 0.001) S.pointerSpeedUnits = 0;

    // Step 22: ring behavior (grow then fade with pointerRingTimer)
    S.pointerRingTimer *= 0.95;
    if (S.pointerRingTimer < 1) {
      S.pointerRingTimer = 0;
    }

    // Step 23: poke timer decay
    S.pokeImpulseTimer *= 0.85;
    if (S.pokeImpulseTimer < 1) S.pokeImpulseTimer = 0;

    // Step 24: debug readouts
    const MISC_READER = document.getElementById("dbgMisc");
    if (MISC_READER) MISC_READER.textContent = S.starList[0].momentumX;
    
    const DEBUG_RING = document.getElementById("dbgCircle");
    if (DEBUG_RING) DEBUG_RING.textContent = S.pointerRingTimer.toFixed(3);

    const DEBUG_SPEED = document.getElementById("dbgSpeed");
    if (DEBUG_SPEED) DEBUG_SPEED.textContent = S.pointerSpeedUnits.toFixed(3);

    const DEBUG_POKE = document.getElementById("dbgPoke");
    if (DEBUG_POKE) DEBUG_POKE.textContent = S.pokeImpulseTimer.toFixed(1);
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
    if (!S.isCanvasReady || !S.drawingContext) return;

    const CONTEXT = S.drawingContext;

    // Step 1: clear canvas
    CONTEXT.clearRect(0, 0, S.canvasWidth, S.canvasHeight);

    // Step 2: pointer ring sizing
    const TARGET_RING_RADIUS = Math.max(0, S.screenScaleUp * 100 - 40);

    let RING_RADIUS = TARGET_RING_RADIUS * (S.pointerRingTimer / 50);
    let RING_WIDTH = S.pointerRingTimer * 0.15;
    let RING_ALPHA = Math.min(S.pointerRingTimer * 0.07, 1);

    // Step 3: alternate ring behavior when pointer speed is zero (poke visualization)
    if (S.pointerSpeedUnits == 0) {
      const NORMALIZED_POKE = Math.min(1, Math.max(0, S.pokeImpulseTimer / 200));
      const INVERTED_POKE = 1 - NORMALIZED_POKE;

      RING_RADIUS = TARGET_RING_RADIUS * INVERTED_POKE;
      RING_WIDTH = NORMALIZED_POKE * 7;
      RING_ALPHA = NORMALIZED_POKE;
    }

    // Step 4: draw the ring if visible
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

    // Step 5: draw links
    CONTEXT.lineWidth = 1;

    const STAR_COUNT = S.starList.length;
    if (STAR_COUNT) {
      // Step 5a: compute edge fade factor once per star
      for (let STAR_INDEX = 0; STAR_INDEX < STAR_COUNT; STAR_INDEX++) {
        S.starList[STAR_INDEX].edge = S.getEdgeFadeFactor(S.starList[STAR_INDEX]);
      }

      const DISTANCE_SCALE = S.screenPerimeter / 500;
      const RAW_CUTOFF = S.maxLinkDistance / DISTANCE_SCALE;
      const CUTOFF_DISTANCE_SQ = RAW_CUTOFF * RAW_CUTOFF;

      resetLinkPaths();

      // Step 5b: pairwise linking
      for (let STAR_A_INDEX = 0; STAR_A_INDEX < STAR_COUNT; STAR_A_INDEX++) {
        const STAR_A = S.starList[STAR_A_INDEX];
        const AX = STAR_A.x;
        const AY = STAR_A.y;
        const OPACITY_A = STAR_A.opacity;
        const EDGE_A = STAR_A.edge;

        for (let STAR_B_INDEX = STAR_A_INDEX + 1; STAR_B_INDEX < STAR_COUNT; STAR_B_INDEX++) {
          const STAR_B = S.starList[STAR_B_INDEX];

          const DELTA_X = AX - STAR_B.x;
          const DELTA_Y = AY - STAR_B.y;
          const DISTANCE_SQ = DELTA_X * DELTA_X + DELTA_Y * DELTA_Y;

          if (DISTANCE_SQ > CUTOFF_DISTANCE_SQ) continue;

          const SCALED_DISTANCE = Math.sqrt(DISTANCE_SQ) * DISTANCE_SCALE;

          const MIN_OPACITY = Math.min(OPACITY_A, STAR_B.opacity);
          const MIN_EDGE = Math.min(EDGE_A, STAR_B.edge);
          const DISTANCE_FADE = 1 - (SCALED_DISTANCE / S.maxLinkDistance);

          let LINK_ALPHA = Math.max(0, DISTANCE_FADE) * MIN_OPACITY * MIN_EDGE;
          if (LINK_ALPHA <= 0.002) continue;

          let BUCKET_INDEX = (LINK_ALPHA * (LINK_BUCKET_COUNT - 1)) | 0;
          if (BUCKET_INDEX < 0) BUCKET_INDEX = 0;
          if (BUCKET_INDEX >= LINK_BUCKET_COUNT) BUCKET_INDEX = LINK_BUCKET_COUNT - 1;

          LINK_PATHS_BY_BUCKET[BUCKET_INDEX].moveTo(AX, AY);
          LINK_PATHS_BY_BUCKET[BUCKET_INDEX].lineTo(STAR_B.x, STAR_B.y);
        }
      }

      // Step 5c: stroke each bucket once (cheaper than per-line stroke)
      for (let BUCKET_INDEX = 0; BUCKET_INDEX < LINK_BUCKET_COUNT; BUCKET_INDEX++) {
        const BUCKET_ALPHA = BUCKET_INDEX / (LINK_BUCKET_COUNT - 1);
        if (BUCKET_ALPHA <= 0) continue;

        CONTEXT.strokeStyle = `rgba(100, 100, 100, ${BUCKET_ALPHA})`;
        CONTEXT.stroke(LINK_PATHS_BY_BUCKET[BUCKET_INDEX]);
      }
    }

    // Step 6: draw star bodies
    for (const STAR of S.starList) {
      let TEMP_RED = 255 * STAR.whiteValue + STAR.redValue;
      if (TEMP_RED > 255) TEMP_RED = 255;

      CONTEXT.beginPath();
      CONTEXT.fillStyle = `rgba(${TEMP_RED}, ${255 * STAR.whiteValue}, ${255 * STAR.whiteValue}, ${STAR.opacity})`;
      CONTEXT.arc(STAR.x, STAR.y, STAR.whiteValue * 2 + STAR.size, 0, Math.PI * 2);
      CONTEXT.fill();
    }
  };

/* #endregion 2) RENDERING */



/*========================================*
//#region 3) USER INPUT
 *========================================*/

  S.updatePointerSpeed = function updatePointerSpeed(CURRENT_X, CURRENT_Y) {
    const NOW_MS = S.getNowMs();

    // Step 1: initialize baseline if this is the first event
    if (!S.lastPointerTimeMs) {
      S.pointerClientX = CURRENT_X;
      S.pointerClientY = CURRENT_Y;
      S.lastPointerTimeMs = NOW_MS;
      S.pointerSpeedUnits = 0;
      return;
    }

    // Step 2: compute dt (at least 1ms)
    const DELTA_TIME_MS = Math.max(1, NOW_MS - S.lastPointerTimeMs);

    // Step 3: compute dx/dy
    const DELTA_X = CURRENT_X - S.pointerClientX;
    const DELTA_Y = CURRENT_Y - S.pointerClientY;

    // Step 4: compute speed per ms and scale into “units”
    const RAW_SPEED = Math.sqrt(DELTA_X * DELTA_X + DELTA_Y * DELTA_Y) / DELTA_TIME_MS;
    S.pointerSpeedUnits = S.screenScaleDown * Math.min(RAW_SPEED * 50, 50) 
    ;

    // Step 5: ring timer is driven by max(pointerRingTimer, speed)
    S.pointerRingTimer = Math.max(S.pointerRingTimer, S.pointerSpeedUnits);

    // Step 6: store current as new baseline
    S.pointerClientX = CURRENT_X;
    S.pointerClientY = CURRENT_Y;
    S.lastPointerTimeMs = NOW_MS;
  };

  S.beginPointerInteraction = function beginPointerInteraction(START_X, START_Y) {
    // Step 1: apply poke impulse
    S.pokeImpulseTimer = 200;

    // Step 2: reset time baseline so first update is clean
    S.lastPointerTimeMs = 0;

    // Step 3: feed the first point
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