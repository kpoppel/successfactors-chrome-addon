#!/bin/bash

# Remember to update the file path:
#!/usr/bin/env bash
set -euo pipefail

# systemd runner script for teamdb
# This script is executed by the systemd unit. It expects to be located
# at: /path/to/successfactors-chrome-addon/server/install/systemd_runner.sh
# The script will change to the application directory, activate the virtualenv
# if present, and exec the teamdb server process.

APP_DIR="/opt/successfactors-chrome-addon"
VENV_DIR="${APP_DIR}/.venv"
TEAMDB_PY="${APP_DIR}/server/teamdb.py"

if [ -n "${TEAMDB_INSTALL_DIR:-}" ]; then
	APP_DIR="${TEAMDB_INSTALL_DIR}"
	VENV_DIR="${APP_DIR}/.venv"
	TEAMDB_PY="${APP_DIR}/server/teamdb.py"
fi

cd "$APP_DIR"

if [ -f "$VENV_DIR/bin/activate" ]; then
	# shellcheck disable=SC1091
	source "$VENV_DIR/bin/activate"
fi

exec python3 "$TEAMDB_PY"