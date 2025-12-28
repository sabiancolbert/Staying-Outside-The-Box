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

//alert("Debug HAT"); // Optional debug tripwire: confirms this file loaded

/*========================================*
//#region 0) PERF HELPERS
 *========================================*/

// Grab the shared STARFIELD state created by Starfield Setup.js
var S = window.STARFIELD;

/*---------- Debug refs cached (NOT on STARFIELD) ----------*/
// Cache debug element references so we don't query the DOM every frame
const DBG = {
  misc: null,     // Displays a sample value (momentumX) for quick sanity checks
  circle: null,   // Displays ring timer
  speed: null,    // Displays pointer speed
  poke: null,     // Displays poke timer
  lastMs: 0       // Tracks last time we updated debug text (throttle to ~10fps)
};

// Look up optional debug elements (they don't exist on most pages)
DBG.misc = document.getElementById("dbgMisc");       // Debug readout: misc
DBG.circle = document.getElementById("dbgCircle");   // Debug readout: ring timer
DBG.speed = document.getElementById("dbgSpeed");     // Debug readout: pointer speed
DBG.poke = document.getElementById("dbgPoke");       // Debug readout: poke timer

/*---------- Sprite stars (WebP) ----------*/
// Hold sprite loading state so rendering can bail until the image is ready
const STAR_SPRITES = {
  ready: false, // True once the star image is fully loaded
  img: null     // The Image() object used by drawImage()
};

// Load the star sprite immediately so it is ready by the time rendering starts
(function loadStarSpriteNow() {
  // Create a new image object for the star sprite
  const IMG = new Image();

  // Hint to the browser: decode image off the main thread if possible
  IMG.decoding = "async";

  // Hint to the browser: start loading immediately
  IMG.loading = "eager";

  // Mark sprite as ready once the image loads successfully
  IMG.onload = () => { STAR_SPRITES.ready = true; };

  // Mark sprite as not ready if the image fails to load
  IMG.onerror = () => { STAR_SPRITES.ready = false; };

  // Provide the sprite URL (starts the network request)
  IMG.src = "/Resources/Star.webp";

  // Store the image object for later drawing
  STAR_SPRITES.img = IMG;
})();

/*---------- Link throttle state ----------*/
// Count frames so we can rebuild link geometry every N frames
let LINK_FRAME = 0;

// Flag used to force an immediate link rebuild (ex: fast pointer movement)
let LINKS_DIRTY = true;

/*---------- Links fade near the edges ----------*/
function getEdgeFadeFactorFast(STAR) {
  // Approximate star "radius" based on how large it draws on screen
  const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

  // Measure padded distance to each edge (radius avoids visible popping at wrap)
  const DIST_LEFT = STAR.x + STAR_RADIUS;
  const DIST_RIGHT = (S.canvasWidth + STAR_RADIUS) - STAR.x;
  const DIST_TOP = STAR.y + STAR_RADIUS;
  const DIST_BOTTOM = (S.canvasHeight + STAR_RADIUS) - STAR.y;

  // Find the closest edge distance (the "most at risk" direction)
  const MIN_EDGE_DISTANCE = Math.min(DIST_LEFT, DIST_RIGHT, DIST_TOP, DIST_BOTTOM);

  // Define how wide the fade band is near edges (cap it so it stays cheap)
  const FADE_BAND = Math.min(90, S.screenPerimeter * 0.03) || 1;

  // Convert closest distance into a 0..1 fade factor (ternaries keep it compact)
  const T =
    MIN_EDGE_DISTANCE <= 0 ? 0 :
    MIN_EDGE_DISTANCE >= FADE_BAND ? 1 :
    (MIN_EDGE_DISTANCE / FADE_BAND);

  // Square the fade for a quick easing curve (cheap "smooth-ish" fade)
  return T * T;
}

/*---------- Time scaling helpers ----------*/
// Define how many milliseconds one 60fps frame represents (conversion constant)
const SIXTY_FPS_FRAME_MS = 1000 / 60;

// Clamp dt in milliseconds to prevent tab-sleep teleports and clock weirdness
function clampDtMs(dtMs) {
  // Prevent negative dt (clock weirdness) from producing inverted updates
  if (dtMs < 0) return 0;

  // Cap dt so tab sleep / lag spikes don't cause massive forces and teleports
  if (dtMs > 50) return 50; // ~3 frames at 60fps

  // Return dt unchanged when it is in a safe range
  return dtMs;
}

// Convert a per-frame multiplier into a time-based multiplier
function decayPerFrameToDt(basePerFrame, dtFrames) {
  // Example: 0.98 per frame becomes 0.98^dtFrames for variable FPS
  return Math.pow(basePerFrame, dtFrames);
}

/* #endregion 0) PERF HELPERS */



/*========================================*
//#region 1) PHYSICS
 *========================================*/

/* DECIDE HOW EACH STAR SHOULD MOVE */
S.updateStarPhysics = function updateStarPhysics() {
  // Bail early if we have no stars to simulate
  if (!S.starList.length) return;

  // Sample the current time from Setup's helper (performance.now when possible)
  const NOW = S.getNowMs();

  // Use a stored previous physics timestamp, or default to NOW on the first frame
  const LAST = S.lastPhysicsMs || NOW;

  // Compute elapsed time and clamp it to avoid huge simulation jumps
  const dtMs = clampDtMs(NOW - LAST);

  // Store this frame's timestamp for the next physics update
  S.lastPhysicsMs = NOW;

  // Normalize elapsed time into "60fps frames" (dt = 1 means one 60fps frame)
  const dtFrames = dtMs / SIXTY_FPS_FRAME_MS;

  // Bail if dt is zero so we don't divide by zero or waste work
  if (dtFrames <= 0) return;

  // Define the maximum range where pointer forces can affect stars
  const INFLUENCE_RANGE = S.screenPerimeter * 0.2;

  // Precompute squared range so we can compare squared distances cheaply
  const INFLUENCE_RANGE_SQ = INFLUENCE_RANGE * INFLUENCE_RANGE;

  // Define a local distance threshold used for wrap vs bounce behavior
  const WRAP_DISTANCE_SQ = 200 * 200;

  // Grab UI-tunable interaction settings
  const SETTINGS = S.interactionSettings;

  // Grab precomputed screen scaling powers (computed during resize)
  const SCALE = S.screenScalePowers;

  /* TIME-BASED DECAYS */
  // Convert legacy "per frame" decay constants into time-based multipliers
  const MOMENTUM_DECAY = decayPerFrameToDt(0.98, dtFrames);
  const WHITE_DECAY = decayPerFrameToDt(0.98, dtFrames);
  const POINTER_SPEED_DECAY = decayPerFrameToDt(0.5, dtFrames);
  const RING_DECAY = decayPerFrameToDt(0.95, dtFrames);
  const POKE_DECAY = decayPerFrameToDt(0.85, dtFrames);

  /* UPDATE EACH STAR */
  for (const STAR of S.starList) {
    // Compute distance from star to pointer
    const POINTER_DELTA_X = S.pointerClientX - STAR.x;
    const POINTER_DELTA_Y = S.pointerClientY - STAR.y;

    // Compute squared distance (cheaper than sqrt) for range checks
    const DISTANCE_SQ =
      POINTER_DELTA_X * POINTER_DELTA_X + POINTER_DELTA_Y * POINTER_DELTA_Y;

    /* PROXIMITY-ONLY FORCES */
    if (DISTANCE_SQ < INFLUENCE_RANGE_SQ) {
      // Compute true distance (sqrt) and add epsilon to prevent divide-by-zero
      const DISTANCE = Math.sqrt(DISTANCE_SQ) + 0.0001;

      // Convert delta into a unit vector pointing toward the pointer
      const UNIT_TO_POINTER_X = POINTER_DELTA_X / DISTANCE;
      const UNIT_TO_POINTER_Y = POINTER_DELTA_Y / DISTANCE;

      /* ATTRACTION */
      // Convert distance into a 0..1 gradient inside the attraction radius
      let ATTRACTION_GRADIENT =
        1 - (DISTANCE / (((SETTINGS.attractRadius * 5.2) * SCALE.attractionGradient) || 1));

      // Clamp attraction gradient so it never goes negative outside radius
      ATTRACTION_GRADIENT = Math.max(0, ATTRACTION_GRADIENT);

      // Shape attraction so the falloff curve can be steeper/softer
      const ATTRACTION_SHAPE = Math.pow(
        ATTRACTION_GRADIENT,
        Math.max(0.1, ((SETTINGS.attractScale * 0.48) * SCALE.attractionShape))
      );

      // Compute attraction force based on settings, screen scale, pointer energy, and shape
      const ATTRACTION_FORCE =
        ((SETTINGS.attractStrength * 0.0044) * SCALE.attractionForce) *
        S.pointerSpeedUnits *
        ATTRACTION_SHAPE;

      /* REPULSION */
      // Convert distance into a 0..1 gradient inside the repulsion radius
      let REPULSION_GRADIENT =
        1 - (DISTANCE / (((SETTINGS.repelRadius * 2.8) * SCALE.repulsionGradient) || 1));

      // Clamp repulsion gradient so it never goes negative outside radius
      REPULSION_GRADIENT = Math.max(0, REPULSION_GRADIENT);

      // Shape repulsion so the falloff curve can be steeper/softer
      const REPULSION_SHAPE = Math.pow(
        REPULSION_GRADIENT,
        Math.max(0.1, (SETTINGS.repelScale * 0.64))
      );

      // Compute repulsion force based on settings, screen scale, pointer energy, and shape
      const REPULSION_FORCE =
        ((SETTINGS.repelStrength * 0.0182) * SCALE.repulsionForce) *
        S.pointerSpeedUnits *
        REPULSION_SHAPE;

      /* POKE */
      // Define poke radius as a fraction of the screen size
      const POKE_RADIUS = S.screenPerimeter * 0.2;

      // Convert distance into a 0..1 poke gradient inside the poke radius
      const POKE_GRADIENT = 1 - (DISTANCE / POKE_RADIUS);

      // Shape poke so it ramps up sharply near the pointer
      const POKE_SHAPE = Math.pow(Math.max(0, POKE_GRADIENT), 2);

      // Tune the strength of the poke, and time it to fade
      const POKE_FORCE =
        (0.01 * SETTINGS.pokeStrength) *
        S.pokeImpulseTimer *
        POKE_SHAPE;

      /* APPLY PROXIMITY-ONLY FORCES */
      // Apply attraction toward the pointer (dt-scaled for stable feel across FPS)
      STAR.momentumX += (ATTRACTION_FORCE * UNIT_TO_POINTER_X) * dtFrames;
      STAR.momentumY += (ATTRACTION_FORCE * UNIT_TO_POINTER_Y) * dtFrames;

      // Apply repulsion away from the pointer (dt-scaled for stable feel across FPS)
      STAR.momentumX += (REPULSION_FORCE * -UNIT_TO_POINTER_X) * dtFrames;
      STAR.momentumY += (REPULSION_FORCE * -UNIT_TO_POINTER_Y) * dtFrames;

      // Apply poke burst away from the pointer (dt-scaled for stable feel across FPS)
      STAR.momentumX += (POKE_FORCE * -UNIT_TO_POINTER_X) * dtFrames;
      STAR.momentumY += (POKE_FORCE * -UNIT_TO_POINTER_Y) * dtFrames;
    }

    /* GLOBAL FORCES */
    // Compute a drift multiplier that grows slightly when the pointer is active
    const DRIFT_BOOST = Math.min(7, 0.01 * S.pointerSpeedUnits);

    // Add passive drift (dt-scaled so it feels stable across FPS)
    STAR.momentumX += (STAR.vx * DRIFT_BOOST) * dtFrames;
    STAR.momentumY += (STAR.vy * DRIFT_BOOST) * dtFrames;

    // Apply keyboard impulses (designed as instant per-tick nudges)
    STAR.momentumX *= window.KEYBOARD.multX;
    STAR.momentumY *= window.KEYBOARD.multY;
    STAR.momentumX += window.KEYBOARD.addX;
    STAR.momentumY += window.KEYBOARD.addY;

    /* MOMENTUM CLAMP */
    // Compute a maximum allowed momentum based on user clamp and screen scaling
    const MOMENTUM_LIMIT = 2 * SETTINGS.clamp * SCALE.forceClamp;

    // Compute current momentum magnitude so we can clamp smoothly
    const MOMENTUM_MAG = Math.sqrt(
      STAR.momentumX * STAR.momentumX + STAR.momentumY * STAR.momentumY
    );

    // Clamp momentum to prevent runaway speeds and keep the sim stable
    if (MOMENTUM_MAG > MOMENTUM_LIMIT) {
      // Compute the scale factor needed to reduce momentum down to the limit
      const MOMENTUM_SCALE = MOMENTUM_LIMIT / MOMENTUM_MAG;

      // Apply scaling to momentum to clamp total magnitude
      STAR.momentumX *= MOMENTUM_SCALE;
      STAR.momentumY *= MOMENTUM_SCALE;
    }

    /* INTEGRATION */
    // Advance star position using base velocity plus accumulated momentum (dt-scaled)
    STAR.x += (STAR.vx + STAR.momentumX) * dtFrames;
    STAR.y += (STAR.vy + STAR.momentumY) * dtFrames;

    // Apply friction decay to momentum (time-based)
    STAR.momentumX *= MOMENTUM_DECAY;
    STAR.momentumY *= MOMENTUM_DECAY;












    /* PADDLE STAR PHYSICS */
    if (window.KEYBOARD.paddlesTimer > 0 && STAR === S.starList[0]) {
      // Keep the paddle ball white and visible
      STAR.whiteValue = 1;
      STAR.opacity = 1;
    
      const CANVAS = S.constellationCanvas;
      const rect = CANVAS.getBoundingClientRect();
  
      // Viewport rectangle in CANVAS coordinates (matches your render)
      const viewLeft = -rect.left;
      const viewTop = -rect.top;
      const viewRight = viewLeft + window.innerWidth;
      const viewBottom = viewTop + window.innerHeight;
  
      // Paddle center (0..100) in viewport, then offset into canvas coords
      const cx = viewLeft + (window.KEYBOARD.paddlesX / 100) * window.innerWidth;
      const cy = viewTop + (window.KEYBOARD.paddlesY / 100) * window.innerHeight;
  
      // Paddle spans (same as render)
      const paddleW = window.innerWidth * 0.10;
      const paddleH = window.innerHeight * 0.10;
      const halfPW = paddleW * 0.5;
      const halfPH = paddleH * 0.5;
  
      // Paddle thickness (match render feel)
      const paddleThickness = Math.max(2, Math.min(window.innerWidth, window.innerHeight) * 0.03);
      const halfT = paddleThickness * 0.5;
  
      // Ball radius
      const BALL_R = Math.max(2, (2 + STAR.size) || 2);
  
      // Current “ball” speed from vx/vy (you can include momentum if you want)
      const Vx = (STAR.vx || 0) + (STAR.momentumX || 0);
      const Vy = (STAR.vy || 0) + (STAR.momentumY || 0);
      const speed = Math.sqrt(Vx * Vx + Vy * Vy);
      if (speed > 0.0001) {
        const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  
        // Where center hit = perpendicular, edge hit = shallow
        const maxAngle = 1.25; // ~72 degrees
  
        // How far to push out after hit (radius + half thickness + tiny epsilon)
        const pushOutX = BALL_R + halfT + 0.5;
        const pushOutY = BALL_R + halfT + 0.5;
  
        // Collision envelopes
        const touchLeft   = STAR.x <= viewLeft  + (BALL_R + halfT);
        const touchRight  = STAR.x >= viewRight - (BALL_R + halfT);
        const touchTop    = STAR.y <= viewTop   + (BALL_R + halfT);
        const touchBottom = STAR.y >= viewBottom- (BALL_R + halfT);
  
        const withinLeftRightPaddle = (STAR.y >= (cy - halfPH) && STAR.y <= (cy + halfPH));
        const withinTopBottomPaddle = (STAR.x >= (cx - halfPW) && STAR.x <= (cx + halfPW));
  
        const HIT_COOLDOWN_MS = 60;
  
        // LEFT paddle: vertical wall, bounce to the right (+1)
        if (touchLeft && withinLeftRightPaddle && Vx < 0) {
          const offset = clamp((STAR.y - cy) / (halfPH || 1), -1, 1);
          const ang = offset * maxAngle;
  
          const outVx = +1 * speed * Math.cos(ang);
          const outVy = speed * Math.sin(ang);
  
          bounceVertical(STAR, viewLeft, +1, outVx, outVy, pushOutX, NOW, HIT_COOLDOWN_MS);
        }
  
        // RIGHT paddle: vertical wall, bounce to the left (-1)
        else if (touchRight && withinLeftRightPaddle && Vx > 0) {
          const offset = clamp((STAR.y - cy) / (halfPH || 1), -1, 1);
          const ang = offset * maxAngle;
  
          const outVx = -1 * speed * Math.cos(ang);
          const outVy = speed * Math.sin(ang);
  
          bounceVertical(STAR, viewRight, -1, outVx, outVy, pushOutX, NOW, HIT_COOLDOWN_MS);
        }
  
        // TOP paddle: horizontal wall, bounce down (+1)
        else if (touchTop && withinTopBottomPaddle && Vy < 0) {
          const offset = clamp((STAR.x - cx) / (halfPW || 1), -1, 1);
          const ang = offset * maxAngle;
  
          const outVy = +1 * speed * Math.cos(ang);
          const outVx = speed * Math.sin(ang);
  
          bounceHorizontal(STAR, viewTop, +1, outVx, outVy, pushOutY, NOW, HIT_COOLDOWN_MS);
        }
  
        // BOTTOM paddle: horizontal wall, bounce up (-1)
        else if (touchBottom && withinTopBottomPaddle && Vy > 0) {
          const offset = clamp((STAR.x - cx) / (halfPW || 1), -1, 1);
          const ang = offset * maxAngle;
  
          const outVy = -1 * speed * Math.cos(ang);
          const outVx = speed * Math.sin(ang);
  
          bounceHorizontal(STAR, viewBottom, -1, outVx, outVy, pushOutY, NOW, HIT_COOLDOWN_MS);
        }
      }
    }
    
    /* EDGE BEHAVIOR: WRAP VS BOUNCE */
    const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;
  
    // For normal bounce, we'll reflect the "ball velocity" too (vx/vy), not just momentum.
    // If you want normal stars to keep using momentum, only apply this to STAR[0].
    const Vx = (STAR.vx || 0) + (STAR.momentumX || 0);
    const Vy = (STAR.vy || 0) + (STAR.momentumY || 0);
  
    // How far to push out so it doesn't remain inside the wall
    const pushOutX = STAR_RADIUS + 0.5;
    const pushOutY = STAR_RADIUS + 0.5;
  
    // Left wall
    if (STAR.x < STAR_RADIUS) {
      const outVx = Math.abs(Vx);     // force to the right
      const outVy = Vy;              // keep vertical
      bounceVertical(STAR, STAR_RADIUS, +1, outVx, outVy, pushOutX, NOW, 0);
    }
    // Right wall
    else if (STAR.x > S.canvasWidth - STAR_RADIUS) {
      const outVx = -Math.abs(Vx);   // force to the left
      const outVy = Vy;
      bounceVertical(STAR, S.canvasWidth - STAR_RADIUS, -1, outVx, outVy, pushOutX, NOW, 0);
    }
  
    // Top wall
    if (STAR.y < STAR_RADIUS) {
      const outVx = Vx;
      const outVy = Math.abs(Vy);    // force down
      bounceHorizontal(STAR, STAR_RADIUS, +1, outVx, outVy, pushOutY, NOW, 0);
    }
    // Bottom wall
    else if (STAR.y > S.canvasHeight - STAR_RADIUS) {
      const outVx = Vx;
      const outVy = -Math.abs(Vy);   // force up
      bounceHorizontal(STAR, S.canvasHeight - STAR_RADIUS, -1, outVx, outVy, pushOutY, NOW, 0);
    }

    /* WHITE FLASH DECAY */
    // Only decay whiteValue when it is actively above zero
    if (STAR.whiteValue > 0) {
      // Fade whiteValue down smoothly over time
      STAR.whiteValue *= WHITE_DECAY;

      // Snap extremely tiny values to zero to avoid endless micro-updates
      if (STAR.whiteValue < 0.001) STAR.whiteValue = 0;
    }

    /* OPACITY / TWINKLE CYCLE */
    // Reset twinkle cycle when opacity gets very low
    if (STAR.opacity <= 0.005) {
      // Restart opacity at full brightness
      STAR.opacity = 1;

      // Occasionally trigger a white flash on a new twinkle
      if (Math.random() < 0.07) STAR.whiteValue = 1;
    }
    // Fade faster while the star is still fairly visible
    else if (STAR.opacity > 0.02) {
      // Reduce opacity using fadeSpeed and dt so it stays consistent across FPS
      STAR.opacity -= (0.005 * STAR.fadeSpeed) * dtFrames;
    }
    // Fade slowly near the end so it doesn't vanish too abruptly
    else {
      // Reduce opacity with a tiny drift amount (dt-scaled)
      STAR.opacity -= 0.0001 * dtFrames;
    }
  }

  /* GLOBAL DECAYS */

  // Reset keyboard forces so keys act as one-tick impulses
  window.KEYBOARD.multX = 1;
  window.KEYBOARD.multY = 1;
  window.KEYBOARD.addX = 0;
  window.KEYBOARD.addY = 0;

  // Decay pointer speed energy over time
  S.pointerSpeedUnits *= POINTER_SPEED_DECAY;

  // Snap tiny pointer speed values to zero to avoid endless micro-updates
  if (S.pointerSpeedUnits < 0.001) S.pointerSpeedUnits = 0;

  // Decay the ring timer over time
  S.pointerRingTimer *= RING_DECAY;

  // Snap small ring values to zero so "off" is truly off
  if (S.pointerRingTimer < 1) S.pointerRingTimer = 0;

  // Decay the poke impulse over time
  S.pokeImpulseTimer *= POKE_DECAY;

  // Snap small poke values to zero so the burst ends cleanly
  if (S.pokeImpulseTimer < 1) S.pokeImpulseTimer = 0;

  /* DEBUG READOUTS */
  // Only do debug work when any debug elements exist
  if (DBG.misc || DBG.circle || DBG.speed || DBG.poke) {
    // Throttle debug DOM writes to about 10 updates per second
    if (NOW - DBG.lastMs >= 100) {
      // Record the last debug update time
      DBG.lastMs = NOW;

      // Write a sample star value for quick sanity checking
      if (DBG.misc) DBG.misc.textContent = S.starList[0].momentumX;

      // Write ring timer value for visual verification
      if (DBG.circle) DBG.circle.textContent = S.pointerRingTimer.toFixed(3);

      // Write pointer speed value for visual verification
      if (DBG.speed) DBG.speed.textContent = S.pointerSpeedUnits.toFixed(3);

      // Write poke timer value for visual verification
      if (DBG.poke) DBG.poke.textContent = S.pokeImpulseTimer.toFixed(1);
    }
  }
};

/* ---------- Bounce helpers (reusable) ---------- */
/**
 * Apply a vertical-wall bounce (left/right).
 * Caller provides:
 *  - wallX: x coordinate of the wall line
 *  - wallSign: +1 means bounce to the right, -1 means bounce to the left
 *  - outVx/outVy: the post-bounce velocity components you computed
 *  - pushOut: how far to place the star away from the wall to avoid re-hits
 *  - NOW + cooldownMs: optional hit-cooldown support (per-star)
 */
function bounceVertical(STAR, wallX, wallSign, outVx, outVy, pushOut, NOW, cooldownMs = 0) {
  if (cooldownMs > 0) {
    const last = STAR.lastBounceV_Ms || 0;
    if (NOW - last < cooldownMs) return false;
    STAR.lastBounceV_Ms = NOW;
  }

  STAR.vx = outVx;
  STAR.vy = outVy;

  // If this star uses momentum too, you can choose to clear it for "clean ball" behavior:
  STAR.momentumX = 0;
  STAR.momentumY = 0;

  // Push away from wall so we don't immediately collide again
  STAR.x = wallX + wallSign * pushOut;

  return true;
}

/**
 * Apply a horizontal-wall bounce (top/bottom).
 * Caller provides:
 *  - wallY: y coordinate of the wall line
 *  - wallSign: +1 means bounce downward, -1 means bounce upward
 *  - outVx/outVy: the post-bounce velocity components you computed
 *  - pushOut: how far to place the star away from the wall to avoid re-hits
 *  - NOW + cooldownMs: optional hit-cooldown support (per-star)
 */
function bounceHorizontal(STAR, wallY, wallSign, outVx, outVy, pushOut, NOW, cooldownMs = 0) {
  if (cooldownMs > 0) {
    const last = STAR.lastBounceH_Ms || 0;
    if (NOW - last < cooldownMs) return false;
    STAR.lastBounceH_Ms = NOW;
  }

  STAR.vx = outVx;
  STAR.vy = outVy;

  STAR.momentumX = 0;
  STAR.momentumY = 0;

  STAR.y = wallY + wallSign * pushOut;

  return true;
}

/* #endregion 1) PHYSICS */



/*========================================*
//#region 2) RENDERING
 *========================================*/

// Define how many opacity buckets we use for link drawing
const LINK_BUCKET_COUNT = 18;

// Pre-create an array of Path2D objects so we can batch draw links by alpha
let LINK_PATHS_BY_BUCKET = Array.from({ length: LINK_BUCKET_COUNT }, () => new Path2D());

function resetLinkPaths() {
  // Recreate each Path2D so we clear out prior frame geometry
  for (let BUCKET_INDEX = 0; BUCKET_INDEX < LINK_BUCKET_COUNT; BUCKET_INDEX++) {
    // Replace this bucket path with a fresh empty path
    LINK_PATHS_BY_BUCKET[BUCKET_INDEX] = new Path2D();
  }
}

/* DISPLAY THE CALCULATED STARS AND LINES */
S.renderStarsAndLinks = function renderStarsAndLinks() {
  // Grab the 2D canvas context for drawing
  const CONTEXT = S.drawingContext;

  // Clear the full canvas each frame before redrawing
  CONTEXT.clearRect(0, 0, S.canvasWidth, S.canvasHeight);












  /* PADDLES */
  if (window.KEYBOARD.paddlesTimer > 0) {
    // Clamp 0-100
    window.KEYBOARD.paddlesX = Math.max(0, Math.min(100, window.KEYBOARD.paddlesX));
    window.KEYBOARD.paddlesY = Math.max(0, Math.min(100, window.KEYBOARD.paddlesY));
  
    const CANVAS = S.constellationCanvas;
    if (!CANVAS) return;
  
    const rect = CANVAS.getBoundingClientRect();
  
    // Visible viewport rectangle in CANVAS coordinates
    const viewLeft = -rect.left;
    const viewTop = -rect.top;
    const viewRight = viewLeft + window.innerWidth;
    const viewBottom = viewTop + window.innerHeight;
  
    // Timer lives on KEYBOARD now
    const alpha = Math.min(1, Math.max(0, window.KEYBOARD.paddlesTimer));
  
    // Convert 0..100 to viewport pixels (then offset into canvas coords)
    const cx = viewLeft + (window.KEYBOARD.paddlesX / 100) * window.innerWidth;
    const cy = viewTop + (window.KEYBOARD.paddlesY / 100) * window.innerHeight;
  
    // Paddle spans as % of viewport size
    const paddleW = window.innerWidth * 0.10;  // top/bottom
    const paddleH = window.innerHeight * 0.10; // left/right
  
    // Draw using the render pass context
    CONTEXT.save();
    CONTEXT.globalAlpha = alpha;
    CONTEXT.lineWidth = Math.max(2, Math.min(window.innerWidth, window.innerHeight) * 0.03);
    CONTEXT.lineCap = "round";
    CONTEXT.strokeStyle = "rgba(255,255,255,1)";
  
    CONTEXT.beginPath();
  
    // Left & right vertical paddles (viewport edges)
    CONTEXT.moveTo(viewLeft, Math.max(viewTop, cy - paddleH / 2));
    CONTEXT.lineTo(viewLeft, Math.min(viewBottom, cy + paddleH / 2));
    CONTEXT.moveTo(viewRight, Math.max(viewTop, cy - paddleH / 2));
    CONTEXT.lineTo(viewRight, Math.min(viewBottom, cy + paddleH / 2));
  
    // Top & bottom horizontal paddles (viewport edges)
    CONTEXT.moveTo(Math.max(viewLeft, cx - paddleW / 2), viewTop);
    CONTEXT.lineTo(Math.min(viewRight, cx + paddleW / 2), viewTop);
    CONTEXT.moveTo(Math.max(viewLeft, cx - paddleW / 2), viewBottom);
    CONTEXT.lineTo(Math.min(viewRight, cx + paddleW / 2), viewBottom);
  
    CONTEXT.stroke();
    CONTEXT.restore();
  
    // Decay paddles
    window.KEYBOARD.paddlesTimer -= 0.1;
  }











  /* LINKS */
  // Set a thin line width for link drawing
  CONTEXT.lineWidth = 1;

  // Cache star count for loops and guard checks
  const STAR_COUNT = S.starList.length;

  // Only attempt link logic if there are stars to connect
  if (STAR_COUNT) {
    // Advance the link frame counter for throttling
    LINK_FRAME++;

    // Force link rebuild when pointer is moving fast (feels more responsive)
    if (S.pointerSpeedUnits > 10) LINKS_DIRTY = true;

    // Decide if we should rebuild link geometry this frame
    const SHOULD_REBUILD_LINKS = LINKS_DIRTY || (LINK_FRAME % 3 === 0);

    // Only rebuild link geometry when needed to save CPU
    if (SHOULD_REBUILD_LINKS) {
      // Clear dirty flag once we commit to rebuilding
      LINKS_DIRTY = false;

      // Update each star's cached edge fade factor for link alpha calculations
      for (let i = 0; i < STAR_COUNT; i++) {
        S.starList[i].edge = getEdgeFadeFactorFast(S.starList[i]);
      }

      // Convert raw pixel distance into a scaled distance space
      const DISTANCE_SCALE = S.screenPerimeter / 500;

      // Compute a cutoff distance in unscaled units for faster squared checks
      const RAW_CUTOFF = S.maxLinkDistance / DISTANCE_SCALE;

      // Precompute squared cutoff distance for cheap comparisons
      const CUTOFF_DISTANCE_SQ = RAW_CUTOFF * RAW_CUTOFF;

      // Clear existing link paths so we can rebuild them from scratch
      resetLinkPaths();

      // Iterate each star as the first endpoint
      for (let a = 0; a < STAR_COUNT; a++) {
        // Cache star A and its commonly used values for the inner loop
        const STAR_A = S.starList[a];
        const AX = STAR_A.x;
        const AY = STAR_A.y;
        const OPACITY_A = STAR_A.opacity;
        const EDGE_A = STAR_A.edge;

        // Iterate remaining stars as the second endpoint
        for (let b = a + 1; b < STAR_COUNT; b++) {
          // Pull out star B for this pair
          const STAR_B = S.starList[b];

          // Compute squared distance between stars for cutoff testing
          const dx = AX - STAR_B.x;
          const dy = AY - STAR_B.y;
          const d2 = dx * dx + dy * dy;

          // Skip pairs that are too far apart
          if (d2 > CUTOFF_DISTANCE_SQ) continue;

          // Convert distance back into scaled space for fade math
          const SCALED_DISTANCE = Math.sqrt(d2) * DISTANCE_SCALE;

          // Use the dimmer opacity and weaker edge fade for link brightness
          const MIN_OPACITY = OPACITY_A < STAR_B.opacity ? OPACITY_A : STAR_B.opacity;
          const MIN_EDGE = EDGE_A < STAR_B.edge ? EDGE_A : STAR_B.edge;

          // Fade links out as they approach the maximum link distance
          const DISTANCE_FADE = 1 - (SCALED_DISTANCE / S.maxLinkDistance);

          // Combine fades and clamp to positive values
          const DISTANCE_CLAMP = DISTANCE_FADE > 0 ? DISTANCE_FADE : 0;
          const LINK_ALPHA = DISTANCE_CLAMP * MIN_OPACITY * MIN_EDGE;

          // Skip nearly invisible links to reduce path complexity
          if (LINK_ALPHA <= 0.002) continue;

          // Map link alpha into a bucket index for batched drawing
          let BUCKET_INDEX = (LINK_ALPHA * (LINK_BUCKET_COUNT - 1)) | 0;
          if (BUCKET_INDEX < 0) BUCKET_INDEX = 0;
          if (BUCKET_INDEX >= LINK_BUCKET_COUNT) BUCKET_INDEX = LINK_BUCKET_COUNT - 1;

          // Add this link into the correct alpha bucket as a single line segment
          LINK_PATHS_BY_BUCKET[BUCKET_INDEX].moveTo(AX, AY);
          LINK_PATHS_BY_BUCKET[BUCKET_INDEX].lineTo(STAR_B.x, STAR_B.y);
        }
      }
    }

    // Draw each alpha bucket once, so strokeStyle changes are minimized
    for (let i = 0; i < LINK_BUCKET_COUNT; i++) {
      // Convert bucket index into an alpha value 0..1
      const A = i / (LINK_BUCKET_COUNT - 1);

      // Skip fully transparent bucket
      if (A <= 0) continue;

      // Set line color using this bucket's alpha
      CONTEXT.strokeStyle = `rgba(100, 100, 100, ${A})`;

      // Stroke all links accumulated in this bucket
      CONTEXT.stroke(LINK_PATHS_BY_BUCKET[i]);
    }
  }

  /* STARS */
  // Bail out if the sprite is not loaded yet
  if (!STAR_SPRITES.ready) return;

  // Cache the loaded sprite image for repeated drawing
  const IMG = STAR_SPRITES.img;

  // Draw each star sprite with darkness + optional white glow
  for (const STAR of S.starList) {
    // Compute a drawing radius based on size and current white flash
    const R = (STAR.whiteValue * 2 + STAR.size) || 1;

    // Convert radius into sprite draw size (with a minimum for visibility)
    const SIZE = Math.max(2, R * 2.4);

    // Cache center and radius for the overlay circle
    const CX = STAR.x;
    const CY = STAR.y;
    const CR = SIZE * 0.48;

    // Normalize redValue into a 0..1 range for darkness mapping
    let t = (STAR.redValue - 50) / 150;
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    // Convert "redness" into a darkness factor (less red = darker)
    const DARKNESS = 0.15 + 0.55 * (1 - t);

    // Save context state so per-star settings do not leak
    CONTEXT.save();

    /* BASE SPRITE (ROTATED) */
    CONTEXT.globalAlpha = STAR.opacity;

    // Move origin to the star center
    CONTEXT.translate(CX, CY);

    // Rotate by the star’s rotation
    CONTEXT.rotate(STAR.rotation || 0);

    // Draw sprite centered at 0,0
    CONTEXT.drawImage(IMG, -SIZE / 2, -SIZE / 2, SIZE, SIZE);

    /* OVERLAYS (IN LOCAL SPACE, ROTATION DOESN'T MATTER FOR CIRCLES) */
    // Restrict the darkness fill so it only affects the sprite pixels
    CONTEXT.globalCompositeOperation = "source-atop";
    CONTEXT.globalAlpha = STAR.opacity * DARKNESS;
    CONTEXT.fillStyle = "rgba(0, 0, 0, 1)";
    CONTEXT.beginPath();
    CONTEXT.arc(0, 0, CR, 0, Math.PI * 2);
    CONTEXT.fill();

    // Add a white glow when the star is flashing
    if (STAR.whiteValue > 0.01) {
      CONTEXT.globalCompositeOperation = "lighter";
      CONTEXT.globalAlpha = STAR.opacity * (STAR.whiteValue > 1 ? 1 : STAR.whiteValue);
      CONTEXT.fillStyle = "rgba(255, 255, 255, 1)";
      CONTEXT.beginPath();
      CONTEXT.arc(0, 0, CR, 0, Math.PI * 2);
      CONTEXT.fill();
    }

    // Restore context state for the next star
    CONTEXT.restore();
  }

  /* USER POINTER RING */
  // Compute the baseline ring radius based on screen size
  const TARGET_RING_RADIUS = Math.max(0, S.screenScaleUp * 100 - 40);

  // Compute ring visuals from timers (defaults to ring-timer behavior)
  let RING_RADIUS = TARGET_RING_RADIUS * (S.pointerRingTimer / 50);
  let RING_WIDTH = S.pointerRingTimer * 0.15;
  let RING_ALPHA = Math.min(S.pointerRingTimer * 0.07, 1);

  // If pointer is not moving, use poke timer to drive the ring visuals instead
  if (S.pointerSpeedUnits == 0) {
    // Normalize poke timer into 0..1 range
    const NORMALIZED_POKE = Math.min(1, Math.max(0, S.pokeImpulseTimer / 200));

    // Invert poke so the ring grows as poke fades
    const INVERTED_POKE = 1 - NORMALIZED_POKE;

    // Drive ring radius, width, and alpha from poke
    RING_RADIUS = TARGET_RING_RADIUS * INVERTED_POKE;
    RING_WIDTH = NORMALIZED_POKE * 7;
    RING_ALPHA = NORMALIZED_POKE;
  }

  // Draw the ring only when it is visible enough to matter
  if (RING_ALPHA > 0.001) {
    // Draw ring using isolated context state so styling does not leak
    CONTEXT.save();
    CONTEXT.lineWidth = RING_WIDTH;
    CONTEXT.strokeStyle = "rgba(189, 189, 189, 1)";
    CONTEXT.globalAlpha = RING_ALPHA;
    CONTEXT.beginPath();
    CONTEXT.arc(S.pointerClientX, S.pointerClientY, RING_RADIUS, 0, Math.PI * 2);
    CONTEXT.stroke();
    CONTEXT.restore();
  }
};

/* #endregion 2) RENDERING */



/*========================================*
//#region 3) USER INPUT
 *========================================*/

/* AMPLIFY STAR MOVEMENT RELATIVE TO POINTER MOVEMENT SPEED */
S.updatePointerSpeed = function updatePointerSpeed(CURRENT_X, CURRENT_Y) {
  // Sample current time for pointer speed calculation
  const NOW_MS = S.getNowMs();

  // Initialize pointer tracking on the first call of a gesture
  if (!S.lastPointerTimeMs) {
    // Store the first pointer position for future delta calculations
    S.pointerClientX = CURRENT_X;
    S.pointerClientY = CURRENT_Y;

    // Store the time baseline for future delta time calculations
    S.lastPointerTimeMs = NOW_MS;

    // Reset pointer speed so the first sample does not spike
    S.pointerSpeedUnits = 0;

    // Exit early because we need a second sample to compute a speed
    return;
  }

  // Compute elapsed time since last pointer sample (minimum 1ms to avoid divide-by-zero)
  const DT = Math.max(1, NOW_MS - S.lastPointerTimeMs);

  // Compute pointer movement delta since last sample
  const DX = CURRENT_X - S.pointerClientX;
  const DY = CURRENT_Y - S.pointerClientY;

  // Convert raw movement into a speed value (pixels per ms)
  const RAW_SPEED = Math.sqrt(DX * DX + DY * DY) / DT;

  // Convert raw speed into a capped, screen-normalized speed unit
  S.pointerSpeedUnits = S.screenScaleDown * Math.min(RAW_SPEED * 50, 50);

  // Kick ring timer upward so fast motion makes the ring appear immediately
  S.pointerRingTimer = Math.max(S.pointerRingTimer, S.pointerSpeedUnits);

  // Mark links dirty when speed is high so link network updates feel responsive
  if (S.pointerSpeedUnits > 10) LINKS_DIRTY = true;

  // Update stored pointer for the next delta calculation
  S.pointerClientX = CURRENT_X;
  S.pointerClientY = CURRENT_Y;

  // Update stored pointer time for the next delta time calculation
  S.lastPointerTimeMs = NOW_MS;
};

/* WHEN USER BEGINS MOVEMENT */
S.beginPointerInteraction = function beginPointerInteraction(START_X, START_Y) {
  // Start a new poke burst at full strength
  S.pokeImpulseTimer = 200;

  // Reset pointer time so the next speed sample initializes cleanly
  S.lastPointerTimeMs = 0;

  // Seed pointer tracking with the starting position
  S.updatePointerSpeed(START_X, START_Y);
};

/* DIFFERENT TYPES OF USER INTERACTION */
// Mouse
window.addEventListener("mousedown", (EVENT) =>
  // Begin interaction using the mouse down position
  S.beginPointerInteraction(EVENT.clientX, EVENT.clientY)
);

// Pointer move (mouse, stylus, trackpad)
window.addEventListener("pointermove", (EVENT) => {
  // Ignore touch pointermove here because touch has its own handlers
  if (EVENT.pointerType === "touch") return;

  // Update pointer speed using pointer event coordinates
  S.updatePointerSpeed(EVENT.clientX, EVENT.clientY);
});

// Touch
window.addEventListener(
  "touchstart",
  (EVENT) => {
    // Grab the first active touch point
    const TOUCH = EVENT.touches[0];

    // Bail if no touches exist (safety guard)
    if (!TOUCH) return;

    // Begin interaction using the touch start position
    S.beginPointerInteraction(TOUCH.clientX, TOUCH.clientY);
  },
  // Allow scrolling to stay smooth by not blocking the event
  { passive: true }
);

// Touch
window.addEventListener(
  "touchmove",
  (EVENT) => {
    // Grab the first active touch point
    const TOUCH = EVENT.touches[0];

    // Bail if no touches exist (safety guard)
    if (!TOUCH) return;

    // Update pointer speed using the touch move position
    S.updatePointerSpeed(TOUCH.clientX, TOUCH.clientY);
  },
  // Allow scrolling to stay smooth by not blocking the event
  { passive: true }
);

/* #endregion 3) USER INPUT */