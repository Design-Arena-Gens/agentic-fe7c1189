import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NL SQL Agent",
  description:
    "Convert simple English into SQL, execute over an embedded dataset, and visualize results."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-900 text-slate-100 min-h-screen">
        <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>
      </body>
    </html>
  );
}
