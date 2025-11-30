/* thank heavens for chatGPT <3 */
/*==============================*
 *  PAGE LOAD HANDLER (must be at the top)
 *==============================*/

window.addEventListener('load', () => {
  const page = document.getElementById('transitionContainer');

  // NEW: read the flag from sessionStorage
  const suppressHomeBack = sessionStorage.getItem('suppressHomeBack') === '1';
  // Optional: clear it so it only applies once
  sessionStorage.removeItem('suppressHomeBack');
  
  // Remove hash if present (so #ids don't block the transition)
  if (window.location.hash) {
    history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search
    );
  }

  if (page) {
    // Measure height and set slide duration relative to content size
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const contentHeight = page.offsetHeight;

    let ratio = contentHeight / viewportHeight;
    ratio = Math.max(1, Math.min(ratio, 3)); // clamp between 1× and 3×

    const baseDuration = 0.5;
    const durationSeconds = baseDuration * ratio;

    document.documentElement.style.setProperty(
      '--slide-duration',
      `${durationSeconds}s`
    );

    // Allow CSS to see the "ready" state for entrance animation
    requestAnimationFrame(() => {
      page.classList.add('ready');
    });
  }

  // --- Referrer / back button / constellation reset logic ---

  const ref = document.referrer;
  if (ref) {
    try {
      const refUrl = new URL(ref);
      isInternalReferrer = refUrl.origin === window.location.origin;
    } catch (e) {
      isInternalReferrer = false;
    }
  } else {
    isInternalReferrer = false;
  }

      const backLink = document.getElementById('homepageBack');
  if (backLink) {
    if (!suppressHomeBack && isInternalReferrer && ref) {
      // normal behavior: store back URL
      try {
        localStorage.setItem('homepageBackUrl', ref);
      } catch (err) {
        console.warn('Could not save homepageBackUrl:', err);
      }
    } else if (suppressHomeBack) {
      // explicit "no back button" request
      localStorage.removeItem('homepageBackUrl');
    } else {
      // external or no referrer
      localStorage.removeItem('homepageBackUrl');
    }

    const backUrl = localStorage.getItem('homepageBackUrl');
    backLink.style.display =
      !suppressHomeBack && backUrl ? 'block' : 'none';
  }

  // If we came from an external site, reset stored constellation
  if (!isInternalReferrer) {
    localStorage.removeItem('constellationStars');
    localStorage.removeItem('constellationMeta');
  }
});

/*==============================*
 *  BACK/FORWARD CACHE HANDLER
 *==============================*/

window.addEventListener('pageshow', (event) => {
  const page = document.getElementById('transitionContainer');
  if (!page) return;

  // Guard for browsers that don't support PerformanceNavigationTiming
  const navEntries = performance.getEntriesByType
    ? performance.getEntriesByType('navigation')
    : [];
  const navType = navEntries[0] && navEntries[0].type;

  if (event.persisted || navType === 'back_forward') {
    // Make sure the content is visible, not stuck off-screen
    page.classList.remove('slide-out');
    page.classList.add('ready');

    // Unfreeze constellation so it animates again
    freezeConstellation = false;
    cleanedUserSpeed = 0;
    smoothSpeed = 0;
    pointerSpeed = 0;

    // Reset transition lock so links work again
    isTransitioning = false;

    // Reset scroll inside the transition container
    page.scrollTop = 0;
  }
});

/*==============================*
 *  SIMPLE HTML HELPERS
 *==============================*/

/**
 * Toggle visibility of an element by id using the `hidden` attribute.
 */
function toggleElement(id) {
  const element = document.getElementById(id);
  if (element) {
    element.hidden = !element.hidden;
  }
}


/*==============================*
 *  CONSTELLATION CANVAS SETUP
 *==============================*/

const canvas = document.getElementById('constellations');
const brush = canvas.getContext('2d');

let freezeConstellation = false;

// Pointer / speed tracking
let lastX = 0;
let lastY = 0;
let lastTime = 0;
let pointerSpeed = 0;
let smoothSpeed = 0;
let cleanedUserSpeed = 0;

// Canvas & star scaling
let width = 0;
let height = 0;
let scaleFactor = 0;
let maxStarCount = 0;
let maxLinkDistance = 0;

// Star collection
let stars = [];


/*==============================*
 *  UTILITY FUNCTIONS
 *==============================*/

/**
 * Return a random number between min (inclusive) and max (exclusive).
 */
function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}


/*==============================*
 *  STAR INITIALIZATION
 *==============================*/

/**
 * Initialize stars from localStorage if possible,
 * otherwise create a fresh set.
 */
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

      // Try to scale from old canvas size to this one
      const metaRaw = localStorage.getItem('constellationMeta');
      if (metaRaw) {
        try {
          const meta = JSON.parse(metaRaw);
          if (meta.width > 0 && meta.height > 0) {
            const scaleX = width / meta.width;
            const scaleY = height / meta.height;
            const sizeScale = (width + height) / (meta.width + meta.height);

            for (const star of stars) {
              star.x *= scaleX;
              star.y *= scaleY;
              star.size *= sizeScale;
            }
          }
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

/**
 * Create a fresh star field sized to the current canvas.
 * Used on first load or when no saved stars are valid.
 */
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
 *  STAR ANIMATION LOGIC
 *==============================*/

/**
 * Move stars based on their velocity, pointer attraction,
 * opacity twinkling, and edge wrapping.
 */
function moveStars() {
  for (const star of stars) {
    // Passive star movement, amplified by user speed
    star.x += star.vx * (cleanedUserSpeed + 1);
    star.y += star.vy * (cleanedUserSpeed + 1);

    // Attraction toward pointer when moving fast enough
    if (lastTime !== 0 && cleanedUserSpeed > 0.19) {
      const dx = lastX - star.x;
      const dy = lastY - star.y;
      const distSq = dx * dx + dy * dy;

      const maxInfluence = 130 * 130; // ~130px influence radius
      if (distSq > 4 && distSq < maxInfluence) {
        const baseForce = 0.008 * cleanedUserSpeed;
        const proximity = (maxInfluence - distSq) / maxInfluence;
        const pull = baseForce * proximity;

        star.x += dx * pull;
        star.y += dy * pull;
      }
    }

    // Fade white highlight back down
    if (star.whiteValue > 0) {
      star.whiteValue -= Math.max(0, star.whiteValue * 0.02);
    }

    // Opacity / twinkle logic
    if (star.opacity <= 0.005) {
      // "Respawn" invisible stars
      star.opacity = 1;

      // Chance to flash white
      if (Math.random() < 0.07) {
        star.whiteValue = 1;
      }
    } else if (star.opacity > 0.02) {
      // Normal fade
      star.opacity -= 0.005 * star.fadeSpeed;
    } else {
      // Keep star hidden a bit longer
      star.opacity -= 0.0001;
    }

    // Wrap stars around edges
    if (star.x < 0) star.x = width;
    if (star.x > width) star.x = 0;
    if (star.y < 0) star.y = height;
    if (star.y > height) star.y = 0;
  }

  // Slow decay of constellation speed after interactions
  cleanedUserSpeed *= 0.9;
}

/**
 * Draw stars and connecting lines based on distances and opacity.
 */
function drawStarsWithLines() {
  brush.clearRect(0, 0, width, height);

  // Draw lines between close stars
  brush.lineWidth = 1;
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const aStar = stars[i];
      const bStar = stars[j];

      const xDistance = aStar.x - bStar.x;
      const yDistance = aStar.y - bStar.y;
      const distance = Math.hypot(xDistance, yDistance);

      if (distance < maxLinkDistance) {
        const opacityModifier = (aStar.opacity + bStar.opacity) / 2;
        const alpha = (1 - distance / maxLinkDistance) * opacityModifier;

        brush.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
        brush.beginPath();
        brush.moveTo(aStar.x, aStar.y);
        brush.lineTo(bStar.x, bStar.y);
        brush.stroke();
      }
    }
  }

  // Draw star circles
  for (const star of stars) {
    let tempRed = 255 * star.whiteValue + star.redValue;
    if (tempRed > 255) {
      tempRed = 255;
    }
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
 *  CANVAS RESIZE HANDLING
 *==============================*/

/**
 * Resize the canvas to match the viewport and scale stars accordingly.
 */
function resizeCanvas() {
  const oldWidth = width;
  const oldHeight = height;
  const oldScaleFactor = scaleFactor;

  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  scaleFactor = width + height;
  if (scaleFactor > 1500) {
    scaleFactor = 1500;
  }

  maxStarCount = scaleFactor / 10;
  maxLinkDistance = scaleFactor / 10;

  // Scale existing stars when this is not the initial setup
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


/*==============================*
 *  MAIN ANIMATION LOOP
 *==============================*/

function animate() {
  if (!freezeConstellation) {
    moveStars();
  }

  drawStarsWithLines();
  requestAnimationFrame(animate);
}


/*==============================*
 *  POINTER SPEED TRACKING
 *==============================*/

/**
 * Update pointer speed and derived smoothed speed,
 * which controls how energetic the constellation is.
 */
function updateSpeed(x, y, time) {
  const dx = x - lastX;
  const dy = y - lastY;
  const dt = time - lastTime;

  if (dt > 0) {
    // px per ms
    pointerSpeed = Math.sqrt(dx * dx + dy * dy) / dt;
  }

  // Smoothing for jittery input
  smoothSpeed = smoothSpeed * 0.8 + pointerSpeed * 10;

  // Normalize to avoid extreme speeds
  cleanedUserSpeed = Math.min(smoothSpeed, 10);

  lastX = x;
  lastY = y;
  lastTime = time;
}

/* Desktop cursor tracking */
window.addEventListener('mousemove', (e) => {
  updateSpeed(e.clientX, e.clientY, e.timeStamp);
});

/* Touch tracking (mobile) */
window.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  updateSpeed(t.clientX, t.clientY, e.timeStamp);
});

/* Release attraction / reset speed on end of interaction */
window.addEventListener('touchend', () => {
  cleanedUserSpeed = 0;
  smoothSpeed = 0;
  pointerSpeed = 0;
});

window.addEventListener('mouseup', () => {
  cleanedUserSpeed = 0;
  smoothSpeed = 0;
  pointerSpeed = 0;
});


/*==============================*
 *  PAGE TRANSITIONS & STORAGE
 *==============================*/

let isInternalReferrer = false;
let isTransitioning = false;

/**
 * Transition to another URL with:
 *  - saving constellation state
 *  - slide-out CSS animation
 *
 * Special case: url === 'back' uses stored internal referrer.
 */
function transitionTo(url, isMenu = false) {
  if (isTransitioning) return;
  isTransitioning = true;

  // If this navigation came from menu, tell the next page
  if (isMenu) {
    sessionStorage.setItem('suppressHomeBack', '1');
  } else {
    sessionStorage.removeItem('suppressHomeBack');
  }
  const page = document.getElementById('transitionContainer');

  // Special case: 'back'
  if (url === 'back') {
    const stored = localStorage.getItem('homepageBackUrl');
    if (!stored) {
      isTransitioning = false;
      return;
    }
    url = stored;
  }

  // If there's no transition container, just navigate
  if (!page) {
    window.location.href = url;
    return;
  }

  // Freeze and save stars so they match on the next page
  freezeConstellation = true;
  saveStarsToStorage();

  // Trigger the slide-out animation
  page.classList.add('slide-out');

  const handler = (event) => {
    if (event.propertyName === 'transform') {
      page.removeEventListener('transitionend', handler);
      window.location.href = url;
    }
  };

  page.addEventListener('transitionend', handler);
}

/**
 * Save stars + meta info to localStorage.
 */
function saveStarsToStorage() {
  try {
    localStorage.setItem('constellationStars', JSON.stringify(stars));
    localStorage.setItem(
      'constellationMeta',
      JSON.stringify({
        width,
        height,
        scaleFactor
      })
    );
  } catch (err) {
    console.warn('Could not save stars:', err);
  }
}

/* Failsafe: save stars on normal page unload */
window.addEventListener('beforeunload', () => {
  saveStarsToStorage();
});

/*==============================*
 *  INITIALIZATION
 *==============================*/

// Initial canvas sizing + star setup + animation loop
resizeCanvas();
initStars();
animate();

// Keep canvas in sync with viewport
window.addEventListener('resize', () => {
  resizeCanvas();
});