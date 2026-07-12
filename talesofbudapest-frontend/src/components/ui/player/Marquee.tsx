'use client'

import { useEffect, useRef, useState } from 'react'

type MarqueeProps = {
  text: string
  className?: string
}

/**
 * Scrolls its text horizontally in a seamless loop when it overflows the
 * container (Spotify-style), and falls back to a static, truncated line when
 * it fits or the user prefers reduced motion.
 */
export const Marquee = ({ text, className }: MarqueeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) {
      return
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const update = () => {
      setOverflow(!reduceMotion && measure.scrollWidth > container.clientWidth + 4)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [text])

  return (
    <div ref={containerRef} className={`marquee ${className ?? ''}`}>
      {overflow ? (
        <div className="marquee__track" aria-label={text}>
          <span ref={measureRef} className="marquee__item">
            {text}
          </span>
          <span className="marquee__item" aria-hidden="true">
            {text}
          </span>
        </div>
      ) : (
        <span ref={measureRef} className="marquee__single">
          {text}
        </span>
      )}
    </div>
  )
}
