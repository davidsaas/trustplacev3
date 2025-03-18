import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Trustplace - Safety Report for Accommodations",
  description: "Get comprehensive safety reports for Airbnb and Booking.com listings in Los Angeles.",
  keywords: ["safety", "airbnb", "booking.com", "los angeles", "travel", "accommodation", "security"],
  authors: [{ name: "Trustplace" }],
  openGraph: {
    title: "Trustplace - Safety Report for Accommodations",
    description: "Get comprehensive safety reports for Airbnb and Booking.com listings in Los Angeles.",
    url: process.env.NEXT_PUBLIC_APP_URL,
    siteName: "Trustplace",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trustplace - Safety Report for Accommodations",
    description: "Get comprehensive safety reports for Airbnb and Booking.com listings in Los Angeles.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(
        "min-h-screen bg-background font-sans antialiased",
        inter.className
      )}>
        {children}
      </body>
    </html>
  );
}
