"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { parseSiweMessage } from "viem/siwe";
import { ApiError, type ApiHealth, api } from "./api";

export type WalletRequest = { method: string; params?: unknown[] };
export type EIP1193Provider = {
  request(args: WalletRequest): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
};
export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "authenticating"
  | "authenticated";
export type WalletState = {
  address: string | null;
  chainId: string | null;
  status: WalletStatus;
  error: string | null;
};
export type WalletContextValue = WalletState & {
  connect(): Promise<void>;
  authenticate(): Promise<void>;
  disconnect(): Promise<void>;
  request(args: WalletRequest): Promise<unknown>;
};
const initial: WalletState = {
  address: null,
  chainId: null,
  status: "disconnected",
  error: null,
};
function injected() {
  return typeof window === "undefined"
    ? undefined
    : (window as Window & { ethereum?: EIP1193Provider }).ethereum;
}
function account(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : null;
  return typeof candidate === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(candidate) &&
    !/^0x0{40}$/.test(candidate)
    ? candidate.toLowerCase()
    : null;
}
function chain(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-fA-F]+$/.test(value) ||
    value.length > 18
  )
    return null;
  const id = BigInt(value);
  return id > BigInt(0) ? id.toString() : null;
}
function walletError(error: unknown) {
  if (error instanceof ApiError) return error;
  if (error instanceof Error && error.name === "WalletError") return error;
  return failure(
    typeof error === "object" && error && "code" in error && error.code === 4001
      ? "The wallet request was declined."
      : "The wallet request failed. Please try again.",
  );
}
function failure(message: string) {
  const error = new Error(message);
  error.name = "WalletError";
  return error;
}

/** The provider's state machine is also usable without a React render loop. */
export function createWalletController(
  getProvider: () => EIP1193Provider | undefined = injected,
) {
  let state = initial;
  let provider: EIP1193Provider | undefined;
  let generation = 0;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let sessionQueue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const update = (patch: Partial<WalletState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  // Verification and revocation must finish in order: an old verify response
  // must never install a cookie after an account-change logout has finished.
  function sessionOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = sessionQueue.then(operation);
    sessionQueue = result.catch(() => {});
    return result;
  }
  const revoke = () =>
    sessionOperation(() => api<void>("/v1/auth/logout", { method: "POST" }));
  function invalidate(patch: Partial<WalletState>) {
    const current = ++generation;
    clearTimeout(expiry);
    update({
      status: state.address ? "connected" : "disconnected",
      error: null,
      ...patch,
    });
    void revoke().catch((error) => {
      if (generation === current) update({ error: walletError(error).message });
    });
  }
  const accountsChanged = (accounts: unknown) => {
    const address = account(accounts);
    invalidate({
      address,
      ...(address ? {} : { chainId: null }),
      status: address && state.chainId ? "connected" : "disconnected",
    });
  };
  const chainChanged = (value: unknown) => {
    const chainId = chain(value);
    invalidate({
      chainId,
      status: state.address && chainId ? "connected" : "disconnected",
      ...(chainId ? {} : { address: null }),
    });
  };
  const disconnected = () =>
    invalidate({ address: null, chainId: null, status: "disconnected" });
  function detach() {
    provider?.removeListener?.("accountsChanged", accountsChanged);
    provider?.removeListener?.("chainChanged", chainChanged);
    provider?.removeListener?.("disconnect", disconnected);
  }
  const assertCurrent = (current: number) => {
    if (generation !== current)
      throw failure("Wallet changed. Connect and authenticate again.");
  };

  async function connect() {
    if (state.status !== "disconnected") return;
    const current = ++generation;
    update({ status: "connecting", error: null });
    try {
      detach();
      provider = getProvider();
      if (!provider)
        throw failure("Install or enable an Ethereum wallet to connect.");
      if (
        typeof provider.on !== "function" ||
        typeof provider.removeListener !== "function"
      )
        throw failure(
          "This wallet does not support account and chain change notifications.",
        );
      const address = account(
        await provider.request({ method: "eth_requestAccounts" }),
      );
      assertCurrent(current);
      const chainId = chain(await provider.request({ method: "eth_chainId" }));
      assertCurrent(current);
      if (!address || !chainId)
        throw failure("The wallet did not provide a valid account and chain.");
      provider.on?.("accountsChanged", accountsChanged);
      provider.on?.("chainChanged", chainChanged);
      provider.on?.("disconnect", disconnected);
      update({ address, chainId, status: "connected", error: null });
    } catch (error) {
      const safe = walletError(error);
      if (generation === current) update({ ...initial, error: safe.message });
      throw safe;
    }
  }
  async function authenticate() {
    if (state.status === "authenticated") return;
    if (
      state.status !== "connected" ||
      !provider ||
      !state.address ||
      !state.chainId
    ) {
      const error = failure("Connect a wallet before authenticating.");
      update({ error: error.message });
      throw error;
    }
    const current = generation;
    const { address, chainId } = state;
    const wallet = provider;
    update({ status: "authenticating", error: null });
    try {
      await revoke();
      assertCurrent(current);
      const health = await api<ApiHealth>("/health");
      assertCurrent(current);
      if (health.sourceChainId !== chainId)
        throw failure(
          `Switch your wallet to source chain ${health.sourceChainId} before signing in.`,
        );
      const challenge = await api<{
        challengeId: string;
        message: string;
        expiresAt: string;
      }>("/v1/auth/challenge", {
        method: "POST",
        body: JSON.stringify({ address, chainId }),
      });
      assertCurrent(current);
      if (
        typeof challenge.message !== "string" ||
        challenge.message.length > 8192 ||
        !/^[\da-f-]{36}$/i.test(challenge.challengeId)
      )
        throw failure("The API returned an invalid sign-in challenge.");
      const parsed = parseSiweMessage(challenge.message);
      const expires = Date.parse(challenge.expiresAt);
      const now = Date.now();
      if (
        parsed.domain !== window.location.host ||
        parsed.uri !== window.location.origin ||
        parsed.address?.toLowerCase() !== address ||
        String(parsed.chainId) !== chainId ||
        parsed.version !== "1" ||
        !parsed.nonce ||
        !/^[a-zA-Z0-9]{8,}$/.test(parsed.nonce) ||
        !Number.isFinite(expires) ||
        expires <= now ||
        expires > now + 600000 ||
        parsed.expirationTime?.getTime() !== expires ||
        !parsed.issuedAt ||
        !Number.isFinite(parsed.issuedAt.getTime()) ||
        parsed.issuedAt.getTime() > now + 60000
      )
        throw failure(
          "The sign-in challenge does not match this site, wallet, chain, or validity period.",
        );
      const encoded = `0x${Array.from(new TextEncoder().encode(challenge.message), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
      const signature = await wallet.request({
        method: "personal_sign",
        params: [encoded, address],
      });
      assertCurrent(current);
      if (
        typeof signature !== "string" ||
        !/^0x([0-9a-fA-F]{2})+$/.test(signature) ||
        signature.length > 16386
      )
        throw failure("The wallet returned an invalid signature.");
      const accounts = await wallet.request({ method: "eth_accounts" });
      const walletChain = await wallet.request({ method: "eth_chainId" });
      assertCurrent(current);
      if (account(accounts) !== address || chain(walletChain) !== chainId) {
        invalidate({ address: null, chainId: null, status: "disconnected" });
        throw failure("Wallet changed. Connect and authenticate again.");
      }
      const session = await sessionOperation(() => {
        assertCurrent(current);
        return api<{ authenticated: boolean; expiresIn: number }>(
          "/v1/auth/verify",
          {
            method: "POST",
            body: JSON.stringify({
              challengeId: challenge.challengeId,
              signature,
            }),
          },
        );
      });
      assertCurrent(current);
      if (
        session.authenticated !== true ||
        !Number.isInteger(session.expiresIn) ||
        session.expiresIn < 1 ||
        session.expiresIn > 86400
      )
        throw failure("The API did not establish a valid session.");
      update({ status: "authenticated", error: null });
      clearTimeout(expiry);
      expiry = setTimeout(
        () =>
          invalidate({ error: "Your session expired. Authenticate again." }),
        session.expiresIn * 1000,
      );
    } catch (error) {
      const safe = walletError(error);
      if (generation === current)
        update({
          status: state.address ? "connected" : "disconnected",
          error: safe.message,
        });
      throw safe;
    }
  }
  async function disconnect() {
    const current = ++generation;
    clearTimeout(expiry);
    detach();
    provider = undefined;
    update(initial);
    try {
      await revoke();
    } catch (error) {
      const safe = walletError(error);
      if (generation === current) update({ error: safe.message });
      throw safe;
    }
  }
  async function request(args: WalletRequest) {
    if (
      !provider ||
      !state.address ||
      !state.chainId ||
      state.status === "disconnected" ||
      state.status === "connecting"
    )
      throw failure("Connect a wallet before making a wallet request.");
    // Called only by an explicit consuming UI action, including owner transactions.
    return provider.request(args);
  }
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect,
    authenticate,
    disconnect,
    request,
    dispose: () => {
      void disconnect().catch(() => {});
    },
  };
}

const WalletContext = createContext<WalletContextValue | null>(null);
export function WalletProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => createWalletController());
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  useEffect(() => () => controller.dispose(), [controller]);
  return (
    <WalletContext.Provider
      value={{
        ...state,
        connect: controller.connect,
        authenticate: controller.authenticate,
        disconnect: controller.disconnect,
        request: controller.request,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
export function useWallet(): WalletContextValue {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error("useWallet must be used within WalletProvider.");
  return wallet;
}
