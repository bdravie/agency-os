# ElevenLabs agent setup (copy these in)

Agent > **First message** (for people who ring the clinic):

> Hi, you're through to Lumen Skin Clinic. I'm the clinic's AI assistant, and this call is recorded. How can I help?

Agent > **System prompt**: paste [system-prompt.md](system-prompt.md).

Agent > **Security** > Overrides: switch on **First message**. The call-back form replaces the first message so the assistant says why it is calling.

## The tool: `send_booking_request`

Agent > Tools > Add tool > **Webhook**.

| Setting | Value |
|---|---|
| Name | `send_booking_request` |
| Description | Sends the caller's call-back request to the clinic team. Call it once, when you have their first name, whether they are new or have been before, what it is about, and a good time to call back. |
| Method | `POST` |
| URL | `https://<your-tunnel>/webhook/voice-demo/booking-request` |
| Headers | `x-demo-secret`: the same text as `tool_secret` in the n8n Settings node |

Body parameters (type **string** for all):

| Name | Value type | Description or variable |
|---|---|---|
| `first_name` | LLM prompt | The caller's first name. |
| `patient_type` | LLM prompt | `new` if this is their first visit, `existing` if they have been before. |
| `about` | LLM prompt | What the appointment is about, in a few words. No medical details. |
| `preferred_time` | LLM prompt | When the team should call back, in the caller's words. |
| `caller_id` | Dynamic variable | `system__caller_id` |
| `called_number` | Dynamic variable | `system__called_number` |
| `conversation_id` | Dynamic variable | `system__conversation_id` |

The caller's number comes from `system__caller_id` (they rang in) or `system__called_number` (the assistant rang them), so the assistant never has to ask for it. n8n picks whichever one is not the clinic's own number.

The same tool as JSON, for the API or the agents CLI:

```json
{
  "type": "webhook",
  "name": "send_booking_request",
  "description": "Sends the caller's call-back request to the clinic team. Call it once, when you have their first name, whether they are new or have been before, what it is about, and a good time to call back.",
  "api_schema": {
    "url": "https://<your-tunnel>/webhook/voice-demo/booking-request",
    "method": "POST",
    "request_headers": { "x-demo-secret": "<tool_secret>" },
    "request_body_schema": {
      "type": "object",
      "required": ["first_name", "patient_type", "about", "preferred_time"],
      "properties": {
        "first_name": { "type": "string", "description": "The caller's first name." },
        "patient_type": { "type": "string", "description": "new if this is their first visit, existing if they have been before." },
        "about": { "type": "string", "description": "What the appointment is about, in a few words. No medical details." },
        "preferred_time": { "type": "string", "description": "When the team should call back, in the caller's words." },
        "caller_id": { "type": "string", "dynamic_variable": "system__caller_id" },
        "called_number": { "type": "string", "dynamic_variable": "system__called_number" },
        "conversation_id": { "type": "string", "dynamic_variable": "system__conversation_id" }
      }
    }
  }
}
```

Check the field names against ElevenLabs' current tool editor before relying on the JSON: the dashboard route above is the one to follow tonight.
