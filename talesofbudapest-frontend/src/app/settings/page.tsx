'use client'

import { useRouter } from 'next/navigation'
import { BottomNav } from '@/components/ui/BottomNav'
import type { NavTabId } from '@/types/navigation'

const SettingsPage = () => {
  const router = useRouter()

  const handleTabChange = (tab: NavTabId) => {
    if (tab === 'map') {
      router.push('/')
      return
    }

    if (tab === 'archives') {
      router.push('/archives')
    }
  }

  const handleAiGuideClick = () => {
    router.push('/?ai=1')
  }

  return (
    <main className="flex h-[100dvh] flex-col bg-background">
      <div className="flex-1 px-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <p className="text-label text-accent">Settings</p>
        <h1 className="text-headline mt-2 text-on-surface">Preferences</h1>
        <p className="mt-2 text-body text-on-surface/55">Coming soon.</p>
      </div>

      <BottomNav
        activeTab="settings"
        onTabChange={handleTabChange}
        onAiGuideClick={handleAiGuideClick}
      />
    </main>
  )
}

export default SettingsPage
