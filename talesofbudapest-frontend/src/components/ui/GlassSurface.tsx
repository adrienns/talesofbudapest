import type { ComponentPropsWithoutRef } from 'react'

type GlassSurfaceProps = ComponentPropsWithoutRef<'div'>

export const GlassSurface = ({ className = '', ...props }: GlassSurfaceProps) => (
  <div className={`glass-surface ${className}`.trim()} {...props} />
)
