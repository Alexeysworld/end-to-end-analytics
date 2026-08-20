import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { pct, pctSigned } from '../lib/format'
import { NoteButton } from '../state/notes'

/** Числовая ячейка. Цветом кодируем только знак результата. */
export function Num({
  children,
  tone = 'plain',
  strong = false,
  muted = false,
  className = '',
  title,
}: {
  children: ReactNode
  tone?: 'plain' | 'sign' | 'pos' | 'neg'
  strong?: boolean
  muted?: boolean
  className?: string
  title?: string
}) {
  const toneClass =
    tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : muted ? 'text-ink-400' : ''
  return (
    <span
      title={title}
      className={`num ${toneClass} ${strong ? 'font-semibold' : ''} ${className}`}
    >
      {children}
    </span>
  )
}

/** ROI: знак — цветом, значение — моноширинным. */
export function Roi({
  value,
  previous,
  strong = false,
  size = 'sm',
}: {
  value: number
  /** Значение на другом горизонте — показываем призраком, если знак сменился. */
  previous?: number
  strong?: boolean
  size?: 'sm' | 'lg'
}) {
  const flipped = previous !== undefined && Math.sign(previous) !== Math.sign(value)
  return (
    <span className="inline-flex items-baseline justify-end gap-1">
      {flipped && (
        <span
          className="num text-2xs text-ink-300 line-through decoration-ink-300"
          title="Значение на другом горизонте окупаемости"
        >
          {pctSigned(previous!, 0)}
        </span>
      )}
      <span
        className={`num ${value >= 0 ? 'text-pos' : 'text-neg'} ${
          strong ? 'font-semibold' : ''
        } ${size === 'lg' ? 'text-[15px]' : ''}`}
      >
        {pctSigned(value)}
      </span>
    </span>
  )
}

/**
 * Сегментированный переключатель со скользящим индикатором.
 * Индикатор позиционируется по реальным размерам кнопок, а не по долям
 * ширины: подписи разной длины, и доли их разъезжают.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
}: {
  value: T
  options: { value: T; label: string; hint?: string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'lg'
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [box, setBox] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const el = refs.current[value]
    if (el) setBox({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value, options.length, size])

  return (
    <div
      className={`relative inline-flex rounded-md border border-ink-200 bg-white p-0.5 ${
        size === 'lg' ? 'text-base' : 'text-xs'
      }`}
    >
      {box && (
        <span
          className="absolute inset-y-0.5 rounded bg-ink-900 transition-[left,width] duration-300 ease-out"
          style={{ left: box.left, width: box.width }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[o.value] = el
          }}
          type="button"
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={`relative z-10 whitespace-nowrap rounded px-2.5 ${
            size === 'lg' ? 'py-1.5 font-medium' : 'py-1'
          } transition-colors ${
            o.value === value ? 'text-white' : 'text-ink-600 hover:text-ink-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode
  tone?: 'neutral' | 'pos' | 'neg' | 'warn' | 'accent'
  title?: string
}) {
  const map = {
    neutral: 'border-ink-200 bg-ink-50 text-ink-600',
    pos: 'border-pos/30 bg-pos-soft text-pos',
    neg: 'border-neg/30 bg-neg-soft text-neg',
    warn: 'border-warn/30 bg-warn-soft text-warn',
    accent: 'border-accent/30 bg-accent-soft text-accent',
  } as const
  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded border px-1 py-px text-2xs font-medium leading-[14px] ${map[tone]}`}
    >
      {children}
    </span>
  )
}

/** Заголовок блока с кнопкой комментария. */
export function BlockHeader({
  title,
  subtitle,
  blockId,
  screen,
  right,
}: {
  title: string
  subtitle?: ReactNode
  blockId: string
  screen: string
  right?: ReactNode
}) {
  return (
    <div className="mb-2 flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-semibold leading-tight text-ink-900">{title}</h2>
          <NoteButton blockId={blockId} blockLabel={title} screen={screen} />
        </div>
        {subtitle && <p className="mt-0.5 max-w-[860px] text-xs leading-snug text-ink-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function Panel({
  children,
  className = '',
  pad = true,
}: {
  children: ReactNode
  className?: string
  pad?: boolean
}) {
  return (
    <section
      className={`rounded-md border border-ink-200 bg-white ${pad ? 'p-3' : ''} ${className}`}
    >
      {children}
    </section>
  )
}

/** Горизонтальная полоса-доля: используем вместо второй колонки процентов. */
export function ShareBar({
  parts,
}: {
  parts: { value: number; className: string; label: string }[]
}) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1
  return (
    <span className="inline-flex h-[6px] w-full overflow-hidden rounded-sm bg-ink-100">
      {parts.map((p, i) => (
        <span
          key={i}
          title={`${p.label}: ${pct(p.value / total, 0)}`}
          className={p.className}
          style={{ width: `${(p.value / total) * 100}%` }}
        />
      ))}
    </span>
  )
}

/** Подпись метрики над числом — для плотных блоков в карточке. */
export function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'pos' | 'neg'
}) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wide text-ink-400">{label}</div>
      <div
        className={`mt-0.5 font-mono text-[15px] font-semibold tabular-nums ${
          tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-ink-900'
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-2xs leading-tight text-ink-400">{hint}</div>}
    </div>
  )
}
