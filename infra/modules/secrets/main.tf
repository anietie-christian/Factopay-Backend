variable "environment" {
  type = string
}

resource "aws_secretsmanager_secret" "app_secrets" {
  name                    = "factopay/${var.environment}/secrets"
  recovery_window_in_days = 0 # Allows immediate deletion and recreation during dev/test phases

  tags = {
    Name        = "factopay-${var.environment}-secrets"
    Environment = var.environment
    Project     = "FactoPay"
    ManagedBy   = "Terraform"
  }
}

output "secret_arn" {
  value = aws_secretsmanager_secret.app_secrets.arn
}

output "secret_name" {
  value = aws_secretsmanager_secret.app_secrets.name
}
