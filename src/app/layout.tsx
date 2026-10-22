import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Waypoint — Excel intake for logistics teams",
  description:
    "Paste or drop a shipment manifest and Waypoint parses it into a clean, filterable shipment board with lane, carrier and exception insights.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
