# HashiCorp Vault — Removed

HashiCorp Vault was used in the previous federated learning implementation for secrets management and the cryptographic audit trail.

It has been removed from Cleanroom AI. Audit logging is now handled directly by the application database (`server/src/api/audit.py`). All audit records are written to the `audit_logs` table using an append-only pattern — the application never issues UPDATE or DELETE against this table.

For organizations requiring external SIEM integration, the `/audit/logs` API can be polled and forwarded to Splunk, Elastic, or other log management systems.
