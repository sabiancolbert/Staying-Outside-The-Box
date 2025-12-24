// thank heavens for chatGPT <3

//alert("Debug car");

/*========================================*
//#region 1) SETUP
 *========================================*/

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
const EFFECT_MULTIPLIER = 1.2;
const EFFECT_CONSTANT = .7;
function getForceIncrease() {
  return ((window.STARFIELD?.pointerRingTimer ?? 0) + EFFECT_CONSTANT) * EFFECT_MULTIPLIER;
}
/* #endregion 1) SETUP */

/*========================================*
//#region 2) GLOBAL MOVEMENT
 *========================================*/

// W = Up
function runW() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = -getForceIncrease();
}

// A = Left
function runA() {
  window.KEYBOARD_FORCE_X = -getForceIncrease();
  window.KEYBOARD_FORCE_Y = 0;
}

// S = Down
function runS() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = getForceIncrease();
}

// D = Right
function runD() {
  window.KEYBOARD_FORCE_X = getForceIncrease();
  window.KEYBOARD_FORCE_Y = 0;
}

// Q = Left up
function runQ() {
  window.KEYBOARD_FORCE_X = -getForceIncrease() / 2;
  window.KEYBOARD_FORCE_Y = -getForceIncrease() / 2;
}

// E = Right up
function runE() {
  window.KEYBOARD_FORCE_X = getForceIncrease() / 2;
  window.KEYBOARD_FORCE_Y = -getForceIncrease() / 2;
}

// Z = Left down
function runZ() {
  window.KEYBOARD_FORCE_X = -getForceIncrease() / 2;
  window.KEYBOARD_FORCE_Y = getForceIncrease() / 2;
}

// X = Right down
function runX() {
  window.KEYBOARD_FORCE_X = getForceIncrease() / 2;
  window.KEYBOARD_FORCE_Y = getForceIncrease() / 2;
}
/* #endregion 2) GLOBAL MOVEMENT */

/*========================================*
//#region 3) QUADRANT MAGNETISM
 *========================================*/
// Y = Top left
function runY() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}

// U = Top center
function runU() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}

// I = Top right
function runI() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}

// H = Middle left
function runH() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}

// J = Middle center
function runJ() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}

// K = Middle right
function runK() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}

// B = Bottom left
function runB() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}

// N = Bottom center
function runN() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}

// M = Bottom right
function runM() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}
/* #endregion 3) QUADRANT MAGNETISM */

/*========================================*
//#region 4) PONG
 *========================================*/
// R = Paddles left
function runR() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}

// T = Paddles right
function runT() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}

// F = Paddles up
function runF() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}

// C = Paddles down
function runC() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}
/* #endregion 4) PONG */

/*========================================*
//#region 5) OTHERS
 *========================================*/

// V = Velocity invert
function runV() {
  for (const STAR of window.STARFIELD.starList) {
    STAR.vx = -STAR.vx;
    STAR.vy = -STAR.vy;
  }
}

// G = Grumble
function runG() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}

// O = Orbit
function runO() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}

// P = Poke burst
function runP() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}

// L = Link shatter
function runL() {
  window.KEYBOARD_FORCE_X = 0;
  window.KEYBOARD_FORCE_Y = 0;
}
/* #endregion 5) OTHERS */
