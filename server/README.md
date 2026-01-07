Team DB Service
================

This FastAPI service provides a simple local API to read and write the team database used by the browser extension. It also keeps a small backup history and exposes a localhost-only token issuance endpoint so you can configure the extension to authenticate to the service.

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
cp example-teamdb_config.yaml teamdb_config.yml
# Edit teamdb_config.yml to set host, port and optional data_root
```

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
