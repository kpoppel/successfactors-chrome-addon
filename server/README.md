Team DB Service
================

This FastAPI service provides a simple local API to read and write the team database used by the browser extension. It also keeps a small backup history and exposes a localhost-only token issuance endpoint so you can configure the extension to authenticate to the service.

It now also supports an optional external-consultant portal:
- self-signup with one-time token issuance
- token-based sign-in and reset
- absence CRUD for signed-in external users
- encrypted storage of sensitive absence fields at rest
- optional server-hosted UI mode (`/ui`, `/portal/*`)
- admin session login for server-hosted calendar/org chart pages

Starting the service
--------------------

Run the service from the repository root:

```bash
python3 server/teamdb.py
```

By default the app listens on `127.0.0.1:8765`.

Get started
-----------

Follow these steps to get the service running locally:

1. Create a Python virtual environment (recommended):

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Install dependencies:

```bash
python3 -m pip install -r ../requirements.txt
```

3. Copy the example config and edit it:

```bash
cp example-teamdb_config.yaml teamdb_config.yaml
# Edit teamdb_config.yaml to set host, port and optional data_root
```

For external portal features, also configure:
- `external_encryption_key` (required, Fernet key)
- `external_portal_enabled`
- `ui_enabled` (only if you want browser pages served by the backend)
- `admin_session_hours` (admin session duration for server UI login)

4. Start the service:

```bash
python3 teamdb.py
```

5. Generate a token (run locally on the host running the service):

```bash
curl -X POST -H "Content-Type: application/json" --data '{"email":"you@example.com"}' http://127.0.0.1:8765/api/token
```

6. Test saving the DB (use the returned token):

```bash
curl -X PUT -H "Content-Type: application/json" \
	-H "X-TeamDB-Email: you@example.com" \
	-H "X-TeamDB-Token: <token>" \
	--data @database.json \
	http://127.0.0.1:8765/api/teamdb
```


Storage and paths
-----------------

- Primary database file: `data/config/database.yaml`
- Backups: `data/config/backups/database.<timestamp>.yaml` (server keeps the last 10 backups)
- Token storage (pickled): `data/server_tokens/tokens.pkl` (managed by the service)

Endpoints
---------

1. GET /api/teamdb

	- Returns: the database content as JSON (YAML converted to JSON structure).
	- Auth: none (readable by the extension without token).

	Example:

	```bash
	curl http://127.0.0.1:8765/api/teamdb
	```

2. PUT /api/teamdb

	- Replace the primary database with the provided payload.
	- Accepts: JSON body or raw YAML body (Content-Type may be application/json or text/plain).
	- Required headers for write:
	  - `X-TeamDB-Email`: the email address the token was issued for
	  - `X-TeamDB-Token`: token string returned by the token endpoint
	- Behavior: before overwriting the primary file the server copies the existing file into `data/config/backups/` with a timestamped filename. It keeps the most recent 10 backup files and prunes older ones.

	Example (JSON):

	```bash
	curl -X PUT -H "Content-Type: application/json" \
		 -H "X-TeamDB-Email: you@example.com" \
		 -H "X-TeamDB-Token: <token>" \
		 --data @database.json \
		 http://127.0.0.1:8765/api/teamdb
	```

3. POST /api/token

	- Generate and store a token for a given email. This endpoint is restricted to callers from `localhost` only to avoid remote token generation.
	- Payload: JSON `{ "email": "user@example.com" }`
	- Returns: `{ "email": "user@example.com", "token": "<token>" }`
	- The token is stored server-side in pickled storage and can then be used by the extension when calling the `PUT /api/teamdb` endpoint.

	Example (run this on the machine hosting the server):

	```bash
	curl -X POST -H "Content-Type: application/json" --data '{"email":"you@example.com"}' http://127.0.0.1:8765/api/token
	```

	Response example:

	```json
	{"email":"you@example.com","token":"3xN2a..."}
	```

4. POST /api/external/signup

	- Create a new external account and issue an initial token.
	- Payload: `{ "email": "external@example.com" }`
	- Repeated signup for the same email is rejected with `409`.

5. POST /api/external/login

	- Token-based sign-in for external users.
	- Payload: `{ "email": "...", "token": "..." }`
	- Returns an HTTP-only session cookie (`external_session`).

6. POST /api/external/reset

	- Permanently deletes one external account and all linked absences.
	- Payload: `{ "email": "...", "token": "..." }`

7. GET/POST/PUT/DELETE /api/external/me/absences

	- CRUD endpoints for the signed-in external user.
	- Sensitive fields (`absence_type`, `note`) are encrypted at rest.

8. GET /api/external/absences

	- Admin endpoint (requires `X-TeamDB-Email` + `X-TeamDB-Token`).
	- Returns merged external absences decrypted for server-side processing.

8b. GET /api/public/external/absences

	- Public read endpoint (minimal fields) used for public calendar rendering.

9. POST /api/sf/absence-data

	- Admin-authenticated endpoint for uploading raw SuccessFactors absence payloads.
	- Required shape: object containing `d.results` array.
	- Payload is encrypted at rest before persistence.

10. GET /api/sf/absence-data

	- Admin-authenticated endpoint to retrieve the latest uploaded SuccessFactors payload.
	- Used by the full extension to load server-synced absence data.

10b. GET /api/public/sf/absence-data

	- Public read endpoint for the latest SuccessFactors payload used by public calendar rendering.

11. POST /api/admin/login

	- Starts an admin browser session using TeamDB email+token.
	- Sets HTTP-only session cookie used by admin-protected web routes such as `/ui`.

12. POST /api/admin/logout

	- Terminates the admin browser session and clears the cookie.

13. GET/PUT /api/admin/teamdb

	- Session-authenticated admin API for reading and writing TeamDB data from the server web UI.
	- `PUT` uses the same strict TeamDB schema validation as `/api/teamdb`.

14. GET /api/admin/sf/absence-data

	- Session-authenticated admin API for reading latest uploaded SuccessFactors payload.

15. GET /api/admin/external/absences

	- Session-authenticated admin API for reading decrypted external absences.

16. UI routes

	- `/` redirects to `/calendar`
	- `/admin/login` admin sign-in page
	- `/ui` full extension-style admin editor (session-authenticated, serves `/addon/ui.html?web=1`)
	- `/calendar` public calendar page rendered with extension view components
	- `/orgchart` public org chart page rendered with extension view components
	- `/portal/*` external consultant portal pages

Authentication and usage from the browser extension
--------------------------------------------------

- To fetch the DB, the extension can call `GET /api/teamdb`.
- To save the DB from the extension, the extension must include two headers with the `PUT /api/teamdb` request:
  - `X-TeamDB-Email`: the email used when requesting the token
  - `X-TeamDB-Token`: the token returned by `/api/token`

Security considerations
-----------------------

- The service is intentionally permissive for local development. For production use you should:
  - Restrict `allow_origins` in CORS to the extension origin or trusted hosts.
  - Set `cookie_secure: true` when serving over HTTPS.
  - Keep `external_encryption_key` outside source control and rotate it with an operational runbook.
  - Consider expiring tokens and adding a revocation/list endpoint.
  - Store token hashes (not plaintext) and compare using a constant-time algorithm.
  - Add HTTPS and authentication for remote hosting.

Backup behaviour
----------------

- Each time the database is overwritten the service copies the existing file into `data/config/backups/` with a timestamp like `database.20260107T123456Z.yaml`.
- The service retains the most recent 10 backups; older backups are removed automatically.

Troubleshooting
---------------

- If you get `403 Invalid token` when saving, ensure the extension is using the `X-TeamDB-Email` and `X-TeamDB-Token` headers exactly as returned by the `/api/token` response.
- If `/api/token` returns `403` when called from your machine, ensure you are calling it from localhost (`127.0.0.1`) and not via an external IP.

Integration suggestion
----------------------

I can help patch the extension to use these endpoints: a small settings panel where the user enters the server base URL (default `http://127.0.0.1:8765`) and the token/email pair. The extension can then call `/api/teamdb` (GET/PUT) instead of using manual file operations.
