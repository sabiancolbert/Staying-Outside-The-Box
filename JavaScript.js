
  const canvas = document.getElementById('constellation-bg');
  const ctx = canvas.getContext('2d');

  let width, height, stars;

  const STAR_COUNT = 120;     // number of stars
  const MAX_SPEED = 0.25;     // max star speed
  const LINK_DISTANCE = 130;  // max distance (px) to draw a line

  function resizeCanvas() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = width;
    canvas.height = height;
  }

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
        r: randomBetween(1, 2.2),          // star radius
        opacity: randomBetween(0.4, 1)     // some soft variation
      });
    }
  }

  function updateStars() {
    for (const s of stars) {
      s.x += s.vx;
      s.y += s.vy;

      // Wrap around screen edges
      if (s.x < 0) s.x = width;
      if (s.x > width) s.x = 0;
      if (s.y < 0) s.y = height;
      if (s.y > height) s.y = 0;
    }
  }

  function drawStars() {
    ctx.clearRect(0, 0, width, height);

    // Slight radial gradient for subtle glow
    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, Math.max(width, height)
    );
    gradient.addColorStop(0, '#050016');
    gradient.addColorStop(1, '#010008');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw lines (constellations) first
    ctx.lineWidth = 0.6;
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const a = stars[i];
        const b = stars[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < LINK_DISTANCE) {
          const alpha = 1 - dist / LINK_DISTANCE; // closer = brighter
          ctx.strokeStyle = `rgba(200, 200, 255, ${alpha * 0.6})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Draw stars
    for (const s of stars) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function animate() {
    updateStars();
    drawStars();
    requestAnimationFrame(animate);
  }

  // Init
  resizeCanvas();
  createStars();
  animate();

  // Handle window resize
  window.addEventListener('resize', () => {
    resizeCanvas();
    createStars(); // re-seed stars to fit new size
  });