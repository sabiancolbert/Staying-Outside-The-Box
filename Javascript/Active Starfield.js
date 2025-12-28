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
	misc: null, // Displays a sample value (momentumX) for quick sanity checks
	circle: null, // Displays ring timer
	speed: null, // Displays pointer speed
	poke: null, // Displays poke timer
	lastMs: 0 // Tracks last time we updated debug text (throttle to ~10fps)
};

// Look up optional debug elements (they don't exist on most pages)
DBG.misc = document.getElementById("dbgMisc"); // Debug readout: misc
DBG.circle = document.getElementById("dbgCircle"); // Debug readout: ring timer
DBG.speed = document.getElementById("dbgSpeed"); // Debug readout: pointer speed
DBG.poke = document.getElementById("dbgPoke"); // Debug readout: poke timer

/*---------- Sprite stars (WebP) ----------*/
// Hold sprite loading state so rendering can bail until the image is ready
const STAR_SPRITES = {
	ready: false, // True once the star image is fully loaded
	img: null // The Image() object used by drawImage()
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
	IMG.onload = () => {
		STAR_SPRITES.ready = true;
	};

	// Mark sprite as not ready if the image fails to load
	IMG.onerror = () => {
		STAR_SPRITES.ready = false;
	};

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
		// ✅ Prevent paddle bounce and normal bounce from fighting each other
		let DID_BOUNCE = false;

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
		const DRIFT_BOOST = Math.min(7, 0.01 * (S.pointerSpeedUnits + 0.0001));

		// Add passive drift (dt-scaled so it feels stable across FPS)
		STAR.momentumX += (STAR.vx * DRIFT_BOOST) * dtFrames;
		STAR.momentumY += (STAR.vy * DRIFT_BOOST) * dtFrames;

		// Apply keyboard influence 
		STAR.momentumX += window.KEYBOARD.addX + (window.KEYBOARD.multX * STAR.vx * 0.05);
		STAR.momentumY += window.KEYBOARD.addY + (window.KEYBOARD.multY * STAR.vy * 0.05);
		STAR.momentumX *= window.KEYBOARD.multX;
		STAR.momentumY *= window.KEYBOARD.multY;

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

		// Apply friction decay to momentum (time-based) BUT never let it hit 0
		const MIN_MOM = 0.01;

		STAR.momentumX *= MOMENTUM_DECAY;
		STAR.momentumY *= MOMENTUM_DECAY;

		// Preserve sign while enforcing a minimum magnitude
		if (STAR.momentumX !== 0) STAR.momentumX = Math.sign(STAR.momentumX) * Math.max(MIN_MOM, Math.abs(STAR.momentumX));
		if (STAR.momentumY !== 0) STAR.momentumY = Math.sign(STAR.momentumY) * Math.max(MIN_MOM, Math.abs(STAR.momentumY));

		/*==============================================================*
		 *  PADDLE STAR PHYSICS (FULL INJECTED BLOCK)
		 *==============================================================*/
		if (window.KEYBOARD.paddlesTimer > 0 && STAR === S.starList[0]) {
			// Keep the paddle ball white and visible
			STAR.whiteValue = 1;
			STAR.opacity = 1;

			const CANVAS = S.constellationCanvas;
			if (CANVAS) {
				const rect = CANVAS.getBoundingClientRect();

				// Viewport rectangle in CANVAS coordinates (matches render)
				const viewLeft = -rect.left;
				const viewTop = -rect.top;
				const viewRight = viewLeft + window.innerWidth;
				const viewBottom = viewTop + window.innerHeight;

				// Paddle center (0..100) in viewport -> canvas coords
				const cx = viewLeft + (window.KEYBOARD.paddlesX / 100) * window.innerWidth;
				const cy = viewTop + (window.KEYBOARD.paddlesY / 100) * window.innerHeight;

				// Paddle spans (same as render)
				const paddleW = window.innerWidth * 0.10; // top/bottom paddle length
				const paddleH = window.innerHeight * 0.10; // left/right paddle length
				const halfPW = paddleW * 0.5;
				const halfPH = paddleH * 0.5;

				// Paddle thickness (match render feel)
				const paddleThickness = Math.max(2, Math.min(window.innerWidth, window.innerHeight) * 0.03);
				const halfT = paddleThickness * 0.5;

				// Ball radius (a little bigger than sprite feels better)
				const BALL_R = Math.max(2, (2 + STAR.size) || 2);

				// Ball velocity (include momentum so it matches how it *actually* moved)
				const Vx = (STAR.vx || 0) + (STAR.momentumX || 0);
				const Vy = (STAR.vy || 0) + (STAR.momentumY || 0);
				const speed = Math.sqrt(Vx * Vx + Vy * Vy);

				if (speed > 0.0001) {
					const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

					// Center hit = perpendicular; edge hit = shallow
					const maxAngle = 1.25; // ~72 degrees

					// Push out after hit so we don't immediately collide again
					const pushOutX = BALL_R + halfT + 0.5;
					const pushOutY = BALL_R + halfT + 0.5;

					// Collision envelopes (edge touch with thickness)
					const touchLeft = STAR.x <= viewLeft + (BALL_R + halfT);
					const touchRight = STAR.x >= viewRight - (BALL_R + halfT);
					const touchTop = STAR.y <= viewTop + (BALL_R + halfT);
					const touchBottom = STAR.y >= viewBottom - (BALL_R + halfT);

					// Must be within paddle segment
					const withinLeftRightPaddle = (STAR.y >= (cy - halfPH) && STAR.y <= (cy + halfPH));
					const withinTopBottomPaddle = (STAR.x >= (cx - halfPW) && STAR.x <= (cx + halfPW));

					const HIT_COOLDOWN_MS = 60;

					// LEFT paddle: bounce to the right (+1)
					if (touchLeft && withinLeftRightPaddle && Vx < 0) {
						const offset = clamp((STAR.y - cy) / (halfPH || 1), -1, 1);
						const ang = offset * maxAngle;

						const outVx = +1 * speed * Math.cos(ang);
						const outVy = speed * Math.sin(ang);

						DID_BOUNCE = bounceVertical(STAR, viewLeft, +1, outVx, outVy, pushOutX, NOW, HIT_COOLDOWN_MS) || DID_BOUNCE;
					}

					// RIGHT paddle: bounce to the left (-1)
					else if (touchRight && withinLeftRightPaddle && Vx > 0) {
						const offset = clamp((STAR.y - cy) / (halfPH || 1), -1, 1);
						const ang = offset * maxAngle;

						const outVx = -1 * speed * Math.cos(ang);
						const outVy = speed * Math.sin(ang);

						DID_BOUNCE = bounceVertical(STAR, viewRight, -1, outVx, outVy, pushOutX, NOW, HIT_COOLDOWN_MS) || DID_BOUNCE;
					}

					// TOP paddle: bounce down (+1)
					else if (touchTop && withinTopBottomPaddle && Vy < 0) {
						const offset = clamp((STAR.x - cx) / (halfPW || 1), -1, 1);
						const ang = offset * maxAngle;

						const outVy = +1 * speed * Math.cos(ang);
						const outVx = speed * Math.sin(ang);

						DID_BOUNCE = bounceHorizontal(STAR, viewTop, +1, outVx, outVy, pushOutY, NOW, HIT_COOLDOWN_MS) || DID_BOUNCE;
					}

					// BOTTOM paddle: bounce up (-1)
					else if (touchBottom && withinTopBottomPaddle && Vy > 0) {
						const offset = clamp((STAR.x - cx) / (halfPW || 1), -1, 1);
						const ang = offset * maxAngle;

						const outVy = -1 * speed * Math.cos(ang);
						const outVx = speed * Math.sin(ang);

						DID_BOUNCE = bounceHorizontal(STAR, viewBottom, -1, outVx, outVy, pushOutY, NOW, HIT_COOLDOWN_MS) || DID_BOUNCE;
					}
				}
			}
		}

		/* EDGE BEHAVIOR: WRAP VS BOUNCE */
		// Choose wrap behavior when ring is off, far away, or poke is strong
		if (S.pointerRingTimer === 0 || DISTANCE_SQ > WRAP_DISTANCE_SQ || S.pokeImpulseTimer > 10) {
			// Compute padded radius for wrap checks to avoid visible popping
			const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

			// Wrap star from left to right when it exits the left boundary
			if (STAR.x < -STAR_RADIUS) STAR.x = S.canvasWidth + STAR_RADIUS;
			// Wrap star from right to left when it exits the right boundary
			else if (STAR.x > S.canvasWidth + STAR_RADIUS) STAR.x = -STAR_RADIUS;

			// Wrap star from top to bottom when it exits the top boundary
			if (STAR.y < -STAR_RADIUS) STAR.y = S.canvasHeight + STAR_RADIUS;
			// Wrap star from bottom to top when it exits the bottom boundary
			else if (STAR.y > S.canvasHeight + STAR_RADIUS) STAR.y = -STAR_RADIUS;
		} else {
			// ✅ NEW: use bounce helpers (and don't overwrite paddle bounce this frame)
			if (!DID_BOUNCE) {
				// Compute padded radius for bounce checks to avoid visible clipping
				const STAR_RADIUS = (STAR.whiteValue * 2 + STAR.size) || 0;

				// Combined velocity for deciding direction
				const Vx = (STAR.vx || 0) + (STAR.momentumX || 0);
				const Vy = (STAR.vy || 0) + (STAR.momentumY || 0);

				// Push away from wall so it doesn't get stuck re-hitting
				const pushOutX = STAR_RADIUS + 0.5;
				const pushOutY = STAR_RADIUS + 0.5;

				// Left wall
				if (STAR.x < STAR_RADIUS) {
					const outVx = Math.abs(Vx);
					const outVy = Vy;
					bounceVertical(STAR, STAR_RADIUS, +1, outVx, outVy, pushOutX, NOW, 0);
				}
				// Right wall
				else if (STAR.x > S.canvasWidth - STAR_RADIUS) {
					const outVx = -Math.abs(Vx);
					const outVy = Vy;
					bounceVertical(STAR, S.canvasWidth - STAR_RADIUS, -1, outVx, outVy, pushOutX, NOW, 0);
				}

				// Top wall
				if (STAR.y < STAR_RADIUS) {
					const outVx = Vx;
					const outVy = Math.abs(Vy);
					bounceHorizontal(STAR, STAR_RADIUS, +1, outVx, outVy, pushOutY, NOW, 0);
				}
				// Bottom wall
				else if (STAR.y > S.canvasHeight - STAR_RADIUS) {
					const outVx = Vx;
					const outVy = -Math.abs(Vy);
					bounceHorizontal(STAR, S.canvasHeight - STAR_RADIUS, -1, outVx, outVy, pushOutY, NOW, 0);
				}
			}
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

/* ---------- Bounce helpers (momentum-only, no hard-stop) ---------- */
function bounceVertical(STAR, wallX, wallSign, outVx, outVy, pushOut, NOW, cooldownMs = 0) {
	if (cooldownMs > 0) {
		const last = STAR.lastBounceV_Ms || 0;
		if (NOW - last < cooldownMs) return false;
		STAR.lastBounceV_Ms = NOW;
	}

	// Base drift never changes
	const baseVx = STAR.vx || 0;
	const baseVy = STAR.vy || 0;

	// Convert desired post-bounce TOTAL velocity into momentum-only
	STAR.momentumX = outVx - baseVx;
	STAR.momentumY = outVy - baseVy;

	// Push away from wall so we don't immediately collide again
	STAR.x = wallX + wallSign * pushOut;

	return true;
}

function bounceHorizontal(STAR, wallY, wallSign, outVx, outVy, pushOut, NOW, cooldownMs = 0) {
	if (cooldownMs > 0) {
		const last = STAR.lastBounceH_Ms || 0;
		if (NOW - last < cooldownMs) return false;
		STAR.lastBounceH_Ms = NOW;
	}

	const baseVx = STAR.vx || 0;
	const baseVy = STAR.vy || 0;

	STAR.momentumX = outVx - baseVx;
	STAR.momentumY = outVy - baseVy;

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
let LINK_PATHS_BY_BUCKET = Array.from({
	length: LINK_BUCKET_COUNT
}, () => new Path2D());

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
		const paddleW = window.innerWidth * 0.10; // top/bottom
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
	CONTEXT.lineWidth = 1;
	const STAR_COUNT = S.starList.length;

	if (STAR_COUNT) {
		LINK_FRAME++;

		if (S.pointerSpeedUnits > 10) LINKS_DIRTY = true;

		const SHOULD_REBUILD_LINKS = LINKS_DIRTY || (LINK_FRAME % 3 === 0);

		if (SHOULD_REBUILD_LINKS) {
			LINKS_DIRTY = false;

			for (let i = 0; i < STAR_COUNT; i++) {
				S.starList[i].edge = getEdgeFadeFactorFast(S.starList[i]);
			}

			const DISTANCE_SCALE = S.screenPerimeter / 500;
			const RAW_CUTOFF = S.maxLinkDistance / DISTANCE_SCALE;
			const CUTOFF_DISTANCE_SQ = RAW_CUTOFF * RAW_CUTOFF;

			resetLinkPaths();

			for (let a = 0; a < STAR_COUNT; a++) {
				const STAR_A = S.starList[a];
				const AX = STAR_A.x;
				const AY = STAR_A.y;
				const OPACITY_A = STAR_A.opacity;
				const EDGE_A = STAR_A.edge;

				for (let b = a + 1; b < STAR_COUNT; b++) {
					const STAR_B = S.starList[b];

					const dx = AX - STAR_B.x;
					const dy = AY - STAR_B.y;
					const d2 = dx * dx + dy * dy;

					if (d2 > CUTOFF_DISTANCE_SQ) continue;

					const SCALED_DISTANCE = Math.sqrt(d2) * DISTANCE_SCALE;

					const MIN_OPACITY = OPACITY_A < STAR_B.opacity ? OPACITY_A : STAR_B.opacity;
					const MIN_EDGE = EDGE_A < STAR_B.edge ? EDGE_A : STAR_B.edge;

					const DISTANCE_FADE = 1 - (SCALED_DISTANCE / S.maxLinkDistance);
					const DISTANCE_CLAMP = DISTANCE_FADE > 0 ? DISTANCE_FADE : 0;
					const LINK_ALPHA = DISTANCE_CLAMP * MIN_OPACITY * MIN_EDGE;

					if (LINK_ALPHA <= 0.002) continue;

					let BUCKET_INDEX = (LINK_ALPHA * (LINK_BUCKET_COUNT - 1)) | 0;
					if (BUCKET_INDEX < 0) BUCKET_INDEX = 0;
					if (BUCKET_INDEX >= LINK_BUCKET_COUNT) BUCKET_INDEX = LINK_BUCKET_COUNT - 1;

					LINK_PATHS_BY_BUCKET[BUCKET_INDEX].moveTo(AX, AY);
					LINK_PATHS_BY_BUCKET[BUCKET_INDEX].lineTo(STAR_B.x, STAR_B.y);
				}
			}
		}

		for (let i = 0; i < LINK_BUCKET_COUNT; i++) {
			const A = i / (LINK_BUCKET_COUNT - 1);
			if (A <= 0) continue;

			CONTEXT.strokeStyle = `rgba(100, 100, 100, ${A})`;
			CONTEXT.stroke(LINK_PATHS_BY_BUCKET[i]);
		}
	}

	/* STARS */
	if (!STAR_SPRITES.ready) return;

	const IMG = STAR_SPRITES.img;

	for (const STAR of S.starList) {
		const R = (STAR.whiteValue * 2 + STAR.size) || 1;
		const SIZE = Math.max(2, R * 2.4);

		const CX = STAR.x;
		const CY = STAR.y;
		const CR = SIZE * 0.48;

		let t = (STAR.redValue - 50) / 150;
		if (t < 0) t = 0;
		if (t > 1) t = 1;

		const DARKNESS = 0.15 + 0.55 * (1 - t);

		CONTEXT.save();

		CONTEXT.globalAlpha = STAR.opacity;

		CONTEXT.translate(CX, CY);
		CONTEXT.rotate(STAR.rotation || 0);
		CONTEXT.drawImage(IMG, -SIZE / 2, -SIZE / 2, SIZE, SIZE);

		CONTEXT.globalCompositeOperation = "source-atop";
		CONTEXT.globalAlpha = STAR.opacity * DARKNESS;
		CONTEXT.fillStyle = "rgba(0, 0, 0, 1)";
		CONTEXT.beginPath();
		CONTEXT.arc(0, 0, CR, 0, Math.PI * 2);
		CONTEXT.fill();

		if (STAR.whiteValue > 0.01) {
			CONTEXT.globalCompositeOperation = "lighter";
			CONTEXT.globalAlpha = STAR.opacity * (STAR.whiteValue > 1 ? 1 : STAR.whiteValue);
			CONTEXT.fillStyle = "rgba(255, 255, 255, 1)";
			CONTEXT.beginPath();
			CONTEXT.arc(0, 0, CR, 0, Math.PI * 2);
			CONTEXT.fill();
		}

		CONTEXT.restore();
	}

	/* USER POINTER RING */
	const TARGET_RING_RADIUS = Math.max(0, S.screenScaleUp * 100 - 40);

	let RING_RADIUS = TARGET_RING_RADIUS * (S.pointerRingTimer / 50);
	let RING_WIDTH = S.pointerRingTimer * 0.15;
	let RING_ALPHA = Math.min(S.pointerRingTimer * 0.07, 1);

	if (S.pointerSpeedUnits < 1) {
		const NORMALIZED_POKE = Math.min(1, Math.max(0, S.pokeImpulseTimer / 200));
		const INVERTED_POKE = 1 - NORMALIZED_POKE;

		RING_RADIUS = TARGET_RING_RADIUS * INVERTED_POKE;
		RING_WIDTH = NORMALIZED_POKE * 7;
		RING_ALPHA = NORMALIZED_POKE;
	}

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
};

/* #endregion 2) RENDERING */



/*========================================*
//#region 3) USER INPUT
 *========================================*/

/* AMPLIFY STAR MOVEMENT RELATIVE TO POINTER MOVEMENT SPEED */
S.updatePointerSpeed = function updatePointerSpeed(CURRENT_X, CURRENT_Y) {
	const NOW_MS = S.getNowMs();

	if (!S.lastPointerTimeMs) {
		S.pointerClientX = CURRENT_X;
		S.pointerClientY = CURRENT_Y;

		S.lastPointerTimeMs = NOW_MS;
		S.pointerSpeedUnits = 0;
		return;
	}

	const DT = Math.max(1, NOW_MS - S.lastPointerTimeMs);

	const DX = CURRENT_X - S.pointerClientX;
	const DY = CURRENT_Y - S.pointerClientY;

	const RAW_SPEED = Math.sqrt(DX * DX + DY * DY) / DT;

	S.pointerSpeedUnits = S.screenScaleDown * Math.min(RAW_SPEED * 50, 50);

	S.pointerRingTimer = Math.max(S.pointerRingTimer, S.pointerSpeedUnits);

	if (S.pointerSpeedUnits > 10) LINKS_DIRTY = true;

	S.pointerClientX = CURRENT_X;
	S.pointerClientY = CURRENT_Y;

	S.lastPointerTimeMs = NOW_MS;
};

/* WHEN USER BEGINS MOVEMENT */
S.beginPointerInteraction = function beginPointerInteraction(START_X, START_Y) {
	S.pokeImpulseTimer = 200;
	S.lastPointerTimeMs = 0;
	S.updatePointerSpeed(START_X, START_Y);
};

/* DIFFERENT TYPES OF USER INTERACTION */
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
	}, {
		passive: true
	}
);

// Touch
window.addEventListener(
	"touchmove",
	(EVENT) => {
		const TOUCH = EVENT.touches[0];
		if (!TOUCH) return;
		S.updatePointerSpeed(TOUCH.clientX, TOUCH.clientY);
	}, {
		passive: true
	}
);

/* #endregion 3) USER INPUT */