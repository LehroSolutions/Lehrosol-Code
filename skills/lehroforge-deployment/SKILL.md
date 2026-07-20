---
name: lehroforge-deployment
description: >
  Deploy LehroForge to production. Use when deploying the platform, configuring CI/CD pipelines,
  setting up Docker/Kubernetes, optimizing performance, or configuring production environments.
---

# LehroForge Deployment Guide

Deploy LehroForge from development to production securely.

## Deployment Options

### Docker (Recommended for most)
```bash
docker compose -f docker-compose.prod.yml up -d
```

### Kubernetes
```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

### Direct Node.js
```bash
# Build
pnpm install --frozen-lockfile
pnpm build

# PM2 (production process manager)
pm2 start dist/index.js --name lehroforge -i max
pm2 save
pm2 startup
```

## Pre-Deployment Checklist
Before deploying, verify:

- [ ] All tests passing (`pnpm test:all`)
- [ ] Security audit clean (`lehroforge security audit`)
- [ ] Secrets rotated for production
- [ ] SSL certificates installed
- [ ] Rate limits configured
- [ ] Monitoring dashboards active
- [ ] Backup schedule set
- [ ] Error alerts configured (email/Slack/PagerDuty)
- [ ] CORS origins restricted
- [ ] Load test passed (>1000 concurrent)

## Environment Configuration
```env
NODE_ENV=production
LEHROFORGE_PORT=3000

# Security
LEHROFORGE_SECRET=<32-byte-random-hex>
TLS_ENABLED=true
TLS_CERT_PATH=/etc/ssl/certs/lehroforge.pem
TLS_KEY_PATH=/etc/ssl/private/lehroforge.pem

# Agent Config
LLM_PROVIDER=openrouter
LLM_MODEL=qwen3.6-plus-free
AGENT_MAX_CONCURRENT=10

# Database (optional audit logs)
DATABASE_URL=postgresql://user:pass@localhost:5432/lehroforge

# Redis (rate limiting & caching)
REDIS_URL=redis://localhost:6379

# Monitoring
SENTRY_DSN=your-sentry-dsn
METRICS_ENABLED=true

# Security
AUDIT_LOG_ENABLED=true
AUDIT_LOG_RETENTION_DAYS=90
CORS_ORIGINS=https://yourdomain.com
RATE_LIMIT_ENABLED=true
MAX_REQUESTS_PER_MINUTE=100
```

## SSL/TLS Setup
```bash
# Let's Encrypt (free)
certbot certonly --standalone -d api.yourdomain.com -d app.yourdomain.com
```

## Monitoring Setup
Health check endpoint:
```bash
curl https://api.yourdomain.com/health
# Returns: status, uptime, connections, errorRate, avgResponseTime, memory
```

Grafana dashboards included for:
- API performance metrics
- Error rate tracking  
- Connection health monitoring
- Security alert feed
- Agent activity visualization

## Scaling Guidelines
| Users | Setup | Est. Cost/Month |
|-------|-------|-----------------|
| 1-10 | Single instance + Redis | $20 |
| 10-100 | 2-3 instances + load balancer | $80 |
| 100-1000 | Kubernetes cluster + DB | $300 |
| 1000+ | Multi-region + CDN | $800+ |

## Database Migration
```bash
# Apply schema migrations
lehroforge migrate --up

# Rollback if needed
lehroforge migrate --down 1

# Check current version
lehroforge migrate --status
```

## Backup & Recovery
```bash
# Manual backup
lehroforge backup create

# Restore
lehroforge backup restore --file 2026-03-31-backup.tar.gz

# Automated (cron)
0 2 * * * /usr/local/bin/lehroforge-backup.sh
```

## Post-Deployment Verification
```bash
# Health check
curl -f https://api.yourdomain.com/health

# Version check
curl https://api.yourdomain.com/version

# Test API connection
lehroforge test --production

# Monitor error rate for 1 hour
lehroforge monitor --duration=1h
```

## Rollback Procedure
If something goes wrong:
```bash
# Rollback to previous release
lehroforge rollback --to=previous

# Emergency shutdown
lehroforge shutdown --graceful
```
