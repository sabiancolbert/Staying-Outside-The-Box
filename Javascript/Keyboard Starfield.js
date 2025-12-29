// thank heavens for chatGPT <3
// Keyboard-driven impulse controller for the Starfield engine.
// This file translates discrete key presses into one-frame forces
// written onto window.KEYBOARD for Active Starfield to consume.

/*======================================================================
 *  MENU
 *----------------------------------------------------------------------
 *  1) SETUP
 *     - Keyboard alias
 *     - Keydown listener
 *     - Key → action dispatch table
 *
 *  2) GLOBAL MOVEMENT
 *     - Directional impulse nudges (WASD + diagonals)
 *
 *  3) QUADRANT MAGNETISM
 *     - Screen-space magnetic attractors (3×3 grid)
 *
 *  4) PONG
 *     - Paddle movement + visibility timer
 *
 *  5) OTHERS
 *     - Speed scaling
 *     - Orbit mode
 *     - Passive inversion
 *     - Link rebuild trigger
 *====================================================================*/


/*======================================================================
 * #region 1) SETUP
 *====================================================================*/

/* GROUP: Keyboard state alias */
// Create a short alias to the shared KEYBOARD impulse object.
// This object is read and cleared every frame by Active Starfield.
var K = window.KEYBOARD;

/* GROUP: Keydown listener */
// Listen globally so keyboard input works regardless of focus,
// unless the browser explicitly suppresses it.
window.addEventListener("keydown", (EVENT) => {

  // Ignore held-down repeat events.
  // We want single, intentional impulses, not OS-level auto-repeat.
  if (EVENT.repeat) return;

  // Ignore IME composition events (important for non-Latin keyboards).
  // Prevents accidental impulses while typing.
  if (EVENT.isComposing) return;

  // Normalize key to lowercase and dispatch if mapped.
  // Optional chaining keeps unknown keys harmless.
  KEY_FUNCTIONS[EVENT.key.toLowerCase()]?.();
});

/* GROUP: Key → action dispatch table */
// Maps physical keys to semantic actions.
// Each action writes impulses into window.KEYBOARD,
// which are then applied exactly once in the physics step.
const KEY_FUNCTIONS = {

  /* GROUP: GLOBAL MOVEMENT */
  // Cardinal directions
  w: () => RUN_W(), // Up
  a: () => RUN_A(), // Left
  s: () => RUN_S(), // Down
  d: () => RUN_D(), // Right

  // Diagonals
  q: () => RUN_Q(), // Up-left
  e: () => RUN_E(), // Up-right
  z: () => RUN_Z(), // Down-left
  x: () => RUN_X(), // Down-right

  /* GROUP: QUADRANT MAGNETISM */
  // 3×3 screen grid magnets (percent-based)
  y: () => RUN_Y(), // Top-left
  u: () => RUN_U(), // Top-center
  i: () => RUN_I(), // Top-right

  h: () => RUN_H(), // Middle-left
  j: () => RUN_J(), // Middle-center
  k: () => RUN_K(), // Middle-right

  b: () => RUN_B(), // Bottom-left
  n: () => RUN_N(), // Bottom-center
  m: () => RUN_M(), // Bottom-right

  /* GROUP: PONG */
  r: () => RUN_R(), // Paddle left
  t: () => RUN_T(), // Paddle right
  f: () => RUN_F(), // Paddle up
  c: () => RUN_C(), // Paddle down

  /* GROUP: OTHERS */
  v: () => RUN_V(), // Reduce velocity
  g: () => RUN_G(), // Increase velocity
  o: () => RUN_O(), // Orbit mode
  p: () => RUN_P(), // Passive drift inversion
  l: () => RUN_L()  // Link rebuild / shatter
};

/* #endregion 1) SETUP */


/*======================================================================
 * #region 2) GLOBAL MOVEMENT
 *====================================================================*/

/* GROUP: Cardinal impulses */
// These functions apply small additive impulses.
// They do NOT move stars directly.
// Active Starfield consumes and clears them next frame.

// W = Up
function RUN_W() {
  // Apply upward impulse in screen space.
  K.addY = -1;
}

// A = Left
function RUN_A() {
  // Apply leftward impulse in screen space.
  K.addX = -1;
}

// S = Down
function RUN_S() {
  // Apply downward impulse in screen space.
  K.addY = 1;
}

// D = Right
function RUN_D() {
  // Apply rightward impulse in screen space.
  K.addX = 1;
}

/* GROUP: Diagonal impulses */
// Diagonals are intentionally weaker to preserve total impulse magnitude.

// Q = Up-left
function RUN_Q() {
  K.addX = -0.5; // Left component
  K.addY = -0.5; // Up component
}

// E = Up-right
function RUN_E() {
  K.addX = 0.5;  // Right component
  K.addY = -0.5; // Up component
}

// Z = Down-left
function RUN_Z() {
  K.addX = -0.5; // Left component
  K.addY = 0.5;  // Down component
}

// X = Down-right
function RUN_X() {
  K.addX = 0.5;  // Right component
  K.addY = 0.5;  // Down component
}

/* #endregion 2) GLOBAL MOVEMENT */


/*======================================================================
 * #region 3) QUADRANT MAGNETISM
 *====================================================================*/

/* GROUP: Screen-space magnetic targets */
// These set magnetX / magnetY in percent-of-screen space.
// Active Starfield converts these into canvas coordinates
// and applies attraction + orbit forces.

// Y = Top-left
function RUN_Y() {
  K.magnetX = 16.5; // Near left
  K.magnetY = 16.5; // Near top
}

// U = Top-center
function RUN_U() {
  K.magnetX = 50;   // Center horizontally
  K.magnetY = 16.5; // Near top
}

// I = Top-right
function RUN_I() {
  K.magnetX = 83.5; // Near right
  K.magnetY = 16.5;
}

// H = Middle-left
function RUN_H() {
  K.magnetX = 16.5;
  K.magnetY = 50;
}

// J = Middle-center
function RUN_J() {
  K.magnetX = 50;
  K.magnetY = 50;
}

// K = Middle-right
function RUN_K() {
  K.magnetX = 83.5;
  K.magnetY = 50;
}

// B = Bottom-left
function RUN_B() {
  K.magnetX = 16.5;
  K.magnetY = 83.5;
}

// N = Bottom-center
function RUN_N() {
  K.magnetX = 50;
  K.magnetY = 83.5;
}

// M = Bottom-right
function RUN_M() {
  K.magnetX = 83.5;
  K.magnetY = 83.5;
}

/* #endregion 3) QUADRANT MAGNETISM */


/*======================================================================
 * #region 4) PONG
 *====================================================================*/

/* GROUP: Paddle impulses */
// These control the paddles overlay and the special “ball star”.
// paddlesTimer controls visibility fade-out.

// R = Paddle left
function RUN_R() {
  K.paddlesTimer = 50; // Make paddles visible
  K.paddlesX -= 5;     // Shift paddles left
}

// T = Paddle right
function RUN_T() {
  K.paddlesTimer = 50;
  K.paddlesX += 5;
}

// F = Paddle up
function RUN_F() {
  K.paddlesTimer = 50;
  K.paddlesY -= 5;
}

// C = Paddle down
function RUN_C() {
  K.paddlesTimer = 50;
  K.paddlesY += 5;
}

/* #endregion 4) PONG */


/*======================================================================
 * #region 5) OTHERS
 *====================================================================*/

/* GROUP: Velocity scaling */
// These multiply implied velocity during the next physics step.

// V = Reduce speed
function RUN_V() {
  K.multX = 0.6; // Horizontal slowdown
  K.multY = 0.6; // Vertical slowdown
}

// G = Increase speed
function RUN_G() {
  K.multX = 1.7; // Horizontal boost
  K.multY = 1.7; // Vertical boost
}

/* GROUP: Orbit mode */
// Enables pointer-centered magnetism.
// Active Starfield reads this and clears it every frame.
function RUN_O() {
  K.magnetPointer = true;
}

/* GROUP: Passive drift inversion */
// Immediately flips base drift velocity for every star.
// This is a permanent change, not an impulse.
function RUN_P() {
  const S = window.STARFIELD;
  if (!S?.starList?.length) return;

  for (const STAR of S.starList) {
    STAR.vx = -STAR.vx; // Invert X drift
    STAR.vy = -STAR.vy; // Invert Y drift
  }
}

/* GROUP: Link rebuild trigger */
// Forces links to disappear and fade back in over time.
function RUN_L() {
  const S = window.STARFIELD;
  if (!S) return;

  S.linkRebuildTimer = 300;
}

/* #endregion 5) OTHERS */

// GPT Joke: If the keyboard were a spaceship, these functions are the tiny thrusters.
// Not enough to warp-drive, but plenty to bonk a star into the next zip code. 🚀