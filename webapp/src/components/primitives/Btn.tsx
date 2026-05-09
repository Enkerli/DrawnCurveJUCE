// Btn.tsx — generic button primitives for the DrawnQurve webapp.
// Ported from Source/WebUI/design/ui-primitives.jsx (Btn / IconBtn).

import type { CSSProperties, ReactNode, MouseEventHandler, KeyboardEventHandler } from 'react'

// ── Btn ──────────────────────────────────────────────────────────────────────
// A rectangular labelled button.  Variants: 'outline' | 'fill' | 'ghost'.

export interface BtnProps {
  variant?: 'outline' | 'fill' | 'ghost'
  active?: boolean
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  title?: string
  onClick?: MouseEventHandler<HTMLButtonElement>
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>
  children: ReactNode
  style?: CSSProperties
}

const SIZE_STYLES: Record<string, CSSProperties> = {
  sm: { padding: '2px 8px',  fontSize: 10, height: 22, borderRadius: 3 },
  md: { padding: '4px 12px', fontSize: 11, height: 28, borderRadius: 4 },
  lg: { padding: '6px 16px', fontSize: 12, height: 34, borderRadius: 4 },
}

export function Btn({
  variant = 'outline',
  active = false,
  size = 'md',
  disabled,
  title,
  onClick,
  onKeyDown,
  children,
  style,
}: BtnProps) {
  const variantStyle: CSSProperties =
    variant === 'outline'
      ? { border: '1px solid currentColor', background: active ? 'currentColor' : 'transparent' }
      : variant === 'fill'
      ? { border: '1px solid transparent', background: 'currentColor' }
      : { border: '1px solid transparent', background: 'transparent' }

  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
    letterSpacing: 0.3,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    userSelect: 'none',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    ...SIZE_STYLES[size],
    ...variantStyle,
    ...style,
  }
  return (
    <button disabled={disabled} title={title} onClick={onClick} onKeyDown={onKeyDown} style={base}>
      {children}
    </button>
  )
}

// ── IconBtn ───────────────────────────────────────────────────────────────────
// A square icon-only button.

export interface IconBtnProps {
  size?: number   // pixel side length (default 28)
  active?: boolean
  disabled?: boolean
  title?: string
  onClick?: MouseEventHandler<HTMLButtonElement>
  children: ReactNode
  style?: CSSProperties
}

export function IconBtn({ size: sz = 28, active = false, disabled, title, onClick, children, style }: IconBtnProps) {
  const s: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: sz,
    height: sz,
    borderRadius: 4,
    border: '1px solid currentColor',
    background: active ? 'currentColor' : 'transparent',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    padding: 0,
    flexShrink: 0,
    ...style,
  }
  return (
    <button disabled={disabled} title={title} onClick={onClick} style={s}>
      {children}
    </button>
  )
}
