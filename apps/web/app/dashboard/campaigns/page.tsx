"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Hex, toHex } from "viem";
import {
  actionAvailability,
  type CampaignAction,
  type CampaignClaim,
  type CampaignSnapshot,
  campaignAddress,
  claimStatusNames,
  hash32,
  parseClaimBundle,
  parseFundingAmount,
  readCampaignConfig,
  sameAddress,
  tokenAmount,
} from "../../../lib/campaign";
import {
  campaignClient,
  campaignError,
  loadCampaign,
  loadCampaignClaim,
  type PreparedCampaignAction,
  prepareCampaignAction,
  sendCampaignAction,
} from "../../../lib/campaign-chain";
import { useWallet } from "../../../lib/wallet";
import styles from "./campaigns.module.css";

function short(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
function time(value: bigint) {
  if (value === BigInt(0)) return "Not set";
  if (value > BigInt(8640000000000)) return `${value.toString()} Unix seconds`;
  return new Date(Number(value) * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className={styles.metric}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </div>
  );
}
function Confirmation({
  prepared,
  busy,
  onCancel,
  onConfirm,
}: {
  prepared: PreparedCampaignAction;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      aria-labelledby="transaction-title"
    >
      <p className="eyebrow">Review transaction</p>
      <h2 id="transaction-title">{prepared.transaction.title}</h2>
      <p>{prepared.transaction.detail}</p>
      <dl>
        <Detail label="Network">Chain {prepared.snapshot.chainId}</Detail>
        <Detail label="From">
          <code>{prepared.account}</code>
        </Detail>
        <Detail label="Contract">
          <code>{prepared.transaction.to}</code>
        </Detail>
        <Detail label="Native value">
          0 · network fees are set by your wallet
        </Detail>
        <Detail label="Simulation block">
          {prepared.snapshot.blockNumber.toString()}
        </Detail>
      </dl>
      <details>
        <summary>View exact calldata</summary>
        <code className={styles.calldata}>{prepared.transaction.data}</code>
      </details>
      <p className={styles.hint}>
        State and wallet permissions are checked again before signing. A
        successful simulation cannot guarantee a later transaction.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Waiting for wallet…" : "Confirm in wallet"}
        </button>
      </div>
    </dialog>
  );
}

type TransactionState = {
  hash: Hex;
  address: string;
  state: "pending" | "confirmed" | "reverted" | "cancelled" | "replaced";
  block?: bigint;
};
export default function CampaignsPage() {
  const wallet = useWallet();
  const connection = useMemo(() => {
    try {
      const config = readCampaignConfig(
        process.env.NEXT_PUBLIC_ARC_RPC_URL,
        process.env.NEXT_PUBLIC_ARC_CHAIN_ID,
      );
      return { config, client: campaignClient(config), error: null };
    } catch (error) {
      return { config: null, client: null, error: campaignError(error) };
    }
  }, []);
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState("");
  const [snapshot, setSnapshot] = useState<CampaignSnapshot | null>(null);
  const [claim, setClaim] = useState<CampaignClaim | null>(null);
  const [key, setKey] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [receipt, setReceipt] = useState("");
  const [tab, setTab] = useState<"overview" | "claims" | "policy">("overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [prepared, setPrepared] = useState<PreparedCampaignAction | null>(null);
  const [transaction, setTransaction] = useState<TransactionState | null>(null);
  const revision = useRef(0);
  const context = useRef({
    selected,
    address: wallet.address,
    chainId: wallet.chainId,
  });
  context.current = {
    selected,
    address: wallet.address,
    chainId: wallet.chainId,
  };
  const claimKey = useRef("");
  claimKey.current = claim?.key ?? "";
  useEffect(() => {
    const address = new URLSearchParams(window.location.search).get("address");
    if (address) {
      setInput(address);
      try {
        setSelected(campaignAddress(address));
      } catch (e) {
        setError(campaignError(e));
      }
    }
  }, []);
  const refresh = useCallback(
    async (
      address = context.current.selected,
      lookup = claimKey.current,
      minimumBlock?: bigint,
    ) => {
      if (!connection.client || !connection.config || !address) return;
      const ticket = ++revision.current;
      setPrepared(null);
      setError("");
      setBusy("Reading chain state…");
      setSnapshot(null);
      setClaim(null);
      try {
        const s = await loadCampaign(
          connection.client,
          connection.config,
          address,
          context.current.address,
        );
        if (minimumBlock !== undefined && s.blockNumber < minimumBlock)
          throw new Error(
            "RPC is behind the confirmed transaction. Refresh to read its resulting state.",
          );
        const c = lookup
          ? await loadCampaignClaim(connection.client, s, lookup)
          : null;
        if (ticket !== revision.current) return;
        setSnapshot(s);
        setClaim(c);
      } catch (e) {
        if (ticket === revision.current) setError(campaignError(e));
      } finally {
        if (ticket === revision.current) setBusy("");
      }
    },
    [connection],
  );
  // An account/network change invalidates any old role gates and prepared transaction.
  useEffect(() => {
    context.current = {
      selected,
      address: wallet.address,
      chainId: wallet.chainId,
    };
    ++revision.current;
    setPrepared(null);
    setSnapshot(null);
    setClaim(null);
    setBusy("");
    if (selected) void refresh(selected, "");
    return () => {
      ++revision.current;
    };
  }, [selected, wallet.address, wallet.chainId, refresh]);
  const mismatch = Boolean(
    wallet.address &&
      connection.config &&
      wallet.chainId !== String(connection.config.chainId),
  );
  const permissions = snapshot
    ? actionAvailability(snapshot, wallet.address, claim)
    : null;
  const disabled = Boolean(busy || mismatch || !wallet.address);
  function openCampaign(event: FormEvent) {
    event.preventDefault();
    try {
      const address = campaignAddress(input.trim());
      setError("");
      if (address === selected) void refresh(address, "");
      else {
        setSelected(address);
        setClaim(null);
        setKey("");
        setAmount("");
        setReceipt("");
        setTab("overview");
      }
    } catch (e) {
      setError(campaignError(e));
    }
  }
  async function preview(action: CampaignAction) {
    if (!snapshot || !connection.client || !connection.config) return;
    const ticket = ++revision.current;
    setError("");
    setPrepared(null);
    setBusy("Checking permissions and simulating…");
    try {
      const result = await prepareCampaignAction(
        connection.client,
        connection.config,
        wallet,
        snapshot.address,
        action,
      );
      if (ticket === revision.current) {
        setPrepared(result);
        setSnapshot(result.snapshot);
        if ("claim" in result.action) setClaim(result.action.claim);
      }
    } catch (e) {
      if (ticket === revision.current) setError(campaignError(e));
    } finally {
      if (ticket === revision.current) setBusy("");
    }
  }
  async function checkTransaction(tx: TransactionState) {
    if (!connection.client) return;
    setBusy("Waiting for onchain confirmation…");
    setError("");
    try {
      let replacement: "cancelled" | "replaced" | undefined;
      const result = await connection.client.waitForTransactionReceipt({
        hash: tx.hash,
        confirmations: 1,
        timeout: 90000,
        onReplaced: (info) => {
          if (info.reason !== "repriced") replacement = info.reason;
        },
      });
      setTransaction({
        ...tx,
        hash: result.transactionHash,
        state:
          replacement ??
          (result.status === "success" ? "confirmed" : "reverted"),
        block: result.blockNumber,
      });
      if (context.current.selected.toLowerCase() === tx.address.toLowerCase())
        await refresh(tx.address, claimKey.current, result.blockNumber);
    } catch (e) {
      setError(campaignError(e));
    } finally {
      setBusy("");
    }
  }
  async function confirm() {
    if (!prepared || !connection.client || !connection.config) return;
    const reviewed = prepared;
    setBusy("Confirm the transaction in your wallet…");
    setError("");
    try {
      const hash = await sendCampaignAction(
        connection.client,
        connection.config,
        wallet,
        reviewed,
      );
      const tx: TransactionState = {
        hash,
        address: reviewed.snapshot.address,
        state: "pending",
      };
      setTransaction(tx);
      setPrepared(null);
      await checkTransaction(tx);
    } catch (e) {
      setPrepared(null);
      setError(campaignError(e));
    } finally {
      setBusy("");
    }
  }
  function fund(kind: "approve" | "fund" | "resetAllowance") {
    try {
      if (!snapshot) return;
      void preview({
        kind,
        amount:
          kind === "resetAllowance"
            ? BigInt(0)
            : parseFundingAmount(amount, snapshot.policy.tokenDecimals),
      });
    } catch (e) {
      setError(campaignError(e));
    }
  }
  function submitReceipt() {
    try {
      if (snapshot)
        void preview({
          kind: "submitClaim",
          bundle: parseClaimBundle(receipt, snapshot),
        });
    } catch (e) {
      setError(campaignError(e));
    }
  }
  async function importReceipt(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 65536) throw new Error("Receipt bundle exceeds 64 KiB.");
      setReceipt(await file.text());
      setError("");
    } catch (e) {
      setError(campaignError(e));
    }
  }
  async function switchChain() {
    try {
      if (connection.config)
        await wallet.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: toHex(connection.config.chainId) }],
        });
    } catch {
      setError(
        "Wallet could not switch networks. Add or select the configured Arc network in your wallet, then retry.",
      );
    }
  }
  let parsedReceipt: ReturnType<typeof parseClaimBundle> | null = null;
  let receiptError = "";
  if (receipt && snapshot) {
    try {
      parsedReceipt = parseClaimBundle(receipt, snapshot);
    } catch (e) {
      receiptError = campaignError(e);
    }
  }
  const fundedPercent =
    snapshot && snapshot.requiredFunding > BigInt(0)
      ? Number(
          (snapshot.accounting.deposited * BigInt(10000)) /
            snapshot.requiredFunding,
        ) / 100
      : 0;
  const campaignState = snapshot
    ? snapshot.timestamp >= snapshot.policy.claimDeadline
      ? "Claims closed"
      : snapshot.active
        ? "Active campaign"
        : "Awaiting activation"
    : "Read from Arc";
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">Arc / Campaign settlement</p>
          <h1 className="page-title">
            Campaigns<span className={styles.dot}>.</span>
          </h1>
          <p className="page-subtitle">
            Follow the funding. Verify the claim. Release the grant.
          </p>
        </div>
        <span className="status-pill">
          {connection.config
            ? `Chain ${connection.config.chainId}`
            : "Connection unavailable"}
        </span>
      </header>
      <form className={`surface ${styles.lookup}`} onSubmit={openCampaign}>
        <div className={styles.grow}>
          <label htmlFor="campaign-address">Open a campaign</label>
          <input
            id="campaign-address"
            className="field"
            placeholder="Campaign contract address · 0x…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
            disabled={Boolean(busy)}
            aria-describedby="campaign-address-help"
          />
          <p id="campaign-address-help" className={styles.hint}>
            Use an existing RemediationCampaign contract address supplied by the
            campaign organizer.
          </p>
        </div>
        <button
          className="btn-primary"
          disabled={!connection.config || Boolean(busy)}
          type="submit"
        >
          Open campaign <span aria-hidden="true">↗</span>
        </button>
      </form>
      {connection.error && (
        <div className="notice" role="status">
          {connection.error} Use a public RPC endpoint; public environment
          values are visible in the browser.
        </div>
      )}
      {error && (
        <div className={`${styles.error} notice`} role="alert">
          {error}
        </div>
      )}
      {busy && (
        <p role="status" className={styles.activity}>
          <span className={styles.pulse} />
          {busy}
        </p>
      )}
      {transaction && (
        <div className={`notice ${styles.transaction}`} role="status">
          <strong>Transaction {transaction.state}</strong>
          <code>{transaction.hash}</code>
          <span>
            Campaign {short(transaction.address)}
            {transaction.block
              ? ` · Block ${transaction.block}`
              : " · Confirmation is not yet established."}
          </span>
          {transaction.state === "pending" && (
            <button
              className="btn-secondary"
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void checkTransaction(transaction)}
            >
              Check confirmation
            </button>
          )}
          {(transaction.state === "cancelled" ||
            transaction.state === "replaced") && (
            <p>
              Your wallet replaced this transaction. The original campaign
              action is not confirmed; inspect the replacement and refreshed
              state.
            </p>
          )}
          {transaction.state === "reverted" && (
            <p>
              The transaction reverted. No campaign action was applied. Review
              refreshed state before retrying.
            </p>
          )}
        </div>
      )}
      {!snapshot && !busy && (
        <section className={`surface ${styles.empty}`}>
          <div className={styles.orbit} aria-hidden="true">
            ↗
          </div>
          <p className="eyebrow">Grants backed by chain state</p>
          <h2>Every campaign starts with a commitment.</h2>
          <p>
            Open a contract to see its fixed terms, tracked budget, and claim
            lifecycle. Reads are public. Connect your wallet when you are ready
            to act.
          </p>
          <div className={styles.steps}>
            <div>
              <b>01</b>
              <strong>Fund</strong>
              <span>The supplier deposits the campaign budget.</span>
            </div>
            <div>
              <b>02</b>
              <strong>Verify & claim</strong>
              <span>A scoped receipt reserves one eligible grant.</span>
            </div>
            <div>
              <b>03</b>
              <strong>Settle</strong>
              <span>Review completes before the recipient withdraws.</span>
            </div>
          </div>
          <p className={styles.hint}>
            No campaign address or deployment is assumed. Campaign creation is
            handled by the deployment workflow.
          </p>
        </section>
      )}
      {snapshot && (
        <>
          <section className={`surface ${styles.summary}`}>
            <div className={styles.summaryTop}>
              <div>
                <span className={styles.liveDot} />
                <span className="eyebrow">{campaignState}</span>
                <h2>Campaign {short(snapshot.policy.campaignId)}</h2>
                <code className={styles.break}>{snapshot.address}</code>
              </div>
              <button
                className="btn-secondary"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void refresh()}
              >
                ↻ Refresh state
              </button>
            </div>
            <div className={styles.progressTitle}>
              <span>Tracked funding</span>
              <span>
                {tokenAmount(snapshot.accounting.deposited)} /{" "}
                {tokenAmount(snapshot.requiredFunding)} tokens
              </span>
            </div>
            <progress
              max={100}
              value={fundedPercent}
              aria-label="Campaign funding"
            />
            <div className={styles.meta}>
              <span>
                Fixed grant{" "}
                <b>{tokenAmount(snapshot.policy.grantAmount)} tokens</b>
              </span>
              <span>
                Eligible deployments{" "}
                <b>{snapshot.policy.eligibleCount.toString()}</b>
              </span>
              <span>
                Claim deadline <b>{time(snapshot.policy.claimDeadline)}</b>
              </span>
            </div>
            <p className={styles.hint}>
              Token {snapshot.policy.token} · {snapshot.policy.tokenDecimals}{" "}
              decimals. Verify the contract and token addresses with the
              organizer.
            </p>
          </section>
          <div className={styles.metrics}>
            <Metric
              label="Unallocated"
              value={tokenAmount(snapshot.accounting.unallocated)}
              note="Available for eligible claims"
            />
            <Metric
              label="Reserved"
              value={tokenAmount(snapshot.accounting.reserved)}
              note="Pending challenge or review"
            />
            <Metric
              label="Awarded"
              value={tokenAmount(snapshot.accounting.awardedUnwithdrawn)}
              note="Ready for recipients to withdraw"
            />
            <Metric
              label="Paid out"
              value={tokenAmount(snapshot.accounting.paid)}
              note="Recorded grant withdrawals"
            />
          </div>
          <div className={styles.readAt}>
            <span>
              Read at block <b>{snapshot.blockNumber.toString()}</b> ·{" "}
              {time(snapshot.timestamp)} · deadlines use chain time
            </span>
            <span>
              Refunded: {tokenAmount(snapshot.accounting.refunded)} tokens
            </span>
          </div>
          {!wallet.address ? (
            <div className={`notice ${styles.walletNotice}`}>
              <span>
                Public view. Connect your wallet to see actions for your onchain
                role. API sign-in is not required.
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={Boolean(busy) || wallet.status === "connecting"}
                onClick={() =>
                  void wallet.connect().catch((e) => setError(campaignError(e)))
                }
              >
                Connect wallet
              </button>
            </div>
          ) : mismatch ? (
            <div className={`notice ${styles.walletNotice}`}>
              <span>
                Wallet chain {wallet.chainId ?? "unknown"} does not match
                campaign chain {snapshot.chainId}.
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void switchChain()}
              >
                Switch network
              </button>
            </div>
          ) : (
            <p className={styles.hint}>
              Connected as {short(wallet.address)} ·{" "}
              {sameAddress(wallet.address, snapshot.policy.supplier)
                ? "Supplier"
                : sameAddress(wallet.address, snapshot.policy.reviewer)
                  ? "Reviewer"
                  : sameAddress(wallet.address, snapshot.policy.challenger)
                    ? "Challenger"
                    : "Claimant / public relayer"}
            </p>
          )}
          <div
            className={styles.tabs}
            role="tablist"
            aria-label="Campaign sections"
          >
            {(
              [
                ["overview", "Funding & lifecycle"],
                ["claims", "Claims & receipts"],
                ["policy", "Policy & roles"],
              ] as const
            ).map(([id, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`campaign-${id}`}
                id={`tab-${id}`}
                key={id}
                className={tab === id ? styles.selectedTab : ""}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "overview" && (
            <section
              role="tabpanel"
              id="campaign-overview"
              aria-labelledby="tab-overview"
              className={styles.columns}
            >
              <div className={`surface ${styles.panel}`}>
                <p className="eyebrow">Supplier controls</p>
                <h2>Fund the commitment</h2>
                <p>
                  Approve the campaign to spend the token, then deposit. Full
                  tracked funding is required before activation.
                </p>
                <dl>
                  <Detail label="Still to fund">
                    {tokenAmount(
                      snapshot.requiredFunding - snapshot.accounting.deposited,
                    )}{" "}
                    tokens
                  </Detail>
                  <Detail label="Your token balance">
                    {snapshot.walletBalance === null
                      ? "Connect wallet"
                      : tokenAmount(snapshot.walletBalance)}
                  </Detail>
                  <Detail label="Campaign allowance">
                    {snapshot.allowance === null
                      ? "Connect wallet"
                      : tokenAmount(snapshot.allowance)}
                  </Detail>
                </dl>
                <label htmlFor="funding-amount">Token amount</label>
                <div className={styles.inline}>
                  <input
                    id="funding-amount"
                    className="field"
                    value={amount}
                    inputMode="decimal"
                    placeholder="0.00"
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() =>
                      setAmount(
                        tokenAmount(
                          snapshot.requiredFunding -
                            snapshot.accounting.deposited,
                        ),
                      )
                    }
                  >
                    Remaining
                  </button>
                </div>
                <div className={styles.actions}>
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={disabled || !permissions?.approve || !amount}
                    onClick={() => fund("approve")}
                  >
                    1. Approve amount
                  </button>
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={disabled || !permissions?.fund || !amount}
                    onClick={() => fund("fund")}
                  >
                    2. Deposit funds
                  </button>
                </div>
                <div className={styles.actions}>
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={disabled || !permissions?.activate}
                    onClick={() => void preview({ kind: "activate" })}
                  >
                    3. Activate campaign
                  </button>
                  {permissions?.resetAllowance && (
                    <button
                      className={styles.textButton}
                      type="button"
                      disabled={disabled}
                      onClick={() => fund("resetAllowance")}
                    >
                      Reset allowance to zero
                    </button>
                  )}
                </div>
                <p className={styles.hint}>
                  Supplier only, before the claim deadline. Some tokens require
                  resetting an existing allowance before approving a new amount.
                  Direct token transfers are not tracked funding.
                </p>
              </div>
              <div className={`surface ${styles.panel}`}>
                <p className="eyebrow">After the deadline</p>
                <h2>Recover unused funds</h2>
                <p>
                  The supplier can recover unallocated funds after claims close.
                  Reserved and awarded grants remain protected.
                </p>
                <div className={styles.recoverAmount}>
                  {tokenAmount(snapshot.accounting.unallocated)}
                  <span>unallocated tokens</span>
                </div>
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={disabled || !permissions?.recoverUnallocated}
                  onClick={() => void preview({ kind: "recoverUnallocated" })}
                >
                  Review recovery
                </button>
                <p className={styles.hint}>
                  {snapshot.timestamp < snapshot.policy.claimDeadline
                    ? `Opens ${time(snapshot.policy.claimDeadline)}.`
                    : "Claim deadline has passed."}{" "}
                  Supplier wallet required.
                </p>
                <div className={styles.callout}>
                  <strong>A claim is not a payment.</strong>
                  <p>
                    Submission reserves a grant. Finalization or reviewer
                    approval awards it. Only its fixed recipient can withdraw.
                  </p>
                </div>
              </div>
            </section>
          )}
          {tab === "claims" && (
            <section
              role="tabpanel"
              id="campaign-claims"
              aria-labelledby="tab-claims"
              className={styles.columns}
            >
              <div className={`surface ${styles.panel}`}>
                <p className="eyebrow">Deployment claim</p>
                <h2>Track a grant</h2>
                <p>
                  Look up a deployment key to inspect its claim and available
                  next steps.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    try {
                      hash32(key.trim(), "Deployment key");
                      void refresh(selected, key.trim());
                    } catch (err) {
                      setError(campaignError(err));
                    }
                  }}
                >
                  <label htmlFor="deployment-key">
                    Deployment key · bytes32
                  </label>
                  <input
                    id="deployment-key"
                    className="field"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="0x…"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    className="btn-secondary"
                    disabled={Boolean(busy) || !key}
                  >
                    Look up claim
                  </button>
                </form>
                {claim ? (
                  <>
                    <div className={styles.claimStatus}>
                      {claimStatusNames[claim.status]}
                    </div>
                    <dl>
                      <Detail label="Deployment">
                        <code>{claim.key}</code>
                      </Detail>
                      <Detail label="Fixed recipient">
                        <code>
                          {claim.status ? claim.recipient : "No claim recorded"}
                        </code>
                      </Detail>
                      <Detail label="Receipt ID">
                        <code>{claim.status ? claim.receiptId : "—"}</code>
                      </Detail>
                      <Detail label="Challenge cutoff">
                        {time(claim.challengeCutoff)}
                      </Detail>
                      <Detail label="Withdrawable">
                        {tokenAmount(claim.withdrawable)} tokens
                      </Detail>
                      {claim.reviewDeadline > BigInt(0) && (
                        <>
                          <Detail label="Review deadline">
                            {time(claim.reviewDeadline)}
                          </Detail>
                          <Detail label="Challenged by">
                            <code>{claim.challenger}</code>
                          </Detail>
                          <Detail label="Reason hash">
                            <code>{claim.reasonHash}</code>
                          </Detail>
                        </>
                      )}
                    </dl>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={disabled || !permissions?.finalizeClaim}
                        onClick={() =>
                          void preview({ kind: "finalizeClaim", claim })
                        }
                      >
                        Finalize claim
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={disabled || !permissions?.withdrawGrant}
                        onClick={() =>
                          void preview({ kind: "withdrawGrant", claim })
                        }
                      >
                        Withdraw grant
                      </button>
                    </div>
                    <p className={styles.hint}>
                      Anyone may finalize after the challenge cutoff. Only the
                      recipient may withdraw an awarded grant.
                    </p>
                    {claim.status === 1 && (
                      <div className={styles.subsection}>
                        <h3>Open a challenge</h3>
                        <label htmlFor="challenge-reason">
                          Evidence reason hash · nonzero bytes32
                        </label>
                        <input
                          className="field"
                          id="challenge-reason"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="0x…"
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={
                            disabled || !permissions?.challengeClaim || !reason
                          }
                          onClick={() => {
                            try {
                              void preview({
                                kind: "challengeClaim",
                                claim,
                                reasonHash: hash32(
                                  reason.trim(),
                                  "Reason hash",
                                ),
                              });
                            } catch (e) {
                              setError(campaignError(e));
                            }
                          }}
                        >
                          Review challenge
                        </button>
                        <p className={styles.hint}>
                          Only the supplier or designated challenger, strictly
                          before the cutoff.
                        </p>
                      </div>
                    )}
                    {claim.status === 2 && (
                      <div className={styles.subsection}>
                        <h3>Resolve the dispute</h3>
                        <p>
                          The designated reviewer can award or reject before the
                          review deadline. After it, anyone can expire the
                          review. Timeout rejects the claim, even if it was
                          honest.
                        </p>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={
                              disabled || !permissions?.resolveChallenge
                            }
                            onClick={() =>
                              void preview({
                                kind: "resolveChallenge",
                                claim,
                                award: true,
                              })
                            }
                          >
                            Award grant
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={
                              disabled || !permissions?.resolveChallenge
                            }
                            onClick={() =>
                              void preview({
                                kind: "resolveChallenge",
                                claim,
                                award: false,
                              })
                            }
                          >
                            Reject claim
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={disabled || !permissions?.expireChallenge}
                            onClick={() =>
                              void preview({ kind: "expireChallenge", claim })
                            }
                          >
                            Expire review
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.claimEmpty}>
                    No deployment selected.
                    <br />
                    <span>
                      Enter the key from your campaign receipt or eligibility
                      record.
                    </span>
                  </div>
                )}
              </div>
              <div className={`surface ${styles.panel}`}>
                <p className="eyebrow">Signed evidence</p>
                <h2>Submit a scoped receipt</h2>
                <p>
                  Use a real passing receipt for this campaign and its
                  eligibility proof. The recipient is fixed by the signed
                  receipt and eligibility commitment.
                </p>
                <label htmlFor="receipt-file" className={styles.upload}>
                  Import receipt bundle <span>JSON · up to 64 KiB</span>
                  <input
                    id="receipt-file"
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => void importReceipt(e.target.files?.[0])}
                  />
                </label>
                <label htmlFor="claim-receipt">
                  Or paste receipt bundle JSON
                </label>
                <textarea
                  id="claim-receipt"
                  className="field"
                  rows={8}
                  spellCheck={false}
                  value={receipt}
                  onChange={(e) => setReceipt(e.target.value)}
                  placeholder={
                    '{"schemaVersion":1,"receipt":{…},"signature":"0x…","eligibilityProof":[…]}'
                  }
                />
                {receiptError && (
                  <p className={styles.error} role="status">
                    {receiptError}
                  </p>
                )}
                {parsedReceipt && (
                  <div className={styles.receiptPreview}>
                    <strong>Scope and format checked</strong>
                    <p>
                      Signature, eligibility and replay are checked onchain when
                      you preview.
                    </p>
                    <dl>
                      <Detail label="Recipient">
                        <code>{parsedReceipt.receipt.recipient}</code>
                      </Detail>
                      <Detail label="Deployment">
                        <code>{parsedReceipt.receipt.deploymentKey}</code>
                      </Detail>
                      <Detail label="Expires">
                        {time(parsedReceipt.receipt.expiresAt)}
                      </Detail>
                    </dl>
                  </div>
                )}
                <button
                  type="button"
                  className="btn-primary"
                  disabled={
                    disabled || !permissions?.submitClaim || !parsedReceipt
                  }
                  onClick={submitReceipt}
                >
                  Validate & preview claim
                </button>
                <p className={styles.hint}>
                  Diagnostic reports, preview evidence and unsigned results
                  cannot qualify. Submission is permitted for any relayer but
                  cannot redirect the recipient.
                </p>
                <details className={styles.format}>
                  <summary>Receipt bundle format</summary>
                  <p>
                    Exactly four top-level fields: <code>schemaVersion: 1</code>
                    , <code>receipt</code>, <code>signature</code> (65-byte
                    hex), and <code>eligibilityProof</code> (bytes32 array).
                  </p>
                  <p>
                    Receipt hashes: campaignId, campaignPolicyHash,
                    deploymentKey, snapshotHash, observedBlockHash,
                    testPackHash, evidenceDigest, receiptId. Address: recipient.
                  </p>
                  <p>
                    Decimal strings: sourceChainId, observedBlockNumber,
                    observedBlockTimestamp, issuedAt, expiresAt. Numeric enums:
                    purpose = 1, mode = 1, result = 1. Extra fields are
                    rejected.
                  </p>
                  <p>
                    The signature domain remains PatchBond / 1, bound to the
                    destination chain and this campaign, as required by the
                    contract.
                  </p>
                </details>
              </div>
            </section>
          )}
          {tab === "policy" && (
            <section
              role="tabpanel"
              id="campaign-policy"
              aria-labelledby="tab-policy"
              className={styles.columns}
            >
              <div className={`surface ${styles.panel}`}>
                <p className="eyebrow">Immutable agreement</p>
                <h2>Policy commitments</h2>
                <dl>
                  <Detail label="Campaign ID">
                    <code>{snapshot.policy.campaignId}</code>
                  </Detail>
                  <Detail label="Policy hash">
                    <code>{snapshot.policyHash}</code>
                  </Detail>
                  <Detail label="Repair policy">
                    <code>{snapshot.policy.repairPolicyHash}</code>
                  </Detail>
                  <Detail label="Test pack">
                    <code>{snapshot.policy.testPackHash}</code>
                  </Detail>
                  <Detail label="Eligibility root">
                    <code>{snapshot.policy.eligibilityRoot}</code>
                  </Detail>
                  <Detail label="Source chain">
                    {snapshot.policy.sourceChainId.toString()}
                  </Detail>
                  <Detail label="Destination chain">
                    {snapshot.policy.destinationChainId.toString()}
                  </Detail>
                  <Detail label="Source registry / sender">
                    <code>{snapshot.policy.sourceRegistry}</code>
                  </Detail>
                  <Detail label="Campaign registry">
                    <code>{snapshot.registry}</code>
                  </Detail>
                  <Detail label="Receipt verifier contract">
                    <code>{snapshot.verifier}</code>
                  </Detail>
                </dl>
              </div>
              <div className={`surface ${styles.panel}`}>
                <p className="eyebrow">Authority & timing</p>
                <h2>Know who decides</h2>
                <dl>
                  {(
                    [
                      ["Supplier", snapshot.policy.supplier],
                      ["Verifier signer", snapshot.policy.verifier],
                      ["Challenger", snapshot.policy.challenger],
                      ["Independent reviewer", snapshot.policy.reviewer],
                    ] as const
                  ).map(([label, address]) => (
                    <Detail key={label} label={label}>
                      <code>{address}</code>
                    </Detail>
                  ))}
                  <Detail label="Challenge window">
                    {snapshot.policy.challengeWindow.toString()} seconds
                  </Detail>
                  <Detail label="Review timeout">
                    {snapshot.policy.reviewTimeout.toString()} seconds
                  </Detail>
                  <Detail label="Max receipt age">
                    {snapshot.policy.maxReceiptAge.toString()} seconds
                  </Detail>
                  <Detail label="Source confirmations">
                    {snapshot.policy.confirmations}
                  </Detail>
                  <Detail label="Evidence retention">
                    {snapshot.policy.evidenceRetention.toString()} seconds
                  </Detail>
                </dl>
                <div className={styles.callout}>
                  <strong>Trust is explicit.</strong>
                  <p>
                    The verifier attests to deployed evidence. Its signature
                    does not prove honest test execution. Reviewer silence
                    rejects a disputed claim. This page shows direct Arc
                    settlement; it does not establish cross-chain message
                    delivery.
                  </p>
                </div>
                <p className={styles.hint}>
                  Snapshot block hash:{" "}
                  <code className={styles.break}>{snapshot.blockHash}</code>
                </p>
              </div>
            </section>
          )}
        </>
      )}
      {prepared && (
        <Confirmation
          prepared={prepared}
          busy={Boolean(busy)}
          onCancel={() => setPrepared(null)}
          onConfirm={() => void confirm()}
        />
      )}
    </div>
  );
}
