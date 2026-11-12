# Loom script: event listing to social post queue (2 minutes)

Say early that this is a demo on made-up events with stand-ins for the directory, the sheet and the Facebook Page.

## Before recording

1. Terminal 1: `uv run python -m agency.event_social reset` then `uv run python -m agency.event_social serve`
2. Terminal 2: `npx n8n`, sign in at http://localhost:5678
3. Browser tab A: n8n, workflow **Event social demo: New events to approval queue**. Click **Execute workflow** (choose the **Run now** trigger if asked) once so the queue already holds the first 8 posts.
4. Browser tab B: n8n, workflow **Event social demo: Publish approved posts**.
5. Browser tab C: the board, http://127.0.0.1:8787, on **Directory listings**.

## The problem (0:00-0:15)

"Every time an event is approved on your directory, someone has to write a post, find an image and share it on Facebook and Instagram, and remember which ones are done. This demo shows that job running on its own, with you approving each post first."

## The trigger (0:15-0:35)

- Tab C, **Directory listings**: "These are made-up events in the same shape your directory's API returns. Two are still pending."
- Click **Approve and publish** on *Sunday Coffee Meet*: "That event has just gone live."
- Tab A: click **Execute workflow**. "This normally runs every five minutes. It only picks up published events it has not seen before."

## The automation running (0:35-1:35)

- Tab C, **Approval queue**: the new *Sunday Coffee Meet* row is there, Pending. Point at the post, the shorter Instagram caption, the image card and the link. "The wording is written from the listing only. The link is added by code, so it is always the right one."
- Click **Approve** on that row. "Nothing is published until I approve it."
- Tab B: click **Execute workflow** (it normally runs every minute).
- Tab C, **Test Page**: the post is there with its image. "This is a stand-in for a test Facebook Page, using the same call Meta's API takes. The Instagram version is prepared in the Posted log, ready to switch on."
- Tab A: click **Execute workflow** again. Tab C, **Approval queue**: "Same feed, no new rows. One listing even appears twice in the feed and was only queued once."
- Tab C, **Failures**: "One event had a broken photo. Instead of failing quietly, it is logged here with the event, the step and the error, and the others carried on."

## The result (1:35-1:50)

"So each new event becomes a post you approve with one click, it can never go out twice, and anything that goes wrong is written down where you can see it."

## The offer (1:50-2:00)

"I'd connect this to your directory and a test Page first, so you can see it on your own events before anything goes to your live pages."
