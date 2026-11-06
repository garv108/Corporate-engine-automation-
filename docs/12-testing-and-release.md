# Testing & Release
Test layers: unit, contract, integration, workflow positive/negative, security, model/agent evaluations and load tests.

Release gates: critical tests pass; no unresolved critical/high security findings; node schemas match deployed n8n version; sandbox report attached; approval recorded; deployment diff and rollback available; monitoring configured.

Rollback redeploys last approved workflow version and verifies health.
