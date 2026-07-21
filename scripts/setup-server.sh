#!/bin/bash
# -----------------------------------------------------------------------------
# setup-server.sh
# One-time initialization script to configure the EC2 host for FactoPay deployment.
# -----------------------------------------------------------------------------
set -e

echo "=== Starting FactoPay Host Provisioning ==="

# 1. Create directory structures
mkdir -p ~/app/logs
mkdir -p ~/app/nginx

# 2. Generate the base Nginx configuration template if it doesn't exist
if [ ! -f ~/app/nginx/nginx.conf ]; then
    echo "Creating base Nginx configuration..."
    cat << 'EOF' > ~/app/nginx/nginx.conf
events { worker_connections 1024; }

http {
    upstream backend {
        # Defaults to routing traffic to api_blue
        server api_blue:3000;
        # server api_green:3000; # Standby container
    }

    server {
        listen 80;

        location / {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /docs {
            proxy_pass http://backend/docs;
            proxy_set_header Host $host;
        }
    }
}
EOF
fi

# 3. Create the production docker-compose.prod.yml if it doesn't exist
if [ ! -f ~/app/docker-compose.prod.yml ]; then
    echo "Creating base docker-compose.prod.yml..."
    cat << 'EOF' > ~/app/docker-compose.prod.yml
version: '3.8'

services:
  # ---------------------------------------------
  # Shared state broker (Redis)
  # ---------------------------------------------
  redis:
    image: redis:7-alpine
    container_name: factopay_redis
    command: redis-server --appendonly yes
    deploy:
      resources:
        limits:
          memory: 128M
    volumes:
      - redis_data:/data
    networks:
      - factopay_net
    restart: always

  # ---------------------------------------------
  # Twin API Services (Blue / Green)
  # ---------------------------------------------
  api_blue:
    image: ${ECR_REPO_URL}:latest
    container_name: factopay_api_blue
    expose:
      - "3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: ${DATABASE_URL}
      DIRECT_URL: ${DIRECT_URL}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      AWS_SECRETS_MANAGER_NAME: ${AWS_SECRETS_MANAGER_NAME}
      AWS_REGION: ${AWS_REGION}
    deploy:
      resources:
        limits:
          memory: 450M
    depends_on:
      - redis
    networks:
      - factopay_net
    restart: always

  api_green:
    image: ${ECR_REPO_URL}:latest
    container_name: factopay_api_green
    expose:
      - "3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: ${DATABASE_URL}
      DIRECT_URL: ${DIRECT_URL}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      AWS_SECRETS_MANAGER_NAME: ${AWS_SECRETS_MANAGER_NAME}
      AWS_REGION: ${AWS_REGION}
    deploy:
      resources:
        limits:
          memory: 450M
    depends_on:
      - redis
    networks:
      - factopay_net
    restart: always

  # ---------------------------------------------
  # Nginx Gateway Routing Proxy
  # ---------------------------------------------
  nginx:
    image: nginx:alpine
    container_name: factopay_nginx
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - api_blue
      - api_green
    networks:
      - factopay_net
    restart: always

networks:
  factopay_net:
    name: factopay_network

volumes:
  redis_data:
EOF
fi

# 4. Pull base helper images and launch the background Redis state broker
echo "Starting persistent Redis container..."
docker compose -f ~/app/docker-compose.prod.yml up -d redis

echo "=== Host Setup Completed Successfully ==="
