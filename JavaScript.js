
const canvas = document.getElementById('constellation-bg');
const ctx = canvas.getContext('2d');

let width = window.innerWidth;
let height = window.innerHeight;
let stars = [];
let scaleFactor = width+height;

let STAR_COUNT = 0;
let LINK_DISTANCE = 0;
 
const MAX_SPEED = 0.25;


function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function createStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: randomBetween(-MAX_SPEED, MAX_SPEED),
      vy: randomBetween(-MAX_SPEED, MAX_SPEED),
      r: randomBetween(1, scaleFactor/400),
      opacity: randomBetween(.1001, 1)
    });
  }
}

// 🔧 resize canvas WITHOUT recreating stars
function resizeCanvas() {
  const oldWidth = width;
  const oldHeight = height;
  const oldScaleFactor = scaleFactor;

  width = window.innerWidth;
  height = window.innerHeight;
  scaleFactor = width+height;
  if(scaleFactor>1500){
    scaleFactor = 1500;
    }
  STAR_COUNT = scaleFactor/10;
  LINK_DISTANCE = scaleFactor/20;

  // scale existing stars to new size so pattern is preserved
  if (oldWidth && oldHeight) {
    const scaleX = width / oldWidth;
    const scaleY = height / oldHeight;
    const scaleS = scaleFactor / oldScaleFactor;
    for (const s of stars) {
      s.x *= scaleX;
      s.y *= scaleY;
      s.r *= scaleS;
    }
  }

  canvas.width = width;
  canvas.height = height;
}

function updateStars() {
  for (const s of stars) {
    s.x += s.vx;
    s.y += s.vy;

    if (s.x < 0) s.x = width;
    if (s.x > width) s.x = 0;
    if (s.y < 0) s.y = height;
    if (s.y > height) s.y = 0;
  }
}

function drawStars() {
  ctx.clearRect(0, 0, width, height);
  

    
  // lines
  ctx.lineWidth = 1;
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const a = stars[i];
      const b = stars[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const alphaModifier = (a.opacity + b.opacity) /2;
      const dist = Math.hypot(dx, dy);

      if (dist < LINK_DISTANCE) {
        const alpha = (1 - dist / LINK_DISTANCE) * alphaModifier;
        ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }
  // stars
  for (const s of stars) {
    ctx.beginPath();
    ctx.fillStyle = `rgba(0, 0, 0, ${s.opacity})`;
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    s.opacity-=.005;
    if(s.opacity < 0.1){
      s.opacity = 1;
      }
    }
}

function animate() {
  updateStars();
  drawStars();
  requestAnimationFrame(animate);
}

// 🔥 Init ONCE
resizeCanvas();
createStars();
animate();

// ✅ Resize WITHOUT restarting anything
window.addEventListener('resize', () => {
  resizeCanvas();
});