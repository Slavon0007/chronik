import { useId } from 'react'
import type { CategoryId } from '../types'

type Props = {
  category: CategoryId
  seed?: string
  className?: string
}

function hashSeed(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/**
 * Hand-drawn vector scenes used as event banners. Keeping the artwork local
 * makes the PWA independent of stock-photo services and guarantees a
 * consistent editorial look for every category.
 */
export function EventArt({ category, seed = category, className }: Props) {
  const uid = useId().replace(/[:]/g, '')
  const variant = hashSeed(seed) % 3
  const gradientId = `sky-${uid}`
  const glowId = `glow-${uid}`
  const groundId = `ground-${uid}`

  const sky: Record<CategoryId, [string, string]> = {
    markt: ['#f0d3a8', '#cf8a64'],
    reenactment: ['#d9ddc4', '#93a684'],
    larp: ['#2a2a49', '#5e5079'],
    turnier: ['#ecd5a8', '#c99b63'],
    cosplay: ['#3c2033', '#7c3a50'],
  }

  return (
    <div className={`event-art event-art--${category} ${className ?? ''}`}>
      <svg
        viewBox="0 0 640 360"
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sky[category][0]} />
            <stop offset="100%" stopColor={sky[category][1]} />
          </linearGradient>
          <linearGradient id={groundId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(20, 26, 18, 0.12)" />
            <stop offset="100%" stopColor="rgba(20, 26, 18, 0.5)" />
          </linearGradient>
          <radialGradient id={glowId}>
            <stop offset="0%" stopColor="#ffd89a" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#f3a95f" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f3a95f" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="640" height="360" fill={`url(#${gradientId})`} />

        {category === 'markt' && <MarktScene variant={variant} glow={glowId} ground={groundId} />}
        {category === 'reenactment' && <ReenactmentScene variant={variant} />}
        {category === 'larp' && <LarpScene variant={variant} glow={glowId} />}
        {category === 'turnier' && <TurnierScene glow={glowId} />}
        {category === 'cosplay' && <CosplayScene variant={variant} glow={glowId} />}
      </svg>
    </div>
  )
}

type SceneProps = {
  uid: string
  variant: number
  glow: string
  ground: string
}

function MarktScene({ variant, glow, ground }: Pick<SceneProps, 'variant' | 'glow' | 'ground'>) {
  const sunX = 470 + variant * 42
  return (
    <g>
      <circle cx={sunX} cy={92} r={58} fill="#f7dfae" opacity="0.9" />
      <circle cx={sunX} cy={92} r={92} fill="#f7dfae" opacity="0.12" />

      {/* distant hills */}
      <path d="M0 236 C90 208 150 230 226 218 C320 202 380 236 460 222 C540 208 590 224 640 212 L640 300 L0 300 Z" fill="#b97954" opacity="0.55" />
      <path d="M0 258 C100 238 180 256 280 246 C400 234 500 258 640 240 L640 320 L0 320 Z" fill="#96593d" opacity="0.65" />

      {/* town silhouette */}
      <g fill="#6d3a2c" opacity="0.9">
        <rect x="48" y="222" width="66" height="72" />
        <path d="M40 222 L81 190 L122 222 Z" />
        <rect x="120" y="236" width="54" height="58" />
        <path d="M112 236 L147 210 L182 236 Z" />
        <rect x="196" y="204" width="20" height="90" />
        <path d="M190 204 L206 168 L222 204 Z" fill="#7a4432" />
        <rect x="228" y="228" width="72" height="66" />
        <path d="M220 228 L264 198 L308 228 Z" />
        <rect x="318" y="240" width="58" height="54" />
        <path d="M310 240 L347 214 L384 240 Z" />
      </g>
      {/* windows */}
      <g fill="#f2cf90" opacity="0.75">
        <rect x="62" y="240" width="7" height="10" />
        <rect x="82" y="240" width="7" height="10" />
        <rect x="62" y="260" width="7" height="10" />
        <rect x="134" y="250" width="6" height="9" />
        <rect x="152" y="250" width="6" height="9" />
        <rect x="244" y="244" width="7" height="10" />
        <rect x="266" y="244" width="7" height="10" />
        <rect x="244" y="264" width="7" height="10" />
      </g>

      {/* bunting */}
      <path d="M20 148 C140 190 280 128 430 168 C500 186 570 172 630 146" fill="none" stroke="#4e2c22" strokeWidth="2" opacity="0.5" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const x = 70 + i * 70
        const y = 158 + Math.sin(i * 0.9) * 16
        return <path key={i} d={`M${x} ${y} l14 3 l-8 16 z`} fill={i % 2 ? '#f3d9a4' : '#a84a2b'} opacity="0.85" />
      })}

      {/* tents */}
      <g>
        <path d="M382 318 L456 216 L530 318 Z" fill="#f2dfba" />
        <path d="M456 216 L530 318 L478 318 Z" fill="#a84a2b" opacity="0.85" />
        <path d="M448 318 L456 216 L464 318 Z" fill="#6d3a2c" opacity="0.35" />
        <path d="M382 318 L456 216 L530 318" fill="none" stroke="#5c3024" strokeWidth="3" opacity="0.55" />
        <path d="M456 216 l0 -20 l28 8 l-28 8" fill="#c9a24b" />
      </g>
      <g>
        <path d="M530 326 L584 254 L638 326 Z" fill="#e7c896" />
        <path d="M584 254 L638 326 L602 326 Z" fill="#7f3a2a" opacity="0.8" />
        <path d="M584 254 l0 -16 l22 6 l-22 6" fill="#e9d3a6" />
      </g>

      {/* ground */}
      <rect y="310" width="640" height="50" fill={`url(#${ground})`} />
      <rect y="322" width="640" height="38" fill="#4a2a20" opacity="0.44" />

      {/* lantern glow + visitors */}
      <circle cx="338" cy="304" r="72" fill={`url(#${glow})`} />
      <g fill="#3a211a" opacity="0.9">
        <circle cx="292" cy="300" r="8" />
        <path d="M286 308 h12 l3 26 h-18 z" />
        <circle cx="322" cy="304" r="7" />
        <path d="M316 311 h12 l3 23 h-18 z" />
        <circle cx="356" cy="298" r="8" />
        <path d="M350 306 h13 l3 28 h-19 z" />
      </g>
      <circle cx="338" cy="300" r="4" fill="#ffd89a" />
    </g>
  )
}

function ReenactmentScene({ variant }: { variant: number }) {
  const castleX = 350 + variant * 26
  return (
    <g>
      <circle cx="150" cy="104" r="46" fill="#f3e6bb" opacity="0.65" />
      <path d="M0 250 C80 220 160 246 238 228 C320 208 400 246 478 228 C548 212 590 226 640 218 L640 330 L0 330 Z" fill="#5a7355" opacity="0.7" />
      <path d="M0 282 C100 260 190 286 290 270 C400 252 510 284 640 262 L640 360 L0 360 Z" fill="#3f5a44" />

      {/* castle */}
      <g transform={`translate(${castleX} 0)`} fill="#2f4436">
        <rect x="0" y="188" width="190" height="96" />
        <rect x="-18" y="158" width="44" height="126" />
        <rect x="166" y="144" width="42" height="140" />
        <rect x="72" y="132" width="46" height="152" />
        <path d="M-22 158 h52 l-6 -12 h-8 l-5 -14 l-5 14 h-8 l-5 -10 l-5 10 h-8 z" />
        <path d="M162 144 h50 l-7 -14 h-8 l-5 -16 l-5 16 h-9 l-5 -12 l-5 12 h-8 z" />
        <path d="M68 132 h54 l-8 -16 h-9 l-5 -18 l-5 18 h-10 l-5 -12 l-5 12 h-8 z" />
        <rect x="88" y="198" width="14" height="24" rx="7" fill="#e8d5a7" opacity="0.55" />
        <rect x="176" y="190" width="12" height="22" rx="6" fill="#e8d5a7" opacity="0.5" />
      </g>

      {/* banners */}
      <g>
        <rect x={castleX + 82} y="66" width="2.5" height="70" fill="#3a2b22" />
        <path d={`M${castleX + 85} 68 h42 l-10 13 l10 13 h-42 z`} fill="#a84a2b" />
        <rect x={castleX + 192} y="50" width="2.5" height="96" fill="#3a2b22" />
        <path d={`M${castleX + 195} 54 h34 l-8 11 l8 11 h-34 z`} fill="#c9a24b" />
      </g>

      {/* foreground camp */}
      <g>
        <path d="M58 330 L118 262 L178 330 Z" fill="#e6d4aa" />
        <path d="M118 262 L178 330 L140 330 Z" fill="#7b6a45" opacity="0.6" />
        <path d="M118 262 v-14 l18 5 l-18 5" fill="#a84a2b" />
        <path d="M198 336 L242 288 L286 336 Z" fill="#d9c79c" opacity="0.95" />
      </g>
      {/* pikes */}
      <g stroke="#3a2b22" strokeWidth="3" opacity="0.75">
        <path d="M470 332 L500 218" />
        <path d="M492 336 L520 226" />
        <path d="M516 338 L540 238" />
        <path d="M538 340 L558 250" />
      </g>
      <g fill="#c9a24b">
        <path d="M496 218 l8 4 l-4 10 z" />
        <path d="M516 226 l8 4 l-4 10 z" />
        <path d="M536 238 l8 4 l-4 10 z" />
        <path d="M554 250 l8 4 l-4 10 z" />
      </g>

      <rect y="330" width="640" height="30" fill="#2c3f31" opacity="0.55" />
      <path d="M0 330 h640" stroke="#26372b" strokeWidth="2" opacity="0.4" />

      {/* birds */}
      <g stroke="#3c4f3d" strokeWidth="2.5" fill="none" opacity="0.7">
        <path d="M236 92 q8 -8 16 0 q8 -8 16 0" />
        <path d="M282 68 q6 -6 12 0 q6 -6 12 0" />
        <path d="M210 120 q5 -5 10 0 q5 -5 10 0" />
      </g>
    </g>
  )
}

function LarpScene({ variant, glow }: Pick<SceneProps, 'variant' | 'glow'>) {
  const moonX = 470 + variant * 30
  return (
    <g>
      <circle cx={moonX} cy="78" r="38" fill="#f2e6c5" />
      <circle cx={moonX - 12} cy="70" r="34" fill="#3b385c" opacity="0.92" />
      <g fill="#f4e8c8">
        {[
          [86, 54, 2],
          [146, 92, 1.6],
          [210, 44, 2.2],
          [264, 104, 1.4],
          [330, 62, 2],
          [392, 38, 1.4],
          [556, 46, 1.8],
          [602, 96, 1.3],
          [72, 128, 1.4],
          [180, 140, 1.2],
          [560, 142, 1.8],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} opacity={0.5 + (i % 4) * 0.12} />
        ))}
      </g>

      {/* dragon */}
      <g fill="none" stroke="#201f35" strokeWidth="4" strokeLinecap="round" opacity="0.8">
        <path d="M196 132 q34 -26 68 -6 q16 9 26 4 q-8 15 -26 12 q-12 18 -32 12 q-14 16 -28 8 q6 -12 14 -16 q-14 -6 -22 -14 z" fill="#201f35" stroke="none" />
        <path d="M196 132 q-14 -8 -24 -28 q18 8 26 18" fill="#201f35" stroke="none" />
      </g>

      {/* mountains */}
      <path d="M0 246 L90 158 L168 238 L252 144 L356 246 L442 176 L520 240 L596 178 L640 224 L640 320 L0 320 Z" fill="#3b3a5c" opacity="0.9" />
      <path d="M0 282 L120 214 L214 282 L312 206 L420 286 L520 228 L640 282 L640 360 L0 360 Z" fill="#26263f" />

      {/* pines */}
      <g fill="#1d1e32">
        {[
          [36, 290, 1],
          [78, 302, 0.8],
          [590, 292, 1.1],
          [548, 306, 0.75],
          [626, 310, 0.9],
        ].map(([x, y, scale], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${scale})`}>
            <rect x="-3" y="0" width="6" height="34" fill="#171827" />
            <path d="M0 -58 L24 -6 L-24 -6 Z" />
            <path d="M0 -34 L30 14 L-30 14 Z" />
          </g>
        ))}
      </g>

      {/* camp */}
      <circle cx="318" cy="296" r="88" fill={`url(#${glow})`} />
      <g>
        <path d="M244 330 L306 236 L368 330 Z" fill="#d9c9a4" />
        <path d="M306 236 L368 330 L326 330 Z" fill="#7c6b91" />
        <path d="M306 236 v-20 l22 6 l-22 6" fill="#c9a24b" />
        <path d="M368 334 L410 268 L452 334 Z" fill="#b7a6c4" opacity="0.9" />
      </g>
      <g>
        <path d="M320 330 l10 -22 l10 22 z" fill="#f0a35a" />
        <path d="M326 330 l4 -12 l5 12 z" fill="#ffe3a8" />
        <circle cx="330" cy="318" r="3" fill="#fff1c9" />
      </g>
      <g fill="#15162a">
        <circle cx="292" cy="306" r="6" />
        <path d="M287 312 h10 l2 19 h-14 z" />
        <circle cx="352" cy="302" r="6" />
        <path d="M347 308 h10 l2 22 h-14 z" />
      </g>
      <rect y="330" width="640" height="30" fill="#161729" opacity="0.55" />
    </g>
  )
}

function TurnierScene({ glow }: { glow: string }) {
  return (
    <g>
      <circle cx="512" cy="86" r="48" fill="#f6e2b6" opacity="0.8" />
      <path d="M0 236 C110 210 200 236 300 218 C410 198 520 232 640 206 L640 330 L0 330 Z" fill="#b08a55" opacity="0.65" />
      <path d="M0 276 C120 254 240 280 360 262 C470 246 560 270 640 254 L640 360 L0 360 Z" fill="#8a6a3e" />

      {/* distant castle */}
      <g fill="#6f5433" opacity="0.7" transform="translate(70 118) scale(0.72)">
        <rect x="0" y="86" width="150" height="70" />
        <rect x="24" y="42" width="34" height="114" />
        <rect x="98" y="54" width="30" height="102" />
        <path d="M20 42 h42 l-6 -12 h-7 l-4 -14 l-4 14 h-7 l-4 -10 l-4 10 h-6 z" />
        <path d="M94 54 h38 l-5 -10 h-6 l-4 -12 l-4 12 h-6 l-4 -10 l-4 10 h-5 z" />
      </g>

      {/* grandstand */}
      <g fill="#4c3823" opacity="0.85">
        <path d="M0 318 L0 276 L94 262 L94 318 Z" />
        <path d="M0 276 L94 262 L94 274 L0 288 Z" fill="#f0dfb9" opacity="0.35" />
      </g>
      <g fill="#2f2619" opacity="0.65">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <circle key={i} cx={12 + i * 10} cy={266 - (i % 2) * 5} r="4" />
        ))}
      </g>

      {/* banners */}
      <g>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${150 + i * 168} 0)`}>
            <rect x="0" y="110" width="3" height="150" fill="#44301f" />
            <path d="M3 116 h54 l-12 16 l12 16 h-54 z" fill={i % 2 ? '#a84a2b' : '#c9a24b'} />
            <path d="M3 116 h54 l-12 16 l12 16 h-54 z" fill="none" stroke="#4b3422" strokeWidth="1.5" opacity="0.35" />
          </g>
        ))}
      </g>

      {/* crossed lances */}
      <g>
        <path d="M222 302 L472 138" stroke="#5a4029" strokeWidth="10" strokeLinecap="round" />
        <path d="M472 138 l28 -12 l-14 24 z" fill="#d8c39a" />
        <path d="M418 302 L168 138" stroke="#5a4029" strokeWidth="10" strokeLinecap="round" />
        <path d="M168 138 l-28 -12 l14 24 z" fill="#d8c39a" />
      </g>

      {/* central shield */}
      <g transform="translate(320 246)">
        <path d="M-64 -76 H64 V18 C64 58 32 82 0 94 C-32 82 -64 58 -64 18 Z" fill="#efe1c0" stroke="#4b3422" strokeWidth="5" />
        <path d="M-64 -76 H64 V18 C64 58 32 82 0 94 C-32 82 -64 58 -64 18 Z" fill="none" />
        <path d="M0 -76 V94 M-64 -14 H64" stroke="#a84a2b" strokeWidth="10" opacity="0.85" />
        <path d="M0 -46 l10 18 l20 3 l-14 14 l3 20 l-19 -9 l-19 9 l3 -20 l-14 -14 l20 -3 z" fill="#c9a24b" opacity="0.9" />
      </g>

      {/* ground shadow */}
      <ellipse cx="320" cy="344" rx="240" ry="16" fill={`url(#${glow})`} opacity="0.45" />
      <rect y="328" width="640" height="32" fill="#5b4327" opacity="0.55" />
      <path d="M0 328 H640" stroke="#3f2e1c" strokeWidth="2" opacity="0.4" />

      {/* crowd */}
      <g fill="#332819" opacity="0.8">
        {[420, 438, 456, 474, 492, 510, 528, 546, 564, 582, 600, 618].map((x, i) => (
          <g key={x}>
            <circle cx={x} cy={304 - (i % 3) * 3} r="5" />
            <path d={`M${x - 6} ${310 - (i % 3) * 3} h12 l3 18 h-18 z`} />
          </g>
        ))}
      </g>
    </g>
  )
}

function CosplayScene({ variant, glow }: Pick<SceneProps, 'variant' | 'glow'>) {
  const tilt = variant * 1.4 - 1.4
  return (
    <g>
      <rect width="640" height="360" fill="#321a2b" opacity="0.25" />
      {/* curtains */}
      <g fill="#5b2335">
        <path d="M0 0 H136 C116 62 132 118 104 180 C80 232 96 288 62 360 H0 Z" />
        <path d="M640 0 H504 C524 62 508 118 536 180 C560 232 544 288 578 360 H640 Z" />
      </g>
      <g stroke="#7c3549" strokeWidth="10" opacity="0.55" fill="none">
        <path d="M22 0 C10 80 38 138 8 218 C-6 268 16 318 4 360" />
        <path d="M618 0 C630 80 602 138 632 218 C646 268 624 318 636 360" />
        <path d="M78 0 C66 70 92 130 64 200" />
        <path d="M562 0 C574 70 548 130 576 200" />
      </g>

      {/* spotlights */}
      <g opacity="0.26">
        <path d="M190 0 L104 360 L286 360 L242 0 Z" fill="#ffe6b0" />
        <path d="M450 0 L354 360 L536 360 L494 0 Z" fill="#ffd3bd" />
      </g>
      <circle cx="320" cy="268" r="138" fill={`url(#${glow})`} opacity="0.5" />

      {/* masks */}
      <g transform={`translate(320 168) rotate(${tilt})`}>
        <g transform="translate(-96 0)">
          <path d="M-54 -70 C-24 -92 34 -92 56 -64 C70 -46 48 -4 22 24 C8 40 0 52 0 72 C0 52 -8 40 -22 24 C-48 -4 -70 -46 -54 -70 Z" fill="#f0ddba" />
          <path d="M-42 -34 q16 -14 30 0" stroke="#3c2330" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M14 -34 q16 -14 30 0" stroke="#3c2330" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M-18 10 q18 18 36 0" stroke="#a84a2b" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M-2 4 l-8 16 h16 z" fill="#a84a2b" opacity="0.7" />
        </g>
        <g transform="translate(96 8) scale(0.92)">
          <path d="M-54 -70 C-24 -92 34 -92 56 -64 C70 -46 48 -4 22 24 C8 40 0 52 0 72 C0 52 -8 40 -22 24 C-48 -4 -70 -46 -54 -70 Z" fill="#e4c79f" />
          <path d="M-42 -34 q16 -8 30 0" stroke="#3c2330" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M14 -34 q16 -8 30 0" stroke="#3c2330" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M-18 26 q18 -20 36 0" stroke="#6d2b45" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M-2 12 l-8 16 h16 z" fill="#6d2b45" opacity="0.7" />
        </g>
      </g>

      {/* sparkles */}
      <g fill="#f4d79c">
        {[
          [146, 88, 1],
          [492, 66, 0.8],
          [520, 138, 1.1],
          [118, 176, 0.7],
          [556, 212, 0.9],
          [210, 46, 0.8],
        ].map(([x, y, s], i) => (
          <path
            key={i}
            d={`M${x} ${y - 12 * s} L${x + 3 * s} ${y - 3 * s} L${x + 12 * s} ${y} L${x + 3 * s} ${y + 3 * s} L${x} ${y + 12 * s} L${x - 3 * s} ${y + 3 * s} L${x - 12 * s} ${y} L${x - 3 * s} ${y - 3 * s} Z`}
            opacity="0.85"
          />
        ))}
      </g>

      {/* stage floor */}
      <path d="M0 316 C120 296 220 312 320 306 C430 300 530 314 640 300 L640 360 L0 360 Z" fill="#2a1623" opacity="0.75" />
      <path d="M0 326 C140 308 260 324 380 318 C480 312 560 322 640 312" stroke="#c9a24b" strokeWidth="2" opacity="0.3" fill="none" />
    </g>
  )
}
