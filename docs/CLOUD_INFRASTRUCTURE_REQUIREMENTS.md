# FactoPay Production Infrastructure & Dependency Requirements
**Prepared by:** Barabu Oscar Edem (Backend and DevOps Engineer)  
**Target:** FactoPay Management  
**Status:** Request for Provisioning  

---

## 1. Executive Summary

To deploy the FactoPay backend into a highly secure, resilient, and production-grade environment, management must provision a set of cloud resources (AWS) and third-party SaaS accounts. This architecture ensures **zero-downtime blue-green deployments**, **strict regulatory compliance (AML/KYC)**, and **impeccable transaction security** (with row-level locking and Redis-backed idempotency).

---

## 2. AWS Cloud Infrastructure Requirements

These resources are defined in our Terraform configuration (`/infra`) and must be provisioned within the target AWS production account.

| AWS Service | Production Specifications | Primary Business Purpose | Rationale & Security Profile |
| :--- | :--- | :--- | :--- |
| **AWS IAM** | Custom roles/policies | EC2 Instance authorization | Eliminates hardcoded credentials. EC2 uses IAM instance profiles to pull secrets and ECR images. |
| **AWS VPC & Networking** | VPC, 3 Subnets (1 Public, 2 Private), SG, Route Tables | Secure network isolation | Isolates database and backend cache from public ingress. API host is protected via strict ingress security groups. |
| **AWS EC2** | 1x `t3.medium` (or `t3.micro` min) | NestJS application hosting | Hosts the active and standby containers (`api_blue` & `api_green`) under an Nginx proxy. |
| **AWS ECR** | 1x Private Repository (`factopay-api`) | Docker image registry | Secure storage of compiled production application images with automatic vulnerability scanning on push. |
| **AWS S3** | 1x Private Bucket (e.g., `factopay-prod-kyc`) | KYC document storage | Secure, versioned storage for uploaded passport/ID documents. Access is locked down to VPC/IAM. |
| **AWS Secrets Manager** | 1x Secret Store (`factopay/prod/secrets`) | API key & database secret storage | Stores database credentials, webhook secrets, and SaaS API keys. Loaded dynamically on boot to prevent leakage. |
| **AWS Route 53** | 1x Public Hosted Zone (`factopay.com`) | DNS resolution | Handles DNS resolution pointing the backend subdomain to the CloudFront distribution. |
| **AWS ACM** | 1x Wildcard Certificate (`*.factopay.com`) | SSL/TLS edge encryption | Used by CloudFront to serve HTTPS traffic securely. |
| **AWS CloudFront** | 1x Content Delivery Network | Edge Proxy and CDN | Directs public requests to the EC2 host. Handles SSL handshake termination at the edge. |
| **AWS WAF** | 1x Web ACL | Application-level firewall | Blocks common SQL injections, XSS, and anomalous bot traffic at the CloudFront level. |
| **AWS RDS (PostgreSQL)** | Engine: 15.4 (`db.t4g.micro` or larger) | Core transaction ledger | Secure transactional ledger in private subnet. Database is isolated and accepts connections ONLY from the EC2 security group. |

---

## 3. Database & Cache Requirements

The application uses a dual database/cache pattern to guarantee high performance and double-entry transaction ledger integrity:

1. **Relational Database (PostgreSQL)**
   * **Provisioning**: AWS RDS PostgreSQL.
   * **Connection String requirements**:
     * `DATABASE_URL`: Must route through a connection pooler (e.g., PgBouncer) to support high concurrent client connections.
     * `DIRECT_URL`: Must connect directly to the database bypass pooler (used exclusively for migrations and row-level `SELECT ... FOR UPDATE` locks).
2. **Caching & Concurrency Lock Layer (Redis)**
   * **Self-Hosted Option (Current)**: Runs as a Docker container (`factopay_redis`) on the EC2 host.
   * **Managed Option (Recommended for Scale)**: AWS ElastiCache for Redis (t4g.micro cluster).
   * **Usage**: Manages temporary FX rate quotes (30-second expiry), API rate-limiting, and idempotency key locks.

---

## 4. Cryptographic & Security Keys (Production Setup)

These keys must be generated securely by DevOps/Security and populated inside **AWS Secrets Manager**:

* **`JWT_SECRET`**: High-entropy secret key used to sign and verify JSON Web Tokens (JWT) for user authentication sessions.
* **`STELLAR_WALLET_ENCRYPTION_KEY`**: A secure, 32-byte encryption key used to symmetrically encrypt users' Stellar private keys before saving them to the database. **CRITICAL: If this key is lost, all user wallet private keys become unrecoverable.**

---

## 5. Third-Party SaaS & External Account Requirements

The following external SaaS accounts and API credentials must be created and populated in **AWS Secrets Manager**:

### Communication & Verification Gateways
* **Sumsub (KYC)**:
  * Credentials: `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`
  * Purpose: End-user identity check state machine and document storage verification.
* **Twilio (SMS)**:
  * Credentials: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
  * Purpose: Delivery of SMS One-Time Passwords (OTP) for authentication and high-value transfers.
* **SendGrid (Email)**:
  * Credentials: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
  * Purpose: User notification and transaction receipt dispatches.
* **Social Auth Providers (Google & Apple)**:
  * Credentials: `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`
  * Purpose: Validates third-party JWT identity tokens during social signups/logins.

### Payment & Settlement Gateways
* **Stellar Blockchain Network (Mainnet)**:
  * Credentials:
    * `STELLAR_MASTER_PUBLIC` / `STELLAR_MASTER_SECRET`
    * `STELLAR_FEE_PUBLIC` / `STELLAR_FEE_SECRET`
    * `STELLAR_LIQUIDITY_PUBLIC` / `STELLAR_LIQUIDITY_SECRET`
    * `STELLAR_USDC_ISSUER_PUBLIC` / `STELLAR_USDC_ISSUER_SECRET` (For token issuances if issuer wallet is self-managed)
  * Purpose: Fueling operations, gas fee settlement, liquidity provisioning, and transaction execution.
* **Transak & Flutterwave (Inbound Webhooks)**:
  * Credentials: `PAYMENT_WEBHOOK_SECRET`
  * Purpose: Enforces strict HMAC-SHA256 signature verification for webhook payloads notifying of deposit/payout completions.
* **BullMQ Dashboard Admin Protection**:
  * Credentials: `BULL_BOARD_USER`, `BULL_BOARD_PASS`
  * Purpose: Basic auth protection for the background queue DLQ admin dashboard.

---

## 6. Security & Network Access Recommendations

To lock down the production environment, the following security policies should be approved by management:

* **Ingress Restriction**: EC2 instance ports 80/443 must only accept traffic originating from **AWS CloudFront IP addresses** (using the AWS CloudFront managed prefix list `com.amazonaws.global.cloudfront.origin-facing`). Public traffic is routed through CloudFront and AWS WAF to mitigate DDoS, enforce security rules, and handle SSL termination.
* **SSH Restriction**: Port 22 access to the EC2 host must be locked down to the developers' static IP address or managed via **AWS Systems Manager (SSM) Session Manager** (eliminating open SSH ports completely).
* **Secrets Separation**: Separate AWS Secrets Manager configurations must be used for `staging` and `production` to prevent environments from cross-contaminating.
