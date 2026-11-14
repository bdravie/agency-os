/* Landing page only. Anonymous counts only: what happened, never who. The edge knows the page version from the visitor's cookie.
   The Cal.com booking calendar loads only when the visitor asks for it.
   The three quick questions are answered by tapping. The answers stay in this browser: they choose the wording shown next and are
   put in the booking's notes box (which the visitor can see and change) if they go on to book. Nothing about them is sent to this site. */
(function () {
  var sent = {};
  function send(t) {
    if (sent[t]) return;
    sent[t] = 1;
    try { navigator.sendBeacon("/e", new Blob([JSON.stringify({ t: t })], { type: "application/json" })); } catch (e) {}
  }

  var box = document.getElementById("cal");
  var loaded = false, shownNotes = "", notes = "";
  function loadCal() {
    if (!box) return;
    if (loaded && shownNotes === notes) return;
    var path = box.getAttribute("data-cal-link");
    if (!loaded) {
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
      Cal("on", { action: "bookingSuccessful", callback: function () { send("booked"); } });
    } else box.innerHTML = "";   // the answers changed after the calendar was drawn: draw it again with the new notes
    loaded = true;
    shownNotes = notes;
    var opts = { elementOrSelector: "#cal", calLink: path, layout: "month_view" };
    if (notes) opts.config = { notes: notes };
    Cal("inline", opts);
  }
  function toCal() {
    loadCal();
    var book = document.getElementById("book");
    if (book) book.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("[data-cta]");
    if (!a) return;
    send("cta_click");
    if (a.getAttribute("data-cta") === "demo" || !box) return;
    ev.preventDefault();
    toCal();
  });
  // "Book a call" on the blog and privacy pages links to /#book
  if (location.hash === "#book") toCal();

  window.addEventListener("scroll", function onScroll() {
    var h = document.documentElement;
    if ((window.scrollY + window.innerHeight) / h.scrollHeight >= 0.75) { send("scroll_75"); window.removeEventListener("scroll", onScroll); }
  }, { passive: true });

  // The three quick questions
  var fit = document.querySelector("[data-fit]");
  if (!fit) return;
  var steps = fit.querySelectorAll("[data-step]");
  var dots = fit.querySelectorAll(".fit-dots i");
  var result = fit.querySelector("[data-result]");
  var back = fit.querySelector("[data-back]");
  var ans = {}, said = {}, at = 0;

  var RESULTS = {
    covered: {
      title: "Sounds like your front desk has it covered",
      text: "If every call and enquiry already gets an answer, you may not need me, and I would rather say so. If that changes, or you would like a second pair of eyes on it, the call is still free.",
      main: "Book a call anyway", blog: true },
    looking: {
      title: "No rush. Have a read first",
      text: "The blog has short, plain guides on where clinic enquiries go missing and what to do about it. When the timing is right, the call is free and takes 30 minutes.",
      main: "Book a call for later", blog: true },
    other: {
      title: "Let's find out on a call",
      text: "I mostly work with dental practices and aesthetics clinics, but the same problem turns up in other places. Book 30 minutes and I will tell you honestly whether I can help.",
      main: "Pick a time" },
    fit: {
      title: "This looks worth a call",
      text: "In 30 minutes I will ask how calls and enquiries reach you today and tell you plainly what I would change and what it would cost. No obligation. Your answers go into the booking notes, so you will not have to repeat them.",
      main: "Pick a time" }
  };

  function show(n) {
    at = n;
    steps.forEach(function (s, k) { s.hidden = k !== n; });
    result.hidden = n < steps.length;
    dots.forEach(function (d, k) { d.className = k < n ? "done" : k === n ? "now" : ""; });
    back.hidden = n === 0;
    var head = n < steps.length ? steps[n].querySelector("legend") : result.querySelector("h3");
    if (head && document.activeElement && fit.contains(document.activeElement)) { head.setAttribute("tabindex", "-1"); head.focus({ preventScroll: true }); }
  }
  function finish() {
    var key = ans.gap === "covered" ? "covered" : ans.when === "looking" ? "looking" : ans.kind === "other" ? "other" : "fit";
    var r = RESULTS[key];
    result.querySelector("h3").textContent = r.title;
    result.querySelector("p").textContent = r.text;
    var main = result.querySelector("[data-cta]");
    result.querySelector("[data-main]").textContent = r.main;
    main.className = key === "fit" || key === "other" ? "btn" : "btn ghost";
    result.querySelector("[data-blog]").hidden = !r.blog;
    notes = "Clinic: " + said.kind + ". When the desk is busy or closed: " + said.gap + ". Timing: " + said.when + ".";
    show(steps.length);
  }
  fit.addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    if (b === back) { show(Math.max(0, at - 1)); return; }
    if (!b.hasAttribute("data-a")) return;
    var key = steps[at].getAttribute("data-step");
    ans[key] = b.getAttribute("data-a");
    said[key] = b.textContent.trim();
    if (at + 1 < steps.length) show(at + 1); else finish();
  });
  show(0);
})();
