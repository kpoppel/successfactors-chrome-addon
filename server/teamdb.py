"""
Ensure the project root is on `sys.path` when running this file directly.

This allows imports like `server.lib.storage` to work when executing
`python3 ./teamdb.py` from the `server/` directory (common during local dev).
"""
from pathlib import Path
import sys
# If `server/teamdb.py` is executed directly, the interpreter's cwd/sys.path
# may not include the repository root. Insert the repository root so
# `import server.lib...` works regardless of invocation directory.
repo_root = Path(__file__).resolve().parent.parent
repo_root_str = str(repo_root)
if repo_root_str not in sys.path:
    sys.path.insert(0, repo_root_str)

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import logging
from pathlib import Path
import yaml
import os
import pickle
from datetime import datetime
from server.lib.storage import FileStorageBackend
from server.lib.db_validator import validate_database, ValidationError
import sys


# Basic logging configuration following planner.py style
logging.basicConfig(level=logging.NOTSET, format='%(asctime)s INFO %(message)s')
DEFAULT_LOG_LEVEL = logging.WARNING
logger = logging.getLogger(__name__)
for handler in logging.root.handlers[:]:
    logging.root.removeHandler(handler)
logging.basicConfig(level=DEFAULT_LOG_LEVEL, format='%(asctime)s %(levelname)s [%(name)s]: %(message)s')
logger = logging.getLogger(__name__)


# Load server config (required). Expect `teamdb_config.yml` to be in the same directory as this file.
CONFIG_PATH = Path(__file__).resolve().parent / 'teamdb_config.yaml'
EXAMPLE_CONFIG_PATH = Path(__file__).resolve().parent / 'example-teamdb_config.yaml'
server_config = {}
if not CONFIG_PATH.exists():
    if EXAMPLE_CONFIG_PATH.exists():
        logger.error('Missing required config file: %s', CONFIG_PATH)
        logger.error('A template exists at %s. Please edit it and save as %s, then restart the service.', EXAMPLE_CONFIG_PATH, CONFIG_PATH)
        sys.exit(2)
    else:
        logger.error('Missing required config file: %s and no example template found at %s', CONFIG_PATH, EXAMPLE_CONFIG_PATH)
        sys.exit(2)
else:
    try:
        with CONFIG_PATH.open('r', encoding='utf-8') as cf:
            server_config = yaml.safe_load(cf) or {}
    except Exception:
        logger.exception('Failed to load server config from %s', CONFIG_PATH)
        sys.exit(2)

# Default storage path (relative to repo root or as configured)
DATA_ROOT = Path(server_config.get('data_root', str(Path(__file__).resolve().parent.parent / 'data')))
ROOT_DATA_DIR = DATA_ROOT
DEFAULT_DB_PATH = ROOT_DATA_DIR / 'config' / 'database.yaml'
DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# Storage backend for tokens
stor = FileStorageBackend(ROOT_DATA_DIR)
stor.configure(mode='json')
TOKENS_NAMESPACE = 'tokens'
TOKENS_KEY = 'tokens'

# Backup settings
MAX_BACKUPS = int(server_config.get('max_backups', 10))
BACKUP_DIR = DEFAULT_DB_PATH.parent / 'backups'
BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def load_database(path: Path = DEFAULT_DB_PATH):
    if not path.exists():
        logger.info('Database file not found at %s', path)
        raise FileNotFoundError(str(path))
    with path.open('r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def save_database(data, path: Path = DEFAULT_DB_PATH):
    try:
        # Rotate existing db into backups first
        if path.exists():
            ts = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
            backup_path = BACKUP_DIR / f"database.{ts}.yaml"
            with path.open('r', encoding='utf-8') as src, backup_path.open('w', encoding='utf-8') as dst:
                dst.write(src.read())

            # Prune old backups
            backups = sorted(BACKUP_DIR.glob('database.*.yaml'), key=lambda p: p.name, reverse=True)
            for old in backups[MAX_BACKUPS:]:
                try:
                    old.unlink()
                except Exception:
                    logger.debug('Failed to remove old backup %s', old)

        with path.open('w', encoding='utf-8') as f:
            yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)
    except Exception as e:
        logger.exception('Failed to save database to %s: %s', path, e)
        raise

# -- FastAPI app setup --
app = FastAPI(title="Team DB Service")

# Allow requests from extension and local dev hosts
# Configure CORS from server_config. `allow_origins` may be a list or a comma-separated string.
raw_allow = server_config.get('allow_origins', None)
def _parse_allow_origins(raw):
    if raw is None:
        # Sensible default: only allow localhost for development
        return ['http://127.0.0.1', 'http://localhost']
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        # allow comma-separated values
        return [s.strip() for s in raw.split(',') if s.strip()]
    # fallback
    return ['http://127.0.0.1', 'http://localhost']

allow_origins = _parse_allow_origins(raw_allow)

# If wildcard is present, do not allow credentials for security reasons
allow_credentials = False
if '*' in allow_origins and allow_origins != ['*']:
    # If somebody included '*' along with other origins, keep '*' but disable credentials
    allow_credentials = False
elif allow_origins == ['*']:
    allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get('/api/teamdb', response_class=JSONResponse)
async def api_get_teamdb():
    """Return the team database as JSON."""
    try:
        data = load_database()
        # include last_modified timestamp based on file mtime
        mtime = None
        try:
            stat = DEFAULT_DB_PATH.stat()
            mtime = datetime.utcfromtimestamp(stat.st_mtime).strftime('%Y-%m-%dT%H:%M:%SZ')
        except Exception:
            mtime = None
        return JSONResponse(content={'database': data, 'last_modified': mtime})
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail='Database not found')
    except Exception as e:
        logger.exception('Error reading database: %s', e)
        raise HTTPException(status_code=500, detail=str(e))


@app.put('/api/teamdb', response_class=JSONResponse)
async def api_put_teamdb(request: Request):
    """Replace the team database with provided JSON/YAML payload."""
    try:
        payload = await request.json()
    except Exception:
        # Try form/body raw text (for clients that POST YAML)
        body = await request.body()
        try:
            payload = yaml.safe_load(body.decode('utf-8'))
        except Exception as e:
            logger.exception('Failed to parse payload as JSON or YAML: %s', e)
            raise HTTPException(status_code=400, detail='Invalid JSON/YAML payload')

    # Basic validation: expect a dict with keys like 'people' and 'teams'
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail='Payload must be an object')

    # Strict schema validation
    try:
        validate_database(payload)
    except ValidationError as ve:
        # return a clear client error with validation path info
        path = '/'.join(ve.path) if getattr(ve, 'path', None) else ''
        detail = f'Validation error: {ve} at {path}' if path else f'Validation error: {ve}'
        raise HTTPException(status_code=400, detail=detail)

    # Require token header for writes
    token = request.headers.get('X-TeamDB-Token')
    email = request.headers.get('X-TeamDB-Email')
    if not token or not email:
        raise HTTPException(status_code=401, detail='Missing authentication headers')

    # Check client-provided modification time for optimistic concurrency
    client_ts = None
    # Prefer explicit header, fall back to If-Unmodified-Since
    hdr = request.headers.get('X-Client-Modified-At') or request.headers.get('If-Unmodified-Since')
    if hdr:
        try:
            # Expect ISO8601 UTC like '2026-01-07T12:34:56Z'
            client_ts = datetime.strptime(hdr, '%Y-%m-%dT%H:%M:%SZ')
        except Exception:
            client_ts = None

    # If server DB exists, compute its mtime
    server_mtime = None
    if DEFAULT_DB_PATH.exists():
        server_mtime = datetime.utcfromtimestamp(DEFAULT_DB_PATH.stat().st_mtime)
    # If client timestamp provided and server mtime is newer, reject
    if client_ts and server_mtime and server_mtime > client_ts:
        raise HTTPException(status_code=412, detail='Server has newer version')

    # Validate token map
    try:
        tokens = stor.load(TOKENS_NAMESPACE, TOKENS_KEY)
    except KeyError:
        tokens = {}

    # Expect stored entry to be dict with salt/hash/iterations
    import hashlib
    import binascii
    import secrets as _secrets

    entry = tokens.get(email)
    if not isinstance(entry, dict):
        raise HTTPException(status_code=403, detail='Invalid token')

    try:
        salt = binascii.unhexlify(entry['salt'])
        expected_hash = binascii.unhexlify(entry['hash'])
        iterations = int(entry.get('iterations', 100_000))
    except Exception:
        raise HTTPException(status_code=403, detail='Invalid token')

    derived = hashlib.pbkdf2_hmac('sha256', token.encode('utf-8'), salt, iterations)
    if not _secrets.compare_digest(derived, expected_hash):
        raise HTTPException(status_code=403, detail='Invalid token')

    try:
        save_database(payload)
        return JSONResponse(content={'ok': True})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/token')
async def api_post_token(request: Request):
    """Generate and store a token for a given email (callable from localhost).

    Payload: { email: 'user@example.com' }
    Returns: { email: ..., token: ... }
    """
    # Allow only localhost callers
    host = request.client.host # type: ignore
    if host not in ('127.0.0.1', '::1', 'localhost'):
        raise HTTPException(status_code=403, detail='Token generation allowed from localhost only')

    body = await request.json()
    email = (body or {}).get('email')
    if not email:
        raise HTTPException(status_code=400, detail='Missing email')

    # Generate a token
    import secrets
    import hashlib
    import binascii

    # Generate a random token (to return to the caller)
    token = secrets.token_urlsafe(24)

    # Derive a salted hash to store instead of the token itself
    salt = secrets.token_bytes(16)
    iterations = 100_000
    dk = hashlib.pbkdf2_hmac('sha256', token.encode('utf-8'), salt, iterations)
    salt_hex = binascii.hexlify(salt).decode('ascii')
    hash_hex = binascii.hexlify(dk).decode('ascii')

    try:
        try:
            tokens = stor.load(TOKENS_NAMESPACE, TOKENS_KEY)
        except KeyError:
            tokens = {}
        # Store metadata for verification
        tokens[email] = {
            'salt': salt_hex,
            'hash': hash_hex,
            'iterations': iterations,
        }
        stor.save(TOKENS_NAMESPACE, TOKENS_KEY, tokens)
        return JSONResponse(content={'email': email, 'token': token})
    except Exception as e:
        logger.exception('Failed to save token: %s', e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/api/health')
async def api_health():
    """Return simple health information about the service."""
    try:
        return JSONResponse(content={
            'status': 'ok',
            'service': 'teamdb',
            'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        })
    except Exception as e:
        logger.exception('Health check failed: %s', e)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == '__main__':
    import uvicorn
    logger.info('Starting Team DB Service')
    host = server_config.get('host', '127.0.0.1')
    port = int(server_config.get('port', 8765))
    uvicorn.run('teamdb:app', host=host, port=port, reload=False)
