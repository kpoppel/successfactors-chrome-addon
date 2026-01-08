#!/bin/bash

# Remember to update the file path:
cd <path-to>/successfactors-chrome-addon
git pull origin main
source .venv/bin/activate
exec python3 server/teamdb.py