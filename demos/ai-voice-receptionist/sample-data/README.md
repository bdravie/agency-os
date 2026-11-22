# Sample payloads (fake data)

What the web page and the voice agent's tool post to the n8n webhooks, with fake numbers from Ofcom's drama range. Replace `$N8N` with your tunnel address and `$SECRET` with `tool_secret` from the Settings node.

```
# The "Have us call you" form (put your own mobile in the file to get a real call)
curl -s -X POST "$N8N/webhook/voice-demo/call-me-back" --data @demos/ai-voice-receptionist/sample-data/call-me-back.txt

# The agent's send_booking_request tool
curl -s -X POST "$N8N/webhook/voice-demo/booking-request" -H "content-type: application/json" -H "x-demo-secret: $SECRET" \
  --data @demos/ai-voice-receptionist/sample-data/booking-request.json
```

The tool call answers `{"result":"sent","say":"The team has the request and will call back Thursday after four."}`, which is what the agent reads before it replies.
