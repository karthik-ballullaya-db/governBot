import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './ButtonWithIcon.css'

export type ButtonWithIconVariant =
  | 'outline-teal'
  | 'outline-pink'
  | 'flat-dark'
  | 'icon-dismiss'
  | 'filter-clear'

const variantClass: Record<ButtonWithIconVariant, string> = {
  'outline-teal': 'btnWithIcon--outline-teal',
  'outline-pink': 'btnWithIcon--outline-pink',
  'flat-dark': 'btnWithIcon--flat-dark',
  'icon-dismiss': 'btnWithIcon--icon-dismiss',
  'filter-clear': 'btnWithIcon--filter-clear',
}

export type ButtonWithIconProps = {
  variant?: ButtonWithIconVariant
  icon: ReactNode
  children?: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

export function ButtonWithIcon({ variant, icon, children, className = '', type = 'button', ...rest }: ButtonWithIconProps) {
  return (
    <button type={type} className={`btnWithIcon ${variant ? variantClass[variant] : ''} ${className}`.trim()} {...rest}>
      {icon}
      {children}
    </button>
  )
}
