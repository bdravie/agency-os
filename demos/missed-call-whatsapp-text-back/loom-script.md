# Loom script: missed-call WhatsApp text-back (2 minutes)

**Set up before recording:** send any message to the WhatsApp sandbox (opens the 24-hour window), publish the workflow, open `site/index.html`, put your phone on screen (QuickTime > New Movie Recording > your iPhone), and leave `forward_to` empty so the call is always "missed".

## The problem (15s)
"Here's a dental practice website. A new patient finds it at lunchtime and rings. The front desk is with a patient, so it goes to voicemail. Most people don't leave one. They just ring the next practice on Google."

## The trigger (15s)
*Click Call on the page, or dial the number on your phone.*
"So I'm that patient. I'm ringing now, and nobody can pick up."

## The automation running (60s)
*Let the call play its one line and end. The WhatsApp arrives on your phone.*
"Before I've even put the phone down, I've got a WhatsApp from the practice, so I know someone's heard me.
I'll reply like a real patient." *Type: "Existing patient, my tooth's a bit sore, any day after 4."*
"It answers in their tone, points me to the practice or NHS 111 if it's urgent, and it doesn't give any clinical advice. It just books the call back."
*Show the front desk's WhatsApp (second phone), or n8n's Executions.*
"And the front desk gets one line: who, what it's about, and when to ring. Nobody has to listen to a voicemail."
*Scroll to the form, submit it.* "Same thing from the website form."

## The result (20s)
"A missed call becomes a booked call back, without anyone at the front desk doing anything extra. It's built on the practice's own number, and it stops the moment someone replies STOP."

## The offer (10s)
"If you'd like this on your practice's number, let's have a quick chat. We'd start with a data processing agreement, because it handles patients' details, and set it up around how your front desk works."
