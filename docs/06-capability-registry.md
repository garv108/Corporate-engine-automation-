# Capability Registry
Registry entities: n8n node, node schema, connector, API endpoint, MCP server/tool, Skill and workflow template.

Categories: triggers, communication, AI/LLM, transformation, databases, storage, CRM/ERP/HRMS, finance, marketing, research, control flow, developer tools, security and utilities.

Required metadata: id, provider, package, node_type, category, version, platform_version_range, operation, parameter_schema, credential_schema_ref, input/output schema, docs_url, source_ref, license, verified_at, status and risk_level.

Synchronize against the installed n8n instance and package versions. Mark deprecated/removed capabilities. Never use model memory as a substitute for live schema retrieval.

Third-party templates, repositories, MCP servers and Skills are untrusted until provenance, license, permissions and security are reviewed.
