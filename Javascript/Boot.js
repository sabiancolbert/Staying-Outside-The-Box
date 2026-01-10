
// CSP-safe GA init (no inline). Assumes gtag.js is included in the page.

(function () {
  // Ensure dataLayer exists
  window.dataLayer = window.dataLayer || [];

  // Define gtag without inline code
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  // Init + config
  window.gtag("js", new Date());
  window.gtag("config", "G-LXE5T2K4ZT");
})();

// Runs ASAP (no defer) so the correct CSS state applies before first paint.

(function () {
  const html = document.documentElement;

  // Remove JS-disabled fallback
  html.classList.remove("noJs");

  // Decide page type by presence of the menu button (your existing heuristic)
  const isHome = !!document.getElementById("menuButton");

  // Apply correct class
  html.classList.toggle("homeJs", isHome);
  html.classList.toggle("otherJs", !isHome);
})();