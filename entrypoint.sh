#!/bin/sh
set -e

# ──────────────────────────────────────────────────────────────
# PUID / PGID handling (LinuxServer.io / *-arr convention)
# Allows the container to run with the host user's UID/GID
# so that mounted volumes have correct ownership.
# ──────────────────────────────────────────────────────────────

PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "───────────────────────────────────────"
echo "  Preservarr — Starting container"
echo "  PUID: ${PUID}"
echo "  PGID: ${PGID}"
echo "───────────────────────────────────────"

# Adjust the preservarr group GID if it differs from PGID
CURRENT_GID=$(id -g preservarr)
if [ "$CURRENT_GID" != "$PGID" ]; then
  echo "Updating preservarr group GID from ${CURRENT_GID} to ${PGID}"
  groupmod -o -g "$PGID" preservarr
fi

# Adjust the preservarr user UID if it differs from PUID
CURRENT_UID=$(id -u preservarr)
if [ "$CURRENT_UID" != "$PUID" ]; then
  echo "Updating preservarr user UID from ${CURRENT_UID} to ${PUID}"
  usermod -o -u "$PUID" preservarr
fi

# Ensure the data directory exists and key directories are owned by the correct user
mkdir -p /app/data
chown preservarr:preservarr /app
chown -R preservarr:preservarr /app/data

# Drop root privileges and exec the CMD as preservarr
exec su-exec preservarr "$@"
