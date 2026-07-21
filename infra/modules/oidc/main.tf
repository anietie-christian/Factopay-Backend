variable "environment" {
  type = string
}

variable "github_org" {
  type        = string
  description = "GitHub organization or username"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository name"
}

variable "create_oidc_provider" {
  type        = bool
  description = "Set to true to create the IAM OIDC provider. Set to false if it already exists in the AWS account."
  default     = true
}

# 1. Create OIDC Provider for GitHub (create only once per AWS Account)
resource "aws_iam_openid_connect_provider" "github" {
  count           = var.create_oidc_provider ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"] # GitHub OIDC thumbprints
}

# We look up the provider ARN if it is not being created in this workspace
data "aws_iam_openid_connect_provider" "existing_github" {
  count = var.create_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.existing_github[0].arn
}

# 2. Create the IAM Role for GitHub Actions
resource "aws_iam_role" "github_actions_role" {
  name = "factopay-${var.environment}-github-actions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = local.oidc_provider_arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            # Only allow the specified repo and branch (dev or main) to assume this role
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/${var.environment == "prod" ? "main" : "dev"}"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "factopay-${var.environment}-github-actions-role"
    Environment = var.environment
    Project     = "FactoPay"
    ManagedBy   = "Terraform"
  }
}

# 3. Attach policies to the GitHub Actions Role
resource "aws_iam_policy" "github_actions_policy" {
  name        = "factopay-${var.environment}-github-actions-policy"
  description = "Policy for GitHub Actions deployment permissions"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECRAuth",
        Effect = "Allow",
        Action = [
          "ecr:GetAuthorizationToken"
        ],
        Resource = "*"
      },
      {
        Sid    = "ECRPush",
        Effect = "Allow",
        Action = [
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ],
        Resource = "*"
      }
    ]
  })

  tags = {
    Name        = "factopay-${var.environment}-github-actions-policy"
    Environment = var.environment
    Project     = "FactoPay"
    ManagedBy   = "Terraform"
  }
}

resource "aws_iam_role_policy_attachment" "github_actions_attach" {
  role       = aws_iam_role.github_actions_role.name
  policy_arn = aws_iam_policy.github_actions_policy.arn
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions_role.arn
}
