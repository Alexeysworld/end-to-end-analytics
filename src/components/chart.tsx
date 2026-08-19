import type { ReactNode } from 'react'
import type { PurchaseChannel } from '../data/types'

/**
 * Токены графиков.
 *
 * Палитра проверена скриптом validate_palette.js на белой поверхности:
 *  — каналы покупки (синий / оранжевый / аквамарин): все проверки PASS,
 *    у аквамарина контраст 2.82:1 — поэтому у него обязательны прямые подписи;
 *  — пара знака результата (зелёный / красный): CVD ΔE 6.5, это полоса 6–8,
 *    легальная только со вторичным кодированием. Знак всегда дублируется
 *    символом +/− в подписи и положением относительно нулевой линии.
 *
 * В недельной динамике оба ряда — деньги, идентичность там не нужна:
 * расход рисуем серым, маржу — тёмной линией. Хроматику тратим только
 * на каналы покупки.
 */
export const VIZ = {
  grid: '#e6e9ec',
  axis: '#7d8794',
  ink: '#12161c',
  spendFill: '#d0d5db',
  marginLine: '#12161c',
  pos: '#0f7b4f',
  neg: '#b3261e',
  zero: '#a8b0ba',
  channel: {
    web: '#2a78d6',
    app: '#eb6834',
    offline: '#1baf7a',
  } as Record<PurchaseChannel, string>,
} as const

export const axisProps = {
  stroke: VIZ.grid,
  tick: { fill: VIZ.axis, fontSize: 10 },
  tickLine: false,
} as const

/** Подложка тултипа: одна на все графики прототипа. */
export function TooltipBox({ title, rows }: { title: string; rows: ReactNode }) {
  return (
    <div className="rounded border border-ink-200 bg-white px-2 py-1.5 shadow-md">
      <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-500">
        {title}
      </div>
      <table className="border-collapse">
        <tbody>{rows}</tbody>
      </table>
    </div>
  )
}

export function TooltipRow({
  label,
  value,
  swatch,
  tone,
}: {
  label: string
  value: string
  swatch?: string
  tone?: 'pos' | 'neg'
}) {
  return (
    <tr>
      <td className="pr-2 align-middle">
        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-600">
          {swatch && (
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: swatch }} />
          )}
          {label}
        </span>
      </td>
      <td
        className={`num text-xs font-medium ${
          tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-ink-900'
        }`}
      >
        {value}
      </td>
    </tr>
  )
}

/** Легенда: обязательна при двух и более рядах. */
export function Legend({
  items,
}: {
  items: { label: string; color: string; shape?: 'bar' | 'line' }[]
}) {
  return (
    <div className="flex items-center gap-3">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-2xs text-ink-500">
          {it.shape === 'line' ? (
            <span className="h-[2px] w-3 rounded-sm" style={{ background: it.color }} />
          ) : (
            <span className="h-2 w-2 rounded-sm" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  )
}
