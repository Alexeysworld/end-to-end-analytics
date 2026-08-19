import { useMemo, useState } from 'react'
import { dataset } from '../data/generate'
import { derive, webOnlyRoi } from '../data/metrics'
import { PURCHASE_CHANNEL_LABEL, type Horizon, type TreeNode } from '../data/types'
import { count, moneyShort, pct, pctSigned, pp } from '../lib/format'
import { NoteButton } from '../state/notes'
import { VIZ } from './chart'
import { Badge, BlockHeader, Metric, Num, Panel, Roi } from './ui'
import { plural } from './RoiTable'

const SCREEN = 'Каналы покупки'

/**
 * Экран отвечает на один вопрос: сколько выручки не видно без приложения
 * и офлайна. Поэтому центральный блок — не раскладка сама по себе,
 * а сравнение двух взглядов на одни и те же кампании.
 */
export function ChannelBreakdown({
  horizon,
  onOpenCampaign,
}: {
  horizon: Horizon
  onOpenCampaign: (id: string) => void
}) {
  const t = derive(dataset.totals, horizon)
  const tAll = derive(dataset.totals, 'all')

  const rows = useMemo(() => {
    return dataset.campaigns
      .map((c) => {
        const web = webOnlyRoi(c.raw)
        const full = derive(c.raw, horizon)
        const firstAll = derive(c.raw, 'first')
        return {
          node: c,
          web,
          full: full.roi,
          firstAllChannels: firstAll.roi,
          spend: c.raw.spend,
          m: full,
          // Вклад каналов вне сайта и вклад повторных покупок — в процентных пунктах.
          channelGain: firstAll.roi - web,
          repeatGain: derive(c.raw, 'all').roi - firstAll.roi,
          flips: web < 0 && full.roi >= 0,
        }
      })
      .sort((a, b) => b.spend - a.spend)
  }, [horizon])

  const flipped = rows.filter((r) => r.flips)
  const offSiteRevenue = tAll.netRevenueByChannel.app + tAll.netRevenueByChannel.offline
  const offSiteOrders = tAll.ordersByChannel.app + tAll.ordersByChannel.offline

  // Общая шкала для всех строк: иначе строки нельзя сравнивать между собой.
  const domain = useMemo(() => {
    const vals = rows.flatMap((r) => [r.web, r.full])
    const min = Math.min(...vals, 0)
    const max = Math.max(...vals, 0)
    const pad = (max - min) * 0.06
    return { min: min - pad, max: max + pad }
  }, [rows])
  const posOf = (v: number) => ((v - domain.min) / (domain.max - domain.min)) * 100

  return (
    <div className="space-y-3">
      <Panel>
        <BlockHeader
          title="Сколько выручки не видно без приложения и офлайна"
          blockId="channels-summary"
          screen={SCREEN}
          subtitle={
            <>
              Сквозная аналитика по куке видит только покупки на сайте и только первый
              заказ. Mindbox связывает клик с покупкой в приложении и на кассе через единый
              профиль клиента — при условии, что клиент идентифицирован. Разница между двумя
              взглядами показана ниже по каждой кампании.
            </>
          }
        />
        <div className="grid grid-cols-4 gap-4">
          <Metric
            label="Доход вне сайта"
            value={`${moneyShort(offSiteRevenue)} ₽`}
            hint={`${pct(offSiteRevenue / tAll.netRevenue, 0)} дохода от выкупленных заказов · все покупки клиента`}
          />
          <Metric
            label="Заказы вне сайта"
            value={count(offSiteOrders)}
            hint={`приложение ${pct(tAll.channelShare.app, 0)} · офлайн ${pct(tAll.channelShare.offline, 0)} · все покупки клиента`}
          />
          <Metric
            label="Меняют решение"
            value={`${flipped.length} ${plural(flipped.length, 'кампания', 'кампании', 'кампаний')}`}
            hint={`${moneyShort(flipped.reduce((a, r) => a + r.spend, 0))} ₽ расхода выглядят убыточными по вебу и окупаются на полных данных`}
            tone={flipped.length ? 'pos' : undefined}
          />
          <Metric
            label="Не атрибуцировано"
            value={pct(t.unattributedShare, 0)}
            hint={`${count(dataset.totals.unattributed.orders)} заказов не связано с источником — в сравнении не участвуют`}
          />
        </div>
      </Panel>

      <Panel>
        <BlockHeader
          title="Два взгляда на одни и те же кампании"
          blockId="channels-dumbbell"
          screen={SCREEN}
          subtitle={
            <>
              Светлая точка — ROI, каким его видит аналитика по куке: только покупки на сайте
              и только первый заказ. Тёмная точка — ROI на полных данных
              {horizon === 'all' ? ' со всеми покупками клиента' : ' по первому заказу'}. Длина
              отрезка — это и есть то, что отчёт добавляет к картине.
            </>
          }
          right={
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-2xs text-ink-500">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-ink-300 bg-white" />
                только веб, 1-й заказ
              </span>
              <span className="flex items-center gap-1.5 text-2xs text-ink-500">
                <span className="h-2.5 w-2.5 rounded-full bg-ink-900" />
                полные данные
              </span>
            </div>
          }
        />

        <div className="mt-1">
          {/* Шкала с нулём: без неё отрезки не привязаны к безубыточности. */}
          <div className="relative mb-1 ml-[372px] mr-[92px] h-4">
            <span
              className="absolute top-0 h-full border-l border-ink-300"
              style={{ left: `${posOf(0)}%` }}
            />
            <span
              className="absolute top-0 -translate-x-1/2 text-2xs text-ink-400"
              style={{ left: `${posOf(0)}%` }}
            >
              0% — безубыточность
            </span>
          </div>

          {rows.map((r) => (
            <DumbbellRow
              key={r.node.id}
              row={r}
              posOf={posOf}
              zero={posOf(0)}
              onOpen={() => onOpenCampaign(r.node.id)}
            />
          ))}
        </div>
      </Panel>

      <ChannelTable horizon={horizon} />
    </div>
  )
}

function DumbbellRow({
  row,
  posOf,
  zero,
  onOpen,
}: {
  row: {
    node: TreeNode
    web: number
    full: number
    spend: number
    channelGain: number
    repeatGain: number
    flips: boolean
  }
  posOf: (v: number) => number
  zero: number
  onOpen: () => void
}) {
  const left = Math.min(posOf(row.web), posOf(row.full))
  const width = Math.abs(posOf(row.full) - posOf(row.web))

  return (
    <div className="group flex items-center gap-0 border-b border-ink-100 py-[3px] hover:bg-ink-50">
      <div className="flex w-[372px] shrink-0 items-center gap-1.5 pr-3">
        <button
          onClick={onOpen}
          className="shrink-0 text-left text-sm whitespace-nowrap text-ink-900 underline decoration-ink-200 decoration-dotted underline-offset-2 hover:decoration-accent"
          title={`${row.node.meta!.sourceName} › ${row.node.meta!.fullName}`}
        >
          {row.node.name}
        </button>
        <span className="truncate text-2xs text-ink-400">{row.node.meta!.sourceName}</span>
        {row.flips && (
          <Badge tone="accent" title="По вебу убыточна, на полных данных окупается">
            меняет решение
          </Badge>
        )}
      </div>

      <div className="relative mr-[92px] h-5 flex-1">
        <span className="absolute top-0 h-full border-l border-ink-200" style={{ left: `${zero}%` }} />
        {/* Отрезок между двумя взглядами. */}
        <span
          className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-sm bg-ink-300"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-300 bg-white"
          style={{ left: `${posOf(row.web)}%` }}
          title={`Только веб, первый заказ: ${pctSigned(row.web)}`}
        />
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${posOf(row.full)}%`,
            background: row.full >= 0 ? VIZ.pos : VIZ.neg,
          }}
          title={`Полные данные: ${pctSigned(row.full)}`}
        />
        <span
          className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-2 text-2xs"
          style={{ left: `${Math.max(posOf(row.web), posOf(row.full))}%` }}
        >
          <span className={row.full >= 0 ? 'text-pos' : 'text-neg'}>{pctSigned(row.full, 0)}</span>
          <span className="text-ink-300"> ← {pctSigned(row.web, 0)}</span>
        </span>
      </div>
    </div>
  )
}

/** Раскладка заказов и дохода по каналу покупки — источники и кампании внутри. */
function ChannelTable({ horizon }: { horizon: Horizon }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setOpen((p) => {
      const n = new Set(p)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const t = derive(dataset.totals, horizon)
  const CH = ['web', 'app', 'offline'] as const

  const row = (node: TreeNode, depth: number) => {
    const m = derive(node.raw, horizon)
    const isSource = node.level === 'source'
    return (
      <tr key={node.id} className={`hover:bg-ink-50 ${isSource ? 'bg-ink-50/60' : ''}`}>
        <td className="tcell">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 14 }}>
            {isSource ? (
              <button
                onClick={() => toggle(node.id)}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-ink-200 bg-white text-[9px] text-ink-500 hover:border-ink-400"
              >
                {open.has(node.id) ? '−' : '+'}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <span className={`truncate text-sm ${isSource ? 'font-semibold' : ''}`}>
              {node.level === 'campaign' ? node.meta!.fullName : node.name}
            </span>
          </div>
        </td>
        {CH.map((ch) => (
          <td key={ch} className="tcell text-right">
            <Num>{count(m.ordersByChannel[ch])}</Num>
            <div className="text-2xs text-ink-400">{pct(m.channelShare[ch], 0)}</div>
          </td>
        ))}
        <td className="tcell">
          <span className="flex h-[6px] w-full gap-[2px] overflow-hidden">
            {CH.map((ch) => (
              <span
                key={ch}
                className="rounded-[1px]"
                style={{ width: `${m.channelShare[ch] * 100}%`, background: VIZ.channel[ch] }}
              />
            ))}
          </span>
        </td>
        {CH.map((ch) => (
          <td key={ch} className="tcell text-right">
            <Num>{moneyShort(m.netRevenueByChannel[ch])}</Num>
          </td>
        ))}
        <td className="tcell text-right">
          <Num muted>{pct(m.unattributedShare, 0)}</Num>
        </td>
        <td className="tcell pr-3 text-right">
          <Roi value={m.roi} strong={isSource} />
        </td>
      </tr>
    )
  }

  return (
    <Panel pad={false}>
      <div className="border-b border-ink-200 p-3">
        <BlockHeader
          title="Заказы и доход по каналу покупки"
          blockId="channels-table"
          screen={SCREEN}
          subtitle="Разверните источник, чтобы увидеть кампании. Доход — по факту выкупа."
        />
      </div>
      <table className="w-full border-collapse">
        <thead className="bg-ink-50">
          <tr className="border-b border-ink-200">
            <th className="thead-cell w-[26%] text-left">
              <span className="inline-flex items-center gap-1">
                Источник · кампания
                <NoteButton
                  blockId="channels-table-hierarchy"
                  blockLabel="Таблица раскладки по каналам покупки"
                  screen={SCREEN}
                />
              </span>
            </th>
            <th className="thead-cell text-right" colSpan={3}>
              Заказы по каналу
            </th>
            <th className="thead-cell w-[9%]" />
            <th className="thead-cell text-right" colSpan={3}>
              Доход от выкупленных заказов
            </th>
            <th className="thead-cell text-right">н/атр.</th>
            <th className="thead-cell pr-3 text-right">ROI</th>
          </tr>
          <tr className="border-b border-ink-200">
            <th className="thead-cell" />
            {CH.map((ch) => (
              <th key={ch} className="thead-cell text-right">
                {PURCHASE_CHANNEL_LABEL[ch]}
              </th>
            ))}
            <th className="thead-cell" />
            {CH.map((ch) => (
              <th key={`r-${ch}`} className="thead-cell text-right">
                {PURCHASE_CHANNEL_LABEL[ch]}
              </th>
            ))}
            <th className="thead-cell" />
            <th className="thead-cell" />
          </tr>
        </thead>
        <tbody>
          {dataset.sources.flatMap((s) => {
            const out = [row(s, 0)]
            if (open.has(s.id)) {
              // Кампании берём из плоского списка: уровень размещения здесь
              // не нужен, экран про канал покупки, а не про структуру закупки.
              for (const c of dataset.campaigns.filter((c) => c.meta!.sourceId === s.id)) {
                out.push(row(c, 1))
              }
            }
            return out
          })}
        </tbody>
        <tfoot className="bg-ink-100">
          <tr className="border-t-2 border-ink-300 font-semibold">
            <td className="px-2 py-2 text-sm">Итого по аккаунту</td>
            {CH.map((ch) => (
              <td key={ch} className="px-2 py-2 text-right">
                <Num strong>{count(t.ordersByChannel[ch])}</Num>
                <div className="text-2xs font-normal text-ink-500">
                  {pct(t.channelShare[ch], 0)}
                </div>
              </td>
            ))}
            <td />
            {CH.map((ch) => (
              <td key={`r-${ch}`} className="px-2 py-2 text-right">
                <Num strong>{moneyShort(t.netRevenueByChannel[ch])}</Num>
              </td>
            ))}
            <td className="px-2 py-2 text-right">
              <Num strong>{pct(t.unattributedShare, 0)}</Num>
            </td>
            <td className="px-2 py-2 pr-3 text-right">
              <Roi value={t.roi} strong />
            </td>
          </tr>
        </tfoot>
      </table>
      <div className="border-t border-ink-200 px-3 py-1.5 text-2xs text-ink-500">
        Неатрибуцированные покупки в раскладку по каналам не входят: источник для них
        неизвестен, поэтому их нельзя отнести ни к вебу, ни к приложению, ни к офлайну.
        Показана только их доля — {pct(t.unattributedShare, 0)} по аккаунту.
      </div>
    </Panel>
  )
}

/** Вклад каналов и повторных покупок в п.п. — используется в подсказках. */
export const gainHint = (channelGain: number, repeatGain: number): string =>
  `каналы вне сайта ${pp(channelGain)}, повторные покупки ${pp(repeatGain)}`
