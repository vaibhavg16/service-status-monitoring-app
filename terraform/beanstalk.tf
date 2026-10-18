resource "aws_security_group" "eb_instance" {
  name        = "${var.project_name}-eb-instance-sg"
  description = "Security group for the Elastic Beanstalk EC2 instance"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

// ---------------------------------------------------------------------------
// The "Application" is just a permanent, free container/shell — it already
// exists (created when you first set this up by hand) and isn't part of the
// tier you're pausing/resuming. There's no Terraform data source for it
// (the AWS provider doesn't expose one), so it needs ONE safe, one-time
// import instead of a fresh create:
//
//   terraform import aws_elastic_beanstalk_application.app isitdown-india
//
// Immediately after importing, run `terraform plan` — it MUST show
// "No changes." before you do anything else.
// ---------------------------------------------------------------------------
resource "aws_elastic_beanstalk_application" "app" {
  name = var.project_name
}

locals {
  # DATABASE_URL built automatically from the RDS resource above, with
  # sslmode=no-verify since RDS requires an encrypted connection.
  database_url = "postgresql://${var.db_master_username}:${var.db_master_password}@${aws_db_instance.app.address}:5432/${var.db_name}?sslmode=no-verify"

  # Merge the computed DATABASE_URL with whatever else is passed in
  # var.app_env_vars (AUTH_SECRET, RESEND_API_KEY, TELEGRAM_BOT_TOKEN, etc.)
  all_env_vars = merge(
    { DATABASE_URL = local.database_url },
    var.app_env_vars
  )
}

resource "aws_elastic_beanstalk_environment" "app" {
  name                = "${var.project_name}-env"
  application         = aws_elastic_beanstalk_application.app.name
  solution_stack_name = "64bit Amazon Linux 2023 v4.13.10 running Docker"

  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "EnvironmentType"
    value     = "SingleInstance"
  }

  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "ServiceRole"
    value     = data.aws_iam_role.eb_service_role.name
  }

  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "IamInstanceProfile"
    value     = data.aws_iam_instance_profile.eb_ec2_profile.name
  }

  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "InstanceType"
    value     = var.eb_instance_type
  }

  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "SecurityGroups"
    value     = aws_security_group.eb_instance.id
  }

  setting {
    namespace = "aws:ec2:vpc"
    name      = "VPCId"
    value     = data.aws_vpc.default.id
  }

  setting {
    namespace = "aws:ec2:vpc"
    name      = "Subnets"
    value     = join(",", data.aws_subnets.default.ids)
  }

  setting {
    namespace = "aws:elasticbeanstalk:healthreporting:system"
    name      = "SystemType"
    value     = "enhanced"
  }

  setting {
    namespace = "aws:elasticbeanstalk:application"
    name      = "Application Healthcheck URL"
    value     = "/api/health"
  }

  # --- Environment variables (the app's .env, minus REDIS_URL/WhatsApp which
  # were deliberately dropped; DATABASE_URL is computed above) -------------
  dynamic "setting" {
    for_each = local.all_env_vars
    content {
      namespace = "aws:elasticbeanstalk:application:environment"
      name      = setting.key
      value     = setting.value
    }
  }

  # Note: this provisions the environment's infrastructure only. The actual
  # app code/image is deployed by the existing GitHub Actions CI/CD pipeline
  # (.github/workflows/deploy.yml). Terraform = infrastructure, CI/CD = code.
  #
  # NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is a Next.js NEXT_PUBLIC_* variable
  # baked into the browser bundle at `docker build` time — setting it here
  # only affects server-side code. Client-side fix requires a Docker build
  # ARG in the CI workflow (known follow-up, not yet done).
}
