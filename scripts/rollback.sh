#!/bin/bash
# -----------------------------------------------------------------------------
# rollback.sh
# Emergency Zero-Downtime Rollback Script.
# Immediately swaps traffic back to the previously running container.
# -----------------------------------------------------------------------------
set -e

APP_DIR="/home/ec2-user/app"
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"
NGINX_CONF="$APP_DIR/nginx/nginx.conf"

echo "⚠️  FactoPay Emergency Rollback Initiated..."

# 1. Determine currently active environment
if grep -q "server api_blue:3000" "$NGINX_CONF"; then
    ACTIVE="blue"
    PREVIOUS="green"
    PREVIOUS_PORT=3000
else
    ACTIVE="green"
    PREVIOUS="blue"
    PREVIOUS_PORT=3001
fi

echo "[1/3] Currently Active (Buggy): api_$ACTIVE"
echo "[2/3] Target Rollback Destination: api_$PREVIOUS"

# 2. Boot up the previous container (if it was stopped)
docker compose -f "$COMPOSE_FILE" start api_$PREVIOUS

# 3. Swap Nginx configuration back to the previous container
echo "[3/3] Updating Nginx routing upstream..."
sed -i "s/server api_$ACTIVE:3000/server api_$PREVIOUS:3000/" "$NGINX_CONF"
docker compose -f "$COMPOSE_FILE" exec -T nginx nginx -s reload

echo "✓ Traffic successfully rolled back to api_$PREVIOUS"

# 4. Stop the buggy container
docker compose -f "$COMPOSE_FILE" stop api_$ACTIVE

echo "⚠️  Rollback completed. Buggy container api_$ACTIVE has been shut down."
