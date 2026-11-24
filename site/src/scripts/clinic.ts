// Motion for the clinic scene (components/ClinicScene.astro). One loop of about half a minute:
//   every room in use -> the phone rings out -> the next call is answered by the assistant and booked into the diary
//   -> the doors never opened -> after closing, the same with the lights off -> morning, and round again.
// The picture as written in the component is the finished still, so nothing here runs for "reduce motion".
// GSAP moves and fades only (transform and opacity); colours change through the .night class and CSS, so the two never fight.
// It plays only while the scene is on screen and the tab is visible. On a screen narrower than the drawing, --cam pans it
// between the desk (0) and the doors (1); on a wide screen the whole room fits and the pan does nothing.
import { gsap } from "gsap";

const CAPTIONS = {
  busy: "Every room is in use. A red light means do not disturb.",
  rings: "The phone rings. Nobody is free to pick up.",
  missed: "It rings out, and that caller may not try again.",
  answered: "The next call is answered straight away.",
  says: "The assistant says what it is and offers a time.",
  booked: "Booked into the diary.",
  doors: "And the doors never opened.",
  closed: "After closing, the phone still rings.",
  late: "It is answered, with nobody in the building.",
  night: "Answered and booked, ready for the morning.",
};

function start(root: HTMLElement, cap: HTMLElement) {
  const svg = root.querySelector("svg")!;
  const one = (s: string) => svg.querySelector(s)!;
  const all = (s: string) => Array.from(svg.querySelectorAll(s));
  const still = cap.textContent;

  // How far the drawing can pan, and where the desk view sits (far enough in that the speech bubble is not cut off).
  function measure() {
    const width = svg.getBoundingClientRect().width;
    const scale = width / 1600;
    const pan = Math.max(0, width - root.clientWidth);
    const deskUnits = Math.min(56, Math.max(0, 694 - root.clientWidth / scale));
    root.style.setProperty("--pan", `${pan}px`);
    root.style.setProperty("--desk", `${Math.min(pan, deskUnits * scale)}px`);
  }
  const sizes = new ResizeObserver(measure);
  sizes.observe(root);
  measure();
  root.classList.add("live");

  const phone = one("[data-phone]"), handset = one("[data-handset]"), marks = one("[data-marks]");
  const ringLight = one('[data-light="ring"]'), onLight = one('[data-light="on"]');
  const missed = one("[data-missed]"), bubble = one("[data-bubble]"), wave = all("[data-wave] rect");
  const hour = one("[data-hour]"), minute = one("[data-minute]");
  const lamps = all("[data-lamp]"), glows = all("[data-glow]");
  const lines = (k: string) => all(`[data-say="${k}"] text`);

  // The hands are written with a rotate() so the still picture shows a time; from here GSAP turns them.
  const hands = [hour, minute].map((el) => [el, el.getAttribute("transform")] as const);
  hands.forEach(([el]) => el.removeAttribute("transform"));
  gsap.set(hour, { rotation: 310, svgOrigin: "860 150" });
  gsap.set(minute, { rotation: 120, svgOrigin: "860 150" });

  // The start of the story: nothing answered yet, both slots free, the camera on the doors.
  gsap.set(root, { "--cam": 1 });
  gsap.set([bubble, onLight, '[data-new="s1"]', '[data-say] text'].flatMap((s) => (typeof s === "string" ? all(s) : [s])), { opacity: 0 });
  gsap.set(all("[data-say]"), { opacity: 1 });
  gsap.set(all('[data-free="s1"]'), { opacity: 1 });
  gsap.set(all("[data-pass]"), { transformOrigin: "50% 50%" });
  gsap.set(missed, { transformOrigin: "50% 50%" });
  cap.textContent = CAPTIONS.busy;

  const pulse = gsap.to(glows, { scale: 1.28, duration: 1.1, repeat: -1, yoyo: true, ease: "sine.inOut", transformOrigin: "50% 50%", paused: true });
  const tl = gsap.timeline({ repeat: -1, paused: true, defaults: { ease: "power2.out" } });

  const caption = (t: number, text: string) =>
    tl.to(cap, { opacity: 0, duration: 0.18, ease: "none" }, t)
      .call(() => { cap.textContent = text; }, undefined, t + 0.18)
      .to(cap, { opacity: 1, duration: 0.3, ease: "none" }, t + 0.2);

  // The phone vibrates on the desk: the handset rattles, the marks above it flick, its light goes Coral.
  const ring = (t: number, length: number) =>
    tl.to([marks, ringLight], { opacity: 1, duration: 0.08 }, t)
      .fromTo(handset, { rotation: -4, x: -2 }, { rotation: 4, x: 2, duration: 0.05, repeat: Math.round(length / 0.05) - 1, yoyo: true, ease: "sine.inOut", svgOrigin: "507 307", immediateRender: false }, t)
      .fromTo(phone, { x: -1.6 }, { x: 1.6, duration: 0.04, repeat: Math.round(length / 0.04) - 1, yoyo: true, ease: "none", immediateRender: false }, t)
      .fromTo(marks, { scale: 0.88 }, { scale: 1.14, duration: 0.1, repeat: Math.round(length / 0.1) - 1, yoyo: true, ease: "sine.inOut", svgOrigin: "507 292", immediateRender: false }, t)
      .set(handset, { rotation: 0, x: 0 }, t + length)
      .set(phone, { x: 0 }, t + length)
      .to([marks, ringLight], { opacity: 0, duration: 0.12 }, t + length);

  // The assistant answers: light goes Lagoon, it says what it is, offers a time, and the booking travels to the diary.
  const answer = (t: number, first: string, second: string, slot: string, pass: number, rowY: number) => {
    const ticket = one(`[data-pass="${pass}"]`), free = one(`[data-free="${slot}"]`), booked = one(`[data-new="${slot}"]`);
    tl.to(onLight, { opacity: 1, duration: 0.2 }, t)
      .fromTo(bubble, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)", svgOrigin: "507 268", immediateRender: false }, t + 0.1)
      .to(wave, { scaleY: 0.3, duration: 0.22, repeat: 27, yoyo: true, stagger: 0.07, ease: "sine.inOut", transformOrigin: "50% 50%" }, t + 0.3)
      .to(lines(first), { opacity: 1, duration: 0.3, stagger: 0.4 }, t + 0.45)
      .to(lines(first), { opacity: 0, duration: 0.2 }, t + 3.5)
      .to(lines(second), { opacity: 1, duration: 0.3, stagger: 0.3 }, t + 3.75)
      .set(ticket, { x: 507, y: 262, scale: 0.6 }, t + 4.6)
      .to(ticket, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2)" }, t + 4.6)
      .to(ticket, { x: 210, duration: 1.1, ease: "power2.inOut" }, t + 4.95)
      .to(ticket, { y: 232, duration: 0.5, ease: "power1.out" }, t + 4.95)
      .to(ticket, { y: rowY, duration: 0.6, ease: "power2.in" }, t + 5.45)
      .to(free, { opacity: 0, duration: 0.2 }, t + 6)
      .to(booked, { opacity: 1, duration: 0.25 }, t + 6)
      .to(ticket, { opacity: 0, scale: 0.9, duration: 0.25 }, t + 6.05)
      .fromTo(booked, { scale: 1.05 }, { scale: 1, duration: 0.45, svgOrigin: `210 ${rowY}`, immediateRender: false }, t + 6.05)
      .to([bubble, onLight], { opacity: 0, duration: 0.3 }, t + 7.2)
      .to(lines(second), { opacity: 0, duration: 0.3 }, t + 7.2);
  };
  const pan = (t: number, to: number) => tl.to(root, { "--cam": to, duration: 1.5, ease: "power2.inOut" }, t);

  // Day
  pan(2.2, 0);
  caption(2.5, CAPTIONS.rings);
  ring(2.9, 0.9);
  ring(4.3, 0.9);
  tl.fromTo(missed, { opacity: 0, scale: 0.7, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: 0.35, ease: "back.out(2)", immediateRender: false }, 5.5);
  caption(5.6, CAPTIONS.missed);
  tl.to(missed, { opacity: 0, y: -10, duration: 0.3 }, 7.9);
  ring(8.4, 0.7);
  caption(9.1, CAPTIONS.answered);
  answer(9.2, "a1", "a2", "s1", 1, 275);
  caption(11.4, CAPTIONS.says);
  caption(14.3, CAPTIONS.booked);
  pan(16.8, 1);
  caption(17.2, CAPTIONS.doors);

  // After closing: lights off, the clock runs on to the evening, and the phone still gets answered.
  const dusk = 19.8;
  tl.call(() => root.classList.add("night"), undefined, dusk)
    .to(lamps, { opacity: 0, duration: 0.7 }, dusk)
    .to(glows, { opacity: 0, duration: 0.7 }, dusk)
    .to(hour, { rotation: 560, duration: 1.7, ease: "power2.inOut", svgOrigin: "860 150" }, dusk)
    .to(minute, { rotation: 3120, duration: 1.7, ease: "power2.inOut", svgOrigin: "860 150" }, dusk)
    .to([one("[data-day]"), one("[data-open]")], { opacity: 0, duration: 0.3 }, dusk + 0.6)
    .to([one("[data-evening]"), one("[data-closed]")], { opacity: 1, duration: 0.3 }, dusk + 0.9);
  caption(dusk + 0.5, CAPTIONS.closed);
  pan(dusk + 0.9, 0);
  ring(dusk + 2.6, 0.9);
  answer(dusk + 3.6, "a3", "a4", "s2", 2, 319);
  caption(dusk + 3.8, CAPTIONS.late);
  caption(dusk + 8.3, CAPTIONS.night);

  // Morning: back to the start, so the loop joins up.
  const dawn = dusk + 11.6;
  tl.call(() => root.classList.remove("night"), undefined, dawn)
    .to(lamps, { opacity: 1, duration: 0.7 }, dawn + 0.3)
    .to(glows, { opacity: 0.16, duration: 0.7 }, dawn + 0.3)
    .to(hour, { rotation: 1030, duration: 1.7, ease: "power2.inOut", svgOrigin: "860 150" }, dawn)
    .to(minute, { rotation: 8760, duration: 1.7, ease: "power2.inOut", svgOrigin: "860 150" }, dawn)
    .to([one("[data-evening]"), one("[data-closed]")], { opacity: 0, duration: 0.3 }, dawn + 0.6)
    .to([one("[data-day]"), one("[data-open]")], { opacity: 1, duration: 0.3 }, dawn + 0.9)
    .to(all("[data-new]"), { opacity: 0, duration: 0.4 }, dawn + 0.6)
    .to(all("[data-free]"), { opacity: 1, duration: 0.4 }, dawn + 0.8);
  pan(dawn + 0.2, 1);
  caption(dawn + 0.8, CAPTIONS.busy);
  tl.to({}, { duration: 0.4 });

  // Play only while it can be seen.
  let inView = false;
  const run = () => {
    const go = inView && !document.hidden;
    tl.paused(!go);
    pulse.paused(!go);
  };
  const seen = new IntersectionObserver((e) => { inView = e[0].isIntersecting; run(); }, { threshold: 0.3 });
  seen.observe(root);
  document.addEventListener("visibilitychange", run);

  // If the visitor switches "reduce motion" on, GSAP puts every tween back; this restores the rest of the still picture.
  return () => {
    seen.disconnect();
    sizes.disconnect();
    document.removeEventListener("visibilitychange", run);
    root.classList.remove("live", "night");
    hands.forEach(([el, t]) => t && el.setAttribute("transform", t));
    cap.textContent = still;
    cap.style.opacity = "";
  };
}

const root = document.querySelector<HTMLElement>("[data-clinic]");
const cap = document.querySelector<HTMLElement>("[data-clinic-cap]");
if (root && cap && "IntersectionObserver" in window && "ResizeObserver" in window) {
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => start(root, cap));
  // The still picture on a narrow screen can be swiped sideways; start it far enough in that the speech bubble is whole.
  mm.add("(prefers-reduced-motion: reduce)", () => {
    const scale = root.scrollWidth / 1600;
    root.scrollLeft = Math.min(56, Math.max(0, 694 - root.clientWidth / scale)) * scale;
  });
}
