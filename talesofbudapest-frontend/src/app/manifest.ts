import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tales of Budapest',
    short_name: 'Tales',
    description: 'Audio walking tours through Budapest.',
    start_url: '/',
    display: 'standalone',
    background_color: '#1d1611',
    theme_color: '#7c4f2b',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
