# Prometheus & Grafana Monitoring Guide

This guide details how to configure, run, and scale the production monitoring stack for the FactoPay Remittance Platform. It uses Prometheus (to store time-series performance metrics) and Grafana (to visualize host and container health).

---

## Architecture Overview

The monitoring stack consists of four core components:
1. **Node Exporter (Host Metrics)**: A lightweight daemon running on the EC2 host collecting CPU, memory, disk, and network stats.
2. **cAdvisor (Container Metrics)**: A Google-designed tool running as a Docker container on the EC2 host, tracking resource utilization per container.
3. **Prometheus (Time-Series Database)**: Scrapes metric endpoints and stores them.
4. **Grafana (Visualization Dashboard)**: Queries Prometheus and builds dashboards.

---

## Part 1: Local Monitoring via SSH Tunneling (Current Setup)

For the current `t3.micro` instance, running the database (Prometheus) and UI (Grafana) directly on the EC2 host will cause Out of Memory (OOM) crashes. Instead, the collectors run on EC2, and Prometheus/Grafana run locally on your development machine.

### Step 1: EC2 Host Setup (Exporters)
1. **Install Node Exporter**:
   SSH into the EC2 instance and run:
   ```bash
   wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
   tar -xvf node_exporter-1.7.0.linux-amd64.tar.gz
   cd node_exporter-1.7.0.linux-amd64
   nohup ./node_exporter > /dev/null 2>&1 &
   ```
   *Exposes system metrics locally on port 9100.*

2. **Install cAdvisor**:
   Run the cAdvisor container on the EC2 host:
   ```bash
   docker run \
     --volume=/:/rootfs:ro \
     --volume=/var/run:/var/run:ro \
     --volume=/sys:/sys:ro \
     --volume=/var/lib/docker/:/var/lib/docker:ro \
     --volume=/dev/disk/:/dev/disk:ro \
     --publish=8080:8080 \
     --detach=true \
     --name=cadvisor \
     --privileged \
     --device=/dev/kmsg \
     gcr.io/cadvisor/cadvisor:v0.47.2
   ```
   *Exposes container metrics locally on port 8080.*

### Step 2: Establish the Secure SSH Tunnel
Run the following command from your local Windows machine in a dedicated PowerShell window to forward the EC2 metrics ports to your local machine safely (replace with your active Elastic IP):
```powershell
ssh -i "C:\Users\USER\.ssh\factopay" -N -L 9100:localhost:9100 -L 8080:localhost:8080 ec2-user@<your_ec2_public_eip>
```
> [!NOTE]
> Keep this PowerShell terminal open. Closing it will tear down the tunnel and interrupt data ingestion in Grafana.

### Step 3: Run Prometheus and Grafana Locally
In your local monitoring directory (e.g., `C:\Users\USER\monitoring`), verify/create the following configuration files:

1. **`prometheus.yml`**:
   ```yaml
   global:
     scrape_interval: 15s

   scrape_configs:
     - job_name: 'ec2-host-metrics'
       static_configs:
         - targets: ['host.docker.internal:9100']

     - job_name: 'ec2-container-metrics'
       static_configs:
         - targets: ['host.docker.internal:8080']
   ```

2. **`docker-compose.yml`**:
   ```yaml
   services:
     prometheus:
       image: prom/prometheus:latest
       container_name: local_prometheus
       volumes:
         - ./prometheus.yml:/etc/prometheus/prometheus.yml
       ports:
         - "9090:9090"
       extra_hosts:
         - "host.docker.internal:host-gateway"
       restart: unless-stopped

     grafana:
       image: grafana/grafana:latest
       container_name: local_grafana
       ports:
         - "3000:3000"
       volumes:
         - grafana_storage:/var/lib/grafana
       restart: unless-stopped

   volumes:
     grafana_storage:
   ```

3. **Start the containers**:
   ```powershell
   docker compose up -d
   ```

### Step 4: Configure Grafana
1. Open **`http://localhost:3000`** (Login: `admin`/`admin`).
2. Add Prometheus as a Data Source:
   - Navigate to **Connections ➔ Data Sources ➔ Add data source ➔ Prometheus**.
   - Set URL to **`http://host.docker.internal:9090`** (or `http://prometheus:9090`).
   - Click **Save & test**.
3. Import Dashboards:
   - Go to **Dashboards ➔ Import**.
   - Input **`1860`** (Node Exporter Full) to visualize host CPU, memory, and disk.
   - Input **`14282`** (cAdvisor) to visualize container resource utilization.

---

## Part 2: Moving the Dashboard to the Server (Upon EC2 Upgrade)

If the EC2 instance is upgraded (e.g., to `t3.medium` or `t3.large` with 4GB+ RAM), you can run the entire Prometheus and Grafana stack directly on the EC2 host.

```
Client Web Browser ➔ [Port 3000] ➔ Grafana Container
  └── Query ➔ Prometheus Container
        ├── Scrape Port 9100 ➔ Node Exporter
        └── Scrape Port 8080 ➔ cAdvisor Container
```

### Step 1: Deploy Prometheus and Grafana on the EC2 Server
1. Create a directory `~/monitoring` on the EC2 instance.
2. Create `~/monitoring/prometheus.yml` on the EC2 server:
   ```yaml
   global:
     scrape_interval: 15s

   scrape_configs:
     - job_name: 'ec2-host-metrics'
       static_configs:
         - targets: ['localhost:9100'] # Metrics are now local to the EC2 host

     - job_name: 'ec2-container-metrics'
       static_configs:
         - targets: ['cadvisor:8080']  # Scraping directly via docker bridge network
   ```

3. Create `~/monitoring/docker-compose.yml` on the EC2 server:
   ```yaml
   services:
     prometheus:
       image: prom/prometheus:latest
       container_name: monitoring_prometheus
       volumes:
         - ./prometheus.yml:/etc/prometheus/prometheus.yml
         - prometheus_data:/prometheus
       network_mode: "host" # Allows scraping localhost:9100 directly
       restart: unless-stopped

     grafana:
       image: grafana/grafana:latest
       container_name: monitoring_grafana
       ports:
         - "127.0.0.1:3000:3000" # Bind to localhost to prevent public access
       volumes:
         - grafana_data:/var/lib/grafana
       restart: unless-stopped

   volumes:
     prometheus_data:
     grafana_data:
   ```

4. Run the stack:
   ```bash
   cd ~/monitoring
   docker compose up -d
   ```

### Step 2: Route Grafana securely through Nginx
Instead of exposing port 3000 directly to the public internet, proxy Grafana traffic through Nginx (port 80/443) with basic authentication or a subdomain.

Add the following block to your Nginx configurations:
```nginx
server {
    listen 80;
    server_name monitoring.factopay.com; # Replace with your subdomain

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then reload Nginx:
```bash
sudo systemctl reload nginx
```

---

## Security Hardening Checklists

- **AWS Security Groups**: Never expose ports 9090 (Prometheus), 9100 (Node Exporter), or 8080 (cAdvisor) to 0.0.0.0/0. Always access them via SSH tunnels or internal Docker networks.
- **Grafana Passwords**: Immediately update the default `admin`/`admin` credentials.
- **Nginx Protection**: If Grafana is exposed through Nginx to the public, enforce SSL (HTTPS) and consider setting up IP restrictions or basic auth to protect it.
