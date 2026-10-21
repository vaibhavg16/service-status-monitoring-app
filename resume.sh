#!/usr/bin/env bash
# Recreates the AWS infrastructure (RDS + Elastic Beanstalk environment)
# and restores the database schema + seed data, in one run.
#
# Run this from the ROOT of your project repo:
#   ./resume.sh
#
# Requirements: aws CLI configured, terraform installed, node + npm deps
# installed, terraform.tfvars already filled in under ./terraform/

set -euo pipefail

echo "=============================================================="
echo " Step 1/4: Recreating AWS infrastructure with Terraform"
echo "=============================================================="
cd terraform
terraform init -input=false
terraform apply   # review the plan, type 'yes' to confirm

echo ""
echo "=============================================================="
echo " Step 2/4: Reading DATABASE_URL from Terraform output"
echo "=============================================================="
export DATABASE_URL
DATABASE_URL="$(terraform output -raw database_url)"
cd ..
echo "DATABASE_URL is set (hidden for safety)."

echo ""
echo "=============================================================="
echo " Step 3/4: Pushing schema + seeding the fresh database"
echo "=============================================================="
npx drizzle-kit push
node scripts/seed.mjs

echo ""
echo "=============================================================="
echo " Step 4/4: Infrastructure ready. Trigger a real app deploy:"
echo "=============================================================="
(cd terraform && echo "RDS endpoint:" && terraform output rds_endpoint && \
 echo "Beanstalk URL:" && terraform output elastic_beanstalk_url)

echo ""
echo "Run these two commands to redeploy your actual app code into the"
echo "fresh environment via your existing CI/CD pipeline:"
echo ""
echo "  git commit --allow-empty -m 'redeploy after infra recreate'"
echo "  git push origin main"
echo ""
echo "GitHub Actions will build, push to ECR, and deploy automatically."
echo "Done. ✅"
