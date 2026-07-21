output "api_server_public_ip" {
  value       = module.compute.public_ip
  description = "The Elastic IP address of the FactoPay API EC2 host"
}

output "ecr_repository_url" {
  value       = module.registry.repository_url
  description = "The AWS ECR Repository URL to push your Docker NestJS image to"
}

output "database_endpoint" {
  value       = module.database.endpoint
  description = "The connection endpoint for the AWS RDS instance"
}

output "secrets_manager_name" {
  value       = module.secrets.secret_name
  description = "The name of the AWS Secrets Manager Secret container"
}

output "secrets_manager_arn" {
  value       = module.secrets.secret_arn
  description = "The ARN of the AWS Secrets Manager Secret container"
}

output "github_actions_role_arn" {
  value       = module.oidc.github_actions_role_arn
  description = "The IAM Role ARN that GitHub Actions must assume to deploy"
}
