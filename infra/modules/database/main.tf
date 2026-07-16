variable "create_database" {
  type = bool
}

variable "db_subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  type = string
}

variable "db_username" {
  type      = string
  sensitive = true
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "environment" {
  type = string
}

resource "aws_db_subnet_group" "db_subnets" {
  count      = var.create_database ? 1 : 0
  name       = "factopay-${var.environment}-db-subnet-group"
  subnet_ids = var.db_subnet_ids

  tags = {
    Name        = "factopay-${var.environment}-db-subnet-group"
    Environment = var.environment
    Project     = "FactoPay"
    ManagedBy   = "Terraform"
  }
}

resource "aws_db_instance" "postgres" {
  count                  = var.create_database ? 1 : 0
  identifier             = "factopay-${var.environment}-db"
  allocated_storage      = 20
  max_allocated_storage  = 100
  engine                 = "postgres"
  engine_version         = "15.4"
  instance_class         = "db.t4g.micro"
  db_name                = "factopay"
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.db_subnets[0].name
  vpc_security_group_ids = [var.security_group_id]
  skip_final_snapshot    = true
  publicly_accessible    = false

  tags = {
    Name        = "factopay-${var.environment}-db"
    Environment = var.environment
    Project     = "FactoPay"
    ManagedBy   = "Terraform"
  }
}

output "endpoint" {
  value = var.create_database ? aws_db_instance.postgres[0].endpoint : "No database provisioned (using external Neon DB)"
}
