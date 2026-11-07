import type { Metadata } from "next";
import { WorkspaceShell } from "../components/workspace/shell";
export const metadata: Metadata = {
  title: "Workspace · Orryn",
  robots: { index: false, follow: false },
};
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
