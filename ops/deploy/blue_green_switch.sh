#!/usr/bin/env bash
set -euo pipefail

# Blue/Green deployment traffic switch script
NAMESPACE=${NAMESPACE:-default}
CURRENT_COLOR=${1:-}
NEW_COLOR=${2:-}

if [[ -z "$CURRENT_COLOR" ]] || [[ -z "$NEW_COLOR" ]]; then
  echo "Usage: $0 <current_color> <new_color>"
  echo "Example: $0 blue green"
  exit 1
fi

echo "[Deploy] Starting blue/green switch from $CURRENT_COLOR to $NEW_COLOR"

# Verify new deployment is ready
echo "[Deploy] Checking $NEW_COLOR deployment readiness..."
kubectl rollout status deployment/api-$NEW_COLOR -n $NAMESPACE --timeout=300s

# Verify health checks pass
echo "[Deploy] Running health checks on $NEW_COLOR..."
NEW_ENDPOINT=$(kubectl get svc api-$NEW_COLOR -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "localhost")

# Run health check
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 30 "http://$NEW_ENDPOINT/healthz" || echo "000")

if [[ "$HEALTH_CODE" != "200" ]]; then
  echo "[Deploy] ERROR: Health check failed for $NEW_COLOR deployment (status: $HEALTH_CODE)"
  exit 1
fi

# Update ingress/load balancer to point to new color
echo "[Deploy] Switching traffic to $NEW_COLOR..."

# Update the main service selector
kubectl patch service api-main -n $NAMESPACE -p \
  "{\"spec\":{\"selector\":{\"app\":\"loanserve\",\"color\":\"$NEW_COLOR\"}}}"

# Wait for traffic to stabilize
echo "[Deploy] Waiting for traffic to stabilize..."
sleep 30

# Verify traffic is flowing to new deployment
echo "[Deploy] Verifying traffic switch..."
VERIFY_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 30 "http://$NEW_ENDPOINT/healthz" || echo "000")

if [[ "$VERIFY_CODE" != "200" ]]; then
  echo "[Deploy] ERROR: Traffic verification failed, rolling back..."
  kubectl patch service api-main -n $NAMESPACE -p \
    "{\"spec\":{\"selector\":{\"app\":\"loanserve\",\"color\":\"$CURRENT_COLOR\"}}}"
  exit 1
fi

echo "[Deploy] Traffic successfully switched to $NEW_COLOR"

# Scale down old deployment (keep 1 replica for quick rollback)
echo "[Deploy] Scaling down $CURRENT_COLOR deployment..."
kubectl scale deployment api-$CURRENT_COLOR -n $NAMESPACE --replicas=1

echo "[Deploy] Blue/green deployment completed successfully"
echo "[Deploy] Active color: $NEW_COLOR"
echo "[Deploy] Standby color: $CURRENT_COLOR (scaled to 1 replica)"