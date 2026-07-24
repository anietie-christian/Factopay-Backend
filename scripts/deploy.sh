# ----------------------------------------------------------------------------------------------------------------#*eddiere
#!/bin/bash
# -----------------------------------------------------------------------------
# deploy.sh
# Automated Zero-Downtime Container-Level Blue-Green Deployment Script.
# Runs on the EC2 production instance.
# -----------------------------------------------------------------------------
set -e

APP_DIR="/home/ec2-user/app"
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"
NGINX_CONF="$APP_DIR/nginx/nginx.conf"
DEPLOY_LOCK="/tmp/factopay-deploy.lock"

# 1. Acquire file lock to prevent concurrent deployment collisions
exec 200>$DEPLOY_LOCK
flock -n 200 || { echo "❌ Deployment failed: Another deploy process is currently running."; exit 1; }

echo "=== FactoPay Zero-Downtime Deployment Started ==="

# 2. Determine currently active environment from Nginx configuration
if grep -q "server api_blue:3000" "$NGINX_CONF"; then
    ACTIVE="blue"
    INACTIVE="green"
    INACTIVE_PORT=3001
else
    ACTIVE="green"
    INACTIVE="blue"
    INACTIVE_PORT=3000
fi

echo "[1/6] Active Environment: $ACTIVE"
echo "[2/6] Standby Target: $INACTIVE (Port: $INACTIVE_PORT)"

# 3. Pull latest image from ECR
echo "[3/6] Pulling latest production container layers from AWS ECR..."
docker compose -f "$COMPOSE_FILE" pull api_$INACTIVE

# 4. Spin up the standby container
echo "[4/6] Booting up new standby container: api_$INACTIVE..."
docker compose -f "$COMPOSE_FILE" up -d api_$INACTIVE

# 5. Run Prisma database migrations inside the newly booted container
echo "[5/6] Running Prisma database migrations in the new container..."
docker compose -f "$COMPOSE_FILE" exec -T api_$INACTIVE npx prisma migrate deploy

# 6. Verify health of the standby container before routing traffic to it
echo "[6/6] Verifying health checks of the new container..."
HEALTHY=false
for i in {1..12}; do
    # Fetch health check status (adjust endpoint to match your app status check)
    STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$INACTIVE_PORT/api/v1/kyc/status || true)
    if [ "$STATUS_CODE" -eq 200 ] || [ "$STATUS_CODE" -eq 401 ]; then # Auth endpoints returning 401 is also alive
        HEALTHY=true
        break
    fi
    echo "Waiting for container startup (Attempt $i/12, status: $STATUS_CODE)..."
    sleep 5
done

if [ "$HEALTHY" = false ]; then
    echo "❌ Deployment failed: Standby container api_$INACTIVE failed to pass health checks."
    # Gracefully stop the failed container
    docker compose -f "$COMPOSE_FILE" stop api_$INACTIVE
    exit 1
fi

echo "✓ Standby container verified healthy. Initiating Nginx proxy routing swap..."

# 7. Update Nginx configuration and reload atomically
sed -i "s/server api_$ACTIVE:3000/server api_$INACTIVE:3000/" "$NGINX_CONF"
docker compose -f "$COMPOSE_FILE" exec -T nginx nginx -s reload

echo "✓ Traffic successfully routed to new container: api_$INACTIVE"

# 8. Stop the previous active container
echo "Stopping old active container: api_$ACTIVE..."
docker compose -f "$COMPOSE_FILE" stop api_$ACTIVE

# 9. Clean up dangling images older than 72 hours to prevent disk bloating
echo "Pruning dangling Docker images..."
docker image prune -a --filter "until=72h" -f

echo "=== FactoPay Deployment Completed Successfully ==="
