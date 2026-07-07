import { Menu } from 'lucide-react'

type AiChatHeaderProps = {
  onMenuClick?: () => void
}

export const AiChatHeader = ({ onMenuClick }: AiChatHeaderProps) => (
  <header className="flex items-center justify-between gap-3">
    <h1 className="text-lg font-bold tracking-tight text-on-surface">Budapest Tales</h1>

    <div className="flex items-center gap-2">
      <div className="relative">      
      </div>

      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Menu"
        className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface transition active:scale-95"
      >
        <Menu className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  </header>
)
