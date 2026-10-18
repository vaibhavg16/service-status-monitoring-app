# =============================================================================
# PERMANENT, FREE, ALREADY-EXISTING resources — referenced read-only.
#
# These were created once (either by hand via the AWS console, or by AWS
# itself when you first set up Elastic Beanstalk and chose "create role").
# They cost nothing to leave running and never need to be destroyed or
# recreated, so instead of managing them as Terraform *resources* (which
# would try to CREATE a duplicate and fail with "already exists"), we look
# them up as *data sources* — read-only references with zero risk.
#
# Confirmed to match your account already:
#   aws-elasticbeanstalk-ec2-role, aws-elasticbeanstalk-service-role
# =============================================================================

data "aws_iam_role" "eb_ec2_role" {
  name = "aws-elasticbeanstalk-ec2-role"
}

data "aws_iam_instance_profile" "eb_ec2_profile" {
  name = "aws-elasticbeanstalk-ec2-role" # AWS console wizard names the profile the same as the role
}

data "aws_iam_role" "eb_service_role" {
  name = "aws-elasticbeanstalk-service-role"
}

# -----------------------------------------------------------------------------
# NOTE ON THE CI/CD IAM USER ("github-actions-deploy"):
#
# Deliberately NOT represented anywhere in this Terraform project. It's a
# free, permanent resource whose access key is already stored in your GitHub
# repo Secrets and used by the working CI/CD pipeline. If Terraform managed
# it, any future `apply` drift-correction could silently generate a NEW
# access key and break the pipeline (AWS never returns a key's secret value
# again after creation, so Terraform can't "put back" the old one). Leave it
# entirely out of scope — manage it by hand, forever, outside Terraform.
# -----------------------------------------------------------------------------
