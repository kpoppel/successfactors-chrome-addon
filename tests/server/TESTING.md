Testing the TeamDB server (conflict / optimistic concurrency)
=============================================================

This document describes how to manually test and automatically simulate the optimistic concurrency behavior implemented in `teamdb.py`.

Manual test (quick):

1. Start the server from the `server/` directory:

```bash
python3 teamdb.py
```

2. Get a token for your email (server only allows token generation from localhost):

```bash
curl -s -X POST -H "Content-Type: application/json" --data '{"email":"you@example.local"}' http://127.0.0.1:8765/api/token | jq
```

The output contains a `token` value you will use for subsequent PUTs.

3. Fetch the current DB (returns JSON { version, database, last_modified }):

```bash
curl -s http://127.0.0.1:8765/api/teamdb | jq
```

Notice the `last_modified` field — you will use it as `X-Client-Modified-At` when sending PUTs.

4. Attempt a PUT with `X-Client-Modified-At` set to the server's `last_modified` — this should succeed if the DB hasn't been updated in the meantime.

```bash
curl -i -X PUT http://127.0.0.1:8765/api/teamdb \
  -H "Content-Type: application/json" \
  -H "X-TeamDB-Email: you@example.local" \
  -H "X-TeamDB-Token: <token-from-step-2>" \
  -H "X-Client-Modified-At: 2026-01-07T12:34:56Z" \
  --data-binary @mydb.json
```

5. If another client updates the DB between your GET and PUT, the server will return HTTP 412 (Precondition Failed).

Automated simulation
--------------------

Use the included `simulate_conflict.py` script to automatically exercise the successful and conflict cases. Ensure you have `requests` installed.

```bash
cd server
python3 -m pip install -r <(echo "requests")
python3 simulate_conflict.py
```

This script will:
- Request a token for `simulate@example.local` (localonly)
- GET the DB and record `last_modified`
- Perform one successful PUT (Client B)
- Then attempt a stale PUT (Client A) which should return 412

If you want me to add server-side logging of client timestamps and more detailed conflict responses, I can patch `teamdb.py` to include that.
