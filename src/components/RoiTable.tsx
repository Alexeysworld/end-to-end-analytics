import { useMemo, useState } from 'react'
import { dataset } from '../data/generate'
import { derive } from '../data/metrics'
import type { DerivedMetrics, Horizon, TreeNode } from '../data/types'
import { count, int, moneyShort, pct, rub } from '../lib/format'
import { NoteButton } from '../state/notes'
import { Badge, BlockHeader, Num, Panel, Roi, Segmented } from './ui'

const SCREEN = 'Таблица окупаемости'

/** Русская форма числительного: 1 кампания, 2 кампании, 5 кампаний. */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(Math.round(n)) % 100
  if (a > 10 && a < 20) return many
  const b = a % 10
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}

/** Режим раскладки заказов по каналу покупки. */
export type ChannelMode = 'total' | 'online-offline' | 'full'

export const CHANNEL_MODE_LABEL: Record<ChannelMode, string> = {
  total: 'Все заказы',
  'online-offline': 'Онлайн / офлайн',
  full: 'Сайт / прил. / офлайн',
}

type SortKey =
  | 'name'
  | 'spend'
  | 'clicks'
  | 'cpc'
  | 'orders'
  | 'netOrders'
  | 'netRevenue'
  | 'margin'
  | 'cpo'
  | 'repeat'
  | 'roi'
  | 'web'
  | 'app'
  | 'offline'
  | 'online'

interface Row {
  node: TreeNode
  depth: number
  m: DerivedMetrics
  /** Метрики на другом горизонте — для показа разворота. */
  other: DerivedMetrics
}

const valueOf = (r: Row, key: SortKey): number | string => {
  switch (key) {
    case 'name':
      return r.node.name
    case 'spend':
      return r.m.spend
    case 'clicks':
      return r.m.clicks
    case 'cpc':
      return r.m.cpc
    case 'orders':
      return r.m.orders
    case 'netOrders':
      return r.m.netOrders
    case 'netRevenue':
      return r.m.netRevenue
    case 'margin':
      return r.m.margin
    case 'cpo':
      return r.m.cpo
    case 'repeat':
      return r.m.repeatOrdersShare
    case 'roi':
      return r.m.roi
    case 'web':
      return r.m.ordersByChannel.web
    case 'app':
      return r.m.ordersByChannel.app
    case 'offline':
      return r.m.ordersByChannel.offline
    case 'online':
      return r.m.onlineOrders
  }
}

export function RoiTable({
  horizon,
  channelMode,
  onChannelMode,
  onOpenCampaign,
  onlyLosing,
  onOnlyLosing,
}: {
  horizon: Horizon
  channelMode: ChannelMode
  onChannelMode: (m: ChannelMode) => void
  onOpenCampaign: (id: string) => void
  onlyLosing: boolean
  onOnlyLosing: (v: boolean) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'spend',
    dir: 'desc',
  })

  const otherHorizon: Horizon = horizon === 'first' ? 'all' : 'first'

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const rows = useMemo(() => {
    const out: Row[] = []
    const sortNodes = (nodes: TreeNode[], depth: number): Row[] => {
      const mapped: Row[] = nodes.map((node) => ({
        node,
        depth,
        m: derive(node.raw, horizon),
        other: derive(node.raw, otherHorizon),
      }))
      const dir = sort.dir === 'asc' ? 1 : -1
      mapped.sort((a, b) => {
        const va = valueOf(a, sort.key)
        const vb = valueOf(b, sort.key)
        if (typeof va === 'string' || typeof vb === 'string')
          return String(va).localeCompare(String(vb), 'ru') * dir
        return (va - vb) * dir
      })
      return mapped
    }

    const walk = (nodes: TreeNode[], depth: number) => {
      for (const row of sortNodes(nodes, depth)) {
        // Фильтр убыточных применяем только к кампаниям: каналы и запросы
        // прячутся вместе со своим родителем, иначе таблица рассыпается.
        if (onlyLosing && row.node.level === 'campaign' && row.m.roi >= 0) continue
        out.push(row)
        if (expanded.has(row.node.id) && row.node.children.length) {
          walk(row.node.children, depth + 1)
        }
      }
    }
    walk(dataset.sources, 0)
    return out
  }, [expanded, sort, horizon, otherHorizon, onlyLosing])

  const totals = derive(dataset.totals, horizon)
  const totalsOther = derive(dataset.totals, otherHorizon)
  const un = dataset.totals.unattributed

  const flippedCount = dataset.campaigns.filter((c) => {
    const f = derive(c.raw, 'first').roi
    const a = derive(c.raw, 'all').roi
    return f < 0 && a >= 0
  }).length

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

  const channelCols =
    channelMode === 'total' ? 1 : channelMode === 'online-offline' ? 2 : 3

  return (
    <Panel pad={false}>
      <div className="border-b border-ink-200 p-3">
        <BlockHeader
          title="Окупаемость по источникам и кампаниям"
          blockId="roi-table"
          screen={SCREEN}
          subtitle={
            <>
              Разворачивайте строку, чтобы уйти вглубь: источник → тип размещения → кампания → группа →
              запрос. Уровень размещения есть там, где он осмыслен: в Директе это Поиск и РСЯ.
              Клик по названию кампании открывает карточку. Заказы объединяют сайт и мобильное
              приложение; раскладку можно развернуть переключателем справа.
            </>
          }
          right={
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-ink-600">
                <input
                  type="checkbox"
                  checked={onlyLosing}
                  onChange={(e) => onOnlyLosing(e.target.checked)}
                  className="h-3 w-3 accent-ink-900"
                />
                только убыточные
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-2xs uppercase tracking-wide text-ink-400">канал покупки</span>
                <Segmented
                  value={channelMode}
                  onChange={onChannelMode}
                  options={[
                    { value: 'total', label: 'Всего' },
                    { value: 'online-offline', label: 'Онлайн / офлайн' },
                    { value: 'full', label: 'Сайт / прил. / офлайн' },
                  ]}
                />
              </div>
            </div>
          }
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20 bg-ink-50">
            <tr className="border-b border-ink-200">
              <th className="thead-cell w-[34%] text-left">
                <span className="inline-flex items-center gap-1">
                  Источник · размещение · кампания · группа · запрос
                  <NoteButton
                    blockId="roi-table-hierarchy"
                    blockLabel="Иерархия и drill-down в таблице"
                    screen={SCREEN}
                  />
                </span>
              </th>
              {th('spend', 'Расход', 'text-right')}
              {th('clicks', 'Клики', 'text-right')}
              {th('cpc', 'CPC', 'text-right')}
              {th('orders', 'Заказы', 'text-right', 'Атрибуцированные заказы за период')}
              {channelMode === 'online-offline' && (
                <>
                  {th('online', 'Онлайн', 'text-right bg-accent-soft/40', 'Сайт и мобильное приложение вместе')}
                  {th('offline', 'Офлайн', 'text-right bg-accent-soft/40', 'Покупки в магазине')}
                </>
              )}
              {channelMode === 'full' && (
                <>
                  {th('web', 'Сайт', 'text-right bg-accent-soft/40')}
                  {th('app', 'Прил.', 'text-right bg-accent-soft/40')}
                  {th('offline', 'Офлайн', 'text-right bg-accent-soft/40')}
                </>
              )}
              {th('netOrders', 'Выкупл. заказы', 'text-right', 'Заказы без отмен и возвратов')}
              {th('netRevenue', 'Доход от выкупл.', 'text-right', 'Выручка по факту выкупа')}
              {th('margin', 'Маржа', 'text-right')}
              {th('cpo', 'CPO', 'text-right')}
              {th('repeat', '% повторных', 'text-right', 'Доля повторных заказов во всех заказах узла')}
              {th('roi', 'ROI', 'text-right pr-3 min-w-[104px]')}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <TableRow
                key={r.node.id}
                row={r}
                horizon={horizon}
                channelMode={channelMode}
                expanded={expanded.has(r.node.id)}
                onToggle={() => toggle(r.node.id)}
                onOpenCampaign={onOpenCampaign}
              />
            ))}

            {/* Неатрибуцированные покупки: без расхода и без ROI, отдельной строкой. */}
            <tr className="bg-warn-soft/50">
              <td className="tcell">
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-sm font-medium text-ink-800">Не атрибуцировано</span>
                  <Badge tone="warn" title="Покупки, которые не удалось связать с источником">
                    {pct(totals.unattributedShare, 0)} покупок
                  </Badge>
                  <NoteButton
                    blockId="roi-table-unattributed"
                    blockLabel="Строка «Не атрибуцировано»"
                    screen={SCREEN}
                  />
                </span>
                <div className="mt-0.5 text-2xs leading-tight text-ink-500">
                  Клиент не идентифицирован или окно атрибуции истекло. В ROI не входит — ни в
                  числитель, ни в знаменатель.
                </div>
              </td>
              <td className="tcell text-right"><Num muted>—</Num></td>
              <td className="tcell text-right"><Num muted>—</Num></td>
              <td className="tcell text-right"><Num muted>—</Num></td>
              <td className="tcell text-right"><Num>{int(un.orders)}</Num></td>
              {Array.from({ length: channelMode === 'total' ? 0 : channelCols }).map((_, i) => (
                <td key={i} className="tcell bg-accent-soft/30 text-right">
                  <Num muted>—</Num>
                </td>
              ))}
              <td className="tcell text-right"><Num>{int(un.netOrders)}</Num></td>
              <td className="tcell text-right"><Num>{moneyShort(un.netRevenue)}</Num></td>
              <td className="tcell text-right"><Num>{moneyShort(un.margin)}</Num></td>
              <td className="tcell text-right"><Num muted>—</Num></td>
              <td className="tcell text-right"><Num muted>—</Num></td>
              <td className="tcell pr-3 text-right"><Num muted>—</Num></td>
            </tr>
          </tbody>

          <tfoot className="sticky bottom-0 z-20 bg-ink-100">
            <tr className="border-t-2 border-ink-300 font-semibold">
              <td className="px-2 py-2 text-sm">
                Итого по аккаунту
                <span className="ml-1.5 text-2xs font-normal text-ink-500">
                  {horizon === 'first'
                    ? `${flippedCount} ${plural(flippedCount, 'кампания', 'кампании', 'кампаний')} выглядят убыточными, но окупаются на повторных покупках`
                    : 'горизонт: все покупки клиента'}
                </span>
              </td>
              <td className="px-2 py-2 text-right"><Num strong>{moneyShort(totals.spend)}</Num></td>
              <td className="px-2 py-2 text-right"><Num strong>{int(totals.clicks)}</Num></td>
              <td className="px-2 py-2 text-right"><Num strong>{Math.round(totals.cpc)}</Num></td>
              <td className="px-2 py-2 text-right"><Num strong>{int(totals.orders)}</Num></td>
              {channelMode === 'online-offline' && (
                <>
                  <td className="px-2 py-2 text-right"><Num strong>{int(totals.onlineOrders)}</Num></td>
                  <td className="px-2 py-2 text-right"><Num strong>{int(totals.ordersByChannel.offline)}</Num></td>
                </>
              )}
              {channelMode === 'full' && (
                <>
                  <td className="px-2 py-2 text-right"><Num strong>{int(totals.ordersByChannel.web)}</Num></td>
                  <td className="px-2 py-2 text-right"><Num strong>{int(totals.ordersByChannel.app)}</Num></td>
                  <td className="px-2 py-2 text-right"><Num strong>{int(totals.ordersByChannel.offline)}</Num></td>
                </>
              )}
              <td className="px-2 py-2 text-right"><Num strong>{int(totals.netOrders)}</Num></td>
              <td className="px-2 py-2 text-right"><Num strong>{moneyShort(totals.netRevenue)}</Num></td>
              <td className="px-2 py-2 text-right"><Num strong>{moneyShort(totals.margin)}</Num></td>
              <td className="px-2 py-2 text-right"><Num strong>{Math.round(totals.cpo)}</Num></td>
              <td className="px-2 py-2 text-right"><Num strong>{pct(totals.repeatOrdersShare, 0)}</Num></td>
              <td className="px-2 py-2 pr-3 text-right">
                <Roi
                  value={totals.roi}
                  previous={horizon === 'all' ? totalsOther.roi : undefined}
                  strong
                />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-ink-200 px-3 py-1.5 text-2xs text-ink-500">
        <span>
          Расход {rub(totals.spend)} · выкуп {pct(totals.buyoutRate, 0)} от заказанной выручки ·
          ROI = маржа / расход − 1
        </span>
        <span>Данные синтетические, сид {dataset.seed}</span>
      </div>
    </Panel>
  )
}

function TableRow({
  row,
  horizon,
  channelMode,
  expanded,
  onToggle,
  onOpenCampaign,
}: {
  row: Row
  horizon: Horizon
  channelMode: ChannelMode
  expanded: boolean
  onToggle: () => void
  onOpenCampaign: (id: string) => void
}) {
  const { node, depth, m, other } = row
  const hasChildren = node.children.length > 0
  const isCampaign = node.level === 'campaign'
  const flipped = Math.sign(other.roi) !== Math.sign(m.roi)
  // Разворот подсвечиваем только там, где он означает смену решения:
  // «на первом заказе минус, на всех покупках плюс».
  const savedByRepeat = flipped && horizon === 'all' && m.roi >= 0

  return (
    <tr
      key={`${node.id}-${horizon}`}
      className={`group transition-colors hover:bg-ink-50 ${
        savedByRepeat ? 'flip-flash' : ''
      } ${node.level === 'source' ? 'bg-ink-50/60 font-medium' : ''} ${
        node.level === 'placement' ? 'bg-ink-50/30' : ''
      }`}
    >
      {/* Убыточные строки помечаем узкой красной полосой у левого края:
          цветом кодируем только знак результата, фон не заливаем. */}
      <td className={`tcell ${m.roi < 0 ? 'border-l-2 border-l-neg' : 'border-l-2 border-l-transparent'}`}>
        <div className="flex items-center gap-1" style={{ paddingLeft: depth * 14 }}>
          {hasChildren ? (
            <button
              onClick={onToggle}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-ink-200 bg-white text-[9px] text-ink-500 hover:border-ink-400 hover:text-ink-900"
              title={expanded ? 'Свернуть' : 'Развернуть'}
            >
              {expanded ? '−' : '+'}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          {isCampaign ? (
            <button
              onClick={() => onOpenCampaign(node.id)}
              className="truncate text-left text-sm text-ink-900 underline decoration-ink-200 decoration-dotted underline-offset-2 hover:decoration-accent"
              title="Открыть карточку кампании"
            >
              {node.name}
            </button>
          ) : (
            <span
              className={`truncate text-sm ${
                node.level === 'source'
                  ? 'font-semibold'
                  : node.level === 'placement'
                    ? 'font-medium'
                    : ''
              } ${node.level === 'keyword' ? 'text-ink-600' : 'text-ink-900'}`}
              title={node.note ?? node.name}
            >
              {node.name}
            </span>
          )}

          {node.note && (
            <span
              className="shrink-0 cursor-help text-2xs text-ink-300"
              title={node.note}
            >
              ⓘ
            </span>
          )}

          {savedByRepeat && (
            <Badge tone="accent" title="На первом заказе убыточна, на всех покупках окупается">
              окупается на повторных
            </Badge>
          )}
          {m.unattributedShare > 0.2 && (
            <Badge tone="warn" title="Большая доля покупок не связана с источником">
              н/атр. {pct(m.unattributedShare, 0)}
            </Badge>
          )}
          {m.buyoutRate < 0.75 && (
            <Badge tone="neg" title="Высокая доля отмен и возвратов">
              возвраты {pct(1 - m.buyoutRate, 0)}
            </Badge>
          )}
        </div>
      </td>

      <td className="tcell text-right"><Num>{moneyShort(m.spend)}</Num></td>
      <td className="tcell text-right"><Num muted>{int(m.clicks)}</Num></td>
      <td className="tcell text-right"><Num muted>{Math.round(m.cpc)}</Num></td>
      <td className="tcell text-right"><Num>{count(m.orders)}</Num></td>

      {channelMode === 'online-offline' && (
        <>
          <td className="tcell bg-accent-soft/30 text-right">
            <Num>{count(m.onlineOrders)}</Num>
            <div className="text-2xs text-ink-400">{pct(m.onlineShare, 0)}</div>
          </td>
          <td className="tcell bg-accent-soft/30 text-right">
            <Num>{count(m.ordersByChannel.offline)}</Num>
            <div className="text-2xs text-ink-400">{pct(m.channelShare.offline, 0)}</div>
          </td>
        </>
      )}
      {channelMode === 'full' && (
        <>
          <td className="tcell bg-accent-soft/30 text-right">
            <Num>{count(m.ordersByChannel.web)}</Num>
            <div className="text-2xs text-ink-400">{pct(m.channelShare.web, 0)}</div>
          </td>
          <td className="tcell bg-accent-soft/30 text-right">
            <Num>{count(m.ordersByChannel.app)}</Num>
            <div className="text-2xs text-ink-400">{pct(m.channelShare.app, 0)}</div>
          </td>
          <td className="tcell bg-accent-soft/30 text-right">
            <Num>{count(m.ordersByChannel.offline)}</Num>
            <div className="text-2xs text-ink-400">{pct(m.channelShare.offline, 0)}</div>
          </td>
        </>
      )}

      <td className="tcell text-right">
        <Num>{count(m.netOrders)}</Num>
        <div
          className={`text-2xs ${m.buyoutRate < 0.75 ? 'text-neg' : 'text-ink-400'}`}
          title="Доля выкупа от заказанного"
        >
          {pct(m.buyoutRate, 0)}
        </div>
      </td>
      <td className="tcell text-right"><Num>{moneyShort(m.netRevenue)}</Num></td>
      <td className="tcell text-right"><Num>{moneyShort(m.margin)}</Num></td>
      <td className="tcell text-right"><Num muted>{Math.round(m.cpo)}</Num></td>
      <td className="tcell text-right">
        <Num muted={m.repeatOrdersShare < 0.1}>{pct(m.repeatOrdersShare, 0)}</Num>
      </td>
      <td className="tcell pr-3 text-right">
        <span className="value-rise inline-block" key={`${node.id}-${horizon}-roi`}>
          <Roi
            value={m.roi}
            previous={flipped && horizon === 'all' ? other.roi : undefined}
            strong={isCampaign}
          />
        </span>
        <div
          className="whitespace-nowrap text-2xs text-ink-400"
          title="Прибыль: маржа минус расход"
        >
          {m.profit >= 0 ? '+' : '−'}
          {moneyShort(Math.abs(m.profit))} ₽
        </div>
      </td>
    </tr>
  )
}
