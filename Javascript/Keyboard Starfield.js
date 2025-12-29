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

/* #endregion 1) SETUP */

/*========================================*
//#region 2) GLOBAL MOVEMENT
 *========================================*/

// W = Up
function runW() {
  // X
  K.addY = -1;
}

// A = Left
function runA() {
  K.addX = -1;
  // Y
}

// S = Down
function runS() {
  // X
  K.addY = 1;
}

// D = Right
function runD() {
  K.addX = 1;
  // Y
}

// Q = Left up
function runQ() {
  K.addX = -1 / 2;
  K.addY = -1 / 2;
}

// E = Right up
function runE() {
  K.addX = 1 / 2;
  K.addY = -1 / 2;
}

// Z = Left down
function runZ() {
  K.addX = -1 / 2;
  K.addY = 1 / 2;
}

// X = Right down
function runX() {
  K.addX = 1 / 2;
  K.addY = 1 / 2;
}
/* #endregion 2) GLOBAL MOVEMENT */

/*========================================*
//#region 3) QUADRANT MAGNETISM
 *========================================*/
// Y = Top left
function runY() {
  
  K.magnetX = 16.5;
  K.magnetY = 16.5;
}

// U = Top center
function runU() {
  
  K.magnetX = 50;
  K.magnetY = 16.5;
}

// I = Top right
function runI() {
  
  K.magnetX = 83.5;
  K.magnetY = 16.5;
}

// H = Middle left
function runH() {
  
  K.magnetX = 16.5;
  K.magnetY = 50;
}

// J = Middle center
function runJ() {
  
  K.magnetX = 50;
  K.magnetY = 50;
}

// K = Middle right
function runK() {
  
  K.magnetX = 83.5;
  K.magnetY = 50;
}

// B = Bottom left
function runB() {
  
  K.magnetX = 16.5;
  K.magnetY = 83.5;
}

// N = Bottom center
function runN() {
  
  K.magnetX = 50;
  K.magnetY = 83.5;
}

// M = Bottom right
function runM() {
  
  K.magnetX = 83.5;
  K.magnetY = 83.5;
}
/* #endregion 3) QUADRANT MAGNETISM */

/*========================================*
//#region 4) PONG
 *========================================*/
// R = Paddles left
function runR() {
  K.paddlesTimer = 50;
  K.paddlesX -= 5;
}

// T = Paddles right
function runT() {
  K.paddlesTimer = 50;
  K.paddlesX += 5;
}

// F = Paddles up
function runF() {
  K.paddlesTimer = 50;
  K.paddlesY -= 5;
}

// C = Paddles down
function runC() {
  K.paddlesTimer = 50;
  K.paddlesY += 5;
}
/* #endregion 4) PONG */

/*========================================*
//#region 5) OTHERS
 *========================================*/

// V = Less (v) speed
function runV() {
  K.multX = 0.6;
  K.multY = 0.6;
}

// G = Greater (^) speed
function runG() {
  K.multX = 1.7;
  K.multY = 1.7;
}

// O = Orbit
function runO() {
  K.magnetPointer = true;
  K.magnetX = window.STARFIELD.pointerClientX;
  K.magnetY = window.STARFIELD.pointerClientY;
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
