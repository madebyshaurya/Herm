import type { Metadata } from "next"
import localFont from "next/font/local"
import { Geist_Mono } from "next/font/google"
import { GeistPixelSquare } from "geist/font/pixel"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const kalice = localFont({
  src: "./fonts/Kalice-Trial_Regular.ttf",
  variable: "--font-kalice",
  display: "swap",
})

const geistPixel = GeistPixelSquare

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "Herm",
  description: "Crowdsourced stolen-vehicle alerts and Raspberry Pi dashcam monitoring.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "font-sans",
        geistMono.variable,
        geistPixel.variable,
        kalice.variable,
        "font-sans",
      )}
    >
      <body className="font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
