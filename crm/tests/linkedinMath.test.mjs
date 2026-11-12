import test from "node:test";
import assert from "node:assert/strict";
import {
  assemblePost, cleanPostImage, cutAtWord, pageCount, slidesToText, spaceParagraphs, textToSlides, diagramCodeProblem, draftProblems, imageFileName, imageProblems, imageTextProblem, mermaidFromGraph,
  openingLine, postProblem, postStage, postWarnings, starterImage, swapOpening, wordCount,
} from "../lib/linkedinMath.ts";

const BODY = Array.from({ length: 14 }, (_, i) => `Line ${i + 1} explains one plain thing about how enquiries get lost between the phone and the diary.`).join("\n\n");
const draft = (o = {}) => {
  const opening = "Most missed enquiries are lost before anyone knows they arrived.";
  return { title: "Missed enquiries", opening, openingAlt: "The phone rang on site and nobody wrote it down.", text: assemblePost(opening, BODY, ["trades", "#systems"]), ...o };
};

test("a post's stage comes from what exists, not a stored value", () => {
  assert.equal(postStage({ status: "Scripted", day: null, hasImage: false }), "Drafted");
  assert.equal(postStage({ status: "Scripted", day: null, hasImage: true }), "Image ready");
  assert.equal(postStage({ status: "Scripted", day: "2026-11-20", hasImage: false }), "Scheduled");
  assert.equal(postStage({ status: "Posted", day: "2026-11-20", hasImage: true }), "Posted");
});

test("a post is assembled as opening, body, then at most three hashtags", () => {
  const t = assemblePost(" Opening. ", "Para one.\n\n\n\nPara two.  \n", ["one", "#two", "three", "four", "one"]);
  assert.equal(t, "Opening.\n\nPara one.\n\nPara two.\n\n#one #two #three");
  assert.equal(openingLine(t), "Opening.");
  assert.equal(wordCount("one  two\nthree"), 3);
});

test("paragraphs get a blank line between them, list lines stay together", () => {
  assert.equal(spaceParagraphs("One.\nTwo.\n- a\n- b\n1. c\nThree."), "One.\n\nTwo.\n\n- a\n- b\n1. c\n\nThree.");
  assert.equal(spaceParagraphs("One.\n\n\n\nTwo."), "One.\n\nTwo.");
  assert.equal(assemblePost("Hook.", "Line one.\nLine two.", []), "Hook.\n\nLine one.\n\nLine two.");
});

test("the opening line can be swapped only while it is still the one saved", () => {
  const t = "Hook A.\n\nBody stays.";
  assert.equal(swapOpening(t, "Hook A.", "Hook B."), "Hook B.\n\nBody stays.");
  assert.equal(swapOpening("My own first line.\n\nBody.", "Hook A.", "Hook B."), null);
  assert.equal(swapOpening(t, "Hook A.", " "), null);
});

test("a clean AI draft passes", () => {
  assert.deepEqual(draftProblems(draft()), []);
});

test("an AI draft is refused for figures, links, contact details, client claims and CRM names", () => {
  const bad = (extra, banned) => draftProblems(draft({ text: `${draft().text}\n\n${extra}` }), banned).join(" | ");
  assert.match(bad("It saved them £400 a week."), /money amount/);
  assert.match(bad("Bookings went up 30% in a month."), /money amount/);
  assert.match(bad("Read more at https://example.com"), /link/);
  assert.match(bad("Message @someone for the template."), /@ name/);
  assert.match(bad("Call 07700 900123 to see it."), /email or phone/);
  assert.match(bad("My clients saw the difference in a week."), /clients/);
  assert.match(bad("I am an AI automation consultant."), /AI automation/);
  assert.doesNotMatch(bad("We did this for Brightside Roofing."), /names a business/);
  assert.match(bad("We did this for Brightside Roofing.", ["brightside roofing"]), /names a business/);
});

test("an AI draft needs two different openings, no stock phrases, sensible length and few hashtags", () => {
  assert.match(draftProblems(draft({ openingAlt: "Most missed enquiries are lost before anyone knows they arrived!" })).join("|"), /really different/);
  assert.match(draftProblems(draft({ opening: "Did you know most enquiries go missing?" })).join("|"), /stock phrase/);
  assert.match(draftProblems(draft({ text: "Too short to be a post." })).join("|"), /only \d+ words/);
  assert.match(draftProblems(draft({ text: `${draft().text} #a #b` })).join("|"), /more than 3 hashtags/);
  assert.match(draftProblems(draft({ title: " " })).join("|"), /working title/);
});

test("the owner's own post is only refused for length and contact details", () => {
  assert.equal(postProblem("Title", "We saved £400 a week, see https://example.com"), null);
  assert.match(postProblem("", "text"), /working title/);
  assert.match(postProblem("Title", "x".repeat(3001)), /3,000/);
  assert.match(postProblem("Title", "Email me at owner@example.com"), /email address or phone/);
});

test("warnings point out a long opening, figures, links and hashtag piles without blocking", () => {
  const w = postWarnings(`${"A very long opening line ".repeat(12)}\n\nIt made £900. See www.example.com #a #b #c #d`).join("|");
  assert.match(w, /see more/);
  assert.match(w, /real figure/);
  assert.match(w, /link/);
  assert.match(w, /hashtags/);
  assert.deepEqual(postWarnings(""), []);
});

test("image text follows the cover rule: no figures, guarantees or contact details", () => {
  assert.equal(imageTextProblem("3 fixes for missed calls"), null);
  assert.match(imageTextProblem("Save 30% on admin"), /an image/);
  assert.match(imageTextProblem("Guaranteed leads"), /guarantee/i);
  assert.match(imageTextProblem("hello@example.com"), /links, emails/);
});

test("an image is cleaned to its kind, clamped and given safe defaults", () => {
  const d = cleanPostImage({ kind: "steps", size: "9:16", theme: "pink", title: "  Three   fixes for missed calls ", power: "fixes", items: ["One", "", "Two", 3, "Four", "Five", "Six", "Seven"], before: ["x"], code: "flowchart TD" });
  assert.equal(d.size, "4:5");
  assert.equal(d.theme, "navy");
  assert.equal(d.title, "Three fixes for missed calls");
  assert.equal(d.power, "FIXES");
  assert.equal(d.items.length, 6);
  assert.deepEqual(d.before, []);
  assert.equal(d.code, "");
  assert.equal(d.footer, true);
  assert.equal(cleanPostImage({ kind: "nonsense" }).kind, "quote");
  assert.equal(cleanPostImage({ kind: "quote", title: "Hello there", power: "missing" }).power, "");
  assert.equal(cleanPostImage(null).kind, "quote");
});

test("an image is refused when its kind is missing parts or its words break the rule", () => {
  assert.deepEqual(imageProblems(cleanPostImage({ kind: "quote", title: "Enquiries die in the gap between the phone and the diary" })), []);
  assert.match(imageProblems(cleanPostImage({ kind: "quote" })).join("|"), /Write the line/);
  assert.match(imageProblems(cleanPostImage({ kind: "steps", title: "Fixes", items: ["Only one"] })).join("|"), /at least 2/);
  assert.match(imageProblems(cleanPostImage({ kind: "compare", title: "Now and next", before: ["Paper"] })).join("|"), /each side/);
  assert.match(imageProblems(cleanPostImage({ kind: "steps", title: "Fixes", items: ["Cut admin by 50%", "Two"] })).join("|"), /percentages/);
  assert.match(imageProblems(cleanPostImage({ kind: "diagram", title: "Flow", code: "sequenceDiagram\nA->>B: hi" })).join("|"), /flowchart TD/);
});

test("diagram code must be a small flowchart with no directives, styling or figures", () => {
  assert.equal(diagramCodeProblem('flowchart TD\n  a["Call comes in"] --> b["Logged"]'), null);
  assert.equal(diagramCodeProblem("graph LR\n  a --> b"), null);
  assert.match(diagramCodeProblem(""), /empty/);
  assert.match(diagramCodeProblem('%%{init: {"theme":"dark"}}%%\nflowchart TD\n a-->b'), /flowchart TD|%%/);
  assert.match(diagramCodeProblem("flowchart TD\n a-->b\n %% note"), /%%/);
  assert.match(diagramCodeProblem('flowchart TD\n a-->b\n click a "https://example.com"'), /click/);
  assert.match(diagramCodeProblem('flowchart TD\n a["Save £500"] --> b'), /money/);
  assert.match(diagramCodeProblem(`flowchart TD\n${"  a --> b\n".repeat(200)}`), /too long/);
});

test("Mermaid is built from steps so the syntax is always valid", () => {
  const code = mermaidFromGraph(
    [{ id: "a", label: 'Call "missed" [on site]' }, { id: "b", label: "Urgent?", decision: true }, { id: "c", label: "Text the owner" }, { id: "d", label: "" }],
    [{ from: "a", to: "b" }, { from: "b", to: "c", label: "yes" }, { from: "b", to: "zzz" }, { from: "a", to: "b" }, { from: "c", to: "c" }]);
  assert.equal(code, 'flowchart TD\n  n1["Call missed on site"]\n  n2{"Urgent?"}\n  n3["Text the owner"]\n  n1 --> n2\n  n2 -->|"yes"| n3');
  assert.equal(diagramCodeProblem(code), null);
  // No usable edges: the steps are joined in order.
  assert.equal(mermaidFromGraph([{ id: "x", label: "One" }, { id: "y", label: "Two" }, { id: "z", label: "Three" }], [], "LR"), 'flowchart LR\n  n1["One"]\n  n2["Two"]\n  n3["Three"]\n  n1 --> n2\n  n2 --> n3');
  assert.equal(mermaidFromGraph([{ id: "x", label: "Alone" }], []), "");
  assert.equal(mermaidFromGraph(Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, label: `Step ${i}` })), []).split("\n").filter((l) => l.includes('["')).length, 8);
});

test("a starter image is built from the post without the AI and can always be saved", () => {
  const post = "Most enquiries are lost before anyone sees them.\n\nIt cost one firm £900.\n\nWrite every call down.\n\nTell one person.\n\n#trades";
  for (const kind of ["quote", "steps", "compare", "diagram"]) {
    const d = starterImage(kind, post);
    assert.equal(d.kind, kind);
    assert.deepEqual(imageProblems(d), [], kind);
  }
  assert.deepEqual(starterImage("steps", post).items, ["Write every call down.", "Tell one person."]);   // the line with a figure is left out
  assert.equal(starterImage("steps", "").items.length, 2);
  assert.match(imageProblems(starterImage("quote", "")).join("|"), /Write the line/);
});

test("carousels: slides cleaned, counted, edited as text, and checked", () => {
  const d = cleanPostImage({ kind: "carousel", title: "Three fixes", cta: "Which one would you try first?", slides: [{ heading: "Log every call", body: "The moment it arrives.\n  Before anything else." }, { heading: "", body: "" }, { heading: "Tell one person", body: "" }, ...Array.from({ length: 10 }, (_, i) => ({ heading: `Extra ${i}`, body: "" }))] });
  assert.equal(d.slides.length, 8);
  assert.deepEqual(d.slides[0], { heading: "Log every call", body: "The moment it arrives.\nBefore anything else." });
  assert.equal(pageCount(d), 10);
  assert.equal(pageCount(cleanPostImage({ kind: "quote", title: "x" })), 1);
  assert.deepEqual(cleanPostImage({ kind: "quote", slides: [{ heading: "x" }], cta: "y" }).slides, []);
  const text = slidesToText(d.slides.slice(0, 2));
  assert.equal(text, "Log every call\nThe moment it arrives.\nBefore anything else.\n\nTell one person");
  assert.deepEqual(textToSlides(text + "\n\n\n  \nLast one\nwith text"), [...d.slides.slice(0, 2), { heading: "Last one", body: "with text" }]);
  assert.deepEqual(imageProblems(d), []);
  assert.match(imageProblems(cleanPostImage({ kind: "carousel", title: "x", slides: [{ heading: "Only one" }] })).join("|"), /at least 2 slides/);
  assert.match(imageProblems(cleanPostImage({ kind: "carousel", title: "x", slides: [{ heading: "One" }, { heading: "", body: "no heading" }] })).join("|"), /needs a heading/);
  assert.match(imageProblems(cleanPostImage({ kind: "carousel", title: "x", slides: [{ heading: "One" }, { heading: "Two", body: "Cut costs by 40%" }] })).join("|"), /percentages/);
});

test("a starter carousel takes one slide per paragraph and the post's last question as the closing line", () => {
  const post = "Quotes go cold.\n\nLog every quote. Even the small ones.\n\nSet a follow-up date. On the day you send it.\n\nWhich of these do you skip?\n\n#trades";
  const d = starterImage("carousel", post, "Stop quotes going cold");
  assert.equal(d.title, "Stop quotes going cold");
  assert.deepEqual(d.slides, [{ heading: "Log every quote.", body: "Even the small ones." }, { heading: "Set a follow-up date.", body: "On the day you send it." }]);
  assert.equal(d.cta, "Which of these do you skip?");
  assert.deepEqual(imageProblems(d), []);
  assert.equal(starterImage("carousel", "One line only.").slides.length, 2);
});

test("download names are plain and safe", () => {
  assert.equal(imageFileName("Three fixes: missed calls!", "steps", "4:5"), "linkedin_steps_4x5_three-fixes-missed-calls.png");
  assert.equal(imageFileName("???", "quote", "1:1"), "linkedin_quote_1x1_post.png");
  assert.equal(imageFileName("Three fixes", "carousel", "4:5"), "linkedin_carousel_4x5_three-fixes.pdf");
});

test("a heading is cut at the end of a word, and a starter heading prefers the post's working title", () => {
  assert.equal(cutAtWord("The phone rang on a roof, and the job was gone before anyone came down the ladder.", 40), "The phone rang on a roof, and the job");
  assert.equal(cutAtWord("Short one", 40), "Short one");
  assert.equal(cutAtWord("Supercalifragilisticexpialidocious", 10), "Supercalif");
  assert.equal(starterImage("steps", "First line of the post.\n\nStep one.\n\nStep two.", "Enquiries lost on site").title, "Enquiries lost on site");
  assert.equal(starterImage("steps", "First line of the post.\n\nStep one.\n\nStep two.", "Save 50% on admin").title, "First line of the post.");
  assert.equal(starterImage("quote", "First line of the post.", "A title").title, "First line of the post.");
});
