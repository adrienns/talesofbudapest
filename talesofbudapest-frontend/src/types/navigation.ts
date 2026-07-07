export type NavTabId = 'map' | 'narrative' | 'archives' | 'settings'

export type BottomNavProps = {
  activeTab: NavTabId
  onTabChange: (tab: NavTabId) => void
  onAiGuideClick?: () => void
  className?: string
}
