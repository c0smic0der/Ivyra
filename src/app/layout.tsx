import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { ServiceWorkerRegister } from "./service-worker-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Wordmark-only face — distinct from the Geist body copy, used solely for
// the "Ivyra" logotype in Header.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600"],
});

// The editorial "voice" serif — used only for the insights coach's-note
// blockquote, where the app speaks in prose rather than reporting a figure.
// Optical/soft display serif; deliberately distinct from the Geist body.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Ivyra",
  description:
    "Log real-life predictions, resolve them, and score your calibration over time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Footer />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
