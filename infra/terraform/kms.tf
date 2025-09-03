# KMS key for backup encryption and envelope encryption
resource "aws_kms_key" "backups" {
  description             = "LoanServe backups and data encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableIAMUserPermissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowBackupServiceAccess"
        Effect = "Allow"
        Principal = {
          Service = ["s3.amazonaws.com", "rds.amazonaws.com"]
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name        = "loanserve-backups"
    Environment = var.environment
    Purpose     = "backup-encryption"
  }
}

resource "aws_kms_alias" "backups" {
  name          = "alias/loanserve-backups-${var.environment}"
  target_key_id = aws_kms_key.backups.key_id
}

# KMS key for application-level encryption (PII, sensitive data)
resource "aws_kms_key" "application" {
  description             = "LoanServe application data encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  tags = {
    Name        = "loanserve-application"
    Environment = var.environment
    Purpose     = "application-encryption"
  }
}

resource "aws_kms_alias" "application" {
  name          = "alias/loanserve-application-${var.environment}"
  target_key_id = aws_kms_key.application.key_id
}

data "aws_caller_identity" "current" {}

# Outputs
output "backup_kms_key_arn" {
  description = "ARN of the backup KMS key"
  value       = aws_kms_key.backups.arn
}

output "backup_kms_key_id" {
  description = "ID of the backup KMS key"
  value       = aws_kms_key.backups.key_id
}

output "application_kms_key_arn" {
  description = "ARN of the application KMS key"
  value       = aws_kms_key.application.arn
}