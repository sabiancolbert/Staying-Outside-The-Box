// thank heavens for chatGPT <3
// Active Starfield: owns physics, rendering, and pointer input.
// Requires Starfield Setup.js to have created window.STARFIELD and canvas state.

/*======================================================================
 *  MENU
 *----------------------------------------------------------------------
 *  0) PERF HELPERS
 *     - Debug refs (cached DOM)
 *     - Sprite preload state
 *     - Link throttle state
 *     - Fast edge fade helper
 *     - dt helpers (clamp + decay conversion)
 *
 *  1) PHYSICS (updateStarPhysics)
 *     - Time-based stepping (dtFrames)
 *     - Pointer forces (attract / repel / poke)
 *     - Global drift + keyboard forces + optional magnet orbit
 *     - Clamp + integrate
 *     - Paddle-ball collisions + wall wrap/bounce
 *     - Decays, debug readouts, adaptive link-distance “lag buster”
 *
 *  2) RENDERING (renderStarsAndLinks)
 *     - Paddles overlay
 *     - Link batching via Path2D buckets (rebuild throttled)
 *     - Sprite star draw + overlays (darkness + white flash)
 *     - Pointer ring
 *
 *  3) USER INPUT (updatePointerSpeed + listeners)
 *     - Pointer speed energy
 *     - Ring timer
 *     - Mouse / pointer / touch wiring
 *====================================================================*/


/*======================================================================
 * #region 0) PERF HELPERS
 *====================================================================*/

/* GROUP: Shared state alias */
// Grab the shared STARFIELD state created by Starfield Setup.js.
var S = window.STARFIELD;

/* GROUP: Debug refs cached (NOT on STARFIELD) */
// Cache debug element references so we don't query the DOM every frame.
const DBG = {

  // Displays a sample value (frame ms) for quick sanity checks.
  misc: null,

  // Displays pointer ring timer.
  circle: null,

  // Displays pointer speed energy.
  speed: null,

  // Displays poke timer.
  poke: null
};

// Look up optional debug elements (they don't exist on most pages).
DBG.misc = document.getElementById("dbgMisc");       // Debug readout: misc
DBG.circle = document.getElementById("dbgCircle");   // Debug readout: ring timer
DBG.speed = document.getElementById("dbgSpeed");     // Debug readout: pointer speed
DBG.poke = document.getElementById("dbgPoke");       // Debug readout: poke timer

/* GROUP: Sprite stars (WebP) */
// Hold sprite loading state so rendering can bail until the image is ready.
const STAR_SPRITES = {

  // True once the star image is fully loaded.
  ready: false,

  // The Image() object used by drawImage().
  img: null
};

// Load the star sprite immediately so it is ready by the time rendering starts.
(function loadStarSpriteNow() {

  // Create a new image object for the star sprite.
  const IMG = new Image();

  // Hint: decode image off the main thread if possible.
  IMG.decoding = "async";

  // Hint: start loading immediately.
  IMG.loading = "eager";

  // Mark sprite as ready once the image loads successfully.
  IMG.onload = () => { STAR_SPRITES.ready = true; };

  // Mark sprite as not ready if the image fails to load.
  IMG.onerror = () => { STAR_SPRITES.ready = false; };

  // Provide the sprite URL (starts the network request).
  IMG.src = "/Resources/Star.webp";

  // Store the image object for later drawing.
  STAR_SPRITES.img = IMG;
})();

/* GROUP: Link throttle state */
// Count frames so we can rebuild link geometry every N frames.
let LINK_FRAME = 0;

// Flag used to force an immediate link rebuild (ex: fast pointer movement).
let LINKS_DIRTY = true;

/* GROUP: Links fade near the edges */
// Faster edge fade helper for links (keeps rendering logic light).
function getEdgeFadeFactorFast(STAR) {

  // Approximate star "radius" based on how large it draws on screen.
  const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

  // Measure padded distance to each edge (radius avoids visible popping at wrap).
  const DIST_LEFT = STAR.x + STAR_RADIUS;
  const DIST_RIGHT = (S.canvasWidth + STAR_RADIUS) - STAR.x;
  const DIST_TOP = STAR.y + STAR_RADIUS;
  const DIST_BOTTOM = (S.canvasHeight + STAR_RADIUS) - STAR.y;

  // Find the closest edge distance (the "most at risk" direction).
  const MIN_EDGE_DISTANCE = Math.min(DIST_LEFT, DIST_RIGHT, DIST_TOP, DIST_BOTTOM);

  // Define fade band width (cap it so it stays cheap).
  const FADE_BAND = Math.min(90, S.screenPerimeter * 0.03) || 1;

  // Convert closest distance into 0..1 fade factor.
  const T =
    MIN_EDGE_DISTANCE <= 0 ? 0 :
    MIN_EDGE_DISTANCE >= FADE_BAND ? 1 :
    (MIN_EDGE_DISTANCE / FADE_BAND);

  // Square for quick easing (cheap “smooth-ish” curve).
  return T * T;
}

/* GROUP: Time scaling helpers */
// Define how many ms one 60fps frame represents (conversion constant).
const SIXTY_FPS_FRAME_MS = 1000 / 60;

// Clamp dt (ms) to prevent tab-sleep teleports and clock weirdness.
function clampDtMs(dtMs) {

  // Prevent negative dt (clock weirdness) from producing inverted updates.
  if (dtMs < 0) return 0;

  // Cap dt so tab sleep / lag spikes don't cause massive forces and teleports.
  if (dtMs > 50) return 50; // ~3 frames at 60fps

  // Return dt unchanged when it is in a safe range.
  return dtMs;
}

// Convert a per-frame decay constant into a time-based decay.
function decayPerFrameToDt(basePerFrame, dtFrames) {

  // Example: 0.98 per frame becomes 0.98^dtFrames for variable FPS.
  return Math.pow(basePerFrame, dtFrames);
}

/* #endregion 0) PERF HELPERS */



/*======================================================================
 * #region 1) PHYSICS
 *====================================================================*/

/* GROUP: Physics entry point */
// Decide how each star should move.
S.updateStarPhysics = function updateStarPhysics() {

  // Bail early if we have no stars to simulate.
  if (!S.starList.length) return;

  // Sample time from Setup helper (performance.now when possible).
  const NOW = S.getNowMs();

  // Mark start time for per-frame debug timing.
  const FRAME_START_MS = NOW;

  // Use previous timestamp, or default to NOW on first frame.
  const LAST = S.lastPhysicsMs || NOW;

  // Compute elapsed time and clamp to avoid huge simulation jumps.
  const dtMs = clampDtMs(NOW - LAST);

  // Store this frame's timestamp for next update.
  S.lastPhysicsMs = NOW;

  // Normalize elapsed time into “60fps frames”.
  const dtFrames = dtMs / SIXTY_FPS_FRAME_MS;

  // Bail if dt is zero so we don't waste work.
  if (dtFrames <= 0) return;

  /* GROUP: Ranges + settings */
  // Define maximum range where pointer forces can affect stars.
  const INFLUENCE_RANGE = S.screenPerimeter * 0.2;

  // Precompute squared range for cheap comparisons.
  const INFLUENCE_RANGE_SQ = INFLUENCE_RANGE * INFLUENCE_RANGE;

  // Local distance threshold for wrap vs bounce behavior.
  const WRAP_DISTANCE_SQ = 200 * 200;

  // Grab UI-tunable settings.
  const SETTINGS = S.interactionSettings;

  // Grab precomputed screen scaling powers.
  const SCALE = S.screenScalePowers;

  /* GROUP: Time-based decays */
  // Convert legacy “per frame” decays into time-based multipliers.
  const MOMENTUM_DECAY = decayPerFrameToDt(0.98, dtFrames);
  const WHITE_DECAY = decayPerFrameToDt(0.98, dtFrames);
  const POINTER_SPEED_DECAY = decayPerFrameToDt(0.5, dtFrames);
  const RING_DECAY = decayPerFrameToDt(0.95, dtFrames);
  const POKE_DECAY = decayPerFrameToDt(0.85, dtFrames);

  /* GROUP: Update each star */
  for (const STAR of S.starList) {

    // Prevent paddle bounce and normal bounce from fighting each other.
    let DID_BOUNCE = false;

    // Compute pointer delta vector (pointer minus star).
    const POINTER_DELTA_X = S.pointerClientX - STAR.x;
    const POINTER_DELTA_Y = S.pointerClientY - STAR.y;

    // Compute squared distance for range checks.
    const DISTANCE_SQ =
      POINTER_DELTA_X * POINTER_DELTA_X + POINTER_DELTA_Y * POINTER_DELTA_Y;

    /* GROUP: Proximity-only forces */
    if (DISTANCE_SQ < INFLUENCE_RANGE_SQ) {

      // Compute true distance and add epsilon to prevent divide-by-zero.
      const DISTANCE = Math.sqrt(DISTANCE_SQ) + 0.0001;

      // Normalize delta into a unit vector toward pointer.
      const UNIT_TO_POINTER_X = POINTER_DELTA_X / DISTANCE;
      const UNIT_TO_POINTER_Y = POINTER_DELTA_Y / DISTANCE;

      /* GROUP: Attraction */
      // Convert distance into 0..1 gradient inside attraction radius.
      let ATTRACTION_GRADIENT =
        1 - (DISTANCE / (((SETTINGS.attractRadius * 5.2) * SCALE.attractionGradient) || 1));

      // Clamp so it never goes negative outside radius.
      ATTRACTION_GRADIENT = Math.max(0, ATTRACTION_GRADIENT);

      // Shape attraction falloff curve.
      const ATTRACTION_SHAPE = Math.pow(
        ATTRACTION_GRADIENT,
        Math.max(0.1, ((SETTINGS.attractScale * 0.48) * SCALE.attractionShape))
      );

      // Compute attraction force (settings + screen scale + pointer energy + shape).
      const ATTRACTION_FORCE =
        ((SETTINGS.attractStrength * 0.0044) * SCALE.attractionForce) *
        S.pointerSpeedUnits *
        ATTRACTION_SHAPE;

      /* GROUP: Repulsion */
      // Convert distance into 0..1 gradient inside repulsion radius.
      let REPULSION_GRADIENT =
        1 - (DISTANCE / (((SETTINGS.repelRadius * 2.8) * SCALE.repulsionGradient) || 1));

      // Clamp so it never goes negative outside radius.
      REPULSION_GRADIENT = Math.max(0, REPULSION_GRADIENT);

      // Shape repulsion falloff curve.
      const REPULSION_SHAPE = Math.pow(
        REPULSION_GRADIENT,
        Math.max(0.1, (SETTINGS.repelScale * 0.64))
      );

      // Compute repulsion force (settings + screen scale + pointer energy + shape).
      const REPULSION_FORCE =
        ((SETTINGS.repelStrength * 0.0182) * SCALE.repulsionForce) *
        S.pointerSpeedUnits *
        REPULSION_SHAPE;

      /* GROUP: Poke */
      // Define poke radius as a fraction of screen size.
      const POKE_RADIUS = S.screenPerimeter * 0.2;

      // Convert distance into 0..1 poke gradient inside poke radius.
      const POKE_GRADIENT = 1 - (DISTANCE / POKE_RADIUS);

      // Shape poke so it ramps sharply near pointer.
      const POKE_SHAPE = Math.pow(Math.max(0, POKE_GRADIENT), 2);

      // Compute poke force (settings + impulse timer + shape).
      const POKE_FORCE =
        (0.01 * SETTINGS.pokeStrength) *
        S.pokeImpulseTimer *
        POKE_SHAPE;

      /* GROUP: Apply proximity-only forces */
      // Apply attraction toward pointer (dt-scaled).
      STAR.momentumX += (ATTRACTION_FORCE * UNIT_TO_POINTER_X) * dtFrames;
      STAR.momentumY += (ATTRACTION_FORCE * UNIT_TO_POINTER_Y) * dtFrames;

      // Apply repulsion away from pointer (dt-scaled).
      STAR.momentumX += (REPULSION_FORCE * -UNIT_TO_POINTER_X) * dtFrames;
      STAR.momentumY += (REPULSION_FORCE * -UNIT_TO_POINTER_Y) * dtFrames;

      // Apply poke burst away from pointer (dt-scaled).
      STAR.momentumX += (POKE_FORCE * -UNIT_TO_POINTER_X) * dtFrames;
      STAR.momentumY += (POKE_FORCE * -UNIT_TO_POINTER_Y) * dtFrames;
    }

    /* GROUP: Global forces */
    // Drift boost grows slightly with pointer energy (keeps motion lively).
    const DRIFT_BOOST = Math.min(7, 0.01 * (S.pointerSpeedUnits + 0.0001));

    // Add passive drift to momentum (dt-scaled).
    STAR.momentumX += (STAR.vx * DRIFT_BOOST) * dtFrames;
    STAR.momentumY += (STAR.vy * DRIFT_BOOST) * dtFrames;

    /* GROUP: Keyboard influence */
    // Apply additive keyboard impulse (one-tick “push”).
    STAR.momentumX += window.KEYBOARD.addX + (window.KEYBOARD.multX * STAR.vx * 0.05);
    STAR.momentumY += window.KEYBOARD.addY + (window.KEYBOARD.multY * STAR.vy * 0.05);

    // Apply multiplicative keyboard scaling (global slow/fast mode).
    STAR.momentumX *= window.KEYBOARD.multX;
    STAR.momentumY *= window.KEYBOARD.multY;

    /* GROUP: Magnet orbit */
    // Run magnet behavior when magnetY is set or pointer magnet mode is active.
    if (window.KEYBOARD.magnetY > 0 || window.KEYBOARD.magnetPointer) {

      // Cache canvas ref for coordinate conversion.
      const CANVAS = S.constellationCanvas;

      // Bail if canvas is missing (should not happen in normal operation).
      if (CANVAS) {

        // Read bounding rect so pointer client coords can map to canvas coords.
        const rect = CANVAS.getBoundingClientRect();

        // Declare magnet coordinates in canvas space.
        let mx, my;

        // Pointer magnet: target pointer position.
        if (window.KEYBOARD.magnetPointer) {

          // Convert client coords into canvas coords via rect offset.
          mx = S.pointerClientX - rect.left;
          my = S.pointerClientY - rect.top;

        } else {

          // Percent magnet: convert 0..100 into canvas pixel coords.
          mx = (window.KEYBOARD.magnetX / 100) * S.canvasWidth;
          my = (window.KEYBOARD.magnetY / 100) * S.canvasHeight;
        }

        // Vector from star to magnet.
        const dxm = mx - STAR.x;
        const dym = my - STAR.y;

        // Distance to magnet (epsilon prevents divide-by-zero).
        const dm = Math.sqrt(dxm * dxm + dym * dym) + 0.0001;

        // Unit vector toward magnet (scaled up for “snappy” feel).
        const ux = (dxm / dm) * 5;
        const uy = (dym / dm) * 5;

        // Perpendicular vector controls orbit direction.
        const dir = (window.KEYBOARD.magnetDir === -1) ? -1 : 1;

        // Perpendicular vector (rotate unit vector 90°).
        const px = -uy * dir;
        const py =  ux * dir;

        // Optional strength knob (defaults to 1).
        const strength = window.KEYBOARD.magnetStrength || 1;

        // Distance falloff to soften far-field pull/spin.
        const FALLOFF = 0.35;

        // Falloff factor (higher dm -> smaller force).
        const fall = 1 / (1 + FALLOFF * dm / (S.screenPerimeter || 1));

        // Base force uses clamp scaling so it stays screen-consistent.
        const BASE = (0.08 * SETTINGS.clamp * SCALE.forceClamp) * strength * fall;

        // Pull (toward magnet) portion.
        const PULL = BASE * 0.55;

        // Spin (orbit) portion.
        const SPIN = BASE * 0.95;

        // Apply combined pull + spin to momentum (dt-scaled).
        STAR.momentumX += (ux * PULL + px * SPIN) * dtFrames;
        STAR.momentumY += (uy * PULL + py * SPIN) * dtFrames;

        // Mark links dirty so link geometry stays responsive during orbit.
        LINKS_DIRTY = true;
      }
    }

    /* GROUP: Momentum clamp */
    // Compute maximum allowed momentum based on clamp and screen scaling.
    const MOMENTUM_LIMIT = 2 * SETTINGS.clamp * SCALE.forceClamp;

    // Compute current momentum magnitude.
    const MOMENTUM_MAG = Math.sqrt(
      STAR.momentumX * STAR.momentumX + STAR.momentumY * STAR.momentumY
    );

    // Clamp momentum to prevent runaway speeds.
    if (MOMENTUM_MAG > MOMENTUM_LIMIT) {

      // Scale factor needed to reduce to limit.
      const MOMENTUM_SCALE = MOMENTUM_LIMIT / MOMENTUM_MAG;

      // Apply scaling to clamp magnitude.
      STAR.momentumX *= MOMENTUM_SCALE;
      STAR.momentumY *= MOMENTUM_SCALE;
    }

    /* GROUP: Integration */
    // Integrate position from base velocity plus momentum (dt-scaled).
    STAR.x += (STAR.vx + STAR.momentumX) * dtFrames;
    STAR.y += (STAR.vy + STAR.momentumY) * dtFrames;

    /* GROUP: Momentum friction with floor */
    // Minimum momentum magnitude (prevents stars from “dying” completely).
    const MIN_MOM = 0.01;

    // Apply time-based friction decay.
    STAR.momentumX *= MOMENTUM_DECAY;
    STAR.momentumY *= MOMENTUM_DECAY;

    // Preserve sign while enforcing minimum magnitude (X).
    if (STAR.momentumX !== 0) {
      STAR.momentumX = Math.sign(STAR.momentumX) * Math.max(MIN_MOM, Math.abs(STAR.momentumX));
    }

    // Preserve sign while enforcing minimum magnitude (Y).
    if (STAR.momentumY !== 0) {
      STAR.momentumY = Math.sign(STAR.momentumY) * Math.max(MIN_MOM, Math.abs(STAR.momentumY));
    }

    /* GROUP: Paddle star physics */
    // Only run paddle collisions when paddles are active and this is the “ball”.
    if (window.KEYBOARD.paddlesTimer > 0 && STAR === S.starList[0]) {

      // Keep the paddle ball white and visible.
      STAR.whiteValue = 1;
      STAR.opacity = 1;

      // Cache canvas ref for rect mapping.
      const CANVAS = S.constellationCanvas;

      // Proceed only when canvas exists.
      if (CANVAS) {

        // Read rect for converting viewport to canvas space.
        const rect = CANVAS.getBoundingClientRect();

        // Visible viewport rectangle in canvas coordinates.
        const viewLeft = -rect.left;
        const viewTop = -rect.top;
        const viewRight = viewLeft + window.innerWidth;
        const viewBottom = viewTop + window.innerHeight;

        // Paddle center (0..100) mapped into viewport then canvas coords.
        const cx = viewLeft + (window.KEYBOARD.paddlesX / 100) * window.innerWidth;
        const cy = viewTop + (window.KEYBOARD.paddlesY / 100) * window.innerHeight;

        // Paddle spans.
        const paddleW = window.innerWidth * 0.10;
        const paddleH = window.innerHeight * 0.10;

        // Half spans for normalization.
        const halfPW = paddleW * 0.5;
        const halfPH = paddleH * 0.5;

        // Paddle thickness.
        const paddleThickness = Math.max(
          2,
          Math.min(window.innerWidth, window.innerHeight) * 0.03
        );

        // Half thickness.
        const halfT = paddleThickness * 0.5;

        // Ball radius (bigger than sprite gives nicer collisions).
        const BALL_R = Math.max(2, (2 + STAR.size) || 2);

        // Ball velocity includes momentum so bounce matches actual movement.
        const Vx = (STAR.vx || 0) + (STAR.momentumX || 0);
        const Vy = (STAR.vy || 0) + (STAR.momentumY || 0);

        // Ball speed magnitude.
        const speed = Math.sqrt(Vx * Vx + Vy * Vy);

        // Skip bounce math if speed is essentially zero.
        if (speed > 0.0001) {

          // Local clamp helper for offsets.
          const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

          // Max angle for “edge hit” deflections.
          const maxAngle = 1.25;

          // Push out after hit so we don’t re-hit instantly.
          const pushOutX = BALL_R + halfT + 0.5;
          const pushOutY = BALL_R + halfT + 0.5;

          // Touch checks (ball radius + paddle thickness).
          const touchLeft   = STAR.x <= viewLeft   + (BALL_R + halfT);
          const touchRight  = STAR.x >= viewRight  - (BALL_R + halfT);
          const touchTop    = STAR.y <= viewTop    + (BALL_R + halfT);
          const touchBottom = STAR.y >= viewBottom - (BALL_R + halfT);

          // Segment checks (must overlap paddle segment).
          const withinLeftRightPaddle = (STAR.y >= (cy - halfPH) && STAR.y <= (cy + halfPH));
          const withinTopBottomPaddle = (STAR.x >= (cx - halfPW) && STAR.x <= (cx + halfPW));

          // Cooldown between hits to avoid jittery multi-collisions.
          const HIT_COOLDOWN_MS = 60;

          /* GROUP: Left paddle */
          // Left paddle bounce to the right.
          if (touchLeft && withinLeftRightPaddle && Vx < 0) {

            // Offset normalized to [-1..1] across paddle height.
            const offset = clamp((STAR.y - cy) / (halfPH || 1), -1, 1);

            // Angle uses offset so center hits go straight, edge hits curve.
            const ang = offset * maxAngle;

            // Desired outgoing velocity components.
            const outVx = +1 * speed * Math.cos(ang);
            const outVy = speed * Math.sin(ang);

            // Apply bounce and mark DID_BOUNCE.
            DID_BOUNCE = bounceVertical(
              STAR, viewLeft, +1, outVx, outVy, pushOutX, NOW, HIT_COOLDOWN_MS
            ) || DID_BOUNCE;
          }

          /* GROUP: Right paddle */
          // Right paddle bounce to the left.
          else if (touchRight && withinLeftRightPaddle && Vx > 0) {

            // Offset normalized to [-1..1].
            const offset = clamp((STAR.y - cy) / (halfPH || 1), -1, 1);

            // Angle from offset.
            const ang = offset * maxAngle;

            // Desired outgoing velocity.
            const outVx = -1 * speed * Math.cos(ang);
            const outVy = speed * Math.sin(ang);

            // Apply bounce.
            DID_BOUNCE = bounceVertical(
              STAR, viewRight, -1, outVx, outVy, pushOutX, NOW, HIT_COOLDOWN_MS
            ) || DID_BOUNCE;
          }

          /* GROUP: Top paddle */
          // Top paddle bounce down.
          else if (touchTop && withinTopBottomPaddle && Vy < 0) {

            // Offset normalized to [-1..1] across paddle width.
            const offset = clamp((STAR.x - cx) / (halfPW || 1), -1, 1);

            // Angle from offset.
            const ang = offset * maxAngle;

            // Desired outgoing velocity.
            const outVy = +1 * speed * Math.cos(ang);
            const outVx = speed * Math.sin(ang);

            // Apply bounce.
            DID_BOUNCE = bounceHorizontal(
              STAR, viewTop, +1, outVx, outVy, pushOutY, NOW, HIT_COOLDOWN_MS
            ) || DID_BOUNCE;
          }

          /* GROUP: Bottom paddle */
          // Bottom paddle bounce up.
          else if (touchBottom && withinTopBottomPaddle && Vy > 0) {

            // Offset normalized to [-1..1].
            const offset = clamp((STAR.x - cx) / (halfPW || 1), -1, 1);

            // Angle from offset.
            const ang = offset * maxAngle;

            // Desired outgoing velocity.
            const outVy = -1 * speed * Math.cos(ang);
            const outVx = speed * Math.sin(ang);

            // Apply bounce.
            DID_BOUNCE = bounceHorizontal(
              STAR, viewBottom, -1, outVx, outVy, pushOutY, NOW, HIT_COOLDOWN_MS
            ) || DID_BOUNCE;
          }
        }
      }
    }

    /* GROUP: Edge behavior (wrap vs bounce) */
    // Wrap when ring is off, far away, or poke is strong.
    if (S.pointerRingTimer === 0 || DISTANCE_SQ > WRAP_DISTANCE_SQ || S.pokeImpulseTimer > 10) {

      // Compute padded radius for wrap checks.
      const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

      // Wrap left -> right.
      if (STAR.x < -STAR_RADIUS) STAR.x = S.canvasWidth + STAR_RADIUS;

      // Wrap right -> left.
      else if (STAR.x > S.canvasWidth + STAR_RADIUS) STAR.x = -STAR_RADIUS;

      // Wrap top -> bottom.
      if (STAR.y < -STAR_RADIUS) STAR.y = S.canvasHeight + STAR_RADIUS;

      // Wrap bottom -> top.
      else if (STAR.y > S.canvasHeight + STAR_RADIUS) STAR.y = -STAR_RADIUS;

    } else {

      // Only wall-bounce if paddles didn’t already bounce us this frame.
      if (!DID_BOUNCE) {

        // Compute padded radius for bounce checks.
        const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

        // Combined velocity for direction decisions.
        const Vx = (STAR.vx || 0) + (STAR.momentumX || 0);
        const Vy = (STAR.vy || 0) + (STAR.momentumY || 0);

        // Push away from wall so we don’t get stuck re-hitting.
        const pushOutX = STAR_RADIUS + 0.5;
        const pushOutY = STAR_RADIUS + 0.5;

        // Left wall.
        if (STAR.x < STAR_RADIUS) {
          const outVx = Math.abs(Vx);
          const outVy = Vy;
          bounceVertical(STAR, STAR_RADIUS, +1, outVx, outVy, pushOutX, NOW, 0);
        }

        // Right wall.
        else if (STAR.x > S.canvasWidth - STAR_RADIUS) {
          const outVx = -Math.abs(Vx);
          const outVy = Vy;
          bounceVertical(STAR, S.canvasWidth - STAR_RADIUS, -1, outVx, outVy, pushOutX, NOW, 0);
        }

        // Top wall.
        if (STAR.y < STAR_RADIUS) {
          const outVx = Vx;
          const outVy = Math.abs(Vy);
          bounceHorizontal(STAR, STAR_RADIUS, +1, outVx, outVy, pushOutY, NOW, 0);
        }

        // Bottom wall.
        else if (STAR.y > S.canvasHeight - STAR_RADIUS) {
          const outVx = Vx;
          const outVy = -Math.abs(Vy);
          bounceHorizontal(STAR, S.canvasHeight - STAR_RADIUS, -1, outVx, outVy, pushOutY, NOW, 0);
        }
      }
    }

    /* GROUP: White flash decay */
    // Only decay when whiteValue is above zero.
    if (STAR.whiteValue > 0) {

      // Fade whiteValue down smoothly over time.
      STAR.whiteValue *= WHITE_DECAY;

      // Snap tiny values to zero to avoid endless micro-updates.
      if (STAR.whiteValue < 0.001) STAR.whiteValue = 0;
    }

    /* GROUP: Opacity / twinkle cycle */
    // Reset twinkle when opacity gets very low.
    if (STAR.opacity <= 0.005) {

      // Restart opacity at full brightness.
      STAR.opacity = 1;

      // Occasionally trigger a white flash on a new twinkle.
      if (Math.random() < 0.07) STAR.whiteValue = 1;
    }

    // Fade faster while the star is still fairly visible.
    else if (STAR.opacity > 0.02) {

      // Reduce opacity using fadeSpeed and dtFrames.
      STAR.opacity -= (0.005 * STAR.fadeSpeed) * dtFrames;
    }

    // Fade slowly near the end so it doesn't vanish abruptly.
    else {

      // Reduce opacity with a tiny drift amount.
      STAR.opacity -= 0.0001 * dtFrames;
    }
  }

  /*==================================================================
   * GROUP: Global decays + one-tick impulse resets
   *==================================================================*/

  /* GROUP: Reset keyboard impulses */
  // Reset keyboard forces so keys act as one-tick impulses.
  window.KEYBOARD.multX = 1;
  window.KEYBOARD.multY = 1;
  window.KEYBOARD.addX = 0;
  window.KEYBOARD.addY = 0;
  window.KEYBOARD.magnetX = 0;
  window.KEYBOARD.magnetY = 0;
  window.KEYBOARD.magnetPointer = false;

  /* GROUP: Pointer energy decay */
  // Decay pointer speed energy over time.
  S.pointerSpeedUnits *= POINTER_SPEED_DECAY;

  // Snap tiny values to zero.
  if (S.pointerSpeedUnits < 0.001) S.pointerSpeedUnits = 0;

  /* GROUP: Ring timer decay */
  // Decay ring timer over time.
  S.pointerRingTimer *= RING_DECAY;

  // Snap small values to zero so “off” is truly off.
  if (S.pointerRingTimer < 1) S.pointerRingTimer = 0;

  /* GROUP: Poke timer decay */
  // Decay poke impulse over time.
  S.pokeImpulseTimer *= POKE_DECAY;

  // Snap small values to zero so poke ends cleanly.
  if (S.pokeImpulseTimer < 1) S.pokeImpulseTimer = 0;

  /*==================================================================
   * GROUP: Debug readouts (only when present)
   *==================================================================*/
  if (DBG.misc || DBG.circle || DBG.speed || DBG.poke) {

    // Write frame cost (ms) for quick sanity checks.
    if (DBG.misc) DBG.misc.textContent = (S.getNowMs() - FRAME_START_MS).toFixed(3);

    // Write ring timer.
    if (DBG.circle) DBG.circle.textContent = S.pointerRingTimer.toFixed(3);

    // Write pointer speed energy.
    if (DBG.speed) DBG.speed.textContent = S.pointerSpeedUnits.toFixed(3);

    // Write poke timer.
    if (DBG.poke) DBG.poke.textContent = S.pokeImpulseTimer.toFixed(1);
  }

  /*==================================================================
   * GROUP: Adaptive link-distance “lag buster”
   *==================================================================*/

  // Measure how long this physics frame took.
  const FRAME_TIME_MS = S.getNowMs() - FRAME_START_MS;

  // Target budget for physics in ms (tune to taste).
  const TARGET_MS = 3;

  // Shrink rate when over budget.
  const SHRINK = 0.95;

  // Grow rate when under budget.
  const GROW = 1.05;

  // Minimum distance allowed (relative to original goal).
  const MIN_LINK_DISTANCE = S.goalLinkDistance * 0.3;

  // Maximum distance allowed (cap at goal).
  const MAX_LINK_DISTANCE = S.goalLinkDistance;

  // If slow, reduce link distance to cut link pairs.
  if (FRAME_TIME_MS > TARGET_MS) {

    // Too slow: reduce link distance.
    S.maxLinkDistance *= SHRINK;

  } else {

    // Fast enough: restore quality.
    S.maxLinkDistance *= GROW;

    /* GROUP: Keyboard "L" button fade-in */
    // When link rebuild timer is active, ramp link distance back in smoothly.
    if (S.linkRebuildTimer > 0) {

      // Convert timer into 0..1 progress.
      const t = 1 - (S.linkRebuildTimer / 300);

      // Apply ramped link distance.
      S.maxLinkDistance = S.goalLinkDistance * t;

      // Force a rebuild so the ramp shows immediately.
      LINKS_DIRTY = true;
    }
  }

  /* GROUP: linkRebuildTimer decay */
  // Count link rebuild timer down over time.
  if (S.linkRebuildTimer > 0) S.linkRebuildTimer -= 0.1 * dtMs;

  // Clamp timer to zero.
  if (S.linkRebuildTimer < 0) S.linkRebuildTimer = 0;

  /* GROUP: Clamp link distance */
  // Prevent maxLinkDistance from shrinking too far.
  if (S.maxLinkDistance < MIN_LINK_DISTANCE) {
    S.maxLinkDistance = MIN_LINK_DISTANCE;
  }

  // Prevent maxLinkDistance from growing above the goal.
  else if (S.maxLinkDistance > MAX_LINK_DISTANCE) {
    S.maxLinkDistance = MAX_LINK_DISTANCE;
  }
};

/*======================================================================
 * GROUP: Bounce helpers (momentum-only, no hard stop)
 *====================================================================*/

// Bounce off a vertical wall (left/right).
function bounceVertical(STAR, wallX, wallSign, outVx, outVy, pushOut, NOW, cooldownMs = 0) {

  // Enforce cooldown when requested.
  if (cooldownMs > 0) {

    // Read last bounce timestamp.
    const last = STAR.lastBounceV_Ms || 0;

    // Skip if we are still in cooldown window.
    if (NOW - last < cooldownMs) return false;

    // Record bounce timestamp.
    STAR.lastBounceV_Ms = NOW;
  }

  // Base drift velocity (never changes here).
  const baseVx = STAR.vx || 0;
  const baseVy = STAR.vy || 0;

  // Convert desired TOTAL velocity into momentum-only.
  STAR.momentumX = outVx - baseVx;
  STAR.momentumY = outVy - baseVy;

  // Push away from wall so we don’t immediately collide again.
  STAR.x = wallX + wallSign * pushOut;

  // Report that we bounced.
  return true;
}

// Bounce off a horizontal wall (top/bottom).
function bounceHorizontal(STAR, wallY, wallSign, outVx, outVy, pushOut, NOW, cooldownMs = 0) {

  // Enforce cooldown when requested.
  if (cooldownMs > 0) {

    // Read last bounce timestamp.
    const last = STAR.lastBounceH_Ms || 0;

    // Skip if we are still in cooldown window.
    if (NOW - last < cooldownMs) return false;

    // Record bounce timestamp.
    STAR.lastBounceH_Ms = NOW;
  }

  // Base drift velocity (never changes here).
  const baseVx = STAR.vx || 0;
  const baseVy = STAR.vy || 0;

  // Convert desired TOTAL velocity into momentum-only.
  STAR.momentumX = outVx - baseVx;
  STAR.momentumY = outVy - baseVy;

  // Push away from wall so we don’t immediately collide again.
  STAR.y = wallY + wallSign * pushOut;

  // Report that we bounced.
  return true;
}

/* #endregion 1) PHYSICS */



/*======================================================================
 * #region 2) RENDERING
 *====================================================================*/

/* GROUP: Link bucket constants */
// Define how many opacity buckets we use for link drawing.
const LINK_BUCKET_COUNT = 18;

// Pre-create Path2D buckets so we can batch links by alpha.
let LINK_PATHS_BY_BUCKET = Array.from({ length: LINK_BUCKET_COUNT }, () => new Path2D());

/* GROUP: Bucket reset helper */
// Clear paths by replacing them with fresh Path2D objects.
function resetLinkPaths() {

  // Loop every bucket index.
  for (let BUCKET_INDEX = 0; BUCKET_INDEX < LINK_BUCKET_COUNT; BUCKET_INDEX++) {

    // Replace this bucket path with a fresh empty path.
    LINK_PATHS_BY_BUCKET[BUCKET_INDEX] = new Path2D();
  }
}

/* GROUP: Render entry point */
// Display the calculated stars and lines.
S.renderStarsAndLinks = function renderStarsAndLinks() {

  // Grab the 2D canvas context.
  const CONTEXT = S.drawingContext;

  // Clear the full canvas each frame before redrawing.
  CONTEXT.clearRect(0, 0, S.canvasWidth, S.canvasHeight);

  /*==================================================================
   * GROUP: Paddles overlay
   *==================================================================*/
  if (window.KEYBOARD.paddlesTimer > 0) {

    // Clamp paddle coords to 0..100.
    window.KEYBOARD.paddlesX = Math.max(0, Math.min(100, window.KEYBOARD.paddlesX));
    window.KEYBOARD.paddlesY = Math.max(0, Math.min(100, window.KEYBOARD.paddlesY));

    // Cache canvas ref.
    const CANVAS = S.constellationCanvas;

    // Bail if canvas missing.
    if (!CANVAS) return;

    // Read rect to map viewport to canvas coordinates.
    const rect = CANVAS.getBoundingClientRect();

    // Visible viewport rectangle in canvas coordinates.
    const viewLeft = -rect.left;
    const viewTop = -rect.top;
    const viewRight = viewLeft + window.innerWidth;
    const viewBottom = viewTop + window.innerHeight;

    // Timer lives on KEYBOARD; use it as alpha.
    const alpha = Math.min(1, Math.max(0, window.KEYBOARD.paddlesTimer));

    // Paddle center in canvas coordinates.
    const cx = viewLeft + (window.KEYBOARD.paddlesX / 100) * window.innerWidth;
    const cy = viewTop + (window.KEYBOARD.paddlesY / 100) * window.innerHeight;

    // Paddle spans as % of viewport size.
    const paddleW = window.innerWidth * 0.10;
    const paddleH = window.innerHeight * 0.10;

    // Draw paddles.
    CONTEXT.save();

    // Apply alpha for fade-out.
    CONTEXT.globalAlpha = alpha;

    // Set thickness.
    CONTEXT.lineWidth = Math.max(2, Math.min(window.innerWidth, window.innerHeight) * 0.03);

    // Round caps for “paddle” feel.
    CONTEXT.lineCap = "round";

    // White stroke.
    CONTEXT.strokeStyle = "rgba(255,255,255,1)";

    // Build paddle segments.
    CONTEXT.beginPath();

    // Left and right vertical paddles.
    CONTEXT.moveTo(viewLeft, Math.max(viewTop, cy - paddleH / 2));
    CONTEXT.lineTo(viewLeft, Math.min(viewBottom, cy + paddleH / 2));
    CONTEXT.moveTo(viewRight, Math.max(viewTop, cy - paddleH / 2));
    CONTEXT.lineTo(viewRight, Math.min(viewBottom, cy + paddleH / 2));

    // Top and bottom horizontal paddles.
    CONTEXT.moveTo(Math.max(viewLeft, cx - paddleW / 2), viewTop);
    CONTEXT.lineTo(Math.min(viewRight, cx + paddleW / 2), viewTop);
    CONTEXT.moveTo(Math.max(viewLeft, cx - paddleW / 2), viewBottom);
    CONTEXT.lineTo(Math.min(viewRight, cx + paddleW / 2), viewBottom);

    // Stroke the paddles.
    CONTEXT.stroke();

    // Restore state.
    CONTEXT.restore();

    // Decay paddles timer.
    window.KEYBOARD.paddlesTimer -= 0.1;
  }

  /*==================================================================
   * GROUP: Links
   *==================================================================*/
  CONTEXT.lineWidth = 1;

  // Cache star count.
  const STAR_COUNT = S.starList.length;

  // Only attempt links when there are stars.
  if (STAR_COUNT) {

    // Advance link frame counter.
    LINK_FRAME++;

    // Force rebuild when pointer energy is high.
    if (S.pointerSpeedUnits > 10) LINKS_DIRTY = true;

    // Decide rebuild cadence (dirty or every other frame).
    const SHOULD_REBUILD_LINKS = LINKS_DIRTY || (LINK_FRAME % 2 === 0);

    // Rebuild geometry when requested.
    if (SHOULD_REBUILD_LINKS) {

      // Clear dirty flag now that rebuild is happening.
      LINKS_DIRTY = false;

      // Update edge fades for every star.
      for (let i = 0; i < STAR_COUNT; i++) {
        S.starList[i].edge = getEdgeFadeFactorFast(S.starList[i]);
      }

      // Convert world distance into link space distance.
      const DISTANCE_SCALE = S.screenPerimeter / 500;

      // Derive raw cutoff and convert to squared for comparisons.
      const RAW_CUTOFF = S.maxLinkDistance / DISTANCE_SCALE;
      const CUTOFF_DISTANCE_SQ = RAW_CUTOFF * RAW_CUTOFF;

      // Clear bucket paths.
      resetLinkPaths();

      // Pairwise link building.
      for (let a = 0; a < STAR_COUNT; a++) {

        // Cache star A.
        const STAR_A = S.starList[a];

        // Cache A coords.
        const AX = STAR_A.x;
        const AY = STAR_A.y;

        // Cache opacity and edge fade.
        const OPACITY_A = STAR_A.opacity;
        const EDGE_A = STAR_A.edge;

        // Pair with stars after A (avoids duplicates).
        for (let b = a + 1; b < STAR_COUNT; b++) {

          // Cache star B.
          const STAR_B = S.starList[b];

          // Compute delta.
          const dx = AX - STAR_B.x;
          const dy = AY - STAR_B.y;

          // Squared distance.
          const d2 = dx * dx + dy * dy;

          // Skip if outside cutoff.
          if (d2 > CUTOFF_DISTANCE_SQ) continue;

          // Compute scaled distance (sqrt only after passing cutoff).
          const SCALED_DISTANCE = Math.sqrt(d2) * DISTANCE_SCALE;

          // Use minimum opacity so dim stars don’t make bright links.
          const MIN_OPACITY = OPACITY_A < STAR_B.opacity ? OPACITY_A : STAR_B.opacity;

          // Use minimum edge fade so edges fade cleanly.
          const MIN_EDGE = EDGE_A < STAR_B.edge ? EDGE_A : STAR_B.edge;

          // Distance fade factor.
          const DISTANCE_FADE = 1 - (SCALED_DISTANCE / S.maxLinkDistance);

          // Clamp fade to >= 0.
          const DISTANCE_CLAMP = DISTANCE_FADE > 0 ? DISTANCE_FADE : 0;

          // Build alpha from distance fade, opacity, and edge fade.
          let LINK_ALPHA = DISTANCE_CLAMP * MIN_OPACITY * MIN_EDGE;

          // Bias alpha upward for pleasing visibility.
          LINK_ALPHA = Math.min(1, (LINK_ALPHA * (LINK_ALPHA + 1)));

          // Skip invisible links.
          if (LINK_ALPHA <= 0.002) continue;

          // Bucket index from alpha.
          let BUCKET_INDEX = (LINK_ALPHA * (LINK_BUCKET_COUNT - 1)) | 0;

          // Clamp bucket low.
          if (BUCKET_INDEX < 0) BUCKET_INDEX = 0;

          // Clamp bucket high.
          if (BUCKET_INDEX >= LINK_BUCKET_COUNT) BUCKET_INDEX = LINK_BUCKET_COUNT - 1;

          // Add segment to this bucket path.
          LINK_PATHS_BY_BUCKET[BUCKET_INDEX].moveTo(AX, AY);
          LINK_PATHS_BY_BUCKET[BUCKET_INDEX].lineTo(STAR_B.x, STAR_B.y);
        }
      }
    }

    // Draw each bucket with its alpha.
    for (let i = 0; i < LINK_BUCKET_COUNT; i++) {

      // Convert bucket index into alpha.
      const A = i / (LINK_BUCKET_COUNT - 1);

      // Skip fully transparent.
      if (A <= 0) continue;

      // Apply alpha to stroke style.
      CONTEXT.strokeStyle = `rgba(100, 100, 100, ${A})`;

      // Stroke this bucket path.
      CONTEXT.stroke(LINK_PATHS_BY_BUCKET[i]);
    }
  }

  /*==================================================================
   * GROUP: Stars
   *==================================================================*/

  // Bail if sprite isn't ready.
  if (!STAR_SPRITES.ready) return;

  // Cache sprite image.
  const IMG = STAR_SPRITES.img;

  // Draw each star sprite.
  for (const STAR of S.starList) {

    // Base radius from whiteValue and size.
    const R = (STAR.whiteValue * 2 + STAR.size) || 1;

    // Sprite size in pixels.
    const SIZE = Math.max(2, R * 2.4);

    // Center coords.
    const CX = STAR.x;
    const CY = STAR.y;

    // Circle radius for overlays.
    const CR = SIZE * 0.48;

    // Normalize redValue into [0..1].
    let t = (STAR.redValue - 50) / 150;
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    // Darkness overlay strength (less red -> darker).
    const DARKNESS = 0.15 + 0.55 * (1 - t);

    // Save state per star.
    CONTEXT.save();

    // Apply star opacity.
    CONTEXT.globalAlpha = STAR.opacity;

    // Move to center.
    CONTEXT.translate(CX, CY);

    // Rotate for line-y sprite variety.
    CONTEXT.rotate(STAR.rotation || 0);

    // Draw sprite.
    CONTEXT.drawImage(IMG, -SIZE / 2, -SIZE / 2, SIZE, SIZE);

    /* GROUP: Darkness overlay */
    CONTEXT.globalCompositeOperation = "source-atop";
    CONTEXT.globalAlpha = STAR.opacity * DARKNESS;
    CONTEXT.fillStyle = "rgba(0, 0, 0, 1)";
    CONTEXT.beginPath();
    CONTEXT.arc(0, 0, CR, 0, Math.PI * 2);
    CONTEXT.fill();

    /* GROUP: White flash overlay */
    if (STAR.whiteValue > 0.01) {
      CONTEXT.globalCompositeOperation = "lighter";
      CONTEXT.globalAlpha = STAR.opacity * (STAR.whiteValue > 1 ? 1 : STAR.whiteValue);
      CONTEXT.fillStyle = "rgba(255, 255, 255, 1)";
      CONTEXT.beginPath();
      CONTEXT.arc(0, 0, CR, 0, Math.PI * 2);
      CONTEXT.fill();
    }

    // Restore state.
    CONTEXT.restore();
  }

  /*==================================================================
   * GROUP: User pointer ring
   *==================================================================*/

  // Base target radius scales with screen size.
  const TARGET_RING_RADIUS = Math.max(0, S.screenScaleUp * 100 - 40);

  // Default ring values driven by ring timer.
  let RING_RADIUS = TARGET_RING_RADIUS * (S.pointerRingTimer / 50);
  let RING_WIDTH = S.pointerRingTimer * 0.15;
  let RING_ALPHA = Math.min(S.pointerRingTimer * 0.07, 1);

  // When pointer energy is low, use poke-driven ring style.
  if (S.pointerSpeedUnits < 1) {

    // Normalize poke timer into 0..1.
    const NORMALIZED_POKE = Math.min(1, Math.max(0, S.pokeImpulseTimer / 200));

    // Invert so ring shrinks as poke “fills”.
    const INVERTED_POKE = 1 - NORMALIZED_POKE;

    // Radius shrinks with poke.
    RING_RADIUS = TARGET_RING_RADIUS * INVERTED_POKE;

    // Width grows with poke.
    RING_WIDTH = NORMALIZED_POKE * 7;

    // Alpha follows poke.
    RING_ALPHA = NORMALIZED_POKE;
  }

  // Only draw ring when visible.
  if (RING_ALPHA > 0.001) {

    // Save ring draw state.
    CONTEXT.save();

    // Apply ring width.
    CONTEXT.lineWidth = RING_WIDTH;

    // Set ring color.
    CONTEXT.strokeStyle = "rgba(189, 189, 189, 1)";

    // Apply ring alpha.
    CONTEXT.globalAlpha = RING_ALPHA;

    // Draw ring path.
    CONTEXT.beginPath();
    CONTEXT.arc(S.pointerClientX, S.pointerClientY, RING_RADIUS, 0, Math.PI * 2);
    CONTEXT.stroke();

    // Restore state.
    CONTEXT.restore();
  }
};

/* #endregion 2) RENDERING */



/*======================================================================
 * #region 3) USER INPUT
 *====================================================================*/

/* GROUP: Pointer speed energy */
// Amplify star movement relative to pointer movement speed.
S.updatePointerSpeed = function updatePointerSpeed(CURRENT_X, CURRENT_Y) {

  // Read timestamp in ms.
  const NOW_MS = S.getNowMs();

  // If we have no baseline time, initialize and bail.
  if (!S.lastPointerTimeMs) {

    // Store pointer position baseline.
    S.pointerClientX = CURRENT_X;
    S.pointerClientY = CURRENT_Y;

    // Store baseline time.
    S.lastPointerTimeMs = NOW_MS;

    // Reset pointer energy.
    S.pointerSpeedUnits = 0;

    // Done for first sample.
    return;
  }

  // Compute dt (min 1ms to avoid divide-by-zero).
  const DT = Math.max(1, NOW_MS - S.lastPointerTimeMs);

  // Compute movement deltas.
  const DX = CURRENT_X - S.pointerClientX;
  const DY = CURRENT_Y - S.pointerClientY;

  // Compute raw speed (pixels per ms).
  const RAW_SPEED = Math.sqrt(DX * DX + DY * DY) / DT;

  // Convert raw speed into capped energy units (screen-scaled).
  S.pointerSpeedUnits = S.screenScaleDown * Math.min(RAW_SPEED * 50, 50);

  // Ensure ring timer is at least as “hot” as pointer energy.
  S.pointerRingTimer = Math.max(S.pointerRingTimer, S.pointerSpeedUnits);

  // Mark links dirty when pointer is moving fast.
  if (S.pointerSpeedUnits > 10) LINKS_DIRTY = true;

  // Commit new pointer position.
  S.pointerClientX = CURRENT_X;
  S.pointerClientY = CURRENT_Y;

  // Commit time baseline.
  S.lastPointerTimeMs = NOW_MS;
};

/* GROUP: Begin interaction */
// Called when user begins movement (tap/click/touch start).
S.beginPointerInteraction = function beginPointerInteraction(START_X, START_Y) {

  // Kick poke burst to full value.
  S.pokeImpulseTimer = 200;

  // Reset pointer timing so first move sample is clean.
  S.lastPointerTimeMs = 0;

  // Seed pointer speed using the starting position.
  S.updatePointerSpeed(START_X, START_Y);
};

/* GROUP: Event listeners */
// Mouse down triggers poke burst and seeds speed.
window.addEventListener("mousedown", (EVENT) =>
  S.beginPointerInteraction(EVENT.clientX, EVENT.clientY)
);

// Pointer move for non-touch pointers (mouse, stylus, trackpad).
window.addEventListener("pointermove", (EVENT) => {

  // Ignore touch pointers here (touch has dedicated handlers).
  if (EVENT.pointerType === "touch") return;

  // Update pointer speed.
  S.updatePointerSpeed(EVENT.clientX, EVENT.clientY);
});

// Touch start seeds interaction.
window.addEventListener(
  "touchstart",
  (EVENT) => {

    // Read first touch.
    const TOUCH = EVENT.touches[0];

    // Bail if missing.
    if (!TOUCH) return;

    // Begin interaction at touch point.
    S.beginPointerInteraction(TOUCH.clientX, TOUCH.clientY);
  },
  { passive: true }
);

// Touch move updates pointer speed.
window.addEventListener(
  "touchmove",
  (EVENT) => {

    // Read first touch.
    const TOUCH = EVENT.touches[0];

    // Bail if missing.
    if (!TOUCH) return;

    // Update pointer speed.
    S.updatePointerSpeed(TOUCH.clientX, TOUCH.clientY);
  },
  { passive: true }
);

/* #endregion 3) USER INPUT */