# FactoPay — AWS Cloud Architecture (Low-Cost MVP Edition)

**Classification:** CONFIDENTIAL · INTERNAL USE ONLY  
**Goal:** Under $30/Month Production-Ready Setup with Zero Security Compromises & Zero Downtime Deployments

---

## 1. High-Level Architecture Diagram

```
[ Internet Traffic ]
        │
        ▼ (Route 53 DNS & AWS WAF)
  [ CloudFront CDN ] (SSL/TLS Termination, Edge Caching)
        │
        ▼ (Port 80/443 - Restricted to CloudFront IP Prefix List)
┌─────────────────────────── AWS VPC ───────────────────────────┐
│                                                               │
│   ┌────────────────── Public Subnet ──────────────────────┐   │
│   │                                                       │   │
│   │   [ EC2 Instance ] (t3.micro / 1GB RAM / 2 vCPUs)     │   │
│   │                                                       │   │
│   │   ┌────────────────── Docker Compose ────────────────┐ │   │
│   │   │                                                  │ │   │
│   │   │  [ Nginx Proxy ] (Routes traffic atomically)     │ │   │
│   │   │         │                                        │ │   │
│   │   │         ├──▶ [ api_blue ] (Port 3000 / Active)   │ │   │
│   │   │         └──▶ [ api_green ] (Port 3001 / Standby) │ │   │
│   │   │                                                  │ │   │
│   │   │  [ Redis Server ] (Local Port 6379 - Cached state)│ │   │
│   │   │                                                  │ │   │
│   │   └──────────────────────────────────────────────────┘ │   │
│   │                                                       │   │
│   ├──────────────────────────┬────────────────────────────┘   │
│                              │ (Port 5432 - Secured)          │
│                              ▼                                │
│   ┌────────────────── Private Subnet ─────────────────────┐   │
│   │                                                       │   │
│   │   [ RDS PostgreSQL ] (db.t4g.micro - Graviton2)       │   │
│   │   - No public IP address                              │   │
│   │   - Accepts connections ONLY from EC2 Security Group   │   │
│   │                                                       │   │
│   └───────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Infrastructure Components & Cost Optimization

To achieve production-grade performance while maintaining a **sub-$30/month budget**, we implement co-located service topologies and a container-level Blue-Green deployment model:

### 2.1 Compute: AWS EC2 (t3.micro ARM64/x86)
- **Selection:** Run the application on a single AWS EC2 `t3.micro` instance (2 vCPUs, 1 GB RAM).
- **Cost:** ~$7.00 / month.
- **Optimization:** We do **not** use an AWS Application Load Balancer (ALB) in the MVP setup to save costs. Instead, incoming web traffic is proxy-routed through Amazon CloudFront directly to a containerized Nginx instance on the EC2 host.

### 2.2 Load Balancing & Zero-Downtime: Host-Level Nginx
- **Mechanism:** A local Nginx Docker container acts as a reverse proxy on the host. It balances traffic between two parallel API containers: `api_blue` (port 3000) and `api_green` (port 3001).
- **Blue-Green Deployments:** Pushing code triggers a script that:
  1. Pulls the latest image from ECR.
  2. Spawns the inactive color container.
  3. Runs migrations and performs local health checks.
  4. Swaps the Nginx configuration atomically and reloads Nginx (0 dropped requests, zero downtime).
  5. Stops the old version.
- **Cost:** **$0.00** (saves $16/month by avoiding AWS ALB).

### 2.3 Cache & Message Queue: Co-located Redis
- **Selection:** Runs a local `redis:7-alpine` Docker container on the same EC2 instance.
- **Latency Advantage:** Both the active API container and the Redis container run on the same virtual network bridge. Redis lookups resolve in **under 1 millisecond**.
- **Session Preservation:** During Blue-Green swaps, the Redis container is **never** stopped, ensuring zero logged-out sessions or lost webhook events.
- **Cost:** **$0.00** (saves ~$15/month relative to AWS ElastiCache).

### 2.4 Database: Amazon RDS PostgreSQL (Graviton2)
- **Selection:** `db.t4g.micro` instance (2 vCPU, 1 GB RAM, gp3 storage).
- **Cost:** ~$15.00 / month.
- **Optimization:** Multi-AZ deployment is disabled for early MVP. Daily automated snapshots are retained for 7 days to provide recovery points.

### 2.5 Networking: CloudFront Security Group Restriction
- **Security**: The EC2 instance security group ingress rule on port 80/443 is **restricted strictly to the AWS CloudFront Origin-Facing Managed Prefix List**.
- **Result**: Prevents direct scanner ingress to the EC2 server and ensures all traffic is filtered by CloudFront and AWS WAF before hitting our server, costing $0/month while maintaining a highly secure firewall perimeter.

---

## 3. Storage & Static Assets

- **S3 Standard Storage**: Used for KYC document uploads and transaction receipts.
- **Security**: Bucket access is configured with **Block Public Access**. Assets are accessed securely using short-lived **Presigned URLs** (15-minute expiry).
- **Cost**: ~$1.00 / month (pay-as-you-go).

---

## 4. Key Security Integrations (Low Cost)

| Service | Choice | Rationale | Cost |
|---|---|---|---|
| **SSL Certificates** | AWS Certificate Manager (ACM) | Automated, free SSL edge encryption via CloudFront | $0.00 |
| **Secrets Storage** | AWS Systems Manager Parameter Store | Free alternative to AWS Secrets Manager ($0.40/secret/mo) | $0.00 |
| **WAF / DDoS Protection** | AWS WAF & AWS Shield (Standard) | Protects CloudFront distribution from SQL injections and DDoS | $0.00 (Shield Standard is free; WAF is pay-as-you-go) |
| **Database Encryption** | AWS KMS Default Keys | Encrypts RDS volumes at rest | $0.00 |

---

## 5. Total Cost Estimation (MVP Launch)

| Component | Hourly Rate / Plan | Estimated Monthly Cost |
|---|---|---|
| **EC2 t3.micro Compute** | $0.010 | ~$7.00 |
| **RDS PostgreSQL (db.t4g.micro, gp3)** | $0.021 | ~$15.00 |
| **Co-located Redis Container** | Local | $0.00 |
| **Nginx Reverse Proxy Container** | Local | $0.00 |
| **Amazon S3 Storage** | Pay-as-you-go | ~$1.00 |
| **AWS CloudFront + ACM** | Free Tier | $0.00 |
| **AWS Shield + AWS WAF** | Pay-as-you-go | ~$3.00 |
| **AWS KMS & SSM Parameter Store** | Free Tiers | $0.00 |
| **Data Transfer Fees** | ~$0.09 / GB | ~$2.00 |
| **TOTAL ESTIMATED BUDGET** | — | **~$28.00 / Month** |

---

## 6. Scaling & Growth Roadmap

The architecture is designed to scale linearly as user traffic and transaction volumes grow. Below is the multi-phase roadmap to transition from a low-cost MVP to a high-availability enterprise system.

---

### Phase 1: Vertical Scale & High Availability (0 to 5,000 Active Users)
*Focus: Boost compute capacity and secure data redundancy with minimal configuration changes.*

* **Compute (Scale-Up)**:
  - Upgrade the single EC2 instance from `t3.micro` (1GB RAM, 2 vCPUs) to `t3.medium` (4GB RAM, 2 vCPUs).
  - Configure NestJS to run in cluster mode or boot 2 parallel API container instances to utilize both CPU cores.
* **Database (Multi-AZ Failover)**:
  - Enable **Multi-AZ Deployment** in the RDS PostgreSQL configuration. AWS will automatically provision and maintain a synchronous standby replica in a different Availability Zone.
  - Upgrade the database instance class to `db.t4g.small` (2GB RAM).
* **Cache & State**:
  - Keep Redis local/co-located on the EC2 host to preserve the <1ms latency.
  - Increase the Redis container memory cap to 512MB.
* **Est. Monthly AWS Cost**: **~$50.00 / month**

---

### Phase 2: Horizontal Scale & Decoupled State (5,000 to 30,000 Active Users)
*Focus: Eliminate single points of failure by distributing traffic and decoupling the session/queue state.*

```
             [ Public Internet ]
                      │
                      ▼
        [ AWS Route 53 / CloudFront ]
                      │
                      ▼
        [ AWS Application Load Balancer ]
           │                         │
           ▼                         ▼
  [ EC2 Instance 1 ]        [ EC2 Instance 2 ]
    (Subnet A)                (Subnet B)
           │                         │
           └───────────┬─────────────┘
                       ▼
         [ AWS ElastiCache Redis ] (Shared State)
                       │
                       ▼
         [ RDS PostgreSQL (Multi-AZ) ]
```

* **Compute (Scale-Out)**:
  - Provision an **AWS Application Load Balancer (ALB)**.
  - Deploy two EC2 instances running behind the ALB across two separate Availability Zones.
* **State Decoupling (Critical Step)**:
  - Since multiple API instances cannot share a local Redis container, migrate the cache/queue layer to a managed **AWS ElastiCache for Redis** (or a premium serverless Upstash tier).
  - This keeps idempotency locks, active sessions, and BullMQ payment retry jobs synchronized across all API hosts.
* **Database (Scale-Up)**:
  - Upgrade RDS to `db.t4g.medium` (4GB RAM) to support higher connection counts.
* **Network Isolation**:
  - Move the EC2 instances into **Private Subnets**.
  - Route outbound API calls through an AWS NAT Gateway (or a custom micro-NAT instance to save on NAT fees).
* **Est. Monthly AWS Cost**: **~$130.00 / month**

---

### Phase 3: Serverless Containers & Database Auto-Scaling (30,000+ Active Users)
*Focus: Move to fully managed, auto-scaling serverless infrastructure to support high-throughput global operations.*

* **Compute (AWS ECS Fargate)**:
  - Migrate from manually managed EC2 instances to **AWS ECS Fargate** (Serverless Containers).
  - Configure target tracking policies to automatically scale container tasks up and down based on CPU/Memory utilization thresholds.
* **Database (Amazon Aurora Serverless v2)**:
  - Migrate PostgreSQL to **Amazon Aurora Serverless v2**.
  - Aurora dynamically scales database capacity units (ACUs) up and down based on active transaction pressure, avoiding connection pool limits.
  - Add a **Read Replica** to offload read-heavy compliance reporting, audit trails, and administrative dashboards.
* **Security & DDoS Mitigation**:
  - Attach **AWS WAF (Web Application Firewall)** to the ALB to block SQL injections, cross-site scripting (XSS), and rate-limit anomalous IPs at the AWS edge.
* **Est. Monthly AWS Cost**: **~$250.00+ / month** (scales dynamically based on usage)

---

## 7. Migration Runbook: Transitioning to AWS ECS (Fargate) & ElastiCache

This section outlines the step-by-step procedure to migrate the FactoPay backend from the single-node EC2 instance to a fully managed, auto-scaled AWS ECS (Fargate) and Amazon ElastiCache (Redis) architecture.

### Step 1: Network Infrastructure Preparation (VPC)
1. **Private Subnet Provisioning**: Ensure your VPC has at least two private subnets across two different Availability Zones (AZs) for compute workloads, and two public subnets for the load balancer.
2. **NAT Gateway (or NAT Instance)**: Deploy a NAT Gateway in a public subnet to allow ECS Fargate tasks in the private subnets to download dependencies, access the Stellar Network, and reach external services (Flutterwave, Sumsub, Twilio).
3. **Security Groups Configuration**:
    * **ALB Security Group**: Allow ingress on `80/443` from CloudFront IP addresses (using the managed prefix list).
   * **ECS Tasks Security Group**: Allow ingress on port `3000` (API) strictly from the ALB Security Group. Allow all egress.
   * **RDS Security Group**: Add an ingress rule allowing port `5432` from the ECS Tasks Security Group.
   * **ElastiCache Security Group**: Allow ingress on port `6379` strictly from the ECS Tasks Security Group.

### Step 2: Provision AWS ElastiCache for Redis
1. **Creation**: Provision a managed Redis cluster in Amazon ElastiCache.
   * **Engine**: Redis OSS (version 7.x).
   * **Node Type**: `cache.t4g.micro` (sufficient for MVP scale) or `cache.t4g.small`.
   * **Subnet Group**: Group the private subnets in the VPC.
   * **Multi-AZ**: Enable only if strict high-availability is budgeted.
2. **Retrieve Endpoints**: Once provisioned, note the **Primary Endpoint** URL.
3. **SSM Parameter Update**: Update `REDIS_HOST` in the SSM Parameter Store with the ElastiCache Primary Endpoint address.

### Step 3: Containerize and Publish to AWS ECR
1. **ECR Repository**: Create a private Amazon ECR repository (e.g. `factopay-api`).
2. **Authentication**: Authenticate your CI/CD runner (GitHub Actions / GitLab CI) or local terminal to ECR:
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
   ```
3. **Build & Push**:
   ```bash
   docker build -t factopay-api:latest -f Dockerfile .
   docker tag factopay-api:latest <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/factopay-api:latest
   docker push <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/factopay-api:latest
   ```

### Step 4: Create ECS Task Definition and Service
1. **Execution IAM Role**: Create an ECS Task Execution Role (`ecsTaskExecutionRole`) and attach:
   * `AmazonECSTaskExecutionRolePolicy`
   * Inline permission to read secrets from AWS Systems Manager (SSM) Parameter Store:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Action": [
             "ssm:GetParameters",
             "secretsmanager:GetSecretValue"
           ],
           "Resource": "*"
         }
       ]
     }
     ```
2. **Task Definition Configuration**:
   * **Launch Type**: Fargate.
   * **CPU & RAM**: `0.25 vCPU` and `512MB RAM` (scale up as needed).
   * **Container Port Mapping**: Map port `3000` (TCP).
   * **Environment Variables (SSM Reference)**: Reference critical variables (`DATABASE_URL`, `REDIS_HOST`, Stellar secrets) directly from SSM Parameter Store instead of hardcoding them in the Task Definition.
3. **Create ECS Cluster & Service**:
   * Create an ECS Cluster (e.g., `factopay-cluster`).
   * Create a Service using the task definition. Set **Desired Tasks** to `2` for redundancy.
   * Configure the service to use the **ECS Tasks Security Group** and place tasks in the **VPC Private Subnets**.

### Step 5: Configure Application Load Balancer (ALB)
1. **Provision ALB**:
   * **Type**: Application Load Balancer.
   * **Scheme**: Internet-facing.
   * **Subnets**: Select the public subnets.
    * **Security Group**: ALB Security Group (CloudFront locked).
2. **Target Group Creation**:
   * **Target Type**: IP (required for Fargate).
   * **Protocol / Port**: HTTP / 3000.
   * **Health Check Path**: `/api/v1/admin/dashboard/health` (or basic root health check).
3. **Listeners**:
   * Map HTTP `80` to redirect to HTTPS `443`.
   * Map HTTPS `443` to forward traffic to the target group. Attach your domain's ACM SSL certificate.

### Step 6: Cutover and DNS Transition (Zero-Downtime)
1. **Warm Up**: Ensure the ECS tasks boot cleanly, connect successfully to RDS and ElastiCache, and pass ALB health checks.
2. **Double Write/Dual-State (Optional)**: If active sessions are cached in local EC2 Redis, users will have to re-login unless you run the old and new clusters simultaneously. Wait 10 minutes for any running background tasks on the EC2 host to finish.
3. **DNS Update**: Update your Alias record in AWS Route 53:
   * Point your backend API subdomain (e.g., `api.factopay.com`) from the EC2 Elastic IP address to the **AWS ALB DNS Name**.
4. **Monitoring**: Watch the RDS connection count, ALB HTTP status logs, and error telemetry (Sentry/CloudWatch) to ensure traffic flows smoothly to ECS.
5. **Teardown**: Once traffic is 100% routed through the ALB and ECS Fargate cluster, stop and terminate the old EC2 instance.

### Step 7: Database Migration from RDS to Amazon Aurora (PostgreSQL Cluster / Serverless v2)
When transaction volumes scale and you are ready to transition the standard RDS database to an Aurora cluster with minimal downtime:
1. **Provision Aurora Read Replica**:
   * Go to the AWS RDS console, select the primary `db.t4g.micro` PostgreSQL database.
   * Under **Actions**, select **Create Aurora Read Replica**.
   * Configure the target Aurora PostgreSQL DB Cluster (assign engine version compatibility, and specify either provisioned instances or Serverless v2 capacity ranges, e.g. 0.5–4.0 ACUs).
   * AWS will create a read replica and automatically sync data asynchronously.
2. **Monitor Replication Lag**:
   * Check the `ReplicaLag` metric in Amazon CloudWatch. Wait until the replication lag drops to `0`.
3. **Execute Cutover Window**:
   * Put your API in a temporary "Maintenance Mode" (or set ECS desired tasks to `0` temporarily) to stop write operations.
   * Wait for any final transactions to replicate (confirm replica lag remains at `0`).
   * Select the Aurora Read Replica cluster in the console and choose **Promote**. AWS will elevate the replica into a standalone, primary write-ready cluster (Writer endpoint).
4. **Update API Connection Endpoint**:
   * Update the `DATABASE_URL` variable in the SSM Parameter Store to point to the new Aurora Cluster Writer Endpoint.
   * Scale your ECS Fargate service tasks back up (or out of maintenance mode) to pick up the new database endpoint.
5. **Standard RDS Teardown**:
   * Once operations are confirmed healthy on Aurora, terminate the old standard RDS instance to save costs.

