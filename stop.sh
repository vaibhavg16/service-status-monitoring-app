#!/usr/bin/env bash
# One-shot stop: shuts down local stack AND destroys all AWS resources
# so you are NOT billed while the project is idle.
# Run from the ROOT of the repo:  ./stop.sh
set -euo pipefail

echo "=== [1/2] Stopping local Docker stack ==="
docker compose down

echo "=== [2/2] Destroying AWS infrastructure (RDS + Elastic Beanstalk) ==="
cd terraform
terraform destroy -auto-approve
cd ..

echo "Done. Local containers stopped and ALL AWS resources destroyed — no ongoing AWS billing."
