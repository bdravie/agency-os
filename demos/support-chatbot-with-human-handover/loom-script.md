# Loom script: support chat with human handover (demo, about 2 minutes)

**Before recording**
1. `npm run reset` in `demos/support-chatbot-with-human-handover`, then `npm run dev`.
2. In the Google Sheet: **Support demo > Clear demo tickets**.
3. Open three browser tabs, left to right:
   - `http://127.0.0.1:3100` (help page, chat closed);
   - the Google Sheet on the **Tickets** tab;
   - `http://127.0.0.1:3100/staff`.
4. Run the three questions below once before recording, so Claude's replies are cached and come back instantly. Then run `npm run reset` again (the cache is kept).
5. Keep made-up details ready: first name **Sam**, order number **TH-10482**.

---

**1. The problem (0:00 to 0:15)**, on the help page
> "Most support inboxes answer the same few questions all day: where's my order, how do I return this, I can't sign in. This is a demo for a made-up shop: a help chat that answers from the shop's own help pages, walks people through the common fixes, and hands anything else to a person with the whole chat attached."

**2. A question, answered from a help article (0:15 to 0:40)**
- Click **Chat with us**. Type: `Can I return something I bought in the sale?` Press Enter.
- Point at **Source: Our returns policy** and click it. The article opens and flashes on the page.
> "It only answers from the shop's own articles, and it shows which one. Code also checks the answer: every number has to be in that article, or it isn't shown."

**3. A step-by-step fix, then something off-topic (0:40 to 1:15)**
- Click **Start again**, then **My order is late**. Click **Yes, I've checked it**, then **On its way**, then **Yes, I'll wait**, then **Yes, it's fixed**.
> "Common issues are scripted with the support team: one question at a time, buttons only, and it checks the problem is actually fixed."
- Type: `Do you offer gift wrapping?` Press Enter.
> "The help pages don't cover gift wrapping, so instead of guessing it says it isn't sure and offers a person."
- Click **Pass to a person**. Type **Sam** and **TH-10482**, then click **Send to the team**. The ticket number appears.

**4. The ticket and the fix (1:15 to 1:50)**
- Switch to the **Sheet** tab. The new row is there: the reason, a short summary with a suggested next step, the order number, and the full chat.
> "The team gets the summary and the whole conversation, so the customer never has to repeat themselves."
- Switch to the **staff page** tab and reload. On **Gaps to fix**, the gift wrapping question is listed.
- Click **Write an article for this**. Change the title to `Gift wrapping`. Type `gift wrap, wrapping, present` in search words. In the text box, type: `We do not offer gift wrapping yet. You can add a free gift message at checkout.` Click **Save article**.
- Switch to the **help page** tab and reload. Open the chat and ask `Do you offer gift wrapping?` again. It now answers, with **Source: Gift wrapping**.
> "Every question it couldn't answer shows up here, and the support team fixes it by writing the article. No retraining: the very next customer gets the answer."

**5. The offer (1:50 to 2:00)**
> "That's a demo on a made-up shop. For your business it would answer from your own help pages, with flows written with your team and handovers going into your help desk or a sheet. If that's useful, let's talk it through."

---

Don't say:
- any figures about saved time, deflected tickets or response rates (this is a demo, with no client results);
- that it "never" gets things wrong (it is built to say "not sure", and the team reviews the gaps).

For a real client, mention that a data processing agreement comes first, because customer chats can contain personal details.
