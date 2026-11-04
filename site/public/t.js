/* Anonymous counts only: what happened, never who. The edge knows the page version from the visitor's cookie.
   The Cal.com booking calendar loads only when the visitor asks for it. */
(function () {
  var sent = {};
  function send(t) {
    if (sent[t]) return;
    sent[t] = 1;
    try { navigator.sendBeacon("/e", new Blob([JSON.stringify({ t: t })], { type: "application/json" })); } catch (e) {}
  }

  var box = document.getElementById("cal");
  var loaded = false;
  function loadCal() {
    if (loaded || !box) return;
    loaded = true;
    var path = box.getAttribute("data-cal-link");
    (function (C, A, L) {
      var p = function (a, ar) { a.q.push(ar); };
      var d = C.document;
      C.Cal = C.Cal || function () {
        var cal = C.Cal, ar = arguments;
        if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement("script")).src = A; cal.loaded = true; }
        if (ar[0] === L) {
          var api = function () { p(api, arguments); };
          var ns = ar[1];
          api.q = api.q || [];
          if (typeof ns === "string") { cal.ns[ns] = cal.ns[ns] || api; p(cal.ns[ns], ar); p(cal, ["initNamespace", ns]); } else p(cal, ar);
          return;
        }
        p(cal, ar);
      };
    })(window, "https://app.cal.com/embed/embed.js", "init");
    Cal("init", { origin: "https://app.cal.com" });
    Cal("inline", { elementOrSelector: "#cal", calLink: path, layout: "month_view" });
    Cal("on", { action: "bookingSuccessful", callback: function () { send("booked"); } });
  }

  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("[data-cta]");
    if (!a) return;
    send("cta_click");
    if (a.getAttribute("data-cta") === "demo" || !box) return;
    ev.preventDefault();
    loadCal();
    box.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });

  window.addEventListener("scroll", function onScroll() {
    var h = document.documentElement;
    if ((window.scrollY + window.innerHeight) / h.scrollHeight >= 0.75) { send("scroll_75"); window.removeEventListener("scroll", onScroll); }
  }, { passive: true });
})();
