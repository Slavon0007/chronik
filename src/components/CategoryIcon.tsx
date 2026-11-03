import { Castle, Shield, Swords, Tent, VenetianMask, type LucideIcon } from 'lucide-react'
import type { CategoryId } from '../types'

const ICONS: Record<CategoryId, LucideIcon> = {
  markt: Tent,
  reenactment: Castle,
  larp: Shield,
  turnier: Swords,
  cosplay: VenetianMask,
}

type Props = {
  category: CategoryId
  size?: number
  strokeWidth?: number
  className?: string
}

export function CategoryIcon({ category, size = 16, strokeWidth = 1.8, className }: Props) {
  const Icon = ICONS[category]
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />
}
