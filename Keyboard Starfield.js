let USER_INPUT = 0;

const setForceX = (value) => (window.KEYBOARD_FORCE_X = value);
const getForceX = () => window.KEYBOARD_FORCE_X;

const setForceY = (value) => (window.KEYBOARD_FORCE_Y = value);
const getForceY = () => window.KEYBOARD_FORCE_Y;

window.addEventListener("keydown", (event) => {
  // Ignore held-down repeats
  if (event.repeat) return;
});
