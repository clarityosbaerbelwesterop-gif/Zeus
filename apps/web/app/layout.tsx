import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Zeus", template: "%s · Zeus" },
  description:
    "A calm AI workspace for specialized teammates that plan, build, design, test and sell alongside you.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
