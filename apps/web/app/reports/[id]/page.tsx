import type { Metadata } from "next";
import { PublicReport } from "./public-report";
export const metadata: Metadata = {
  title: "Published verification · Orryn",
  robots: { index: false, follow: false },
};
export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicReport id={id} />;
}
