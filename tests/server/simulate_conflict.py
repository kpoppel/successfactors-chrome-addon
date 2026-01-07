#!/usr/bin/env python3
"""
simulate_conflict.py

Simple script to exercise the TeamDB server's optimistic concurrency behavior.

Flow:
 - Request a token for a test email (POST /api/token) — server allows this from localhost
 - GET /api/teamdb to obtain the current document and `last_modified`
 - Client B: modify and PUT the document using `X-Client-Modified-At` == last_modified (should succeed)
 - Client A: attempt to PUT its (older) copy using the same `X-Client-Modified-At` (should get 412)

Requires: requests (pip install requests)

Run from the server directory while the server is running:
    python3 simulate_conflict.py
"""

import copy
import json
import sys
import time

try:
    import requests
except Exception:
    print('This script requires the requests library. Install with: pip install requests')
    sys.exit(1)

BASE = 'http://127.0.0.1:8765'
EMAIL = 'simulate@example.local'

def gen_token(email):
    r = requests.post(BASE + '/api/token', json={'email': email})
    r.raise_for_status()
    data = r.json()
    return data['token']

def main():
    print('Requesting token...')
    token = gen_token(EMAIL)
    print('Token received for', EMAIL)

    # Initial GET
    r = requests.get(BASE + '/api/teamdb')
    r.raise_for_status()
    server_doc = r.json()
    last_modified = server_doc.get('last_modified')
    print('Last modified from server:', last_modified)

    # Prepare two clients' copies
    clientA = copy.deepcopy(server_doc)
    clientB = copy.deepcopy(server_doc)

    # Make distinct edits
    # Ensure payload contains the top-level structure expected by the server
    if 'database' not in clientA:
        print('Unexpected server document shape; aborting')
        sys.exit(1)

    # Client B modifies and PUTs
    clientB['database']['people'] = clientB['database'].get('people', []) + [
        {'name': 'SimUser B', 'birthday': '', 'title': 'Tester'}
    ]

    headers = {
        'Content-Type': 'application/json',
        'X-TeamDB-Email': EMAIL,
        'X-TeamDB-Token': token,
        'X-Client-Modified-At': last_modified or ''
    }

    print('\nClient B: sending PUT (expected to succeed)')
    r2 = requests.put(BASE + '/api/teamdb', headers=headers, json=clientB)
    print('Client B status:', r2.status_code)
    try:
        print('Client B response:', r2.json())
    except Exception:
        print('Client B response text:', r2.text[:200])

    # Small wait to ensure server mtime is different
    time.sleep(1.1)

    # Client A attempts to PUT its (older) change
    clientA['database']['people'] = clientA['database'].get('people', []) + [
        {'name': 'SimUser A', 'birthday': '', 'title': 'Tester'}
    ]

    print('\nClient A: sending PUT with stale X-Client-Modified-At (expected 412)')
    r3 = requests.put(BASE + '/api/teamdb', headers=headers, json=clientA)
    print('Client A status:', r3.status_code)
    try:
        print('Client A response:', r3.json())
    except Exception:
        print('Client A response text:', r3.text[:200])

if __name__ == '__main__':
    main()
