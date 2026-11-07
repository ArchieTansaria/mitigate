import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/wallet", () => ({
  useWallet: () => ({
    address: null,
    chainId: null,
    status: "disconnected",
    error: null,
    connect: vi.fn(),
    request: vi.fn(),
  }),
}));

import CampaignsPage from "../app/dashboard/campaigns/page";

afterEach(() => vi.unstubAllEnvs());
describe("public campaign page", () => {
  it("explains missing config and requires a user-supplied address", () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_RPC_URL", "");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "");
    const html = renderToStaticMarkup(createElement(CampaignsPage));
    expect(html).toContain("NEXT_PUBLIC_ARC_RPC_URL");
    expect(html).toContain("NEXT_PUBLIC_ARC_CHAIN_ID");
    expect(html).toContain('id="campaign-address"');
    expect(html).toContain('value=""');
    expect(html).toContain("Open campaign");
    expect(html).toContain("disabled");
    expect(html).not.toContain("0x360000");
  });
  it("offers public lookup without auth when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_ARC_RPC_URL", "https://rpc.example.com");
    vi.stubEnv("NEXT_PUBLIC_ARC_CHAIN_ID", "5042002");
    const html = renderToStaticMarkup(createElement(CampaignsPage));
    expect(html).toContain("Chain 5042002");
    expect(html).not.toContain("Connection unavailable");
    expect(html).not.toContain("disabled");
    expect(html).toContain("Reads are public");
  });
});
