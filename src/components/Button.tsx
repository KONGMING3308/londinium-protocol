import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'muted'

const STYLES: Record<Variant, string> = {
  primary:
    'bg-amber-500/90 text-slate-950 hover:bg-amber-400 disabled:bg-amber-500/30 disabled:text-slate-500',
  ghost:
    'border border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 disabled:opacity-40',
  danger:
    'border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 disabled:opacity-40',
  muted: 'bg-white/5 text-slate-400 hover:bg-white/10 disabled:opacity-30',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  full?: boolean
}

export function Button({ variant = 'primary', full, className = '', ...rest }: Props) {
  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-medium tracking-wide transition-colors disabled:cursor-not-allowed ${
        STYLES[variant]
      } ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  )
}
