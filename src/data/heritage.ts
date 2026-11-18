import type { HeritageKind } from '../types'

export const HERITAGE_KINDS = {
  castle: { id: 'castle', label: 'Historische Burg oder Schloss', shortLabel: 'Burgen & Schlösser', color: '#814c22', tint: '#f2dfcc' },
  museum: { id: 'museum', label: 'Historisches Museum', shortLabel: 'Museen', color: '#28577b', tint: '#d8e8f5' },
} satisfies Record<HeritageKind, { id: HeritageKind; label: string; shortLabel: string; color: string; tint: string }>
