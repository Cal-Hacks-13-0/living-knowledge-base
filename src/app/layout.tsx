import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RouteMemory } from "@/components/route-memory";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Every page in this app reads live data straight from the local SQLite
// database on each request (knowledge bases, insights, research run status,
// etc). Force dynamic rendering app-wide so nothing gets statically cached
// at build time and silently goes stale.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Axion",
  description: "AI-powered knowledge management that keeps discovering, so you don't have to.",
};

// Intentionally bare: the app shell (sidebar nav) lives in app/(shell)/layout.tsx
// and is NOT rendered for the /new onboarding wizard, which is full-screen by
// design (see docs/frontend-redesign-plan.md §2-3).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <RouteMemory />
        {children}
      </body>
    </html>
  );
}
