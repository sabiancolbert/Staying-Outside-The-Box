
const canvas = document.getElementById('constellation-bg');
const ctx = canvas.getContext('2d');

let width = window.innerWidth;
let height = window.innerHeight;
let stars = [];

const STAR_COUNT = 100;
const MAX_SPEED = 0.25;
const LINK_DISTANCE = 55;

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
      r: randomBetween(1, 2.2),
      ocapity: randomBetween(.4, 1)
    });
  }
}

// 🔧 resize canvas WITHOUT recreating stars
function resizeCanvas() {
  const oldWidth = width;
  const oldHeight = height;

  width = window.innerWidth;
  height = window.innerHeight;

  // scale existing stars to new size so pattern is preserved
  if (oldWidth && oldHeight) {
    const scaleX = width / oldWidth;
    const scaleY = height / oldHeight;
    for (const s of stars) {
      s.x *= scaleX;
      s.y *= scaleY;
    }
  }

  canvas.width = width;
  canvas.height = height;
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
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
      const dist = Math.hypot(dx, dy);

      if (dist < LINK_DISTANCE) {
        const alpha = 1 - dist / LINK_DISTANCE;
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
    s.opacity-=.0001;
    if(s.opacity < 0.4){
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
window.addEventListener('resize', resizeCanvas);