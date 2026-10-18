# This ECR repository already exists and holds your pushed image history.
# Storage cost is a few cents a month regardless of whether the app is
# running — leave it alone forever. Referenced read-only, never recreated.
#
# Confirmed to match your account already: isitdown-india
data "aws_ecr_repository" "app" {
  name = var.project_name
}
