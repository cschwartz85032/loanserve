# Blue/Green Deployment Guide

## Overview
This guide covers the blue/green deployment process for LoanServe Pro, ensuring zero-downtime deployments with automated rollback capabilities.

## Deployment Process

### 1. Pre-Deployment Checks

Before starting any deployment, verify:

```bash
# Check current deployment status
kubectl get deployments -n loanserve
kubectl get services -n loanserve

# Verify database migrations are ready
npm run db:check-migrations

# Check current traffic distribution
kubectl describe service api-main -n loanserve
```

### 2. Deploy to Inactive Color

If blue is currently active, deploy to green:

```bash
# Update green deployment
kubectl set image deployment/api-green api=loanserve/api:v1.2.3 -n loanserve

# Wait for rollout to complete
kubectl rollout status deployment/api-green -n loanserve --timeout=300s

# Verify green health
kubectl get pods -l color=green -n loanserve
```

### 3. Run Database Migrations (if needed)

For zero-downtime migrations, use the expand-contract pattern:

```bash
# Phase 1: Expand (add new columns/tables)
npm run db:migrate:expand

# Deploy application that works with both old and new schema
./ops/deploy/blue_green_switch.sh blue green

# Phase 2: Contract (remove old columns after traffic switch)
npm run db:migrate:contract
```

### 4. Switch Traffic

Use the automated switch script:

```bash
./ops/deploy/blue_green_switch.sh blue green
```

This script will:
- Verify green deployment health
- Switch traffic from blue to green
- Scale down blue deployment to 1 replica
- Validate traffic flow

### 5. Post-Deployment Validation

```bash
# Check application health
curl -f http://api.loanserve.io/healthz

# Verify key functionality
curl -f http://api.loanserve.io/api/loans/metrics

# Monitor error rates
kubectl logs -l color=green -n loanserve --tail=100
```

### 6. Rollback Procedure

If issues are detected, rollback immediately:

```bash
# Quick rollback to previous color
./ops/deploy/blue_green_switch.sh green blue

# Scale up blue deployment if needed
kubectl scale deployment api-blue -n loanserve --replicas=3

# Verify rollback success
curl -f http://api.loanserve.io/healthz
```

## Migration Patterns

### Safe Migration Pattern

1. **Expand Phase** - Add new schema elements without breaking existing code
2. **Deploy** - Application handles both old and new schema
3. **Contract Phase** - Remove old schema elements after traffic switch

Example:

```sql
-- Expand: Add new column
ALTER TABLE loans ADD COLUMN new_field TEXT;

-- Deploy application that writes to both old and new fields

-- Contract: Remove old column (in next release)
-- ALTER TABLE loans DROP COLUMN old_field;
```

### Dangerous Patterns to Avoid

❌ Never do in same deployment:
- DROP COLUMN
- RENAME COLUMN  
- Change column type
- Add NOT NULL constraints without defaults

✅ Safe operations:
- ADD COLUMN (with defaults)
- ADD INDEX
- CREATE TABLE
- ADD CONSTRAINT (not null)

## Monitoring During Deployment

### Key Metrics to Watch

```bash
# Response time and error rates
kubectl top pods -n loanserve

# Database connection pool
kubectl logs deployment/api-green -n loanserve | grep "pool"

# External service health
curl http://api.loanserve.io/healthz | jq '.checks[]'
```

### Automated Monitoring

The deployment script automatically checks:
- Health endpoint returns 200
- Database connectivity
- External service dependencies
- Response time < 2 seconds

## Emergency Procedures

### Complete Rollback

```bash
# Immediate traffic switch
kubectl patch service api-main -n loanserve -p \
  '{"spec":{"selector":{"color":"blue"}}}'

# Scale up blue if needed
kubectl scale deployment api-blue -n loanserve --replicas=3

# Verify services
kubectl get endpoints api-main -n loanserve
```

### Database Rollback

```bash
# For schema changes, may need PITR restore
aws rds restore-db-cluster-to-point-in-time \
  --db-cluster-identifier loanserve-prod-aurora-rollback \
  --source-db-cluster-identifier loanserve-prod-aurora \
  --restore-to-time "2025-10-01T10:00:00Z"

# Update connection strings to rollback cluster
kubectl patch secret loanserve-secrets -n loanserve \
  --type merge -p '{"data":{"DATABASE_URL":"<rollback-cluster-url>"}}'
```

### Maintenance Mode

If needed, enable maintenance mode:

```bash
# Set maintenance banner
kubectl patch configmap app-config -n loanserve \
  --type merge -p '{"data":{"MAINTENANCE_BANNER":"System maintenance in progress"}}'

# Scale down to minimal replicas
kubectl scale deployment api-blue api-green -n loanserve --replicas=1

# Serve static maintenance page
kubectl apply -f ops/k8s/maintenance-mode.yaml
```

## Feature Flags

Control feature rollout using environment variables:

```bash
# Enable new features gradually
kubectl patch deployment api-green -n loanserve -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"api","env":[{"name":"FEATURE_FLAGS_JSON","value":"{\"new_feature\":true}"}]}]}}}}'
```

## Troubleshooting

### Common Issues

**Health checks failing**
```bash
# Check pod logs
kubectl logs -l color=green -n loanserve

# Check resource limits
kubectl describe pods -l color=green -n loanserve

# Check database connectivity
kubectl exec -it deployment/api-green -n loanserve -- pg_isready -h $DB_HOST
```

**Traffic not switching**
```bash
# Verify service selector
kubectl get service api-main -n loanserve -o yaml

# Check endpoints
kubectl get endpoints api-main -n loanserve

# Verify ingress/load balancer
kubectl describe ingress api-ingress -n loanserve
```

**Performance degradation**
```bash
# Check resource usage
kubectl top pods -n loanserve

# Monitor database connections
kubectl logs deployment/api-green -n loanserve | grep "connection"

# Check external service latency
curl -w "@curl-format.txt" http://api.loanserve.io/healthz
```

## Deployment Checklist

### Pre-Deployment
- [ ] Code review completed
- [ ] Tests passing (unit, integration, e2e)
- [ ] Database migrations tested
- [ ] Security scan completed
- [ ] Feature flags configured
- [ ] Rollback plan documented

### During Deployment
- [ ] Inactive color deployment updated
- [ ] Health checks passing
- [ ] Database migrations executed
- [ ] Traffic switched successfully
- [ ] Key functionality verified
- [ ] Monitoring shows normal metrics

### Post-Deployment
- [ ] Application fully operational
- [ ] Error rates within normal range
- [ ] Performance metrics acceptable
- [ ] User acceptance confirmed
- [ ] Previous deployment scaled down
- [ ] Documentation updated