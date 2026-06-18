"""FastAPI service for team database and external absence portal."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
import re
from pathlib import Path
import binascii
import hashlib
import secrets
import sys
from typing import Any

import yaml
from cryptography.fernet import Fernet, InvalidToken
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
import logging

repo_root = Path(__file__).resolve().parent.parent
repo_root_str = str(repo_root)
if repo_root_str not in sys.path:
    sys.path.insert(0, repo_root_str)

from server.lib.db_validator import ValidationError, validate_database
from server.lib.storage import FileStorageBackend
from server.ui_components import render_logout_action, render_page_shell, render_topbar_links

logging.basicConfig(level=logging.NOTSET, format='%(asctime)s INFO %(message)s')
DEFAULT_LOG_LEVEL = logging.WARNING
logger = logging.getLogger(__name__)
for handler in logging.root.handlers[:]:
    logging.root.removeHandler(handler)
logging.basicConfig(level=DEFAULT_LOG_LEVEL, format='%(asctime)s %(levelname)s [%(name)s]: %(message)s')
logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).resolve().parent / 'teamdb_config.yaml'
EXAMPLE_CONFIG_PATH = Path(__file__).resolve().parent / 'example-teamdb_config.yaml'


def _load_server_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        if EXAMPLE_CONFIG_PATH.exists():
            logger.error('Missing required config file: %s', CONFIG_PATH)
            logger.error(
                'A template exists at %s. Please edit it and save as %s, then restart the service.',
                EXAMPLE_CONFIG_PATH,
                CONFIG_PATH,
            )
            sys.exit(2)
        logger.error('Missing required config file: %s and no example template found at %s', CONFIG_PATH, EXAMPLE_CONFIG_PATH)
        sys.exit(2)

    try:
        with CONFIG_PATH.open('r', encoding='utf-8') as cf:
            return yaml.safe_load(cf) or {}
    except Exception:
        logger.exception('Failed to load server config from %s', CONFIG_PATH)
        sys.exit(2)


server_config = _load_server_config()


def _cfg_bool(key: str, default: bool) -> bool:
    value = server_config.get(key, default)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {'1', 'true', 'yes', 'on'}:
            return True
        if lowered in {'0', 'false', 'no', 'off'}:
            return False
    return default


DATA_ROOT = Path(server_config.get('data_root', str(Path(__file__).resolve().parent.parent / 'data')))
ROOT_DATA_DIR = DATA_ROOT
DEFAULT_DB_PATH = ROOT_DATA_DIR / 'config' / 'database.yaml'
DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

MAX_BACKUPS = int(server_config.get('max_backups', 10))
BACKUP_DIR = DEFAULT_DB_PATH.parent / 'backups'
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

UI_ENABLED = _cfg_bool('ui_enabled', False)
EXTERNAL_PORTAL_ENABLED = _cfg_bool('external_portal_enabled', True)
COOKIE_SECURE = _cfg_bool('cookie_secure', False)
EXTERNAL_SESSION_HOURS = int(server_config.get('external_session_hours', 12))

stor = FileStorageBackend(ROOT_DATA_DIR)
stor.configure(mode='json')

TOKENS_NAMESPACE = 'tokens'
TOKENS_KEY = 'tokens'

EXTERNAL_NAMESPACE = 'external'
EXTERNAL_STORE_KEY = 'portal_store'
EXTERNAL_STORE_VERSION = 1
EXTERNAL_SESSION_COOKIE = 'external_session'

SF_NAMESPACE = 'sf_sync'
SF_ABSENCE_KEY = 'absence_payload'
ADMIN_NAMESPACE = 'admin'
ADMIN_SESSIONS_KEY = 'sessions'
ADMIN_SESSION_COOKIE = 'teamdb_admin_session'
ADMIN_SESSION_HOURS = int(server_config.get('admin_session_hours', 12))


def _load_external_encrypter() -> Fernet | None:
    key = server_config.get('external_encryption_key')
    if not key:
        logger.warning('external_encryption_key is not configured; external absence APIs are disabled')
        return None
    try:
        return Fernet(key.encode('ascii'))
    except Exception:
        logger.exception('Invalid external_encryption_key; external absence APIs are disabled')
        return None


encrypter = _load_external_encrypter()


app = FastAPI(title='Team DB Service')


def _parse_allow_origins(raw: Any) -> list[str]:
    if raw is None:
        return ['http://127.0.0.1', 'http://localhost']
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        return [s.strip() for s in raw.split(',') if s.strip()]
    return ['http://127.0.0.1', 'http://localhost']


allow_origins = _parse_allow_origins(server_config.get('allow_origins'))
allow_credentials = False
if '*' in allow_origins:
    allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allow_headers=['*'],
)


if UI_ENABLED:
    addon_dir = repo_root / 'addon'
    if addon_dir.exists():
        app.mount('/addon', StaticFiles(directory=str(addon_dir)), name='addon')

    @app.middleware('http')
    async def _protect_addon_assets(request: Request, call_next):
        if request.url.path.startswith('/addon/ui.html'):
            if _has_admin_session(request):
                return RedirectResponse(url='/admin/people')
            return RedirectResponse(url='/admin/login')
        return await call_next(request)


# -------------------------
# Common helpers
# -------------------------

def _utc_now() -> datetime:
    return datetime.now(UTC)


def _utc_now_iso() -> str:
    return _utc_now().strftime('%Y-%m-%dT%H:%M:%SZ')


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _hash_secret(secret_text: str, iterations: int = 100_000) -> dict[str, Any]:
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac('sha256', secret_text.encode('utf-8'), salt, iterations)
    return {
        'salt': binascii.hexlify(salt).decode('ascii'),
        'hash': binascii.hexlify(derived).decode('ascii'),
        'iterations': iterations,
    }


def _verify_secret(secret_text: str, entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    try:
        salt = binascii.unhexlify(entry['salt'])
        expected_hash = binascii.unhexlify(entry['hash'])
        iterations = int(entry.get('iterations', 100_000))
    except Exception:
        return False
    derived = hashlib.pbkdf2_hmac('sha256', secret_text.encode('utf-8'), salt, iterations)
    return secrets.compare_digest(derived, expected_hash)


def _load_token_map() -> dict[str, Any]:
    try:
        loaded = stor.load(TOKENS_NAMESPACE, TOKENS_KEY)
        if isinstance(loaded, dict):
            return loaded
        return {}
    except KeyError:
        return {}


def _save_token_map(token_map: dict[str, Any]) -> None:
    stor.save(TOKENS_NAMESPACE, TOKENS_KEY, token_map)


def _load_admin_sessions() -> dict[str, Any]:
    try:
        loaded = stor.load(ADMIN_NAMESPACE, ADMIN_SESSIONS_KEY)
        if isinstance(loaded, dict):
            return loaded
    except KeyError:
        pass
    return {}


def _save_admin_sessions(sessions: dict[str, Any]) -> None:
    stor.save(ADMIN_NAMESPACE, ADMIN_SESSIONS_KEY, sessions)


def _prune_admin_sessions(sessions: dict[str, Any]) -> None:
    now = _utc_now()
    expired = []
    for sid, item in sessions.items():
        expires_at_raw = item.get('expires_at') if isinstance(item, dict) else None
        if not isinstance(expires_at_raw, str):
            expired.append(sid)
            continue
        try:
            expires_at = datetime.strptime(expires_at_raw, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=UTC)
        except ValueError:
            expired.append(sid)
            continue
        if expires_at <= now:
            expired.append(sid)
    for sid in expired:
        sessions.pop(sid, None)


def _new_admin_session(email: str) -> str:
    sessions = _load_admin_sessions()
    _prune_admin_sessions(sessions)
    sid = secrets.token_urlsafe(32)
    sessions[sid] = {
        'email': email,
        'created_at': _utc_now_iso(),
        'expires_at': (_utc_now() + timedelta(hours=ADMIN_SESSION_HOURS)).strftime('%Y-%m-%dT%H:%M:%SZ'),
    }
    _save_admin_sessions(sessions)
    return sid


def _require_admin_session(request: Request) -> str:
    sid = request.cookies.get(ADMIN_SESSION_COOKIE)
    if not sid:
        raise HTTPException(status_code=401, detail='Admin session required')
    sessions = _load_admin_sessions()
    _prune_admin_sessions(sessions)
    session = sessions.get(sid)
    if not isinstance(session, dict) or not isinstance(session.get('email'), str):
        _save_admin_sessions(sessions)
        raise HTTPException(status_code=401, detail='Admin session invalid or expired')
    _save_admin_sessions(sessions)
    return session['email']


def _has_admin_session(request: Request) -> bool:
    try:
        _require_admin_session(request)
        return True
    except HTTPException:
        return False


def _require_admin_token_headers(request: Request) -> str:
    token = request.headers.get('X-TeamDB-Token')
    email = request.headers.get('X-TeamDB-Email')
    if not token or not email:
        raise HTTPException(status_code=401, detail='Missing authentication headers')

    normalized_email = _normalize_email(email)
    entry = _load_token_map().get(normalized_email)
    if not _verify_secret(token, entry):
        raise HTTPException(status_code=403, detail='Invalid token')
    return normalized_email


def _load_external_store() -> dict[str, Any]:
    try:
        loaded = stor.load(EXTERNAL_NAMESPACE, EXTERNAL_STORE_KEY)
    except KeyError:
        loaded = None

    if not isinstance(loaded, dict):
        return {
            'version': EXTERNAL_STORE_VERSION,
            'accounts': {},
            'absences': {},
            'sessions': {},
        }

    if not isinstance(loaded.get('accounts'), dict):
        loaded['accounts'] = {}
    if not isinstance(loaded.get('absences'), dict):
        loaded['absences'] = {}
    if not isinstance(loaded.get('sessions'), dict):
        loaded['sessions'] = {}
    if not isinstance(loaded.get('version'), int):
        loaded['version'] = EXTERNAL_STORE_VERSION
    return loaded


def _save_external_store(store: dict[str, Any]) -> None:
    stor.save(EXTERNAL_NAMESPACE, EXTERNAL_STORE_KEY, store)


def _prune_sessions(store: dict[str, Any]) -> None:
    sessions = store.get('sessions', {})
    now = _utc_now()
    expired_ids = []
    for sid, session in sessions.items():
        expires_at_raw = session.get('expires_at') if isinstance(session, dict) else None
        if not isinstance(expires_at_raw, str):
            expired_ids.append(sid)
            continue
        try:
            expires_at = datetime.strptime(expires_at_raw, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=UTC)
        except ValueError:
            expired_ids.append(sid)
            continue
        if expires_at <= now:
            expired_ids.append(sid)

    for sid in expired_ids:
        sessions.pop(sid, None)


def _require_external_feature() -> None:
    if not EXTERNAL_PORTAL_ENABLED:
        raise HTTPException(status_code=404, detail='External portal is disabled')
    if encrypter is None:
        raise HTTPException(status_code=503, detail='External portal encryption is not configured')


def _require_sensitive_encryption() -> None:
    if encrypter is None:
        raise HTTPException(status_code=503, detail='Encryption key is not configured')


def _encrypt_sensitive_absence(absence_type: str, note: str | None) -> str:
    assert encrypter is not None
    payload = {
        'absence_type': absence_type,
        'note': note or '',
    }
    payload_bytes = yaml.safe_dump(payload, sort_keys=True).encode('utf-8')
    token = encrypter.encrypt(payload_bytes)
    return token.decode('ascii')


def _decrypt_sensitive_absence(token_text: str) -> dict[str, Any]:
    assert encrypter is not None
    try:
        decrypted = encrypter.decrypt(token_text.encode('ascii'))
        parsed = yaml.safe_load(decrypted.decode('utf-8'))
        if not isinstance(parsed, dict):
            raise ValueError('Sensitive payload is not a mapping')
        return parsed
    except (InvalidToken, ValueError, yaml.YAMLError):
        raise HTTPException(status_code=500, detail='Failed to decrypt external absence payload')


def _encrypt_sensitive_payload(payload: Any) -> str:
    _require_sensitive_encryption()
    assert encrypter is not None
    payload_bytes = yaml.safe_dump(payload, sort_keys=True).encode('utf-8')
    token = encrypter.encrypt(payload_bytes)
    return token.decode('ascii')


def _decrypt_sensitive_payload(token_text: str) -> Any:
    _require_sensitive_encryption()
    assert encrypter is not None
    try:
        decrypted = encrypter.decrypt(token_text.encode('ascii'))
        return yaml.safe_load(decrypted.decode('utf-8'))
    except (InvalidToken, yaml.YAMLError):
        raise HTTPException(status_code=500, detail='Failed to decrypt sensitive payload')


def _validate_iso_date(value: str, field_name: str) -> None:
    try:
        datetime.strptime(value, '%Y-%m-%d')
    except ValueError:
        raise HTTPException(status_code=400, detail=f"'{field_name}' must be in YYYY-MM-DD format")


def _validate_absence_payload(payload: Any, require_all_fields: bool) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail='Payload must be an object')

    required_fields = {'start_date', 'end_date', 'absence_type'}
    if require_all_fields:
        missing = [field for field in required_fields if field not in payload]
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(sorted(missing))}")

    result: dict[str, Any] = {}
    for field in ('start_date', 'end_date'):
        if field in payload:
            value = payload.get(field)
            if not isinstance(value, str):
                raise HTTPException(status_code=400, detail=f"'{field}' must be a string")
            _validate_iso_date(value, field)
            result[field] = value

    if 'absence_type' in payload:
        absence_type = payload.get('absence_type')
        if not isinstance(absence_type, str) or not absence_type.strip():
            raise HTTPException(status_code=400, detail="'absence_type' must be a non-empty string")
        result['absence_type'] = absence_type.strip()

    if 'note' in payload:
        note = payload.get('note')
        if note is not None and not isinstance(note, str):
            raise HTTPException(status_code=400, detail="'note' must be a string or null")
        result['note'] = note

    if 'is_all_day' in payload:
        is_all_day = payload.get('is_all_day')
        if not isinstance(is_all_day, bool):
            raise HTTPException(status_code=400, detail="'is_all_day' must be boolean")
        result['is_all_day'] = is_all_day

    start_date = result.get('start_date')
    end_date = result.get('end_date')
    if start_date and end_date and end_date < start_date:
        raise HTTPException(status_code=400, detail="'end_date' must be on or after 'start_date'")

    return result


def _new_external_session(store: dict[str, Any], email: str) -> str:
    _prune_sessions(store)
    sid = secrets.token_urlsafe(32)
    expires_at = (_utc_now() + timedelta(hours=EXTERNAL_SESSION_HOURS)).strftime('%Y-%m-%dT%H:%M:%SZ')
    store['sessions'][sid] = {
        'email': email,
        'created_at': _utc_now_iso(),
        'expires_at': expires_at,
    }
    return sid


def _require_external_session(request: Request) -> tuple[dict[str, Any], str]:
    _require_external_feature()
    sid = request.cookies.get(EXTERNAL_SESSION_COOKIE)
    if not sid:
        sid = request.headers.get('X-External-Session')
    if not sid:
        raise HTTPException(status_code=401, detail='External session is required')

    store = _load_external_store()
    _prune_sessions(store)
    session = store['sessions'].get(sid)
    if not isinstance(session, dict):
        _save_external_store(store)
        raise HTTPException(status_code=401, detail='External session is invalid or expired')

    email = session.get('email')
    if not isinstance(email, str):
        store['sessions'].pop(sid, None)
        _save_external_store(store)
        raise HTTPException(status_code=401, detail='External session is invalid or expired')

    _save_external_store(store)
    return store, email


# -------------------------
# Team DB endpoints
# -------------------------

def load_database(path: Path | None = None) -> Any:
    if path is None:
        path = DEFAULT_DB_PATH
    if not path.exists():
        logger.info('Database file not found at %s', path)
        raise FileNotFoundError(str(path))
    with path.open('r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def save_database(data: Any, path: Path | None = None) -> None:
    if path is None:
        path = DEFAULT_DB_PATH
    try:
        if path.exists():
            ts = datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')
            backup_path = BACKUP_DIR / f'database.{ts}.yaml'
            with path.open('r', encoding='utf-8') as src, backup_path.open('w', encoding='utf-8') as dst:
                dst.write(src.read())

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
async def api_get_teamdb() -> JSONResponse:
    try:
        data = load_database()
        try:
            stat = DEFAULT_DB_PATH.stat()
            mtime = datetime.fromtimestamp(stat.st_mtime, tz=UTC).strftime('%Y-%m-%dT%H:%M:%SZ')
        except Exception:
            mtime = None
        if isinstance(data, dict) and 'database' in data:
            content = dict(data)
            content['last_modified'] = mtime
            return JSONResponse(content=content)
        return JSONResponse(content={'database': data, 'last_modified': mtime})
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail='Database not found')
    except Exception as e:
        logger.exception('Error reading database: %s', e)
        raise HTTPException(status_code=500, detail=str(e))


@app.put('/api/teamdb', response_class=JSONResponse)
async def api_put_teamdb(request: Request) -> JSONResponse:
    try:
        payload = await request.json()
    except Exception:
        body = await request.body()
        try:
            payload = yaml.safe_load(body.decode('utf-8'))
        except Exception as e:
            logger.exception('Failed to parse payload as JSON or YAML: %s', e)
            raise HTTPException(status_code=400, detail='Invalid JSON/YAML payload')

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail='Payload must be an object')

    try:
        validate_database(payload)
    except ValidationError as ve:
        path = '/'.join(ve.path) if getattr(ve, 'path', None) else ''
        detail = f'Validation error: {ve} at {path}' if path else f'Validation error: {ve}'
        raise HTTPException(status_code=400, detail=detail)

    _require_admin_token_headers(request)

    client_ts = None
    hdr = request.headers.get('X-Client-Modified-At') or request.headers.get('If-Unmodified-Since')
    if hdr:
        try:
            client_ts = datetime.strptime(hdr, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=UTC)
        except Exception:
            client_ts = None

    server_mtime = None
    if DEFAULT_DB_PATH.exists():
        server_mtime = datetime.fromtimestamp(DEFAULT_DB_PATH.stat().st_mtime, tz=UTC)
    if client_ts and server_mtime and server_mtime > client_ts:
        raise HTTPException(status_code=412, detail='Server has newer version')

    try:
        save_database(payload)
        return JSONResponse(content={'ok': True})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/token', response_class=JSONResponse)
async def api_post_token(request: Request) -> JSONResponse:
    host = request.client.host if request.client else ''
    if host not in ('127.0.0.1', '::1', 'localhost'):
        raise HTTPException(status_code=403, detail='Token generation allowed from localhost only')

    body = await request.json()
    email = (body or {}).get('email')
    if not isinstance(email, str) or not email.strip():
        raise HTTPException(status_code=400, detail='Missing email')

    normalized_email = _normalize_email(email)
    token = secrets.token_urlsafe(24)

    tokens = _load_token_map()
    tokens[normalized_email] = _hash_secret(token)

    try:
        _save_token_map(tokens)
        return JSONResponse(content={'email': normalized_email, 'token': token})
    except Exception as e:
        logger.exception('Failed to save token: %s', e)
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------
# SuccessFactors sync endpoints
# -------------------------


@app.post('/api/sf/absence-data', response_class=JSONResponse)
async def api_sf_upload_absence_data(request: Request) -> JSONResponse:
    uploader_email = _require_admin_token_headers(request)

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid JSON payload')

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail='Payload must be an object')
    d = payload.get('d')
    results = d.get('results') if isinstance(d, dict) else None
    if not isinstance(results, list):
        raise HTTPException(status_code=400, detail="Payload must include list at 'd.results'")

    now = _utc_now_iso()
    wrapped = {
        'updated_at': now,
        'uploaded_by': uploader_email,
        'payload': _encrypt_sensitive_payload(payload),
    }
    stor.save(SF_NAMESPACE, SF_ABSENCE_KEY, wrapped)
    return JSONResponse(content={'ok': True, 'updated_at': now})


@app.get('/api/sf/absence-data', response_class=JSONResponse)
async def api_sf_get_absence_data(request: Request) -> JSONResponse:
    _require_admin_token_headers(request)
    try:
        wrapped = stor.load(SF_NAMESPACE, SF_ABSENCE_KEY)
    except KeyError:
        raise HTTPException(status_code=404, detail='No uploaded SuccessFactors absence data found')

    if not isinstance(wrapped, dict) or not isinstance(wrapped.get('payload'), str):
        raise HTTPException(status_code=500, detail='Stored SuccessFactors absence data is invalid')

    payload = _decrypt_sensitive_payload(wrapped['payload'])
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail='Stored SuccessFactors absence payload is invalid')

    return JSONResponse(
        content={
            'updated_at': wrapped.get('updated_at'),
            'uploaded_by': wrapped.get('uploaded_by'),
            'data': payload,
        }
    )


@app.get('/api/public/sf/absence-data', response_class=JSONResponse)
async def api_public_sf_absence_data() -> JSONResponse:
    try:
        wrapped = stor.load(SF_NAMESPACE, SF_ABSENCE_KEY)
    except KeyError:
        raise HTTPException(status_code=404, detail='No uploaded SuccessFactors absence data found')

    if not isinstance(wrapped, dict) or not isinstance(wrapped.get('payload'), str):
        raise HTTPException(status_code=500, detail='Stored SuccessFactors absence data is invalid')

    payload = _decrypt_sensitive_payload(wrapped['payload'])
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail='Stored SuccessFactors absence payload is invalid')

    return JSONResponse(
        content={
            'updated_at': wrapped.get('updated_at'),
            'data': payload,
        }
    )


# -------------------------
# External account + absence endpoints
# -------------------------


@app.post('/api/external/signup', response_class=JSONResponse)
async def api_external_signup(request: Request) -> JSONResponse:
    _require_external_feature()
    body = await request.json()
    email = (body or {}).get('email')
    if not isinstance(email, str) or not email.strip():
        raise HTTPException(status_code=400, detail='Missing email')

    normalized_email = _normalize_email(email)
    store = _load_external_store()

    if normalized_email in store['accounts']:
        raise HTTPException(status_code=409, detail='Account already exists')

    token = secrets.token_urlsafe(24)
    now = _utc_now_iso()

    store['accounts'][normalized_email] = {
        'email': normalized_email,
        'external_id': f"ext-{secrets.token_hex(8)}",
        'token': _hash_secret(token),
        'created_at': now,
        'updated_at': now,
    }

    _save_external_store(store)
    return JSONResponse(content={'email': normalized_email, 'token': token, 'created_at': now})


@app.post('/api/external/login', response_class=JSONResponse)
async def api_external_login(request: Request) -> JSONResponse:
    _require_external_feature()
    body = await request.json()
    email = (body or {}).get('email')
    token = (body or {}).get('token')
    if not isinstance(email, str) or not isinstance(token, str):
        raise HTTPException(status_code=400, detail='Missing email or token')

    normalized_email = _normalize_email(email)
    store = _load_external_store()
    account = store['accounts'].get(normalized_email)
    if not isinstance(account, dict):
        raise HTTPException(status_code=401, detail='Invalid credentials')

    if not _verify_secret(token, account.get('token')):
        raise HTTPException(status_code=401, detail='Invalid credentials')

    sid = _new_external_session(store, normalized_email)
    _save_external_store(store)

    response = JSONResponse(content={'ok': True, 'email': normalized_email, 'session_expires_in_hours': EXTERNAL_SESSION_HOURS})
    response.set_cookie(
        EXTERNAL_SESSION_COOKIE,
        sid,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite='lax',
        max_age=EXTERNAL_SESSION_HOURS * 3600,
    )
    return response


@app.post('/api/external/logout', response_class=JSONResponse)
async def api_external_logout(request: Request) -> JSONResponse:
    _require_external_feature()
    sid = request.cookies.get(EXTERNAL_SESSION_COOKIE) or request.headers.get('X-External-Session')
    store = _load_external_store()
    if sid:
        store['sessions'].pop(sid, None)
        _save_external_store(store)

    response = JSONResponse(content={'ok': True})
    response.delete_cookie(EXTERNAL_SESSION_COOKIE)
    return response


@app.post('/api/external/reset', response_class=JSONResponse)
async def api_external_reset(request: Request) -> JSONResponse:
    _require_external_feature()
    body = await request.json()
    email = (body or {}).get('email')
    token = (body or {}).get('token')

    if not isinstance(email, str) or not isinstance(token, str):
        raise HTTPException(status_code=400, detail='Missing email or token')

    normalized_email = _normalize_email(email)
    store = _load_external_store()
    account = store['accounts'].get(normalized_email)
    if not isinstance(account, dict):
        raise HTTPException(status_code=404, detail='Account not found')

    if not _verify_secret(token, account.get('token')):
        raise HTTPException(status_code=401, detail='Invalid credentials')

    store['accounts'].pop(normalized_email, None)

    absences = store['absences']
    for absence_id in [aid for aid, item in absences.items() if isinstance(item, dict) and item.get('email') == normalized_email]:
        absences.pop(absence_id, None)

    for sid, session in list(store['sessions'].items()):
        if isinstance(session, dict) and session.get('email') == normalized_email:
            store['sessions'].pop(sid, None)

    _save_external_store(store)
    response = JSONResponse(content={'ok': True, 'email': normalized_email, 'data_deleted': True})
    response.delete_cookie(EXTERNAL_SESSION_COOKIE)
    return response


@app.get('/api/external/me/absences', response_class=JSONResponse)
async def api_external_get_my_absences(request: Request) -> JSONResponse:
    store, email = _require_external_session(request)

    entries = []
    for absence in store['absences'].values():
        if not isinstance(absence, dict) or absence.get('email') != email:
            continue
        sensitive = _decrypt_sensitive_absence(absence['sensitive'])
        entries.append(
            {
                'id': absence['id'],
                'email': email,
                'start_date': absence['start_date'],
                'end_date': absence['end_date'],
                'is_all_day': absence.get('is_all_day', True),
                'absence_type': sensitive.get('absence_type', ''),
                'note': sensitive.get('note', ''),
                'created_at': absence['created_at'],
                'updated_at': absence['updated_at'],
            }
        )

    entries.sort(key=lambda x: (x['start_date'], x['id']))
    return JSONResponse(content={'items': entries})


@app.post('/api/external/me/absences', response_class=JSONResponse)
async def api_external_create_absence(request: Request) -> JSONResponse:
    store, email = _require_external_session(request)
    body = await request.json()
    payload = _validate_absence_payload(body, require_all_fields=True)

    now = _utc_now_iso()
    absence_id = f"abs-{secrets.token_hex(8)}"
    sensitive = _encrypt_sensitive_absence(payload['absence_type'], payload.get('note'))

    store['absences'][absence_id] = {
        'id': absence_id,
        'email': email,
        'start_date': payload['start_date'],
        'end_date': payload['end_date'],
        'is_all_day': payload.get('is_all_day', True),
        'sensitive': sensitive,
        'created_at': now,
        'updated_at': now,
    }
    _save_external_store(store)

    return JSONResponse(
        content={
            'id': absence_id,
            'email': email,
            'start_date': payload['start_date'],
            'end_date': payload['end_date'],
            'is_all_day': payload.get('is_all_day', True),
            'absence_type': payload['absence_type'],
            'note': payload.get('note', ''),
            'created_at': now,
            'updated_at': now,
        }
    )


@app.put('/api/external/me/absences/{absence_id}', response_class=JSONResponse)
async def api_external_update_absence(absence_id: str, request: Request) -> JSONResponse:
    store, email = _require_external_session(request)
    body = await request.json()
    payload = _validate_absence_payload(body, require_all_fields=False)

    absence = store['absences'].get(absence_id)
    if not isinstance(absence, dict) or absence.get('email') != email:
        raise HTTPException(status_code=404, detail='Absence not found')

    current_sensitive = _decrypt_sensitive_absence(absence['sensitive'])
    merged_sensitive = {
        'absence_type': payload.get('absence_type', current_sensitive.get('absence_type', '')),
        'note': payload.get('note', current_sensitive.get('note', '')),
    }

    if 'start_date' in payload:
        absence['start_date'] = payload['start_date']
    if 'end_date' in payload:
        absence['end_date'] = payload['end_date']

    start_date = absence.get('start_date')
    end_date = absence.get('end_date')
    if isinstance(start_date, str) and isinstance(end_date, str) and end_date < start_date:
        raise HTTPException(status_code=400, detail="'end_date' must be on or after 'start_date'")

    if 'is_all_day' in payload:
        absence['is_all_day'] = payload['is_all_day']

    absence['sensitive'] = _encrypt_sensitive_absence(merged_sensitive['absence_type'], merged_sensitive['note'])
    absence['updated_at'] = _utc_now_iso()
    _save_external_store(store)

    return JSONResponse(
        content={
            'id': absence['id'],
            'email': email,
            'start_date': absence['start_date'],
            'end_date': absence['end_date'],
            'is_all_day': absence.get('is_all_day', True),
            'absence_type': merged_sensitive['absence_type'],
            'note': merged_sensitive['note'],
            'created_at': absence['created_at'],
            'updated_at': absence['updated_at'],
        }
    )


@app.delete('/api/external/me/absences/{absence_id}', response_class=JSONResponse)
async def api_external_delete_absence(absence_id: str, request: Request) -> JSONResponse:
    store, email = _require_external_session(request)
    absence = store['absences'].get(absence_id)
    if not isinstance(absence, dict) or absence.get('email') != email:
        raise HTTPException(status_code=404, detail='Absence not found')

    store['absences'].pop(absence_id, None)
    _save_external_store(store)
    return JSONResponse(content={'ok': True, 'id': absence_id})


@app.get('/api/external/absences', response_class=JSONResponse)
async def api_external_get_absences(request: Request) -> JSONResponse:
    _require_external_feature()
    _require_admin_token_headers(request)
    store = _load_external_store()

    entries = []
    for absence in store['absences'].values():
        if not isinstance(absence, dict):
            continue
        sensitive = _decrypt_sensitive_absence(absence['sensitive'])
        entries.append(
            {
                'id': absence['id'],
                'email': absence['email'],
                'start_date': absence['start_date'],
                'end_date': absence['end_date'],
                'is_all_day': absence.get('is_all_day', True),
                'absence_type': sensitive.get('absence_type', ''),
                'note': sensitive.get('note', ''),
                'created_at': absence['created_at'],
                'updated_at': absence['updated_at'],
            }
        )

    entries.sort(key=lambda x: (x['start_date'], x['email'], x['id']))
    return JSONResponse(content={'items': entries})


@app.get('/api/public/external/absences', response_class=JSONResponse)
async def api_public_external_absences() -> JSONResponse:
    _require_external_feature()
    store = _load_external_store()

    entries = []
    for absence in store['absences'].values():
        if not isinstance(absence, dict):
            continue
        sensitive = _decrypt_sensitive_absence(absence['sensitive'])
        entries.append(
            {
                'id': absence['id'],
                'email': absence['email'],
                'start_date': absence['start_date'],
                'end_date': absence['end_date'],
                'is_all_day': absence.get('is_all_day', True),
                'absence_type': sensitive.get('absence_type', ''),
            }
        )

    entries.sort(key=lambda x: (x['start_date'], x['email'], x['id']))
    return JSONResponse(content={'items': entries})


@app.get('/api/health', response_class=JSONResponse)
async def api_health() -> JSONResponse:
    sf_data_available = stor.exists(SF_NAMESPACE, SF_ABSENCE_KEY)
    return JSONResponse(
        content={
            'status': 'ok',
            'service': 'teamdb',
            'timestamp': _utc_now_iso(),
            'ui_enabled': UI_ENABLED,
            'external_portal_enabled': EXTERNAL_PORTAL_ENABLED and encrypter is not None,
            'sf_absence_data_available': sf_data_available,
        }
    )


def _load_latest_sf_absence_payload() -> dict[str, Any] | None:
    if not stor.exists(SF_NAMESPACE, SF_ABSENCE_KEY):
        return None
    wrapped = stor.load(SF_NAMESPACE, SF_ABSENCE_KEY)
    if not isinstance(wrapped, dict) or not isinstance(wrapped.get('payload'), str):
        return None
    payload = _decrypt_sensitive_payload(wrapped['payload'])
    if isinstance(payload, dict):
        return payload
    return None


def _parse_sf_date(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    m = re.match(r'^/Date\((\d+)\)/$', value)
    if not m:
        return None
    ts = int(m.group(1)) / 1000
    return datetime.fromtimestamp(ts, tz=UTC).strftime('%Y-%m-%d')


def _date_range(start_date: str, end_date: str) -> list[str]:
    start = datetime.strptime(start_date, '%Y-%m-%d').date()
    end = datetime.strptime(end_date, '%Y-%m-%d').date()
    if end < start:
        return []
    days = []
    cur = start
    while cur <= end:
        days.append(cur.isoformat())
        cur = cur.fromordinal(cur.toordinal() + 1)
    return days


def _build_calendar_model() -> tuple[list[str], list[dict[str, Any]]]:
    sf_payload = _load_latest_sf_absence_payload() or {'d': {'results': []}}
    sf_results = sf_payload.get('d', {}).get('results', []) if isinstance(sf_payload.get('d'), dict) else []
    try:
        db = load_database()
    except FileNotFoundError:
        db = {'database': {'people': []}}
    db_people = db.get('database', {}).get('people', []) if isinstance(db, dict) else []
    team_by_name = {
        person.get('name'): person.get('team_name', '')
        for person in db_people
        if isinstance(person, dict) and isinstance(person.get('name'), str)
    }

    absence_map: dict[str, set[str]] = {}
    for entry in sf_results:
        if not isinstance(entry, dict):
            continue
        name = entry.get('username')
        if not isinstance(name, str):
            continue
        employee_times = entry.get('employeeTimeNav', {}).get('results', []) if isinstance(entry.get('employeeTimeNav'), dict) else []
        for absence in employee_times:
            if not isinstance(absence, dict):
                continue
            status = absence.get('approvalStatus')
            if status != 'APPROVED':
                continue
            start_date = _parse_sf_date(absence.get('startDate'))
            end_date = _parse_sf_date(absence.get('endDate'))
            if not start_date or not end_date:
                continue
            absence_map.setdefault(name, set()).update(_date_range(start_date, end_date))

    if EXTERNAL_PORTAL_ENABLED and encrypter is not None:
        store = _load_external_store()
        for item in store.get('absences', {}).values():
            if not isinstance(item, dict):
                continue
            email = item.get('email')
            start = item.get('start_date')
            end = item.get('end_date')
            if not isinstance(email, str) or not isinstance(start, str) or not isinstance(end, str):
                continue
            absence_map.setdefault(email, set()).update(_date_range(start, end))
            if email not in team_by_name:
                team_by_name[email] = 'External'

    all_dates = sorted({d for dates in absence_map.values() for d in dates})
    if not all_dates:
        today = _utc_now().date().isoformat()
        all_dates = [today]

    rows = []
    for person, dates in sorted(absence_map.items(), key=lambda p: p[0].lower()):
        rows.append({
            'name': person,
            'team': team_by_name.get(person, ''),
            'dates': dates,
        })
    return all_dates, rows


def _render_calendar_page() -> str:
    dates, rows = _build_calendar_model()
    head = ''.join(f'<th>{d[5:]}</th>' for d in dates)
    body_parts = []
    for row in rows:
        cells = ''.join('<td class="a"></td>' if d in row['dates'] else '<td></td>' for d in dates)
        body_parts.append(f"<tr><td>{row['name']}</td><td>{row['team']}</td>{cells}</tr>")
    body = ''.join(body_parts) or '<tr><td colspan="3">No absence data uploaded</td></tr>'
    return (
        '<html><head><title>TeamDB Calendar</title>'
        '<style>body{font-family:Arial,sans-serif}table{border-collapse:collapse;font-size:12px}'
        'th,td{border:1px solid #ddd;padding:4px;text-align:center}td.a{background:#ffcccc}'
        'th{position:sticky;top:0;background:#fff}td:first-child,th:first-child{text-align:left}'
        'td:nth-child(2),th:nth-child(2){text-align:left}</style></head><body>'
        '<h2>Absence Calendar</h2><p><a href="/">Home</a> | <a href="/orgchart">Org Chart</a></p>'
        f'<table><thead><tr><th>Name</th><th>Team</th>{head}</tr></thead><tbody>{body}</tbody></table></body></html>'
    )


def _render_orgchart_page() -> str:
    try:
        db = load_database()
    except FileNotFoundError:
        db = {'database': {'people': []}}
    people = db.get('database', {}).get('people', []) if isinstance(db, dict) else []
    teams: dict[str, list[str]] = {}
    for person in people:
        if not isinstance(person, dict) or not isinstance(person.get('name'), str):
            continue
        team_name = person.get('team_name') or 'Unassigned'
        teams.setdefault(team_name, []).append(person['name'])

    if EXTERNAL_PORTAL_ENABLED and encrypter is not None:
        store = _load_external_store()
        ext_accounts = sorted([k for k in store.get('accounts', {}).keys() if isinstance(k, str)])
        if ext_accounts:
            teams.setdefault('External', []).extend(ext_accounts)

    cards = []
    for team, members in sorted(teams.items(), key=lambda t: t[0].lower()):
        member_list = ''.join(f'<li>{m}</li>' for m in sorted(set(members), key=str.lower))
        cards.append(f'<section><h3>{team}</h3><ul>{member_list}</ul></section>')
    cards_html = ''.join(cards) or '<p>No team data available.</p>'
    return (
        '<html><head><title>TeamDB Org Chart</title>'
        '<style>body{font-family:Arial,sans-serif}section{border:1px solid #ccc;border-radius:8px;padding:10px;margin:10px 0}'
        'h3{margin:0 0 8px 0}ul{margin:0;padding-left:20px}</style></head><body>'
        '<h2>Organization Chart</h2><p><a href="/">Home</a> | <a href="/calendar">Calendar</a></p>'
        f'{cards_html}</body></html>'
    )


def _render_landing_page(admin_logged_in: bool) -> str:
    external_enabled = EXTERNAL_PORTAL_ENABLED and encrypter is not None
    admin_action_href = '/ui' if admin_logged_in else '/admin/login'
    admin_action_label = 'Open Admin UI' if admin_logged_in else 'Admin Sign In'
    admin_state = 'Signed in' if admin_logged_in else 'Not signed in'
    external_href = '/portal/login' if external_enabled else '#'
    external_style = '' if external_enabled else 'opacity:.55;pointer-events:none;'
    external_state = 'Enabled' if external_enabled else 'Disabled (missing feature flag or encryption key)'
    logout_button = (
        '<button id="logout" class="ghost">Sign out</button>'
        '<script>document.getElementById("logout").onclick=async()=>{await fetch("/api/admin/logout",{method:"POST"});location.href="/";};</script>'
        if admin_logged_in else ''
    )
    return f'''
    <html>
    <head>
      <title>TeamDB Hub</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        :root {{ --bg:#0b1020; --panel:#131a2e; --card:#1a2440; --text:#eef3ff; --muted:#97a7d1; --accent:#5ea1ff; }}
        * {{ box-sizing: border-box; }}
        body {{ margin:0; font-family: Inter, Segoe UI, Arial, sans-serif; background: radial-gradient(1200px 600px at 10% -10%, #1b2f60, var(--bg)); color: var(--text); }}
        .wrap {{ max-width: 1100px; margin: 0 auto; padding: 36px 22px 48px; }}
        h1 {{ margin: 0 0 8px; font-size: 2rem; }}
        .sub {{ color: var(--muted); margin: 0 0 26px; }}
        .top {{ display:flex; justify-content:space-between; gap:12px; align-items:center; margin-bottom:14px; }}
        .badge {{ background:#223157; border:1px solid #33477f; color:#cfe0ff; border-radius:999px; padding:6px 10px; font-size:.8rem; }}
        .grid {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:14px; }}
        .card {{ background: linear-gradient(180deg, #1b2748, var(--card)); border:1px solid #2d3f74; border-radius:14px; padding:16px; min-height:190px; display:flex; flex-direction:column; }}
        .card h3 {{ margin:0 0 8px; }}
        .card p {{ margin:0 0 10px; color:var(--muted); line-height:1.4; font-size:.95rem; flex:1; }}
        .state {{ font-size:.84rem; margin-bottom:12px; color:#bfd0ff; }}
        .actions {{ display:flex; gap:8px; flex-wrap:wrap; }}
        a.btn, button.ghost {{ text-decoration:none; border:1px solid #4564aa; color:#eaf1ff; background:#2d4478; padding:9px 12px; border-radius:10px; font-weight:600; font-size:.9rem; cursor:pointer; }}
        a.btn.alt {{ background:transparent; }}
        button.ghost {{ background:transparent; }}
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="top">
          <div>
            <h1>TeamDB Hub</h1>
            <p class="sub">Choose what you want to open. Sensitive areas require admin sign-in.</p>
          </div>
          {logout_button}
        </div>
        <div class="grid">
          <section class="card">
            <h3>Admin</h3>
            <p>Edit shared people, team and project data with schema validation.</p>
            <div class="state">Status: {admin_state}</div>
            <div class="actions"><a class="btn" href="{admin_action_href}">{admin_action_label}</a></div>
          </section>
          <section class="card">
            <h3>Calendar</h3>
            <p>View the current department absence calendar generated from internal and external data.</p>
            <div class="state">Status: Public</div>
            <div class="actions"><a class="btn" href="/calendar">Open Calendar</a></div>
          </section>
          <section class="card">
            <h3>Org Chart</h3>
            <p>Browse the team structure and member grouping generated from the latest TeamDB dataset.</p>
            <div class="state">Status: Public</div>
            <div class="actions"><a class="btn" href="/orgchart">Open Org Chart</a></div>
          </section>
          <section class="card" style="{external_style}">
            <h3>External Portal</h3>
            <p>External consultants can sign in to register and manage their own absences.</p>
            <div class="state">Status: {external_state}</div>
            <div class="actions"><a class="btn" href="{external_href}">Open External Portal</a></div>
          </section>
        </div>
      </div>
    </body>
    </html>
    '''


def _render_public_extension_view(mode: str, admin_logged_in: bool) -> str:
    title = 'Calendar' if mode == 'calendar' else 'Organization Chart'
    external_enabled = EXTERNAL_PORTAL_ENABLED and encrypter is not None
    topbar_links = render_topbar_links(admin_logged_in=admin_logged_in, external_enabled=external_enabled)
    topbar_logout = render_logout_action(admin_logged_in)
    return render_page_shell(
        title=f'TeamDB {title}',
        topbar_title=f'TeamDB {title}',
        topbar_links_html=topbar_links,
        topbar_logout_html=topbar_logout,
        root_id='public-view-root',
        root_loading_text=f'Loading {title.lower()}...',
        include_uikit=True,
        extra_head_html='#public-view-root { padding: 14px; }',
        extra_script_html=f'''
      <script src="/addon/src/web-runtime-shim.js"></script>
      <script>window.__TEAMDB_PUBLIC_MODE__ = "{mode}";</script>
      <script type="module" src="/addon/src/public-views.js?mode={mode}"></script>
    ''',
    )


def _render_portal_shell(title: str, body_html: str, script_html: str = '', *, admin_logged_in: bool = False) -> str:
    external_enabled = EXTERNAL_PORTAL_ENABLED and encrypter is not None
    topbar_links = render_topbar_links(admin_logged_in=admin_logged_in, external_enabled=external_enabled)
    topbar_logout = render_logout_action(admin_logged_in, '/calendar')
    return render_page_shell(
        title=title,
        topbar_title=title,
        topbar_links_html=topbar_links,
        topbar_logout_html=topbar_logout,
        content_html=f'''
      <div class="content">
        {body_html}
        <pre id="result"></pre>
      </div>
    ''',
        extra_head_html='''
        .content { padding: 18px; }
        form label { display:block; margin-bottom: 10px; }
        input { padding: 6px; min-width: 260px; }
        button { padding: 7px 10px; margin-right: 8px; }
    ''',
        extra_script_html=script_html,
    )


def _render_admin_extension_view(mode: str) -> str:
    mode_to_title = {
        'people': 'People Editor',
        'team': 'Teams and Projects Editor',
        'absence': 'Absence Editor',
    }
    mode_to_mount = {
        'people': 'people-tab',
        'team': 'team-tab',
        'absence': 'absence-tab',
    }
    page_title = mode_to_title.get(mode, 'Admin')
    mount_id = mode_to_mount.get(mode, 'people-tab')
    external_enabled = EXTERNAL_PORTAL_ENABLED and encrypter is not None
    topbar_links = render_topbar_links(admin_logged_in=True, external_enabled=external_enabled)
    topbar_logout = render_logout_action(True, '/admin/login')
    return render_page_shell(
        title=f'TeamDB {page_title}',
        topbar_title=f'TeamDB {page_title}',
        topbar_links_html=topbar_links,
        topbar_logout_html=topbar_logout,
                content_html=f'''
            <div id="admin-view-root">
                <div id="{mount_id}">Loading...</div>
            </div>
        ''',
        include_uikit=True,
        extra_head_html=f'#admin-view-root {{ padding: 18px; }}',
        extra_script_html=f'''
      <script src="/addon/src/web-runtime-shim.js"></script>
      <script>
        window.__TEAMDB_WEB_UI__ = true;
        try {{ localStorage.setItem('server_url', window.location.origin); }} catch (e) {{}}
        window.__TEAMDB_ADMIN_MODE__ = "{mode}";
      </script>
      <script type="module" src="/addon/src/admin-views.js?mode={mode}"></script>
    ''',
    )


# -------------------------
# Optional UI routes
# -------------------------


if UI_ENABLED:
    @app.post('/api/admin/login', response_class=JSONResponse)
    async def api_admin_login(request: Request) -> JSONResponse:
        body = await request.json()
        email = body.get('email') if isinstance(body, dict) else None
        token = body.get('token') if isinstance(body, dict) else None
        if not isinstance(email, str) or not isinstance(token, str):
            raise HTTPException(status_code=400, detail='Missing email or token')
        normalized_email = _normalize_email(email)
        entry = _load_token_map().get(normalized_email)
        if not _verify_secret(token, entry):
            raise HTTPException(status_code=401, detail='Invalid credentials')
        sid = _new_admin_session(normalized_email)
        response = JSONResponse(content={'ok': True, 'email': normalized_email})
        response.set_cookie(
            ADMIN_SESSION_COOKIE,
            sid,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite='lax',
            max_age=ADMIN_SESSION_HOURS * 3600,
        )
        return response


    @app.post('/api/admin/logout', response_class=JSONResponse)
    async def api_admin_logout(request: Request) -> JSONResponse:
        sid = request.cookies.get(ADMIN_SESSION_COOKIE)
        if sid:
            sessions = _load_admin_sessions()
            sessions.pop(sid, None)
            _save_admin_sessions(sessions)
        response = JSONResponse(content={'ok': True})
        response.delete_cookie(ADMIN_SESSION_COOKIE)
        return response


    @app.get('/api/admin/teamdb', response_class=JSONResponse)
    async def api_admin_get_teamdb(request: Request) -> JSONResponse:
        _require_admin_session(request)
        try:
            data = load_database()
            return JSONResponse(content=data if isinstance(data, dict) else {'database': data})
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail='Database not found')


    @app.get('/api/admin/sf/absence-data', response_class=JSONResponse)
    async def api_admin_get_sf_absence_data(request: Request) -> JSONResponse:
        _require_admin_session(request)
        try:
            wrapped = stor.load(SF_NAMESPACE, SF_ABSENCE_KEY)
        except KeyError:
            raise HTTPException(status_code=404, detail='No uploaded SuccessFactors absence data found')
        if not isinstance(wrapped, dict) or not isinstance(wrapped.get('payload'), str):
            raise HTTPException(status_code=500, detail='Stored SuccessFactors absence data is invalid')
        payload = _decrypt_sensitive_payload(wrapped['payload'])
        if not isinstance(payload, dict):
            raise HTTPException(status_code=500, detail='Stored SuccessFactors absence payload is invalid')
        return JSONResponse(
            content={
                'updated_at': wrapped.get('updated_at'),
                'uploaded_by': wrapped.get('uploaded_by'),
                'data': payload,
            }
        )


    @app.get('/api/admin/external/absences', response_class=JSONResponse)
    async def api_admin_get_external_absences(request: Request) -> JSONResponse:
        _require_admin_session(request)
        _require_external_feature()
        store = _load_external_store()
        entries = []
        for absence in store['absences'].values():
            if not isinstance(absence, dict):
                continue
            sensitive = _decrypt_sensitive_absence(absence['sensitive'])
            entries.append(
                {
                    'id': absence['id'],
                    'email': absence['email'],
                    'start_date': absence['start_date'],
                    'end_date': absence['end_date'],
                    'is_all_day': absence.get('is_all_day', True),
                    'absence_type': sensitive.get('absence_type', ''),
                    'note': sensitive.get('note', ''),
                    'created_at': absence['created_at'],
                    'updated_at': absence['updated_at'],
                }
            )
        entries.sort(key=lambda x: (x['start_date'], x['email'], x['id']))
        return JSONResponse(content={'items': entries})


    @app.put('/api/admin/teamdb', response_class=JSONResponse)
    async def api_admin_put_teamdb(request: Request) -> JSONResponse:
        _require_admin_session(request)
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail='Invalid JSON payload')

        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail='Payload must be an object')

        try:
            validate_database(payload)
        except ValidationError as ve:
            path = '/'.join(ve.path) if getattr(ve, 'path', None) else ''
            detail = f'Validation error: {ve} at {path}' if path else f'Validation error: {ve}'
            raise HTTPException(status_code=400, detail=detail)

        save_database(payload)
        return JSONResponse(content={'ok': True})


    @app.get('/admin/login', response_class=HTMLResponse)
    async def ui_admin_login(request: Request) -> HTMLResponse:
        admin_logged_in = _has_admin_session(request)
        topbar_links = render_topbar_links(
            admin_logged_in=admin_logged_in,
            external_enabled=EXTERNAL_PORTAL_ENABLED and encrypter is not None,
        )
        topbar_logout = render_logout_action(admin_logged_in, '/calendar')
        return HTMLResponse(
            render_page_shell(
                title='TeamDB Admin Login',
                topbar_title='TeamDB Admin Login',
                topbar_links_html=topbar_links,
                topbar_logout_html=topbar_logout,
                content_html='''
      <div class="content">
        <h2>Sign in</h2>
        <form id="login">
            <label>Email <input name="email" type="email" required /></label>
            <label>Token <input name="token" type="text" required /></label>
            <button type="submit">Sign in</button>
        </form>
        <pre id="result"></pre>
      </div>
    ''',
                extra_head_html='''
        .content { padding: 20px; max-width: 520px; }
        form label { display: block; margin-bottom: 10px; }
        input { padding: 6px; min-width: 280px; }
        button { padding: 7px 10px; }
    ''',
                extra_script_html='''
      <script>
        const form = document.getElementById('login');
        const result = document.getElementById('result');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(form).entries());
            const resp = await fetch('/api/admin/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            const body = await resp.text();
            result.textContent = body;
            if (resp.ok) location.href = '/admin/people';
        });
      </script>
    ''',
            )
        )


    @app.get('/admin')
    async def ui_admin_entry(request: Request) -> RedirectResponse:
        try:
            _require_admin_session(request)
            return RedirectResponse(url='/admin/people')
        except HTTPException:
            return RedirectResponse(url='/admin/login')


    @app.get('/')
    async def ui_home() -> RedirectResponse:
        return RedirectResponse(url='/calendar')


    @app.get('/ui')
    async def ui_editor(request: Request) -> RedirectResponse:
        try:
            _require_admin_session(request)
        except HTTPException:
            return RedirectResponse(url='/admin/login')
        return RedirectResponse(url='/admin/people')


    @app.get('/admin/people')
    async def ui_admin_people(request: Request) -> HTMLResponse:
        _require_admin_session(request)
        return HTMLResponse(_render_admin_extension_view('people'))


    @app.get('/admin/team')
    async def ui_admin_team(request: Request) -> HTMLResponse:
        _require_admin_session(request)
        return HTMLResponse(_render_admin_extension_view('team'))


    @app.get('/admin/absence')
    async def ui_admin_absence(request: Request) -> HTMLResponse:
        _require_admin_session(request)
        return HTMLResponse(_render_admin_extension_view('absence'))


    @app.get('/calendar')
    async def ui_calendar(request: Request) -> HTMLResponse:
        return HTMLResponse(_render_public_extension_view('calendar', _has_admin_session(request)))


    @app.get('/orgchart')
    async def ui_orgchart(request: Request) -> HTMLResponse:
        return HTMLResponse(_render_public_extension_view('orgchart', _has_admin_session(request)))


    @app.get('/portal/login', response_class=HTMLResponse)
    async def ui_external_login(request: Request) -> HTMLResponse:
        body_html = '''
            <h2>External Absence Portal</h2>
            <form id="login">
                <label>Email <input name="email" type="email" required /></label>
                <label>Token <input name="token" type="text" required /></label>
                <button type="submit">Sign in</button>
            </form>
            <p><a href="/portal/signup">Need an account?</a></p>
        '''
        script_html = '''
            <script>
                const form = document.getElementById('login');
                const result = document.getElementById('result');
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const data = Object.fromEntries(new FormData(form).entries());
                    const resp = await fetch('/api/external/login', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(data)
                    });
                    const body = await resp.text();
                    result.textContent = body;
                    if (resp.ok) location.href = '/portal/absences';
                });
            </script>
        '''
        return HTMLResponse(_render_portal_shell(
            'TeamDB External Portal',
            body_html,
            script_html,
            admin_logged_in=_has_admin_session(request),
        ))


    @app.get('/portal/signup', response_class=HTMLResponse)
    async def ui_external_signup(request: Request) -> HTMLResponse:
        body_html = '''
            <h2>External Signup</h2>
            <form id="signup">
                <label>Email <input name="email" type="email" required /></label>
                <button type="submit">Create account</button>
            </form>
            <p>Store the generated token safely. It is required for sign in and reset.</p>
        '''
        script_html = '''
            <script>
                const form = document.getElementById('signup');
                const result = document.getElementById('result');
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const data = Object.fromEntries(new FormData(form).entries());
                    const resp = await fetch('/api/external/signup', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(data)
                    });
                    result.textContent = await resp.text();
                });
            </script>
        '''
        return HTMLResponse(_render_portal_shell(
            'TeamDB External Signup',
            body_html,
            script_html,
            admin_logged_in=_has_admin_session(request),
        ))


    @app.get('/portal/absences', response_class=HTMLResponse)
    async def ui_external_absences(request: Request) -> HTMLResponse:
        body_html = '''
            <h2>My absences</h2>
            <form id="create">
                <label>Start <input name="start_date" type="date" required /></label>
                <label>End <input name="end_date" type="date" required /></label>
                <label>Type <input name="absence_type" type="text" required /></label>
                <label>Note <input name="note" type="text" /></label>
                <button type="submit">Add absence</button>
            </form>
            <div style="margin-top:8px;">
                <button id="refresh">Refresh</button>
                <button id="logout">Logout</button>
            </div>
        '''
        script_html = '''
            <script>
                const result = document.getElementById('result');
                async function refresh() {
                    const resp = await fetch('/api/external/me/absences');
                    result.textContent = await resp.text();
                }
                document.getElementById('refresh').onclick = refresh;
                document.getElementById('logout').onclick = async () => {
                    await fetch('/api/external/logout', {method: 'POST'});
                    location.href = '/portal/login';
                };
                document.getElementById('create').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const data = Object.fromEntries(new FormData(e.target).entries());
                    const resp = await fetch('/api/external/me/absences', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(data)
                    });
                    result.textContent = await resp.text();
                    if (resp.ok) refresh();
                });
                refresh();
            </script>
        '''
        return HTMLResponse(_render_portal_shell(
            'TeamDB External Absences',
            body_html,
            script_html,
            admin_logged_in=_has_admin_session(request),
        ))


if __name__ == '__main__':
    import uvicorn

    logger.info('Starting Team DB Service')
    host = server_config.get('host', '127.0.0.1')
    port = int(server_config.get('port', 8765))
    uvicorn.run('teamdb:app', host=host, port=port, reload=False)
