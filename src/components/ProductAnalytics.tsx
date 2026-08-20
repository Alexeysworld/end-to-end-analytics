import { useMemo, useState } from 'react'
import { BRAND_BY_ID } from '../data/brands'
import { dataset } from '../data/generate'
import { brandTotals, derive, type BrandTotals } from '../data/metrics'
import type { Horizon, TreeNode } from '../data/types'
import { count, moneyShort, pct, pctSigned } from '../lib/format'
import { VIZ } from './chart'
import { Badge, BlockHeader, Metric, Num, Panel, Roi } from './ui'

const SCREEN = 'Товарная аналитика'

type SortKey =
  | 'name'
  | 'orders'
  | 'netOrders'
  | 'netRevenue'
  | 'aov'
  | 'marginRate'
  | 'returnRate'
  | 'repeat'
  | 'spend'
  | 'roi'

/** Искусственный корень: brandTotals обходит листья, поэтому нужен узел со всеми каналами. */
const ROOT: TreeNode = {
  id: 'root',
  level: 'source',
  name: 'Все источники',
  parentId: null,
  campaignId: null,
  children: dataset.sources,
  raw: dataset.totals,
}

export function ProductAnalytics({
  horizon,
  onOpenCampaign,
}: {
  horizon: Horizon
  onOpenCampaign: (id: string) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'netRevenue',
    dir: 'desc',
  })
  const [open, setOpen] = useState<Set<string>>(new Set())

  const brands = useMemo(() => brandTotals(ROOT, horizon), [horizon])

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const val = (b: BrandTotals): number | string => {
      switch (sort.key) {
        case 'name':
          return BRAND_BY_ID[b.brandId].name
        case 'orders':
          return b.orders
        case 'netOrders':
          return b.netOrders
        case 'netRevenue':
          return b.netRevenue
        case 'aov':
          return b.aov
        case 'marginRate':
          return b.marginRate
        case 'returnRate':
          return b.returnRate
        case 'repeat':
          return b.repeatOrdersShare
        case 'spend':
          return b.allocatedSpend
        case 'roi':
          return b.roi
      }
    }
    return [...brands].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      if (typeof va === 'string' || typeof vb === 'string')
        return String(va).localeCompare(String(vb), 'ru') * dir
      return (va - vb) * dir
    })
  }, [brands, sort])

  const totalNet = brands.reduce((a, b) => a + b.netRevenue, 0)
  const own = brands.find((b) => BRAND_BY_ID[b.brandId].kind === 'СТМ')
  const worst = [...brands].sort((a, b) => a.roi - b.roi)[0]
  const worstReturns = [...brands].sort((a, b) => b.returnRate - a.returnRate)[0]
  const t = derive(dataset.totals, horizon)

  const th = (key: SortKey, label: string, extra = '', hint?: string) => {
    const active = sort.key === key
    return (
      <th
        className={`thead-cell cursor-pointer hover:text-ink-900 ${extra}`}
        title={hint}
        onClick={() =>
          setSort((s) =>
            s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' },
          )
        }
      >
        <span className="inline-flex items-center gap-0.5">
          {label}
          <span className={`text-[8px] ${active ? 'text-ink-900' : 'text-ink-300'}`}>
            {active ? (sort.dir === 'desc' ? '▼' : '▲') : '⇅'}
          </span>
        </span>
      </th>
    )
  }

  const toggle = (id: string) =>
    setOpen((p) => {
      const n = new Set(p)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_1.1fr] gap-3">
        <Panel>
          <BlockHeader
            title="Что продаёт реклама"
            blockId="products-summary"
            screen={SCREEN}
            subtitle="Товарный взгляд на тот же расход: какие бренды платят за трафик, а какие его проедают."
          />
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Metric
              label="Доход от выкупленных"
              value={`${moneyShort(totalNet)} ₽`}
              hint={`средняя маржинальность ${pct(t.margin / t.netRevenue, 0)}`}
            />
            {own && (
              <Metric
                label="Доля СТМ в доходе"
                value={pct(own.revenueShare, 0)}
                hint={`${BRAND_BY_ID[own.brandId].name}: маржинальность ${pct(own.marginRate, 0)}, ROI ${pctSigned(own.roi, 0)}`}
                tone="pos"
              />
            )}
            <Metric
              label="Худший бренд по ROI"
              value={BRAND_BY_ID[worst.brandId].name}
              hint={`${pctSigned(worst.roi, 0)} · маржинальность ${pct(worst.marginRate, 0)} · возвраты ${pct(worst.returnRate, 0)}`}
              tone="neg"
            />
            <Metric
              label="Худший по возвратам"
              value={BRAND_BY_ID[worstReturns.brandId].name}
              hint={`возвраты ${pct(worstReturns.returnRate, 0)} · ${count(worstReturns.orders - worstReturns.netOrders)} заказов вернули`}
              tone="neg"
            />
          </div>
        </Panel>

        <Panel>
          <BlockHeader
            title="ROI по брендам"
            blockId="products-roi-bars"
            screen={SCREEN}
            subtitle="Расход распределён внутри каждого запроса пропорционально заказам — это допущение, а не факт."
          />
          <RoiBars brands={[...brands].sort((a, b) => b.roi - a.roi)} />
        </Panel>
      </div>

      <Panel pad={false}>
        <div className="border-b border-ink-200 p-3">
          <BlockHeader
            title="Бренды"
            blockId="products-table"
            screen={SCREEN}
            subtitle="Разверните бренд, чтобы увидеть, какие кампании его продают. Суммы по брендам точно равны итогам таблицы окупаемости."
          />
        </div>
        <table className="w-full border-collapse">
          <thead className="bg-ink-50">
            <tr className="border-b border-ink-200">
              {th('name', 'Бренд', 'w-[24%] text-left')}
              {th('orders', 'Заказы', 'text-right')}
              {th('netOrders', 'Выкупл. заказы', 'text-right')}
              {th('netRevenue', 'Доход от выкупл.', 'text-right')}
              {th('aov', 'Ср. чек', 'text-right')}
              {th('marginRate', 'Маржинальность', 'text-right')}
              {th('returnRate', 'Возвраты', 'text-right')}
              {th('repeat', '% повторных', 'text-right')}
              {th('spend', 'Расход (распр.)', 'text-right', 'Расход, отнесённый на бренд пропорционально заказам внутри каждого запроса')}
              {th('roi', 'ROI', 'pr-3 text-right')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const meta = BRAND_BY_ID[b.brandId]
              const expanded = open.has(b.brandId)
              return [
                <tr key={b.brandId} className="group hover:bg-ink-50">
                  <td
                    className={`tcell border-l-2 ${
                      b.roi < 0 ? 'border-l-neg' : 'border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggle(b.brandId)}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-ink-200 bg-white text-[9px] text-ink-500 hover:border-ink-400"
                        title={expanded ? 'Свернуть' : 'Показать кампании'}
                      >
                        {expanded ? '−' : '+'}
                      </button>
                      <span className="text-sm text-ink-900">{meta.name}</span>
                      <Badge tone={meta.kind === 'СТМ' ? 'pos' : 'neutral'} title={meta.note}>
                        {meta.kind}
                      </Badge>
                      {b.returnRate > 0.3 && (
                        <Badge tone="neg" title="Возвращают почти треть заказанного">
                          возвраты
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="tcell text-right"><Num>{count(b.orders)}</Num></td>
                  <td className="tcell text-right">
                    <Num>{count(b.netOrders)}</Num>
                    <div
                      className={`text-2xs ${b.buyoutRate < 0.75 ? 'text-neg' : 'text-ink-400'}`}
                    >
                      {pct(b.buyoutRate, 0)}
                    </div>
                  </td>
                  <td className="tcell text-right">
                    <Num>{moneyShort(b.netRevenue)}</Num>
                    <div className="text-2xs text-ink-400">{pct(b.revenueShare, 0)}</div>
                  </td>
                  <td className="tcell text-right"><Num>{moneyShort(b.aov)}</Num></td>
                  <td className="tcell text-right">
                    <Num strong={b.marginRate > 0.35}>{pct(b.marginRate, 0)}</Num>
                  </td>
                  <td className="tcell text-right">
                    <Num tone={b.returnRate > 0.3 ? 'neg' : 'plain'} muted={b.returnRate <= 0.15}>
                      {pct(b.returnRate, 0)}
                    </Num>
                  </td>
                  <td className="tcell text-right"><Num>{pct(b.repeatOrdersShare, 0)}</Num></td>
                  <td className="tcell text-right"><Num muted>{moneyShort(b.allocatedSpend)}</Num></td>
                  <td className="tcell pr-3 text-right"><Roi value={b.roi} strong /></td>
                </tr>,
                ...(expanded ? brandCampaignRows(b.brandId, horizon, onOpenCampaign) : []),
              ]
            })}
          </tbody>
          <tfoot className="bg-ink-100">
            <tr className="border-t-2 border-ink-300 font-semibold">
              <td className="px-2 py-2 text-sm">Итого · {brands.length} брендов</td>
              <td className="px-2 py-2 text-right"><Num strong>{count(t.orders)}</Num></td>
              <td className="px-2 py-2 text-right"><Num strong>{count(t.netOrders)}</Num></td>
              <td className="px-2 py-2 text-right"><Num strong>{moneyShort(t.netRevenue)}</Num></td>
              <td className="px-2 py-2 text-right"><Num strong>{moneyShort(t.aov)}</Num></td>
              <td className="px-2 py-2 text-right">
                <Num strong>{pct(t.margin / t.netRevenue, 0)}</Num>
              </td>
              <td className="px-2 py-2 text-right"><Num strong>{pct(1 - t.buyoutRate, 0)}</Num></td>
              <td className="px-2 py-2 text-right"><Num strong>{pct(t.repeatOrdersShare, 0)}</Num></td>
              <td className="px-2 py-2 text-right"><Num strong>{moneyShort(t.spend)}</Num></td>
              <td className="px-2 py-2 pr-3 text-right"><Roi value={t.roi} strong /></td>
            </tr>
          </tfoot>
        </table>
        <div className="border-t border-ink-200 px-3 py-1.5 text-2xs text-ink-500">
          Бренд — разложение уже посчитанных чисел запроса, а не отдельный расчёт: суммы по
          брендам точно равны итогам таблицы окупаемости. Расход рекламы живёт на запросе,
          а бренд на товаре, поэтому расход распределён внутри каждого запроса пропорционально
          заказам — иначе носки платили бы за клик по кожаной куртке.
        </div>
      </Panel>
    </div>
  )
}

/** Кампании, которые продают этот бренд. */
function brandCampaignRows(
  brandId: string,
  horizon: Horizon,
  onOpenCampaign: (id: string) => void,
) {
  const rows = dataset.campaigns
    .map((c) => ({ campaign: c, slice: brandTotals(c, horizon).find((b) => b.brandId === brandId) }))
    .filter((r) => r.slice && r.slice.orders > 0.5)
    .sort((a, b) => b.slice!.netRevenue - a.slice!.netRevenue)

  return rows.map((r) => {
    const b = r.slice!
    return (
      <tr key={`${brandId}-${r.campaign.id}`} className="bg-ink-50/40 hover:bg-ink-50">
        <td className="tcell border-l-2 border-l-transparent">
          <div className="flex items-center gap-1.5 pl-6">
            <button
              onClick={() => onOpenCampaign(r.campaign.id)}
              className="truncate text-left text-sm text-ink-600 underline decoration-ink-200 decoration-dotted underline-offset-2 hover:decoration-accent"
            >
              {r.campaign.meta!.fullName}
            </button>
            <span className="shrink-0 text-2xs text-ink-400">{r.campaign.meta!.sourceName}</span>
          </div>
        </td>
        <td className="tcell text-right"><Num muted>{count(b.orders)}</Num></td>
        <td className="tcell text-right"><Num muted>{count(b.netOrders)}</Num></td>
        <td className="tcell text-right"><Num muted>{moneyShort(b.netRevenue)}</Num></td>
        <td className="tcell text-right"><Num muted>{moneyShort(b.aov)}</Num></td>
        <td className="tcell text-right"><Num muted>{pct(b.marginRate, 0)}</Num></td>
        <td className="tcell text-right"><Num muted>{pct(b.returnRate, 0)}</Num></td>
        <td className="tcell text-right"><Num muted>{pct(b.repeatOrdersShare, 0)}</Num></td>
        <td className="tcell text-right"><Num muted>{moneyShort(b.allocatedSpend)}</Num></td>
        <td className="tcell pr-3 text-right"><Roi value={b.roi} /></td>
      </tr>
    )
  })
}

/** Полосы ROI по брендам. Одна величина, поэтому цвет несёт только знак. */
function RoiBars({ brands }: { brands: BrandTotals[] }) {
  const max = Math.max(...brands.map((b) => Math.abs(b.roi)), 0.1)
  const zero = 50 // ноль по центру: значения есть с обеих сторон
  return (
    <div className="mt-1">
      {brands.map((b) => {
        const meta = BRAND_BY_ID[b.brandId]
        const w = (Math.abs(b.roi) / max) * 50
        return (
          <div key={b.brandId} className="flex items-center gap-2 py-[2px]">
            <span className="w-[132px] shrink-0 truncate text-xs text-ink-700" title={meta.note}>
              {meta.name}
            </span>
            <span className="relative h-3.5 flex-1">
              <span className="absolute inset-y-0 border-l border-ink-300" style={{ left: `${zero}%` }} />
              <span
                className="absolute inset-y-0 rounded-[2px]"
                style={{
                  left: b.roi >= 0 ? `${zero}%` : `${zero - w}%`,
                  width: `${w}%`,
                  background: b.roi >= 0 ? VIZ.pos : VIZ.neg,
                }}
              />
            </span>
            <span className="w-[52px] shrink-0 text-right">
              <Num tone={b.roi >= 0 ? 'pos' : 'neg'}>{pctSigned(b.roi, 0)}</Num>
            </span>
          </div>
        )
      })}
    </div>
  )
}
