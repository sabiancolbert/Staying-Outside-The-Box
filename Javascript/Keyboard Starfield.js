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
const FROM_ZERO = 1.2;
const FROM_ZERO_HALF = 1.1;
const TO_ZERO = 0.8;
const TO_ZERO_HALF = 0.9;
}
/* #endregion 1) SETUP */

/*========================================*
//#region 2) GLOBAL MOVEMENT
 *========================================*/

// W = Up
function runW() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = TO_ZERO;
}

// A = Left
function runA() {
  window.KEYBOARD_FORCE_X = TO_ZERO;
  window.KEYBOARD_FORCE_Y = 1;
}

// S = Down
function runS() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = FROM_ZERO;
}

// D = Right
function runD() {
  window.KEYBOARD_FORCE_X = FROM_ZERO;
  window.KEYBOARD_FORCE_Y = 1;
}

// Q = Left up
function runQ() {
  window.KEYBOARD_FORCE_X = TO_ZERO_HALF;
  window.KEYBOARD_FORCE_Y = TO_ZERO_HALF;
}

// E = Right up
function runE() {
  window.KEYBOARD_FORCE_X = FROM_ZERO_HALF;
  window.KEYBOARD_FORCE_Y = TO_ZERO_HALF;
}

// Z = Left down
function runZ() {
  window.KEYBOARD_FORCE_X = TO_ZERO_HALF;
  window.KEYBOARD_FORCE_Y = FROM_ZERO_HALF;
}

// X = Right down
function runX() {
  window.KEYBOARD_FORCE_X = FROM_ZERO_HALF;
  window.KEYBOARD_FORCE_Y = FROM_ZERO_HALF;
}
/* #endregion 2) GLOBAL MOVEMENT */

/*========================================*
//#region 3) QUADRANT MAGNETISM
 *========================================*/
// Y = Top left
function runY() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
}

// U = Top center
function runU() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
}

// I = Top right
function runI() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
}

// H = Middle left
function runH() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
}

// J = Middle center
function runJ() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
}

// K = Middle right
function runK() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
}

// B = Bottom left
function runB() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
}

// N = Bottom center
function runN() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
}

// M = Bottom right
function runM() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
}
/* #endregion 3) QUADRANT MAGNETISM */

/*========================================*
//#region 4) PONG
 *========================================*/
// R = Paddles left
function runR() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
}

// T = Paddles right
function runT() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
}

// F = Paddles up
function runF() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
}

// C = Paddles down
function runC() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
}
/* #endregion 4) PONG */

/*========================================*
//#region 5) OTHERS
 *========================================*/

// V = Less (v) speed
function runV() {
  window.KEYBOARD_FORCE_X = TO_ZERO;
  window.KEYBOARD_FORCE_Y = TO_ZERO;
}

// G = Greater (^) speed
function runG() {
  window.KEYBOARD_FORCE_X = FROM_ZERO;
  window.KEYBOARD_FORCE_Y = FROM_ZERO;
}

// O = Orbit
function runO() {
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
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
  window.KEYBOARD_FORCE_X = 1;
  window.KEYBOARD_FORCE_Y = 1;
}
/* #endregion 5) OTHERS */
