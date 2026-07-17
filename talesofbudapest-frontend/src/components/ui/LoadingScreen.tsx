type LoadingScreenProps = {
  message?: string
  coverImage?: string
}

export const LoadingScreen = ({ message = 'Loading…', coverImage }: LoadingScreenProps) => (
  <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-surface">
    {coverImage ? (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverImage} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-black/35" aria-hidden="true" />
      </>
    ) : null}
    <div className={`relative flex flex-col items-center gap-3 ${coverImage ? 'text-white' : ''}`}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <p className={`text-body ${coverImage ? 'text-white/85' : 'text-on-surface/60'}`}>{message}</p>
    </div>
  </div>
)
