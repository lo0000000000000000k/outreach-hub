import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Outreach Hub", description: "Capture, enrich and track prospects", icons: { icon: "/icon.svg" } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
