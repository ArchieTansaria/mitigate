import type { Metadata } from "next";
import { SampleWorkspaceApp } from "./sample-workspace";
export const metadata: Metadata = {
  title: "Sample workspace · Orryn",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <SampleWorkspaceApp />;
}
