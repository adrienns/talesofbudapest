export type NavTabId = 'explore' | 'tours' | 'settings'

export type BottomNavProps = {
  activeTab: NavTabId
  onTabChange: (tab: NavTabId) => void
  onCreateTour: () => void
  onOpenAiGuide: () => void
  showAiGuide?: boolean
  showNavigation?: boolean
  className?: string
  variant?: 'default' | 'map'
}
