#!/usr/bin/env bash
# One-shot start: local Docker stack + AWS demo environment + app deploy.
# Run from the ROOT of the repo:  ./start.sh
set -euo pipefail

echo "=== [1/6] Starting local stack (app, postgres, redis, prometheus, grafana) ==="
docker compose up -d --build

echo "=== [2/6] Updating terraform.tfvars with your current public IP ==="
MY_IP="$(curl -4 -s ifconfig.me)"
sed -i "s/^my_ip_cidr = .*/my_ip_cidr = \"${MY_IP}\/32\"/" terraform/terraform.tfvars
echo "my_ip_cidr set to ${MY_IP}/32"

echo "=== [3/6] Provisioning AWS infrastructure (RDS + Elastic Beanstalk) ==="
cd terraform
terraform init -input=false
terraform apply -auto-approve
export DATABASE_URL
DATABASE_URL="$(terraform output -raw database_url)"
cd ..

echo "=== [4/6] Pushing schema + seeding the fresh AWS database ==="
npx drizzle-kit push
node scripts/seed.mjs

echo "=== [5/6] Triggering CI/CD deploy to Elastic Beanstalk ==="
git commit --allow-empty -m "redeploy after infra recreate"
git push origin main

echo "=== [6/6] Done ==="
echo "Local app:  http://localhost:3000"
echo "Grafana:    http://localhost:3001"
echo "AWS app (wait ~5 min for GitHub Actions to deploy):"
(cd terraform && terraform output elastic_beanstalk_cname)
