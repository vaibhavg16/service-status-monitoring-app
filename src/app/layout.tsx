import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { readLocale } from "@/lib/auth";
import { LOCALE_HTML } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Is It Down, India? — live status for UPI, IRCTC, GST & more",
    template: "%s · Is It Down, India?",
  },
  description:
    "Live green/amber/red status for UPI, IRCTC, DigiLocker, Aadhaar e-KYC and the GST portal — probed every 30 seconds and backed by what people across India actually report.",
};

export const viewport: Viewport = {
  themeColor: "#16130E",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await readLocale();
  return (
    <html lang={LOCALE_HTML[locale]} data-locale={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Noto+Sans+Tamil:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
