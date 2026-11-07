import type { Metadata } from "next";
import { RecordingDemo } from "./recording-demo";
export const metadata: Metadata = {
  title: "Orryn · Interactive demo",
  description:
    "A simulated walkthrough of deployment repair verification and funded remediation.",
  robots: { index: false, follow: false },
};
export default function DemoPage() {
  return <RecordingDemo />;
}
