// thank heavens for chatGPT <3

alert("Debug car");

/*========================================*
//#region 1) SETUP
 *========================================*/

const KEYBOARD_FORCE_X = window.KEYBOARD_FORCE_X;
const KEYBOARD_FORCE_Y = window.KEYBOARD_FORCE_Y;

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

/* Function constants */
const EFFECT_MULTIPLIER = 2;
const EFFECT_CONSTANT = 5;
function getForceIncrease() {
  return ((window.STARFIELD?.pointerRingTimer ?? 0) + EFFECT_CONSTANT) * EFFECT_MULTIPLIER;
}
/* #endregion 1) SETUP */

/*========================================*
//#region 2) GLOBAL MOVEMENT
 *========================================*/

// W = Up
function runW() {
  KEYBOARD_FORCE_X = 0;
  KEYBOARD_FORCE_Y = -getForceIncrease();
}

// A = Left
function runA() {
  return [-getForceIncrease(), 0];
}

// S = Down
function runS() {
  return [0, getForceIncrease()];
}

// D = Right
function runD() {
  return [getForceIncrease(), 0];
}

// Q = Left up
function runQ() {
  return [-getForceIncrease() / 2, -getForceIncrease() / 2];
}

// E = Right up
function runE() {
  return [getForceIncrease() / 2, -getForceIncrease() / 2];
}

// Z = Left down
function runZ() {
  return [-getForceIncrease() / 2, getForceIncrease() / 2];
}

// X = Right down
function runX() {
  return [getForceIncrease() / 2, getForceIncrease() / 2];
}
/* #endregion 2) GLOBAL MOVEMENT */

/*========================================*
//#region 3) QUADRANT MAGNETISM
 *========================================*/
// Y = Top left
function runY() {
  return [0, 0];
}

// U = Top center
function runU() {
  return [0, 0];
}

// I = Top right
function runI() {
  return [0, 0];
}

// H = Middle left
function runH() {
  return [0, 0];
}

// J = Middle center
function runJ() {
  return [0, 0];
}

// K = Middle right
function runK() {
  return [0, 0];
}

// B = Bottom left
function runB() {
  return [0, 0];
}

// N = Bottom center
function runN() {
  return [0, 0];
}

// M = Bottom right
function runM() {
  return [0, 0];
}
/* #endregion 3) QUADRANT MAGNETISM */

/*========================================*
//#region 4) PONG
 *========================================*/
// R = Paddles left
function runR() {
  return [0, 0];
}

// T = Paddles right
function runT() {
  return [0, 0];
}

// F = Paddles up
function runF() {
  return [0, 0];
}

// C = Paddles down
function runC() {
  return [0, 0];
}
/* #endregion 4) PONG */

/*========================================*
//#region 5) OTHERS
 *========================================*/

// V = Velocity invert
function runV() {
  .vx = -.vx;
  .vy = -.vy;
  return [0, 0];
}

// G = Grumble
function runG() {
  return [0, 0];
}

// O = Orbit
function runO() {
  return [0, 0];
}

// P = Poke burst
function runP() {
  return [0, 0];
}

// L = Link shatter
function runL() {
  return [0, 0];
}
/* #endregion 5) OTHERS */
