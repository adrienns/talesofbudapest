import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Source_Serif_4 } from 'next/font/google'
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

export const metadata: Metadata = {
  title: 'Tales of Budapest',
  description: 'AI-powered location audio tours through Budapest',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: colors.primary,
}

const RootLayout = ({ children }: { children: React.ReactNode }) => (
  <html lang="en" className={`${plusJakarta.variable} ${sourceSerif.variable}`}>
    <body className="min-h-[100dvh] bg-background font-sans text-on-surface antialiased">
      {children}
    </body>
  </html>
)

export default RootLayout
