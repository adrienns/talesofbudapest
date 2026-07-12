import type { Metadata } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Archive Console', template: '%s · Archive Console' },
  description: 'Private research and knowledge-graph administration for Tales of Budapest.',
  robots: { follow: false, index: false },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
