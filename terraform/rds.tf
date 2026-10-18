# Default VPC/subnets, same as what was used when this was set up by hand.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_db_subnet_group" "db" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_security_group" "db" {
  name        = "${var.project_name}-db-sg"
  description = "Allow Postgres from the app EC2 instance and your laptop"
  vpc_id      = data.aws_vpc.default.id

  # Your laptop (for running drizzle-kit push / seed scripts). Update
  # my_ip_cidr whenever your public IP changes, then `terraform apply`.
  ingress {
    description = "My laptop"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.my_ip_cidr]
  }

  # The Beanstalk EC2 instance's own security group (created below).
  ingress {
    description     = "Elastic Beanstalk app instance"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.eb_instance.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "app" {
  identifier     = "${var.project_name}-db"
  engine         = "postgres"
  engine_version = "17"
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 20 # disables storage autoscaling
  storage_type          = "gp3"

  db_name  = var.db_name
  username = var.db_master_username
  password = var.db_master_password

  db_subnet_group_name   = aws_db_subnet_group.db.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = true

  skip_final_snapshot = true # fine for a hackathon project; reconsider for real prod use

  tags = {
    Project = var.project_name
  }
}
