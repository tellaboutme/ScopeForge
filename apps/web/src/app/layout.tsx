import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { cinzel, bebasNeue, robotoMono } from "@/fonts";
import { ShellGate } from "@/components/product/ShellGate";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { AuthProvider } from "@/lib/auth-store";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScopeForge",
  description: "Turn a freelance project brief into a decision-ready report — verdict, price, timeline, risks, and a proposal."
};

const FONT_VARIABLES = `${GeistSans.variable} ${GeistMono.variable} ${cinzel.variable} ${bebasNeue.variable} ${robotoMono.variable}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={FONT_VARIABLES}>
      <body>
        <MotionProvider>
          <AuthProvider>
            <ShellGate>{children}</ShellGate>
          </AuthProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
