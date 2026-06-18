# SuccessFactors Transmit-Only Extension

This extension is a reduced variant focused only on sending SuccessFactors absence payloads to the TeamDB server.

## Features

- Captures `x-ajax-token` and `JSESSIONID` while visiting Team Absences pages in SuccessFactors
- Manual transmit button in popup
- Optional auto-transmit on page activity (cooldown-protected)
- Sends payloads to `POST /api/sf/absence-data` on the TeamDB server

## Setup

1. Load this folder (`addon-transmit/`) as an unpacked extension.
2. Open the popup and set:
   - Server URL
   - TeamDB email and token
   - From/To date
   - Fallback user ID
3. Visit the SuccessFactors Team Absences page once so token/session can be captured.
4. Use **Transmit Now** or enable auto-transmit.
