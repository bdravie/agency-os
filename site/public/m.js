/* Motion for every page. Small on purpose: blocks settle in as they come into view, the landing page's front-desk scene plays
   while it is on screen, dots drift behind the Navy block, and a blog post shows how far down you are.
   Everything stops when the tab is hidden or the thing scrolls away, and "reduce motion" gets the still picture. */
(function () {
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasIO = "IntersectionObserver" in window;

  // Settle-in
  var items = document.querySelectorAll("[data-reveal]");
  if (!hasIO || still) items.forEach(function (el) { el.classList.add("in"); });
  else {
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); seen.unobserve(e.target); } });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    items.forEach(function (el) { seen.observe(el); });
  }

  // The front-desk scene: plays only while visible
  var scene = document.querySelector(".scene");
  if (scene && hasIO && !still) {
    new IntersectionObserver(function (entries) { scene.classList.toggle("run", entries[0].isIntersecting); }, { threshold: 0.4 }).observe(scene);
  }

  // Reading progress on a blog post
  var bar = document.querySelector(".progress");
  if (bar && !still) {
    var tick = function () {
      var h = document.documentElement;
      var max = h.scrollHeight - window.innerHeight;
      bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ")";
    };
    window.addEventListener("scroll", tick, { passive: true });
    tick();
  }

  // Drifting dots behind the Navy block (colours read from the brand tokens, never written here)
  var c = document.querySelector("canvas[data-drift]");
  if (!c || !c.getContext) return;
  var ctx = c.getContext("2d");
  var css = getComputedStyle(c);
  var cream = css.getPropertyValue("--text").trim();
  var coral = css.getPropertyValue("--accent").trim();
  var dots = [], w = 0, h = 0, on = false, last = 0;

  function size() {
    var r = c.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    c.width = w * d; c.height = h * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    var n = Math.max(12, Math.min(38, Math.round(w / 34)));
    dots = [];
    for (var i = 0; i < n; i++) dots.push({ x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 2.2, v: 4 + Math.random() * 9, a: 0.12 + Math.random() * 0.3, coral: i % 4 === 0, sway: Math.random() * 6.28 });
  }
  function draw(dt) {
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < dots.length; i++) {
      var p = dots[i];
      p.y -= p.v * dt; p.sway += dt * 0.4;
      if (p.y < -6) { p.y = h + 6; p.x = Math.random() * w; }
      ctx.globalAlpha = p.a;
      ctx.fillStyle = p.coral ? coral : cream;
      ctx.beginPath();
      ctx.arc(p.x + Math.sin(p.sway) * 6, p.y, p.r, 0, 6.2832);
      ctx.fill();
    }
  }
  function loop(t) {
    if (!on) return;
    if (t - last >= 33) { draw(Math.min(0.1, (t - last) / 1000)); last = t; }   // about 30 frames a second
    requestAnimationFrame(loop);
  }
  function set(run) {
    if (run === on) return;
    on = run;
    if (on) { last = performance.now(); requestAnimationFrame(loop); }
  }
  size();
  draw(0);
  if (still || !hasIO) return;
  var inView = false;
  new IntersectionObserver(function (e) { inView = e[0].isIntersecting; set(inView && !document.hidden); }).observe(c);
  document.addEventListener("visibilitychange", function () { set(inView && !document.hidden); });
  var timer;
  window.addEventListener("resize", function () { clearTimeout(timer); timer = setTimeout(function () { size(); draw(0); }, 150); });
})();
