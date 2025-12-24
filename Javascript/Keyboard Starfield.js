// thank heavens for chatGPT <3

/*========================================*
//#region 1) SETUP
 *========================================*/

// Debug version
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("dbgMisc").textContent = "5";
});

const STARFIELD = window.STARFIELD;
if (!STARFIELD?.starList?.length) return;

/* Event listener */
window.addEventListener("keydown", (event) => {
  // Ignore held-down repeats
  if (event.repeat) return;


  // Ignore IME composition
  if (event.isComposing) return;

  processKeyPress(event.key);
});

/* Key proccessing */
function processKeyPress(KEY) {
  
  // Step 1: normalize key into a lookup value
  const KEYBOARD_INPUT = String(KEY).toLowerCase();

  // Step 2: apply per-star
  for (const STAR of STARFIELD.starList) {
    const FORCES = KEY_FUNCTIONS[KEYBOARD_INPUT]?.(STAR) ?? [0, 0];
    STAR.keyboardForceX = FORCES[0];
    STAR.keyboardForceY = FORCES[1];
  }

  console.log("Key pressed:", KEY);
}

/* Assign keys to functions */
const KEY_FUNCTIONS = {

  /* 2) GLOBAL MOVEMENT */
  // Up
  w: (STAR) => runW(STAR),
  // Left
  a: (STAR) => runA(STAR),
  // Down
  s: (STAR) => runS(STAR),
  // Right
  d: (STAR) => runD(STAR),

  // Up-left
  q: (STAR) => runQ(STAR),
  // Up-right
  e: (STAR) => runE(STAR),
  // Down-left
  z: (STAR) => runZ(STAR),
  // Down-right
  x: (STAR) => runX(STAR),

  /* 3) QUADRANT MAGNETISM */
  // Top-left
  y: (STAR) => runY(STAR),
  // Top-center
  u: (STAR) => runU(STAR),
  // Top-right
  i: (STAR) => runI(STAR),

  // Middle-left
  h: (STAR) => runH(STAR),
  // Middle-center
  j: (STAR) => runJ(STAR),
  // Middle-right
  k: (STAR) => runK(STAR),

  // Bottom-left
  b: (STAR) => runB(STAR),
  // Bottom-center
  n: (STAR) => runN(STAR),
  // Bottom-right
  m: (STAR) => runM(STAR),

  /* 4) PONG */
  // Paddle left
  r: (STAR) => runR(STAR),
  // Paddle right
  t: (STAR) => runT(STAR),
  // Paddle up
  f: (STAR) => runF(STAR),
  // Paddle down
  c: (STAR) => runC(STAR),

  /* 5) OTHERS */
  // Velocity invert
  v: (STAR) => runV(STAR),
  // Grumble
  g: (STAR) => runG(STAR),
  // Orbit
  o: (STAR) => runO(STAR),
  // Poke burst
  p: (STAR) => runP(STAR),
  // Link shatter
  l: (STAR) => runL(STAR)
};

/* Function constants */
const EFFECT_MULTIPLIER = 5;
const EFFECT_CONSTANT = 5;
const FORCE_INCREASE = (STARFIELD.pointerRingTimer + EFFECT_CONSTANT) * EFFECT_MULTIPLIER;
/* #endregion 1) SETUP */

/*========================================*
//#region 2) GLOBAL MOVEMENT
 *========================================*/

// W = Up
function runW(STAR) {
  return [0, FORCE_INCREASE];
}

// A = Left
function runA(STAR) {
  return [-FORCE_INCREASE, 0];
}

// S = Down
function runS(STAR) {
  return [0, -FORCE_INCREASE];
}

// D = Right
function runD(STAR) {
  return [FORCE_INCREASE, 0];
}

// Q = Left up
function runQ(STAR) {
  return [-FORCE_INCREASE / 2, FORCE_INCREASE / 2];
}

// E = Right up
function runE(STAR) {
  return [FORCE_INCREASE / 2, FORCE_INCREASE / 2];
}

// Z = Left down
function runZ(STAR) {
  return [-FORCE_INCREASE / 2, -FORCE_INCREASE / 2];
}

// X = Right down
function runX(STAR) {
  return [FORCE_INCREASE / 2, -FORCE_INCREASE / 2];
}
/* #endregion 2) GLOBAL MOVEMENT */

/*========================================*
//#region 3) QUADRANT MAGNETISM
 *========================================*/
// Y = Top left
function runY(STAR) {
  return [0, 0];
}

// U = Top center
function runU(STAR) {
  return [0, 0];
}

// I = Top right
function runI(STAR) {
  return [0, 0];
}

// H = Middle left
function runH(STAR) {
  return [0, 0];
}

// J = Middle center
function runJ(STAR) {
  return [0, 0];
}

// K = Middle right
function runK(STAR) {
  return [0, 0];
}

// B = Bottom left
function runB(STAR) {
  return [0, 0];
}

// N = Bottom center
function runN(STAR) {
  return [0, 0];
}

// M = Bottom right
function runM(STAR) {
  return [0, 0];
}
/* #endregion 3) QUADRANT MAGNETISM */

/*========================================*
//#region 4) PONG
 *========================================*/
// R = Paddles left
function runR(STAR) {
  return [0, 0];
}

// T = Paddles right
function runT(STAR) {
  return [0, 0];
}

// F = Paddles up
function runF(STAR) {
  return [0, 0];
}

// C = Paddles down
function runC(STAR) {
  return [0, 0];
}
/* #endregion 4) PONG */

/*========================================*
//#region 5) OTHERS
 *========================================*/

// V = Velocity invert
function runV(STAR) {
  STAR.vx = -STAR.vx;
  STAR.vy = -STAR.vy;
  return [0, 0];
}

// G = Grumble
function runG(STAR) {
  return [0, 0];
}

// O = Orbit
function runO(STAR) {
  return [0, 0];
}

// P = Poke burst
function runP(STAR) {
  return [0, 0];
}

// L = Link shatter
function runL(STAR) {
  return [0, 0];
}
/* #endregion 5) OTHERS */