variable "environment" {
  type = string
}

variable "bucket_name" {
  type        = string
  description = "Unique name for the S3 bucket"
}

resource "aws_s3_bucket" "kyc_storage" {
  bucket        = var.bucket_name
  force_destroy = true

  tags = {
    Name        = "factopay-${var.environment}-kyc-storage"
    Environment = var.environment
    Project     = "FactoPay"
    ManagedBy   = "Terraform"
  }
}

resource "aws_s3_bucket_public_access_block" "block_public" {
  bucket                  = aws_s3_bucket.kyc_storage.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "versioning" {
  bucket = aws_s3_bucket.kyc_storage.id
  versioning_configuration {
    status = "Enabled"
  }
}

output "bucket_name" {
  value = aws_s3_bucket.kyc_storage.id
}

output "bucket_arn" {
  value = aws_s3_bucket.kyc_storage.arn
}
