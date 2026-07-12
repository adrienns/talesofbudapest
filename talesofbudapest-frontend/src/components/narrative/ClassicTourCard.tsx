type ClassicTourCardProps = {
  title: string
  tagline: string
  imageSrc: string
  imageAlt: string
  onClick?: () => void
  className?: string
}

export const ClassicTourCard = ({
  title,
  tagline,
  imageSrc,
  imageAlt,
  onClick,
  className = '',
}: ClassicTourCardProps) => {
  const content = (
    <>
      <img src={imageSrc} alt={imageAlt} className="absolute inset-0 h-full w-full object-cover" />
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/5"
        aria-hidden="true"
      />
      <div className="relative mt-auto p-3.5">
        <p className="text-sm font-bold leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">
          {title}
        </p>
        <p className="mt-1 text-[0.6875rem] leading-tight text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
          {tagline}
        </p>
      </div>
    </>
  )

  const sharedClassName = `relative flex aspect-square w-full overflow-hidden rounded-2xl ring-1 ring-white/20 transition active:scale-[0.98] ${className}`

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={`${title} — ${tagline}`} className={sharedClassName}>
        {content}
      </button>
    )
  }

  return <article className={sharedClassName}>{content}</article>
}
