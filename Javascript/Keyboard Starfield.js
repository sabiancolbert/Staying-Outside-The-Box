// thank heavens for chatGPT <3

//alert("Debug man");

/*========================================*
//#region 1) SETUP
 *========================================*/

var K = window.KEYBOARD;

/* Event listener */
window.addEventListener("keydown", (event) => {
  
  
  // Ignore held-down repeats
  if (event.repeat) return;

  // Ignore IME composition
  if (event.isComposing) return;

  // Run the user command
  KEY_FUNCTIONS[event.key.toLowerCase()]?.();
});

/* Assign keys to functions */
const KEY_FUNCTIONS = {

  /* 2) GLOBAL MOVEMENT */
  // Up
  w: () => runW(),
  // Left
  a: () => runA(),
  // Down
  s: () => runS(),
  // Right
  d: () => runD(),

  // Up-left
  q: () => runQ(),
  // Up-right
  e: () => runE(),
  // Down-left
  z: () => runZ(),
  // Down-right
  x: () => runX(),

  /* 3) QUADRANT MAGNETISM */
  // Top-left
  y: () => runY(),
  // Top-center
  u: () => runU(),
  // Top-right
  i: () => runI(),

  // Middle-left
  h: () => runH(),
  // Middle-center
  j: () => runJ(),
  // Middle-right
  k: () => runK(),

  // Bottom-left
  b: () => runB(),
  // Bottom-center
  n: () => runN(),
  // Bottom-right
  m: () => runM(),

  /* 4) PONG */
  // Paddle left
  r: () => runR(),
  // Paddle right
  t: () => runT(),
  // Paddle up
  f: () => runF(),
  // Paddle down
  c: () => runC(),

  /* 5) OTHERS */
  // Velocity invert
  v: () => runV(),
  // Grumble
  g: () => runG(),
  // Orbit
  o: () => runO(),
  // Poke burst
  p: () => runP(),
  // Link shatter
  l: () => runL()
};

/* CONSTANTS */
const STRENGTH = 0.8;
const MULTIPLY = 1 + STRENGTH;
const DIVIDE = 1 - STRENGTH;
const POSITIVE = STRENGTH;
const NEGATIVE = -STRENGTH;
let PADDLES_ACTIVE = 0;
let PADDLES_TIMER = 0;

/* PADDLES */
function animatePaddles(NEW_X, NEW_Y) {
  PADDLES_ACTIVE++;

  // Nudge paddle centers (0–100 space)
  K.paddlesX = Math.max(0, Math.min(100, (K.paddlesX ?? 50) + NEW_X));
  K.paddlesY = Math.max(0, Math.min(100, (K.paddlesY ?? 50) + NEW_Y));

  {
    const S = window.STARFIELD;
    const CANVAS = S?.constellationCanvas;
    const CTX = CANVAS?.getContext?.("2d");
    if (CTX && CANVAS) {
      const W = CANVAS.width;
      const H = CANVAS.height;

      const alpha = Math.min(1, Math.max(0, PADDLES_TIMER));
      const paddleW = W * 0.10; // 10% of width (top/bottom paddles)
      const paddleH = H * 0.10; // 10% of height (left/right paddles)

      const cx = (K.paddlesX / 100) * W;
      const cy = (K.paddlesY / 100) * H;

      CTX.save();
      CTX.globalAlpha = alpha;

      // Feel free to change styling
      CTX.lineWidth = Math.max(2, Math.min(W, H) * 0.004);
      CTX.lineCap = "round";
      CTX.strokeStyle = "rgba(255,255,255,1)";

      // Left & right vertical paddles (x = 0% and x = 100%)
      CTX.beginPath();
      CTX.moveTo(0, Math.max(0, cy - paddleH / 2));
      CTX.lineTo(0, Math.min(H, cy + paddleH / 2));
      CTX.moveTo(W, Math.max(0, cy - paddleH / 2));
      CTX.lineTo(W, Math.min(H, cy + paddleH / 2));

      // Top & bottom horizontal paddles (y = 0% and y = 100%)
      CTX.moveTo(Math.max(0, cx - paddleW / 2), 0);
      CTX.lineTo(Math.min(W, cx + paddleW / 2), 0);
      CTX.moveTo(Math.max(0, cx - paddleW / 2), H);
      CTX.lineTo(Math.min(W, cx + paddleW / 2), H);

      CTX.stroke();
      CTX.restore();
    }
  }

  // If user hasn't already started more paddle frames, then schedule the next one
  PADDLES_ACTIVE--;
  PADDLES_TIMER -= 0.1;
  if (PADDLES_ACTIVE === 0 && PADDLES_TIMER > 0) requestAnimationFrame(() => animatePaddles(0, 0));
}

/* #endregion 1) SETUP */

/*========================================*
//#region 2) GLOBAL MOVEMENT
 *========================================*/

// W = Up
function runW() {
  // X
  K.addY = NEGATIVE;
}

// A = Left
function runA() {
  K.addX = NEGATIVE;
  // Y
}

// S = Down
function runS() {
  // X
  K.addY = POSITIVE;
}

// D = Right
function runD() {
  K.addX = POSITIVE;
  // Y
}

// Q = Left up
function runQ() {
  K.addX = NEGATIVE / 2;
  K.addY = NEGATIVE / 2;
}

// E = Right up
function runE() {
  K.addX = POSITIVE / 2;
  K.addY = NEGATIVE / 2;
}

// Z = Left down
function runZ() {
  K.addX = NEGATIVE / 2;
  K.addY = POSITIVE / 2;
}

// X = Right down
function runX() {
  K.addX = POSITIVE / 2;
  K.addY = POSITIVE / 2;
}
/* #endregion 2) GLOBAL MOVEMENT */

/*========================================*
//#region 3) QUADRANT MAGNETISM
 *========================================*/
// Y = Top left
function runY() {
  
}

// U = Top center
function runU() {
  
}

// I = Top right
function runI() {
  
}

// H = Middle left
function runH() {
  
}

// J = Middle center
function runJ() {
  
}

// K = Middle right
function runK() {
  
}

// B = Bottom left
function runB() {
  
}

// N = Bottom center
function runN() {
  
}

// M = Bottom right
function runM() {
  
}
/* #endregion 3) QUADRANT MAGNETISM */

/*========================================*
//#region 4) PONG
 *========================================*/
// R = Paddles left
function runR() {
  PADDLES_TIMER = 10;
  animatePaddles(-5, 0);
}

// T = Paddles right
function runT() {
  PADDLES_TIMER = 10;
  animatePaddles(5, 0);
}

// F = Paddles up
function runF() {
  PADDLES_TIMER = 10;
  animatePaddles(0, -5);
}

// C = Paddles down
function runC() {
  PADDLES_TIMER = 10;
  animatePaddles(0, 5);
}
/* #endregion 4) PONG */

/*========================================*
//#region 5) OTHERS
 *========================================*/

// V = Less (v) speed
function runV() {
  K.multX = DIVIDE;
  K.multY = DIVIDE;
}

// G = Greater (^) speed
function runG() {
  K.multX = MULTIPLY;
  K.multY = MULTIPLY;
}

// O = Orbit
function runO() {
  
}

// P = Passive movement inversion
function runP() {
  for (const STAR of window.STARFIELD.starList) {
    STAR.vx = -STAR.vx;
    STAR.vy = -STAR.vy;
  }
}

// L = Link shatter
function runL() {
  
}
/* #endregion 5) OTHERS */
