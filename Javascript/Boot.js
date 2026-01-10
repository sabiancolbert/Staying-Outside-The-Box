
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
  html.classList.add("otherJs");
})();