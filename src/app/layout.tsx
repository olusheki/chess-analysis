import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chess.com Game Review & AI Coach",
  description:
    "1:1 Chess.com Game Review clone powered by Stockfish 17.1 WASM, CAPS2 accuracy classification, ECO opening book, and grounded Gemini AI Coach.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#312e2b] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
