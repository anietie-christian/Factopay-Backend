# FactoPay — AWS Cloud Architecture (Low-Cost MVP Edition)
**Classification:** CONFIDENTIAL · INTERNAL USE ONLY  
**Goal:** Under $50/Month Production-Ready Setup with Zero Security Compromises  

---

## 1. High-Level Architecture Diagram

```
[ Internet Traffic ]
        │
        ▼ (Free SSL)
  [ Cloudflare ] (DNS, WAF, Edge Caching, CDN)
        │
        ▼ (Port 3000)
┌─────────────────────────── AWS VPC ───────────────────────────┐
│                                                               │
│   ┌────────────────── Public Subnet ──────────────────────┐   │
│   │                                                       │   │
│   │   [ ECS Fargate (NestJS API) ] (t4g.micro / 0.25 vCPU)│   │
│   │   - Restricts ingress to Cloudflare IPs only          │   │
│   │   - Handles dynamic transfers & validation            │   │
│   │                                                       │   │
│   └──────────────────────────┬────────────────────────────┘   │
│                              │ (Port 5432 - Secured)          │
│                              ▼                                │
│   ┌────────────────── Private Subnet ─────────────────────┐   │
│   │                                                       │   │
│   │   [ RDS PostgreSQL ] (db.t4g.micro - Graviton2)       │   │
│   │   - No public IP address                              │   │
│   │   - Accepts connections ONLY from ECS Security Group  │   │
│   │                                                       │   │
│   └───────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
                               │
                               ▼ (Public API Endpoint)
                 [ Upstash Serverless Redis ] (Cache & Queue)
```

---

## 2. Infrastructure Components & Cost Optimization

To achieve a production-ready compliance standard while maintaining a **sub-$50/month budget**, we implement specific AWS resource limits and pricing strategies:

### 2.1 Compute: AWS ECS on Fargate (Graviton ARM64)
- **Selection:** Run the NestJS Docker container on AWS ECS Fargate using the Graviton2 processor (`ARM64`).
- **Sizing:** Provision the smallest tier: `0.25 vCPU` and `0.5 GB RAM`.
- **Cost:** ~$8.00 / month.
- **Optimization:** We do **not** use an AWS Application Load Balancer (ALB), which costs ~$16/month. Instead, we use Cloudflare to route directly to the ECS container's public IP using a dynamic DNS update script, or use a single Fargate task with an Elastic IP.

### 2.2 Database: Amazon RDS PostgreSQL (Graviton2)
- **Selection:** `db.t4g.micro` instance (2 vCPU, 1 GB RAM).
- **Storage:** 20 GB General Purpose SSD (gp3).
- **Cost:** ~$15.00 / month.
- **Optimization:** Turn off "Multi-AZ Deployment" for development and early MVP. Daily automated snapshots provide adequate backup recovery for low-volume launches without doubling costs.

### 2.3 Cache & Message Queue: Upstash Redis (Serverless)
- **Selection:** Serverless Redis instead of AWS ElastiCache (which costs a minimum of ~$15/month).
- **Cost:** **Free Tier** (up to 10,000 commands per day). Pay-as-you-go thereafter ($0.20 per 100K commands).

### 2.4 Networking: The NAT Gateway Bypass
- **Problem:** A standard secure AWS architecture places servers in private subnets and uses NAT Gateways to fetch external data (Stellar API, KYC docs). AWS NAT Gateways cost **$32/month** each.
- **Solution:** Place the ECS Fargate container in a **Public Subnet**, but completely lock it down:
  - Attach a Security Group that **only** allows incoming traffic on port `3000` from Cloudflare IP addresses.
  - The database remains isolated in a **Private Subnet** and accepts connections *only* from the ECS Fargate task's security group.
  - **Result:** $0/month networking charges while maintaining a strict firewall perimeter.

### 2.5 Why We Avoid AWS Lambda (The Serverless Connection Trap)
While AWS Lambda is appealing for "scale-to-zero" cost savings, it introduces two severe bottlenecks for this specific technology stack (NestJS + Prisma + Postgres):

1. **The Database Connection Pool Exhaustion:**
   - Lambda is ephemeral and scales by spawning new isolated containers for concurrent requests.
   - Prisma ORM establishes a connection pool (default: 5 connections) *per container*.
   - A low-cost RDS Postgres database (`db.t4g.micro`) has a maximum limit of **80 concurrent connections**.
   - If 15 concurrent Lambda instances spin up, they will open up to 75 connections and instantly exhaust the database pool, causing API crashes (`Too many connections` errors).
   - **The Fix is Expensive:** To resolve this, AWS requires provisioning **AWS RDS Proxy**, which costs a minimum of **$15.00/month** per Database vCPU. This eliminates the serverless cost advantage.
2. **NestJS Bootstrapping & Cold Starts:**
   - A clean DDD NestJS project boot-up requires resolving Dependency Injections and loading module boundaries, taking **1 to 2.5 seconds** on cold start. This latency is highly undesirable for real-time checkout / remittance operations.
3. **Persistent Connections:**
   - Real-time transactions (polling on Stellar ledger payments, Webhook queues) are better served by persistent containerized services.

**Conclusion:** ECS Fargate maintains a steady, single connection pool (which we cap at 10 database connections), guarantees zero cold starts, and costs a predictable ~$8/month without needing RDS Proxy.

---

## 3. Storage & Static Assets

- **S3 Standard Storage:** Used for KYC document uploads and transaction receipts.
- **Security:** Bucket access must be set to **Block Public Access**. Documents are accessed securely via **Presigned URLs** generated with temporary permissions (15-minute expiry).
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
| **ECS Fargate (0.25 vCPU, 0.5GB)** | $0.011 | ~$8.00 |
| **RDS PostgreSQL (db.t4g.micro, gp3)** | $0.021 | ~$15.00 |
| **Upstash Redis** | Serverless | $0.00 (Free Tier) |
| **Amazon S3 (20GB Storage + Requests)**| Pay-as-you-go | ~$1.00 |
| **Cloudflare DNS + SSL + Proxy** | Free Tier | $0.00 |
| **AWS KMS & SSM Parameter Store** | Free Tiers | $0.00 |
| **Data Transfer Fees** | ~$0.09 / GB | ~$2.00 |
| **TOTAL ESTIMATED BUDGET** | — | **~$26.00 / Month** |

---

## 6. Testing-to-Production Upgrade Path

The beauty of this architecture is that **you start with a minimal footprint ($26/mo) and scale up linearly** as traffic and compliance needs grow, without rewriting a single line of application code:

```
[ MVP Testing Stage: $26/mo ] ──▶ [ Live Launch: ~$90/mo ] ──▶ [ Enterprise Scale: ~$250+/mo ]
- 1x ECS Task (0.25 vCPU)          - 2x ECS Tasks (0.50 vCPU)      - Auto-scaled ECS Tasks (ARM64)
- RDS db.t4g.micro (Single-AZ)     - RDS db.t4g.small (Multi-AZ)   - RDS db.m6g.large (Multi-AZ + Replica)
- Upstash Free Tier Redis          - Upstash Paid Tier Redis       - AWS ElastiCache Serverless
- Direct Cloudflare Routing        - AWS ALB Load Balancer         - AWS ALB + AWS WAF Enterprise
```

### 6.1 Upgrade Checkpoints

1. **Step 1: High Availability (Multi-AZ Database)**
   - *Action:* Modify the RDS database configuration in AWS Console and check `Enable Multi-AZ`.
   - *Impact:* AWS automatically provisions a hot-standby database replica in a separate availability zone. In case of primary failure, RDS fails over in under 60 seconds with **zero data loss**.
   - *Cost Change:* Doubles RDS cost from ~$15/mo to ~$30/mo.

2. **Step 2: Load Balancing & Scaling (ALB Integration)**
   - *Action:* Provision an AWS Application Load Balancer (ALB) and place the ECS Fargate tasks behind it.
   - *Impact:* You can now scale the API from 1 task to 10+ tasks automatically based on CPU usage. The ALB handles traffic distribution and health check routing.
   - *Cost Change:* Adds ~$16/mo for ALB + Fargate task usage scale.

3. **Step 3: Private Subnet Migration (Enterprise compliance)**
   - *Action:* Provision two AWS NAT Gateways and route Fargate outgoing traffic through them. Move Fargate tasks into private subnets.
   - *Impact:* Restricts direct internet access to Fargate containers. Meets strict enterprise security audit requirements (SOC 2, ISO 27001).
   - *Cost Change:* Adds ~$64/mo (for two NAT Gateways).

4. **Step 4: Scale Database Resources**
   - *Action:* Change RDS instance class (e.g., from `db.t4g.micro` to `db.m6g.large` or higher).
   - *Impact:* Increases RAM from 1GB to 8GB+ to handle hundreds of concurrent SQL connections.
   - *Cost Change:* Upgrades to ~$60 - $120/mo.

