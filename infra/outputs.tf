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
