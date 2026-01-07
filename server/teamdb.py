from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import logging
from pathlib import Path
import yaml
import os
import pickle
from datetime import datetime
from storage import FileStorageBackend
import sys


# Basic logging configuration following planner.py style
logging.basicConfig(level=logging.NOTSET, format='%(asctime)s INFO %(message)s')
DEFAULT_LOG_LEVEL = logging.WARNING
logger = logging.getLogger(__name__)
for handler in logging.root.handlers[:]:
    logging.root.removeHandler(handler)
logging.basicConfig(level=DEFAULT_LOG_LEVEL, format='%(asctime)s %(levelname)s [%(name)s]: %(message)s')
logger = logging.getLogger(__name__)


app = FastAPI(title="Team DB Service")

# Allow requests from extension and local dev hosts
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

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
stor.configure(mode='pickle')
TOKENS_NAMESPACE = 'server_tokens'
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


@app.get('/api/teamdb', response_class=JSONResponse)
async def api_get_teamdb():
    """Return the team database as JSON."""
    try:
        data = load_database()
        return JSONResponse(content=data)
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

    # Require token header for writes
    token = request.headers.get('X-TeamDB-Token')
    email = request.headers.get('X-TeamDB-Email')
    if not token or not email:
        raise HTTPException(status_code=401, detail='Missing authentication headers')

    # Validate token map
    try:
        tokens = stor.load(TOKENS_NAMESPACE, TOKENS_KEY)
    except KeyError:
        tokens = {}

    valid = tokens.get(email) == token
    if not valid:
        raise HTTPException(status_code=403, detail='Invalid token')

    try:
        save_database(payload)
        return JSONResponse(content={'ok': True})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/teamdb/save-as')
async def api_post_teamdb_saveas(request: Request):
    """Save the payload to a specific path (useful for tests/dev)."""
    data = await request.json()
    path = request.query_params.get('path')
    if not path:
        raise HTTPException(status_code=400, detail='Missing path query parameter')
    target = Path(path).expanduser().resolve()
    if not target.parent.exists():
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f'Invalid path: {e}')
    try:
        # no auth for save-as (dev only) - but ensure parent dir exists
        save_database(data, target)
        return JSONResponse(content={'ok': True, 'path': str(target)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/token')
async def api_post_token(request: Request):
    """Generate and store a token for a given email (callable from localhost).

    Payload: { email: 'user@example.com' }
    Returns: { email: ..., token: ... }
    """
    # Allow only localhost callers
    host = request.client.host
    if host not in ('127.0.0.1', '::1', 'localhost'):
        raise HTTPException(status_code=403, detail='Token generation allowed from localhost only')

    body = await request.json()
    email = (body or {}).get('email')
    if not email:
        raise HTTPException(status_code=400, detail='Missing email')

    # Generate a token
    import secrets
    token = secrets.token_urlsafe(24)

    try:
        try:
            tokens = stor.load(TOKENS_NAMESPACE, TOKENS_KEY)
        except KeyError:
            tokens = {}
        tokens[email] = token
        stor.save(TOKENS_NAMESPACE, TOKENS_KEY, tokens)
        return JSONResponse(content={'email': email, 'token': token})
    except Exception as e:
        logger.exception('Failed to save token: %s', e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/api/health')
async def api_health():
    """Return simple health information about the service."""
    try:
        db_exists = DEFAULT_DB_PATH.exists()
        return JSONResponse(content={
            'status': 'ok',
            'service': 'teamdb',
            'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
            'data_root': str(ROOT_DATA_DIR),
            'database_present': bool(db_exists),
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
