import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LandingPage from "../app/page";

describe("Orryn public landing page", () => {
  it("renders public product navigation without requiring a wallet", () => {
    const html = renderToStaticMarkup(createElement(LandingPage));

    expect(html).toContain("<main");
    expect(html).toContain("Orryn");
    expect(html).toContain('href="#workflow"');
    expect(html).toContain('id="workflow"');
    expect(html).not.toMatch(/connect wallet|MAINNET v1\.2|2,480/i);
  });
});
