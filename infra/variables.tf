variable "aws_region" {
  type        = string
  description = "AWS region to deploy resources"
  default     = "us-east-1"
}

variable "environment" {
  type        = string
  description = "Target deployment environment (dev, staging, prod)"
  default     = "prod"
}

variable "instance_type" {
  type        = string
  description = "EC2 instance size for compute"
  default     = "t3.micro"
}

variable "admin_ssh_ip" {
  type        = string
  description = "Your personal IP address (CIDR block) allowed to access the server via SSH (e.g. 203.0.113.5/32)"
}

variable "create_database" {
  type        = bool
  description = "Set to true to provision AWS RDS database; set to false if using external Neon DB"
  default     = false
}

variable "db_username" {
  type        = string
  description = "Master username for RDS database"
  default     = "factopay_admin"
  sensitive   = true
}

variable "db_password" {
  type        = string
  description = "Master password for RDS database"
  default     = "securepasswordplaceholder123"
  sensitive   = true
}

variable "s3_bucket_name" {
  type        = string
  description = "Unique bucket name for KYC document storage"
}

variable "github_org" {
  type        = string
  description = "GitHub organization or username (e.g. anietie-christian)"
  default     = "anietie-christian"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository name (e.g. Factopay-Backend)"
  default     = "Factopay-Backend"
}

variable "create_oidc_provider" {
  type        = bool
  description = "Set to true to create the IAM OIDC provider. Set to false if it already exists in the AWS account."
  default     = true
}
