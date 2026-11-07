import type { Metadata } from "next";
import { Geist, Geist_Mono, Silkscreen } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-silkscreen",
});

export const metadata: Metadata = {
  title: "Orryn — Verified dependency repairs",
  description:
    "Orryn helps protocol teams coordinate dependency repairs across customer-owned smart-contract deployments, with checks tied to the state that was actually observed.",
  applicationName: "Orryn",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geist.variable} ${geistMono.variable} ${silkscreen.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
