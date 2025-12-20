// thank heavens for chatGPT <3

/*==============================================================*
 *                STARFIELD INTERACTION (PART 2)
 *==============================================================*
 *  What this file does:
 *   1) Gravity params (shared via window.STARFIELD)
 *   2) Physics: moveStars()
 *   3) Drawing: drawStarsWithLines()
 *   4) Pointer input: updateSpeed() + listeners
 *
 *  Requires:
 *   - StarfieldCore.js loaded first (creates window.STARFIELD, canvas, sizes)
 *==============================================================*/

/*==============================================================*
 *  MENU
 *==============================================================*
 *  1) SHARED HANDLE
 *  2) GRAVITY PARAMS
 *  3) PHYSICS: moveStars
 *  4) DRAWING: stars + links + ring
 *  5) POINTER INPUT: updateSpeed + listeners
 *==============================================================*/

//#region 1) SHARED HANDLE
const SF = window.STARFIELD;
window.STARFIELD = window.STARFIELD || {};
const SF = window.STARFIELD;
//#endregion



//#region 2) GRAVITY PARAMS (shared)
/*========================================*
 *  These are stored on SF so:
 *   - localStorage can save them (Core)
 *   - UI can bind them (Core)
 *   - physics can read them (this file)
 *========================================*/
SF.ATTRACT_STRENGTH = SF.ATTRACT_STRENGTH ?? 50;
SF.ATTRACT_RADIUS   = SF.ATTRACT_RADIUS   ?? 50;
SF.ATTRACT_SCALE    = SF.ATTRACT_SCALE    ?? 5;

SF.CLAMP            = SF.CLAMP            ?? 5;

SF.REPEL_STRENGTH   = SF.REPEL_STRENGTH   ?? 50;
SF.REPEL_RADIUS     = SF.REPEL_RADIUS     ?? 50;
SF.REPEL_SCALE      = SF.REPEL_SCALE      ?? 5;

SF.POKE_STRENGTH    = SF.POKE_STRENGTH    ?? 5;

// Now that params exist, allow Core to bind UI (if DOM has controls)
if (typeof SF.initControlsIfPresent === 'function') {
  SF.initControlsIfPresent();
}
//#endregion



//#region 3) PHYSICS: moveStars()
/*========================================*
 *  Preserves your behavior:
 *   - influence range = SCREEN * 0.2
 *   - squared distance precheck
 *   - poke kick
 *   - wrap vs bounce
 *   - same global decay
 *========================================*/
SF.moveStars = SF.moveStars || function moveStars() {
  if (!SF.HAS_CANVAS || !SF.STARS.length) return;

  const INFLUENCE_RANGE = SF.SCREEN * 0.2;
  const INFLUENCE_RANGE_SQ = INFLUENCE_RANGE * INFLUENCE_RANGE;
  const WRAP_DISTANCE_SQ = 200 * 200;

  for (const STAR of SF.STARS) {
    const DX = SF.USER_X - STAR.x;
    const DY = SF.USER_Y - STAR.y;
    const D2 = DX * DX + DY * DY;

    if (D2 < INFLUENCE_RANGE_SQ) {
      const DIST = Math.sqrt(D2) + 0.0001;

      const TO_X = DX / DIST;
      const TO_Y = DY / DIST;

      // Linear gradients
      let ATTR_G =
        1 - (DIST / (((SF.ATTRACT_RADIUS * 5.2) * SF.SCALED_ATT_GRA) || 1));

      let REP_G =
        1 - (DIST / (((SF.REPEL_RADIUS * 2.8) * SF.SCALED_REP_GRA) || 1));

      ATTR_G = Math.max(0, ATTR_G);
      REP_G = Math.max(0, REP_G);

      const ATTR_SHAPE = Math.pow(
        ATTR_G,
        Math.max(0.1, ((SF.ATTRACT_SCALE * 0.48) * SF.SCALED_ATT_SHA))
      );

      const REP_SHAPE = Math.pow(
        REP_G,
        Math.max(0.1, (SF.REPEL_SCALE * 0.64))
      );

      const ATTR =
        ((SF.ATTRACT_STRENGTH * 0.006) * SF.SCALED_ATT) *
        SF.USER_SPEED *
        ATTR_SHAPE;

      const REP =
        ((SF.REPEL_STRENGTH * 0.0182) * SF.SCALED_REP) *
        SF.USER_SPEED *
        REP_SHAPE;

      STAR.momentumX += ATTR * TO_X;
      STAR.momentumY += ATTR * TO_Y;

      STAR.momentumX += REP * -TO_X;
      STAR.momentumY += REP * -TO_Y;

      const POKE = (0.01 * SF.POKE_STRENGTH) * SF.POKE_TIMER * REP_SHAPE;
      STAR.momentumX += POKE * -TO_X;
      STAR.momentumY += POKE * -TO_Y;
    }

    // Baseline drift boosted by interaction
    STAR.momentumX += STAR.vx * Math.min(10, 0.05 * SF.USER_SPEED);
    STAR.momentumY += STAR.vy * Math.min(10, 0.05 * SF.USER_SPEED);

    // Clamp magnitude
    let FX = STAR.momentumX;
    let FY = STAR.momentumY;

    const LIMIT = SF.CLAMP * (SF.SCALE ** 2);
    const MAG = Math.sqrt(FX * FX + FY * FY);

    if (MAG > LIMIT) {
      const S = LIMIT / MAG;
      FX *= S;
      FY *= S;
    }

    // Move
    STAR.x += STAR.vx + FX;
    STAR.y += STAR.vy + FY;

    // Decay
    STAR.momentumX *= 0.98;
    STAR.momentumY *= 0.98;

    // Wrap vs bounce
    if (SF.CIRCLE_TIMER == 0 || D2 > WRAP_DISTANCE_SQ || SF.POKE_TIMER > 1000) {
      const R = (STAR.whiteValue * 2 + STAR.size) || 0;

      if (STAR.x < -R) STAR.x = SF.W + R;
      else if (STAR.x > SF.W + R) STAR.x = -R;

      if (STAR.y < -R) STAR.y = SF.H + R;
      else if (STAR.y > SF.H + R) STAR.y = -R;
    } else {
      const R = (STAR.whiteValue * 2 + STAR.size) || 0;

      if (STAR.x < R) {
        STAR.x = 2 * R - STAR.x;
        STAR.momentumX = -STAR.momentumX;
      } else if (STAR.x > SF.W - R) {
        STAR.x = 2 * (SF.W - R) - STAR.x;
        STAR.momentumX = -STAR.momentumX;
      }

      if (STAR.y < R) {
        STAR.y = 2 * R - STAR.y;
        STAR.momentumY = -STAR.momentumY;
      } else if (STAR.y > SF.H - R) {
        STAR.y = 2 * (SF.H - R) - STAR.y;
        STAR.momentumY = -STAR.momentumY;
      }
    }

    // Flash decay
    if (STAR.whiteValue > 0) {
      STAR.whiteValue *= 0.98;
      if (STAR.whiteValue < 0.001) STAR.whiteValue = 0;
    }

    // Opacity cycle
    if (STAR.opacity <= 0.005) {
      STAR.opacity = 1;
      if (Math.random() < 0.07) STAR.whiteValue = 1;
    } else if (STAR.opacity > 0.02) {
      STAR.opacity -= 0.005 * STAR.fadeSpeed;
    } else {
      STAR.opacity -= 0.0001;
    }
  }

  // Global decay
  SF.USER_SPEED *= 0.5;
  if (SF.USER_SPEED < 0.001) SF.USER_SPEED = 0;

  SF.CIRCLE_TIMER *= 0.9;
  if (SF.CIRCLE_TIMER < 0.1) SF.CIRCLE_TIMER = 0;

  SF.POKE_TIMER *= 0.85;
  if (SF.POKE_TIMER < 1) SF.POKE_TIMER = 0;

  // Debug readouts
  const MISC_DEBUG = 0;
  const DBG_MISC = document.getElementById('miscDbg');
  if (DBG_MISC) DBG_MISC.textContent = MISC_DEBUG.toFixed(3);

  const DBG_CIRCLE = document.getElementById('dbgCircle');
  if (DBG_CIRCLE) DBG_CIRCLE.textContent = SF.CIRCLE_TIMER.toFixed(3);

  const DBG_SPEED = document.getElementById('dbgSpeed');
  if (DBG_SPEED) DBG_SPEED.textContent = SF.USER_SPEED.toFixed(3);

  const DBG_POKE = document.getElementById('dbgPoke');
  if (DBG_POKE) DBG_POKE.textContent = SF.POKE_TIMER.toFixed(1);
};
//#endregion



//#region 4) DRAWING: drawStarsWithLines()
/*========================================*
 *  Same visuals:
 *   - ring
 *   - link fade + edge fade
 *   - star bodies
 *========================================*/
const LINK_BUCKET_COUNT = 18;
let LINK_PATHS = Array.from({ length: LINK_BUCKET_COUNT }, () => new Path2D());

function resetLinkPaths() {
  for (let i = 0; i < LINK_BUCKET_COUNT; i++) LINK_PATHS[i] = new Path2D();
}

SF.drawStarsWithLines = SF.drawStarsWithLines || function drawStarsWithLines() {
  if (!SF.HAS_CANVAS || !SF.BRUSH) return;

  const BRUSH = SF.BRUSH;
  BRUSH.clearRect(0, 0, SF.W, SF.H);

  // Pointer ring
  if (!window.REMOVE_CIRCLE) {
    const RING_RADIUS = SF.SCALE * 100 - 40;
    const RING_WIDTH = SF.CIRCLE_TIMER * 0.15 + 1.5;
    const RING_ALPHA = Math.min(SF.CIRCLE_TIMER * 0.07, 1);

    if (SF.USER_TIME > 0 && RING_ALPHA > 0.001) {
      BRUSH.save();
      BRUSH.lineWidth = RING_WIDTH;
      BRUSH.strokeStyle = 'rgba(0, 0, 0, 1)';
      BRUSH.globalAlpha = RING_ALPHA;

      BRUSH.beginPath();
      BRUSH.arc(SF.USER_X, SF.USER_Y, RING_RADIUS, 0, Math.PI * 2);
      BRUSH.stroke();

      BRUSH.restore();
    }
  }

  // Links (bucketed Path2D)
  BRUSH.lineWidth = 1;

  const N = SF.STARS.length;
  if (N) {
    for (let i = 0; i < N; i++) {
      SF.STARS[i].edge = SF.edgeFactor(SF.STARS[i]);
    }

    const DIST_SCALE = SF.SCREEN / 1100;
    const CUTOFF_RAW = SF.MAX_LINK / DIST_SCALE;
    const CUTOFF2 = CUTOFF_RAW * CUTOFF_RAW;

    resetLinkPaths();

    for (let i = 0; i < N; i++) {
      const A = SF.STARS[i];
      const AX = A.x, AY = A.y;
      const AOP = A.opacity;
      const AEDGE = A.edge;

      for (let j = i + 1; j < N; j++) {
        const B = SF.STARS[j];

        const dx = AX - B.x;
        const dy = AY - B.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > CUTOFF2) continue;

        const dist = Math.sqrt(d2) * DIST_SCALE;

        let alpha = (1 - dist / SF.MAX_LINK) * ((AOP + B.opacity) / 2);
        alpha *= Math.min(AEDGE, B.edge);
        if (alpha <= 0.002) continue;

        let bucket = (alpha * (LINK_BUCKET_COUNT - 1)) | 0;
        if (bucket < 0) bucket = 0;
        if (bucket >= LINK_BUCKET_COUNT) bucket = LINK_BUCKET_COUNT - 1;

        LINK_PATHS[bucket].moveTo(AX, AY);
        LINK_PATHS[bucket].lineTo(B.x, B.y);
      }
    }

    for (let b = 0; b < LINK_BUCKET_COUNT; b++) {
      const BUCKET_ALPHA = (b + 1) / LINK_BUCKET_COUNT;
      BRUSH.strokeStyle = `rgba(0, 0, 0, ${BUCKET_ALPHA})`;
      BRUSH.stroke(LINK_PATHS[b]);
    }
  }

  // Star bodies
  for (const STAR of SF.STARS) {
    let TEMP_RED = 255 * STAR.whiteValue + STAR.redValue;
    if (TEMP_RED > 255) TEMP_RED = 255;

    BRUSH.beginPath();
    BRUSH.fillStyle = `rgba(${TEMP_RED}, ${255 * STAR.whiteValue}, ${255 * STAR.whiteValue}, ${STAR.opacity})`;
    BRUSH.arc(STAR.x, STAR.y, STAR.whiteValue * 2 + STAR.size, 0, Math.PI * 2);
    BRUSH.fill();
  }
};

// External redraw hook (other scripts can call)
window.forceStarfieldRedraw = () => {
  if (!SF || !SF.BRUSH || !SF.CANVAS) return;
  SF.drawStarsWithLines();
};
//#endregion



//#region 5) POINTER INPUT: updateSpeed + listeners
/*========================================*
 *  Uses normalized event timestamps
 *========================================*/
SF.updateSpeed = SF.updateSpeed || function updateSpeed(POINTER_X, POINTER_Y, EVENT_TIME_STAMP) {
  const TIME = SF.normalizeEventTime(EVENT_TIME_STAMP);

  const DT = Math.max(1, TIME - SF.USER_TIME);
  const DX = POINTER_X - SF.USER_X;
  const DY = POINTER_Y - SF.USER_Y;

  const RAW = Math.sqrt(DX * DX + DY * DY) / DT;

  SF.USER_SPEED = Math.min(RAW * 50, 50);
  SF.CIRCLE_TIMER = Math.max(SF.CIRCLE_TIMER, SF.USER_SPEED);

  SF.USER_X = POINTER_X;
  SF.USER_Y = POINTER_Y;
  SF.USER_TIME = TIME;
};

SF.startPointerInteraction = SF.startPointerInteraction || function startPointerInteraction(POINTER_X, POINTER_Y, EVENT_TIME_STAMP) {
  SF.POKE_TIMER = 2500;
  SF.updateSpeed(POINTER_X, POINTER_Y, EVENT_TIME_STAMP);
};

// Wire listeners once
if (!SF._POINTER_WIRED) {
  SF._POINTER_WIRED = true;

  window.addEventListener('mousemove', (E) =>
    SF.updateSpeed(E.clientX, E.clientY, E.timeStamp)
  );

  window.addEventListener('mousedown', (E) =>
    SF.startPointerInteraction(E.clientX, E.clientY, E.timeStamp)
  );

  window.addEventListener('touchstart', (E) => {
    const T = E.touches[0];
    if (!T) return;
    SF.startPointerInteraction(T.clientX, T.clientY, E.timeStamp);
  });

  window.addEventListener('touchmove', (E) => {
    const T = E.touches[0];
    if (!T) return;
    SF.updateSpeed(T.clientX, T.clientY, E.timeStamp);
  });
}
//#endregion

// Joke: Two files now. Like a buddy-cop movie, but with fewer car chases and more stars violating Newton. ⭐👮