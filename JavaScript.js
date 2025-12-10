// thank heavens for chatGPT <3

/*==============================*
 *  GLOBAL PAGE STATE
 *==============================*/

let isInternalReferrer = false;
let isTransitioning = false;

/*==============================*
 *  SMALL HELPERS
 *==============================*/

// Main content wrapper
const getPage = () => document.getElementById('transitionContainer');


// Use #transitionContainer as the only scroll area
function lockScrollToContainer(page = getPage()) {
  const html = document.documentElement;
  const body = document.body;
  html.style.overflowY = 'hidden';
  body.style.height = '100dvmin';
  if (page) page.style.overflowY = 'auto';
}

// Let the whole page scroll normally
function freeScrollLayout(page = getPage()) {
  const html = document.documentElement;
  const body = document.body;
  html.style.overflowY = 'auto';
  body.style.height = 'auto';
  if (page) page.style.overflowY = 'visible';
}

/*==============================*
 *  PAGE LOAD HANDLER
 *==============================*/

window.addEventListener('load', () => {
  const page = getPage();

  // Clear menu-return flag for this page view
  const suppressHomeBack =
    sessionStorage.getItem('suppressHomeBack') === '1';
  sessionStorage.removeItem('suppressHomeBack');

  // Remove hash so anchors don't interfere with transitions
  if (window.location.hash) {
    history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search
    );
  }

  // Configure slide-in timing and lock scroll after transition
  if (page) {

    document.documentElement.style.setProperty(
    '--slide-duration',
    '0.6s'
    );

    requestAnimationFrame(() => {
      page.classList.add('ready');

      page.addEventListener(
        'transitionend',
        () => lockScrollToContainer(page),
        { once: true }
      );
    });
  }

  // Detect if we came from another page on this site
  const ref = document.referrer;
  if (ref) {
    try {
      const refUrl = new URL(ref);
      isInternalReferrer = refUrl.origin === window.location.origin;
    } catch {
      isInternalReferrer = false;
    }
  }

  // Show or hide the homepage back link
  const backLink = document.getElementById('homepageBack');
  if (backLink) {
    if (!suppressHomeBack && isInternalReferrer && ref) {
      try {
        localStorage.setItem('homepageBackUrl', ref);
      } catch (err) {
        console.warn('Could not save homepageBackUrl:', err);
      }
    } else {
      localStorage.removeItem('homepageBackUrl');
    }

    const backUrl = localStorage.getItem('homepageBackUrl');
    backLink.style.display =
      !suppressHomeBack && backUrl ? 'block' : 'none';
  }

  // Clear saved constellations on fresh external entry
  if (!isInternalReferrer) {
    localStorage.removeItem('constellationStars');
    localStorage.removeItem('constellationMeta');
  }
});

/*==============================*
 *  BACK/FORWARD CACHE HANDLER
 *==============================*/

window.addEventListener('pageshow', (event) => {
  const page = getPage();
  if (!page) return;

  const navEntries = performance.getEntriesByType
    ? performance.getEntriesByType('navigation')
    : [];
  const navType = navEntries[0] && navEntries[0].type;

  // Fix state when page is restored from bfcache
  if (event.persisted || navType === 'back_forward') {
    page.classList.remove('slide-out');
    page.classList.add('ready');

    lockScrollToContainer(page);

    freezeConstellation = false;
    cleanedUserSpeed = 0;
    smoothSpeed = 0;
    pointerSpeed = 0;

    page.scrollTop = 0;
    isTransitioning = false;
  }
});

/*==============================*
 *  SIMPLE HTML HELPERS
 *==============================*/

// Toggle an element using the hidden attribute
function toggleElement(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = !el.hidden;
}

// Drop focus after touch so active states clear
document.addEventListener(
  'touchend',
  () => {
    document.activeElement?.blur();
  },
  { passive: true }
);

/*==============================*
 *  CONSTELLATION CANVAS SETUP
 *==============================*/

const canvas = document.getElementById('constellations');
const brush = canvas.getContext('2d');

let freezeConstellation = false;

// Mouse/touch movement tracking
let lastX = 0,
  lastY = 0,
  lastTime = 0,
  pointerSpeed = 0,
  smoothSpeed = 0,
  cleanedUserSpeed = 0,
  attractionValue = 1;

// Canvas size and star scaling
let width = 0,
  height = 0,
  scaleFactor = 0,
  maxStarCount = 0,
  maxLinkDistance = 0;

// Star objects
let stars = [];

/*==============================*
 *  STAR HELPERS
 *==============================*/

// Random float in [min, max)
const randomBetween = (min, max) =>
  Math.random() * (max - min) + min;

/*==============================*
 *  STAR INITIALIZATION
 *==============================*/

// Load saved stars or create new ones
function initStars() {
  const saved = localStorage.getItem('constellationStars');

  if (!saved) {
    createStars();
    return;
  }

  try {
    const parsed = JSON.parse(saved);

    if (Array.isArray(parsed) && parsed.length) {
      stars = parsed;

      const metaRaw = localStorage.getItem('constellationMeta');
      if (metaRaw) {
        try {
          const meta = JSON.parse(metaRaw);
          if (meta.width > 0 && meta.height > 0) {
            const scaleX = width / meta.width;
            const scaleY = height / meta.height;
            const sizeScale =
              (width + height) / (meta.width + meta.height);

            for (const star of stars) {
              star.x *= scaleX;
              star.y *= scaleY;
              star.size *= sizeScale;
            }
          }

          attractionValue = meta.attractionValue ?? 1;
          cleanedUserSpeed = meta.cleanedUserSpeed ?? 0;
          smoothSpeed = meta.smoothSpeed ?? 0;
          pointerSpeed = meta.pointerSpeed ?? 0;
        } catch (err) {
          console.warn('Could not parse constellationMeta, skipping scale.', err);
        }
      }
    } else {
      createStars();
    }
  } catch (err) {
    console.error('Could not parse saved stars, recreating.', err);
    createStars();
  }
}

// Build a new starfield for the current canvas
function createStars() {
  stars = [];

  for (let i = 0; i < maxStarCount; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: randomBetween(-0.25, 0.25),
      vy: randomBetween(-0.25, 0.25),
      size: randomBetween(3, scaleFactor / 400),
      opacity: randomBetween(0.005, 1.8),
      fadeSpeed: randomBetween(1, 2.1),
      redValue: randomBetween(0, 200),
      whiteValue: 0
    });
  }
}

/*==============================*
 *  STAR ANIMATION
 *==============================*/

// Move, fade, and wrap stars around the screen
function moveStars() {
  for (const star of stars) {
    star.x += star.vx * (cleanedUserSpeed + 1);
    star.y += star.vy * (cleanedUserSpeed + 1);

    // Pointer pull / push
    if (lastTime !== 0 && cleanedUserSpeed > 0.19) {
      const dx = lastX - star.x;
      const dy = lastY - star.y;
      const screenSizeModifier = scaleFactor / 500;
      const distSq = dx * dx + dy * dy;
      const maxInfluence = 12000 * screenSizeModifier;

      if (distSq > 4 && distSq < maxInfluence) {
        const proximity = (maxInfluence - distSq) / maxInfluence;
        const pull =
          0.005 *
          cleanedUserSpeed *
          proximity *
          (attractionValue < 0 ? attractionValue * 2.5 : attractionValue);

        star.x += dx * pull;
        star.y += dy * pull;
      }
    }

    // Fade white flashes
    if (star.whiteValue > 0) {
      star.whiteValue -= Math.max(0, star.whiteValue * 0.02);
    }

    // Opacity and twinkle
    if (star.opacity <= 0.005) {
      star.opacity = 1;
      if (Math.random() < 0.07) star.whiteValue = 1;
    } else if (star.opacity > 0.02) {
      star.opacity -= 0.005 * star.fadeSpeed;
    } else {
      star.opacity -= 0.0001;
    }

    // Wrap at canvas edges
    if (star.x < 0) star.x = width;
    if (star.x > width) star.x = 0;
    if (star.y < 0) star.y = height;
    if (star.y > height) star.y = 0;
  }

  // Slowly decay pointer speed
  cleanedUserSpeed *= 0.95;
  if (cleanedUserSpeed < 0.05) cleanedUserSpeed = 0;

  // Ease attraction back to normal
  attractionValue += (1 - attractionValue) * 0.06;
  if (attractionValue > 1) attractionValue = 1;
}

// Draw star links and star circles
function drawStarsWithLines() {
  brush.clearRect(0, 0, width, height);

  // Lines between nearby stars
  brush.lineWidth = 1;
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const a = stars[i];
      const b = stars[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);

      if (dist < maxLinkDistance) {
        const opacityModifier = (a.opacity + b.opacity) / 2;
        const alpha =
          (1 - dist / maxLinkDistance) * opacityModifier;

        brush.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
        brush.beginPath();
        brush.moveTo(a.x, a.y);
        brush.lineTo(b.x, b.y);
        brush.stroke();
      }
    }
  }

  // Star bodies
  for (const star of stars) {
    let tempRed = 255 * star.whiteValue + star.redValue;
    if (tempRed > 255) tempRed = 255;

    const tempGreen = 255 * star.whiteValue;
    const tempBlue = 255 * star.whiteValue;
    const tempSize = star.whiteValue * 2 + star.size;

    brush.beginPath();
    brush.fillStyle = `rgba(${tempRed}, ${tempGreen}, ${tempBlue}, ${star.opacity})`;
    brush.arc(star.x, star.y, tempSize, 0, Math.PI * 2);
    brush.fill();
  }
}

/*==============================*
 *  RESIZE + ANIMATION LOOP
 *==============================*/

// Match canvas to viewport and rescale stars
function resizeCanvas() {
  const oldWidth = width;
  const oldHeight = height;
  const oldScaleFactor = scaleFactor;

  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  scaleFactor = Math.min(width + height, 2000);
  maxStarCount = scaleFactor / 10;
  maxLinkDistance = scaleFactor / 10;

  if (oldWidth !== 0) {
    const scaleX = width / oldWidth;
    const scaleY = height / oldHeight;
    const scaleSize = scaleFactor / oldScaleFactor;

    for (const star of stars) {
      star.x *= scaleX;
      star.y *= scaleY;
      star.size *= scaleSize;
    }
  }
}

// Main drawing loop
function animate() {
  if (!freezeConstellation) moveStars();
  drawStarsWithLines();
  requestAnimationFrame(animate);
}

/*==============================*
 *  POINTER SPEED
 *==============================*/

// Update pointer speed from mouse or touch
function updateSpeed(x, y, time) {
  const dx = x - lastX;
  const dy = y - lastY;
  const dt = time - lastTime;

  if (dt > 0) {
    pointerSpeed = Math.sqrt(dx * dx + dy * dy) / dt;
  }

  smoothSpeed = smoothSpeed * 0.8 + pointerSpeed * 10;
  cleanedUserSpeed = Math.min(
    smoothSpeed * (scaleFactor / 1100) ** 2,
    10
  );

  lastX = x;
  lastY = y;
  lastTime = time;
}

window.addEventListener('mousemove', (e) =>
  updateSpeed(e.clientX, e.clientY, e.timeStamp)
);

window.addEventListener('mousedown', (e) => {
  attractionValue = -2;
  lastX = e.clientX;
  lastY = e.clientY;
  lastTime = e.timeStamp;
  updateSpeed(e.clientX, e.clientY, e.timeStamp);
  cleanedUserSpeed = Math.min(cleanedUserSpeed + 0.8, 3);
});

window.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  if (!t) return;

  attractionValue = -2;
  lastX = t.clientX;
  lastY = t.clientY;
  lastTime = e.timeStamp;
  updateSpeed(t.clientX, t.clientY, e.timeStamp);
  cleanedUserSpeed = Math.min(cleanedUserSpeed + 0.8, 3);
});

window.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (!t) return;
  updateSpeed(t.clientX, t.clientY, e.timeStamp);
});

/*==============================*
 *  PAGE TRANSITIONS & STORAGE
 *==============================*/

// Trigger slide-out and navigate to a new URL
function transitionTo(url, isMenu = false) {
  if (isTransitioning) return;
  isTransitioning = true;

  const page = getPage();
  freeScrollLayout(page);

  if (isMenu) {
    sessionStorage.setItem('suppressHomeBack', '1');
  } else {
    sessionStorage.removeItem('suppressHomeBack');
  }

  if (url === 'back') {
    const stored = localStorage.getItem('homepageBackUrl');
    if (!stored) {
      isTransitioning = false;
      return;
    }
    url = stored;
  }

  if (!page) {
    window.location.href = url;
    return;
  }

  freezeConstellation = true;
  saveStarsToStorage();

  page.classList.add('slide-out');

  setTimeout(() => {
    window.location.href = url;
  }, 600);
}

// Save current starfield to localStorage
function saveStarsToStorage() {
  try {
    localStorage.setItem('constellationStars', JSON.stringify(stars));
    localStorage.setItem(
      'constellationMeta',
      JSON.stringify({
        width,
        height,
        scaleFactor,
        attractionValue,
        cleanedUserSpeed,
        smoothSpeed,
        pointerSpeed
      })
    );
  } catch (err) {
    console.warn('Could not save stars:', err);
  }
}

window.addEventListener('beforeunload', saveStarsToStorage);

/*==============================*
 *  INITIALIZATION
 *==============================*/

resizeCanvas();
initStars();
animate();
window.addEventListener('resize', resizeCanvas);