module "networking" {
  source       = "./modules/networking"
  aws_region   = var.aws_region
  environment  = var.environment
  admin_ssh_ip = var.admin_ssh_ip
}

module "iam" {
  source      = "./modules/iam"
  environment = var.environment
}

module "compute" {
  source               = "./modules/compute"
  instance_type        = var.instance_type
  subnet_id            = module.networking.public_subnet_id
  security_group_id    = module.networking.ec2_sg_id
  iam_instance_profile = module.iam.ec2_instance_profile_name
  environment          = var.environment
}

module "registry" {
  source      = "./modules/registry"
  environment = var.environment
}

module "database" {
  source            = "./modules/database"
  create_database   = var.create_database
  db_subnet_ids     = module.networking.private_subnet_ids
  security_group_id = module.networking.db_sg_id
  db_username       = var.db_username
  db_password       = var.db_password
  environment       = var.environment
}

module "storage" {
  source      = "./modules/storage"
  environment = var.environment
  bucket_name = var.s3_bucket_name
}

module "secrets" {
  source      = "./modules/secrets"
  environment = var.environment
}

module "oidc" {
  source               = "./modules/oidc"
  environment          = var.environment
  github_org           = var.github_org
  github_repo          = var.github_repo
  create_oidc_provider = var.create_oidc_provider
}
