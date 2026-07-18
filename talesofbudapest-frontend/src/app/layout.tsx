import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Source_Serif_4 } from 'next/font/google'
import { Providers } from '@/app/providers'
import { colors } from '@/constants/designTokens'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
})

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: colors.primary,
}

export const metadata: Metadata = {
  applicationName: 'Tales of Budapest',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    title: 'Tales of Budapest',
    statusBarStyle: 'black-translucent',
  },
}

const RootLayout = ({ children }: { children: React.ReactNode }) => (
  <html lang="en" className={`${plusJakarta.variable} ${sourceSerif.variable}`} suppressHydrationWarning>
    <body className="min-h-[100dvh] bg-background font-sans text-on-surface antialiased">
      <Providers>{children}</Providers>
    </body>
  </html>
)

export default RootLayout
