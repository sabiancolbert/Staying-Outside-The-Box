(function boot(){
  // CSP-safe GA init (no inline)
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };

  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=G-LXE5T2K4ZT";
  document.head.appendChild(s);

  // Queue config calls (gtag.js will read from dataLayer when it loads)
  window.gtag("js", new Date());
  window.gtag("config", "G-LXE5T2K4ZT");

  // CSS mode flip
  const html = document.documentElement;
  html.classList.remove("noJs");
  html.classList.add("otherJs");
})();