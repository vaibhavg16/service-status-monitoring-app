output "ecr_repository_uri" {
  value = data.aws_ecr_repository.app.repository_url
}

output "rds_endpoint" {
  value = aws_db_instance.app.address
}

output "database_url" {
  value     = local.database_url
  sensitive = true
}

output "elastic_beanstalk_url" {
  value = aws_elastic_beanstalk_environment.app.endpoint_url
}

# NOTE: no IAM access-key outputs here. The CI/CD IAM user
# ("github-actions-deploy") is intentionally outside Terraform's management
# (see the note in iam.tf).
