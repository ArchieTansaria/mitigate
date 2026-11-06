import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Address, Hex } from "viem";
import { createSiweMessage } from "viem/siwe";
import type { RuntimeConfig } from "../../../../packages/config/src/index.ts";
import type { Repository } from "../db/repository.ts";
import type { WalletVerifier } from "./wallet.ts";

const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class Sessions {
  constructor(
    private readonly repo: Repository,
    private readonly config: RuntimeConfig,
    private readonly verify: WalletVerifier,
  ) {}
  async challenge(address: Address, chainId: string) {
    if (chainId !== this.config.network.source.chainId)
      throw new Error("INVALID_INPUT");
    const challengeId = randomUUID(),
      now = new Date(),
      expiry = new Date(
        now.getTime() + this.config.limits.challengeSeconds * 1000,
      );
    const message = createSiweMessage({
      address,
      chainId: Number(chainId),
      domain: new URL(this.config.origin).host,
      uri: this.config.origin,
      version: "1",
      nonce: randomBytes(24).toString("hex"),
      issuedAt: now,
      expirationTime: expiry,
      statement:
        "Sign in to PatchBond. This grants no authority to upgrade contracts or transfer funds.",
    });
    await this.repo.pool.query(
      "INSERT INTO auth_challenges(id,address,chain_id,message,expires_at) VALUES($1,$2,$3,$4,$5)",
      [challengeId, address, chainId, message, expiry],
    );
    return { challengeId, message, expiresAt: expiry.toISOString() };
  }
  async authenticate(id: string, signature: Hex) {
    const r = await this.repo.pool.query(
      "SELECT * FROM auth_challenges WHERE id=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp()",
      [id],
    );
    const c = r.rows[0];
    if (
      !c ||
      c.chain_id !== this.config.network.source.chainId ||
      !(await this.verify(c.address, c.message, signature))
    )
      throw new Error("UNAUTHORIZED");
    const token = randomBytes(32).toString("hex");
    await this.repo.transaction(async (db) => {
      const consumed = await db.query(
        "UPDATE auth_challenges SET consumed_at=clock_timestamp() WHERE id=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp()",
        [id],
      );
      if (consumed.rowCount !== 1) throw new Error("UNAUTHORIZED");
      await db.query(
        "INSERT INTO sessions(digest,owner,expires_at) VALUES($1,$2,clock_timestamp()+$3*interval '1 second')",
        [
          digest(token),
          String(c.address).toLowerCase(),
          this.config.limits.sessionSeconds,
        ],
      );
    });
    return { token, expiresIn: this.config.limits.sessionSeconds };
  }
  async owner(header: string | undefined) {
    if (!header || !/^Bearer [a-f0-9]{64}$/.test(header))
      throw new Error("UNAUTHORIZED");
    const r = await this.repo.pool.query(
      "SELECT owner FROM sessions WHERE digest=$1 AND expires_at>clock_timestamp()",
      [digest(header.slice(7))],
    );
    if (!r.rows[0]) throw new Error("UNAUTHORIZED");
    return r.rows[0].owner as string;
  }
  async logout(header: string) {
    await this.repo.pool.query("DELETE FROM sessions WHERE digest=$1", [
      digest(header.slice(7)),
    ]);
  }
}
