import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { cn, getBaseUrl } from "@/lib/utils";
import { AuthProvider } from "@/components/shared/providers/auth-provider";
import { ThemeProvider } from "@/components/shared/providers/theme-provider";
import { Toaster } from 'sonner';
import 'leaflet/dist/leaflet.css';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: "Trustplace - Safety Report for Accommodations",
  description: "Get comprehensive safety reports for Airbnb and Booking.com listings in Los Angeles.",
  keywords: ["safety", "airbnb", "booking.com", "los angeles", "travel", "accommodation", "security"],
  authors: [{ name: "Trustplace" }],
  openGraph: {
    title: "Trustplace - Safety Report for Accommodations",
    description: "Get comprehensive safety reports for Airbnb and Booking.com listings in Los Angeles.",
    url: getBaseUrl(),
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
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className={cn(
        "h-full font-sans antialiased",
        inter.className
      )}>
        <ThemeProvider>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
