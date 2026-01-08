# Server install (systemd + nginx)

This document explains how to install and run the `teamdb` backend service using either a manual procedure or the provided turnkey installer script `server/install/install.sh`.

Files provided in the repo

- `server/install/install.sh` — interactive/non-interactive installer that writes a systemd unit and an nginx site, validates nginx, reloads it, and enables + restarts the systemd service.
- `server/install/systemd_runner.sh` — runner script invoked by the systemd unit; it activates a `.venv` if present and execs `python3 server/teamdb.py`.
- `server/install/teamdb.service` — systemd unit template (placeholders must be replaced if you install manually).
- `server/install/nginx_server.md` — example nginx location snippet.

Prerequisites

- An installed and running nginx server. On Debian/Ubuntu: `sudo apt install nginx`.
- A system user that will run the service (e.g. `planner`) or choose an existing user.
- The application code checked out to a directory (referred to below as `INSTALL_DIR`).
- Optional: a Python virtual environment placed at `INSTALL_DIR/.venv`.

Manual installation (step-by-step)

1. Choose directories and user:

   - `INSTALL_DIR` — absolute path to the checked-out repository (example: `/opt/successfactors-chrome-addon` or `/home/joe/development/successfactors-chrome-addon`).
   - `USER` — system user that will run the service (e.g. `planner` or `kpo`).
   - `PORT` — port the backend will listen on (default suggested: `8765`).
   - `NGINX_LOCATION` — URL prefix to expose the service (default: `/teamdb/`).

2. Update or create the runner script `server/install/systemd_runner.sh` if you changed the layout. The runner expects to be invoked with the environment variable `TEAMDB_INSTALL_DIR` set to your `INSTALL_DIR` and will activate `INSTALL_DIR/.venv` if present.

3. Install the systemd unit (as root):

   - Copy the template and edit placeholders:

     ```bash
     sudo cp server/install/teamdb.service /etc/systemd/system/teamdb.service
     sudoeditor /etc/systemd/system/teamdb.service
     # Replace %TEAMDB_USER% and %TEAMDB_INSTALL_DIR% with real values
     ```

   - Reload systemd and enable the service:

     ```bash
     sudo systemctl daemon-reload
     sudo systemctl enable --now teamdb
     sudo systemctl status teamdb
     sudo journalctl -u teamdb -n 200 --no-pager
     ```

4. Configure nginx (example site):

   - Create `/etc/nginx/sites-available/teamdb` with the following content (update `server_name`, `location` and `proxy_pass` if needed):

     ```nginx
     server {
         listen 80;
         server_name example.com; # or _ for catch-all

         location /teamdb/ {
             proxy_pass http://127.0.0.1:8765/;
             proxy_set_header Host $host;
             proxy_set_header X-Real-IP $remote_addr;
         }
     }
     ```

   - Enable the site and test nginx:

     ```bash
     sudo ln -s /etc/nginx/sites-available/teamdb /etc/nginx/sites-enabled/teamdb
     sudo nginx -t
     sudo systemctl reload nginx
     ```

Installer script (`server/install/install.sh`)

The provided `install.sh` automates the manual steps above. It:

- Writes `/etc/systemd/system/teamdb.service` with the `User` and `WorkingDirectory` set from the chosen `INSTALL_DIR` and `USER`.
- Writes an nginx site file to `/etc/nginx/sites-available/<site-name>` and symlinks it into `/etc/nginx/sites-enabled/`.
- Runs `nginx -t` and reloads nginx.
- Runs `systemctl daemon-reload`, enables and restarts the service, and prints status + recent journal output.

Usage examples

- Interactive (recommended):

  ```bash
  cd /path/to/repo
  sudo server/install/install.sh
  ```

- Non-interactive (explicit values):

  ```bash
  sudo server/install/install.sh --non-interactive --install-dir /opt/successfactors-chrome-addon --user planner --port 8765 --domain example.com --location /teamdb/ --site-name teamdb
  ```

Safety & backups

- The installer will back up any existing service unit or nginx site file to `/var/backups/teamdb-install-<timestamp>/` before overwriting.
- The installer validates the nginx configuration (`nginx -t`) before reloading; if the test fails it restores the previous site file from the backup.

Troubleshooting

- If the service fails to start: `sudo journalctl -u teamdb -n 200 --no-pager` and `sudo systemctl status teamdb`.
- If nginx fails to reload: run `sudo nginx -t` and inspect `/var/log/nginx/error.log`.
- Ensure `TEAMDB_INSTALL_DIR` matches the installed location and that `server/install/systemd_runner.sh` is executable.

Customization

- If you prefer a different virtualenv location, update `server/install/systemd_runner.sh` to source the desired `VENV_PATH` or export `TEAMDB_INSTALL_DIR` in the systemd unit.
- For SELinux-enabled systems you may need to configure appropriate policies for nginx to talk to the local socket/port.

If you want, I can:
- Add a `--dry-run` mode to the installer that prints intended changes without making them, or
- Add automatic creation of the service user if it doesn't exist.
