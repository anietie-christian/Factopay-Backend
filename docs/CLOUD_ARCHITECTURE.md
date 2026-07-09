# FactoPay — AWS Cloud Architecture (Low-Cost MVP Edition)

**Classification:** CONFIDENTIAL · INTERNAL USE ONLY  
**Goal:** Under $30/Month Production-Ready Setup with Zero Security Compromises & Zero Downtime Deployments

---

## 1. High-Level Architecture Diagram

```
[ Internet Traffic ]
        │
        ▼ (Free SSL / WAF)
  [ Cloudflare ] (DNS, Edge Caching, CDN)
        │
        ▼ (Port 80/443 - Restricted to Cloudflare IPs)
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
│   └──────────────────────────┬────────────────────────────┘   │
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
- **Optimization:** We do **not** use an AWS Application Load Balancer (ALB), which adds a ~$16/month baseline charge. Instead, incoming web traffic (port 80/443) goes directly to a containerized Nginx instance on the EC2 host.

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
- **Latency Advantage:** Both the active API container and the Redis container run on the same virtual network bridge. Redis lookups for FX quote locks, idempotency checks, and BullMQ background queues resolve in **under 1 millisecond** (compared to 10-15ms for external serverless Redis).
- **Session Preservation:** During Blue-Green swaps, the Redis container is **never** stopped. State remains intact, ensuring zero logged-out sessions or lost webhook events during deployments.
- **Cost:** **$0.00** (saves ~$15/month relative to AWS ElastiCache).

### 2.4 Database: Amazon RDS PostgreSQL (Graviton2)
- **Selection:** `db.t4g.micro` instance (2 vCPU, 1 GB RAM, gp3 storage).
- **Cost:** ~$15.00 / month.
- **Optimization:** Multi-AZ deployment is disabled for early MVP. Daily automated snapshots are retained for 7 days to provide recovery points.

### 2.5 Networking: The NAT Gateway Bypass
- **Problem:** Placed in private subnets, servers require NAT Gateways to make outgoing internet requests (e.g. communicating with Stellar endpoints or Sumsub verification SDKs). NAT Gateways cost **$32/month** each.
- **Solution:** Place the EC2 instance in a **Public Subnet**, but lock down its security group:
  - Ingress on port 80/443 is **restricted strictly to Cloudflare's public IP ranges**.
  - Ingress on port 22 (SSH) is limited to admin/developer IP addresses.
  - The database remains isolated in a **Private Subnet** and accepts connections *only* from the EC2 instance's security group.
  - **Result:** $0/month networking charges while maintaining a strict firewall perimeter.

---

## 3. Storage & Static Assets

- **S3 Standard Storage:** Used for KYC document uploads and transaction receipts.
- **Security:** Bucket access is configured with **Block Public Access**. Assets are accessed securely using short-lived **Presigned URLs** (15-minute expiry).
- **Cost:** ~$1.00 / month (pay-as-you-go).

---

## 4. Key Security Integrations (Low Cost)

| Service | Choice | Rationale | Cost |
|---|---|---|---|
| **SSL Certificates** | Cloudflare SSL | Automated, free SSL edge encryption | $0.00 |
| **Secrets Storage** | AWS Systems Manager Parameter Store | Free alternative to AWS Secrets Manager ($0.40/secret/mo) | $0.00 |
| **WAF / DDoS Protection** | Cloudflare Free Tier | Prevents SQL injections, rate-limits bad actors at the edge | $0.00 |
| **Database Encryption** | AWS KMS Default Keys | Encrypts RDS volumes at rest | $0.00 |

---

## 5. Total Cost Estimation (MVP Launch)

| Component | Hourly Rate | Estimated Monthly Cost |
|---|---|---|
| **EC2 t3.micro Compute** | $0.010 | ~$7.00 |
| **RDS PostgreSQL (db.t4g.micro, gp3)** | $0.021 | ~$15.00 |
| **Co-located Redis Container** | Local | $0.00 |
| **Nginx Reverse Proxy Container** | Local | $0.00 |
| **Amazon S3 Storage** | Pay-as-you-go | ~$1.00 |
| **Cloudflare DNS + SSL + Proxy** | Free Tier | $0.00 |
| **AWS KMS & SSM Parameter Store** | Free Tiers | $0.00 |
| **Data Transfer Fees** | ~$0.09 / GB | ~$2.00 |
| **TOTAL ESTIMATED BUDGET** | — | **~$25.00 / Month** |

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
               [ Cloudflare ]
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

