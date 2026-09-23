import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Future Stock",
  description: "Understanding stock distributions and options data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
