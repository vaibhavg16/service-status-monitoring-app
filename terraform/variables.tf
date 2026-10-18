variable "aws_region" {
  description = "AWS region everything is deployed into"
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Short name used to prefix/tag all resources"
  type        = string
  default     = "isitdown-india"
}

# ---- RDS ---------------------------------------------------------------
variable "db_master_username" {
  description = "RDS master username"
  type        = string
  default     = "postgres"
}

variable "db_master_password" {
  description = "RDS master password (letters and digits only, avoids URL-encoding issues)"
  type        = string
  sensitive   = true
}

variable "db_name" {
  description = "Initial database name"
  type        = string
  default     = "app_db"
}

variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "my_ip_cidr" {
  description = "Your current public IP in CIDR form (e.g. 152.59.57.76/32) — allows laptop access to RDS for migrations. Update this whenever your IP changes."
  type        = string
}

# ---- Elastic Beanstalk ---------------------------------------------------
variable "eb_instance_type" {
  type    = string
  default = "t3.micro"
}

# All the app's runtime environment variables (equivalent to your .env),
# except DATABASE_URL which is built automatically from the RDS resources
# below so it's always correct and in sync.
variable "app_env_vars" {
  description = "Extra environment variables for the app (AUTH_SECRET, RESEND_API_KEY, etc.)"
  type        = map(string)
  sensitive   = true
  default     = {}
}
