// thank heavens for chatGPT <3

/*========================================*
//#region 1) SETUP
 *========================================*/

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
  const STARFIELD = window.STARFIELD;
  if (!STARFIELD?.starList?.length) return;

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
  w: (STAR) => runW(STAR),
  a: (STAR) => runA(STAR),
  s: (STAR) => runS(STAR),
  d: (STAR) => runD(STAR),
  q: (STAR) => runQ(STAR),
  e: (STAR) => runE(STAR),
  z: (STAR) => runZ(STAR),
  c: (STAR) => runC(STAR),
  x: (STAR) => runX(STAR)
};

/* Function constants */
const EFFECT_MULTIPLIER = 1;
const EFFECT_CONSTANT = 5;
const FORCE_INCREASE = (window.CIRCLE_TIMER + EFFECT_CONSTANT) * EFFECT_MULTIPLIER;
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

// C = Right down
function runC(STAR) {
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

// Y = Bottom left
function runB(STAR) { return [0, 0]; }
function runN(STAR) { return [0, 0]; }
function runM(STAR) { return [0, 0]; }
/* #endregion 3) QUADRANT MAGNETISM */

/*========================================*
//#region 4) PONG
 *========================================*/
// R T G V
function runR(STAR) { return [0, 0]; }
function runT(STAR) { return [0, 0]; }
function runG(STAR) { return [0, 0]; }
function runV(STAR) { return [0, 0]; }
/* #endregion 4) PONG */

/*========================================*
//#region 5) OTHERS
 *========================================*/

// X = Invert
function runX(STAR) {
  STAR.vx = -STAR.vx;
  STAR.vy = -STAR.vy;
  return [0, 0];
}

function runF(STAR) { return [0, 0]; }
function runO(STAR) { return [0, 0]; }
function runP(STAR) { return [0, 0]; }
function runL(STAR) { return [0, 0]; }
/* #endregion 5) OTHERS */
