variable "environment" {
  type = string
}

resource "aws_ecr_repository" "api_repo" {
  name                 = "factopay-api"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "factopay-api-repo"
    Environment = var.environment
    Project     = "FactoPay"
    ManagedBy   = "Terraform"
  }
}

output "repository_url" {
  value = aws_ecr_repository.api_repo.repository_url
}
