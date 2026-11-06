# Environment Matrix
| Environment | Data | Secrets | Deployment |
|---|---|---|---|
| Local | Synthetic | Local-only | Manual |
| Development | Synthetic/test tenant | Scoped dev | CI |
| Staging | Masked/synthetic | Staging vault | CI + approval |
| Production | Tenant-controlled | Production vault | Explicit approval |

Production secrets must never be copied into local or sandbox environments.
