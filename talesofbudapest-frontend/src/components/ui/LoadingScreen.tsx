type LoadingScreenProps = {
  message?: string
}

export const LoadingScreen = ({ message = 'Loading…' }: LoadingScreenProps) => (
  <div className="flex h-[100dvh] w-full items-center justify-center bg-surface">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <p className="text-body text-on-surface/60">{message}</p>
    </div>
  </div>
)
