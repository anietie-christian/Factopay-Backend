variable "aws_region" {
  type        = string
  description = "AWS region"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
}

variable "admin_ssh_ip" {
  type        = string
  description = "CIDR block allowed to access EC2 via SSH"
}
