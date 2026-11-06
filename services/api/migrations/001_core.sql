CREATE TABLE documents (
 id uuid PRIMARY KEY, owner text NOT NULL, kind text NOT NULL CHECK(kind IN ('inventory','manifest','scope')),
 digest text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(owner,kind,digest)
);
CREATE TABLE runs (
 id uuid PRIMARY KEY, owner text NOT NULL, idempotency_key text NOT NULL, request_digest text NOT NULL, request jsonb NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','succeeded','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), max_attempts integer NOT NULL CHECK(max_attempts BETWEEN 1 AND 10),
 lease_token uuid, lease_until timestamptz, artifact jsonb, error_code text, public_evidence boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner,idempotency_key), CHECK((state='running')=(lease_token IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK(state<>'succeeded' OR artifact IS NOT NULL)
);
CREATE INDEX runs_queue ON runs(state,created_at);
CREATE TABLE auth_challenges (
 id uuid PRIMARY KEY, address text NOT NULL, chain_id text NOT NULL, message text NOT NULL,
 expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE TABLE sessions (digest text PRIMARY KEY, owner text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE rate_limits (bucket text NOT NULL, minute bigint NOT NULL, count integer NOT NULL, PRIMARY KEY(bucket,minute));

CREATE INDEX challenges_expiry ON auth_challenges(expires_at);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX rate_expiry ON rate_limits(minute);
