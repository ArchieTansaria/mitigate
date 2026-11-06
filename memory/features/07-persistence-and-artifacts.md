# 07 — Durable jobs and evidence storage (PB-05)

services/api/src/db owns PostgreSQL migration/repository; artifacts/ owns filesystem and S3 content verification. Idempotency is tenant+key+payload; jobs use leased tokens, bounded attempts and stale-worker fences. Finishing a job requires retrievable intact evidence and clears current processing errors. Cleanup removes expired transient rows in bounded batches.

Validated against real local PostgreSQL, filesystem failures and the AWS SDK against a local HTTP fixture. Hosted S3 and real repair execution remain separate. Read PB-05 handoff; do not replace these with an in-memory queue or add a mark-pass endpoint.
