# Backend outage and recovery

Unavailable verification is unassessed. It is not a failed repair, failed claim, or supplier-attributed result.

## API or worker interruption

Check `/health` and the configured service logs. If the API is unavailable, retry only after it is healthy. If the API is healthy but a run remains `queued`, treat that as a pending job; the worker may be stopped or disconnected. Restart the worker using `pnpm worker:start`. The durable queue and lease recovery resume eligible work. A succeeded job means execution completed; read its evidence assertions to determine pass, fail, unknown or unsupported.

## Evidence storage interruption

An evidence reference in the run record means the job recorded an artifact digest; it does not guarantee the artifact can currently be fetched. `GET /v1/runs/:id/evidence` returns `503 ARTIFACT_UNAVAILABLE_OR_CORRUPT` when the configured store cannot return verified bytes. Restore the configured filesystem/S3 store, then retry the same evidence request. Preserve the run's recorded state and do not infer an assertion result from storage availability.

## RPC, CRE and CCIP interruption

The campaign indexer and authenticated acceptance route are not yet integrated. No API campaign status should be inferred while those interfaces are unavailable or unconfigured. PB-21 evaluation output is non-settlement evidence; CRE simulation, DON execution, forwarder delivery, CCIP transport, receiver processing and final Arc campaign state are distinct stages. Do not manually substitute one stage for another.

For an already deployed campaign, its direct contract challenge, review-timeout, withdrawal and supplier recovery paths remain contract-authoritative and do not depend on the API. Use the configured Arc wallet/chain and read the resulting transaction and contract state; API/database records do not mint approvals or payments.

## Reorg and configuration changes

PB-22 indexer rollback is not implemented yet. Until it is, do not treat a database record as final chain state; use finalized onchain reads and preserve the observed block number/hash separately from current state. No reorg recovery or claim-revocation behavior is claimed by this runbook.
