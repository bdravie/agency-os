/* Small things for every page. The clinic scene on the landing page has its own script (src/scripts/clinic.ts).
   Here: the corner booking button steps aside while the calendar is on screen, and a blog post shows how far down you are. */
(function () {
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var book = document.getElementById("book");
  if (book && "IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { document.documentElement.classList.toggle("at-book", e[0].isIntersecting); }, { threshold: 0.15 }).observe(book);
  }

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
})();
