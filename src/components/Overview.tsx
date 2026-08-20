import { useMemo } from 'react'
import { dataset } from '../data/generate'
import { derive, webOnlyRoi } from '../data/metrics'
import type { Horizon, TreeNode } from '../data/types'
import { count, moneyShort, pct, pctSigned, pp } from '../lib/format'
import { NoteButton } from '../state/notes'
import { VIZ } from './chart'
import { Badge, BlockHeader, Metric, Num, Panel, Roi } from './ui'
import { plural } from './RoiTable'

const SCREEN = 'Сводка'

/** Группа решения, в которую попадает кампания. */
type Verdict = 'buy' | 'keep' | 'cut'

interface Item {
  node: TreeNode
  spend: number
  roiFirst: number
  roiAll: number
  profitFirst: number
  profitAll: number
  verdict: Verdict
  cpc: number
  breakEven: number
}

const VERDICT: Record<Verdict, { label: string; hint: string; color: string; tone: 'pos' | 'accent' | 'neg' }> = {
  buy: {
    label: 'Докупить или держать',
    hint: 'прибыльны уже на первом заказе — есть запас по ставке',
    color: VIZ.pos,
    tone: 'pos',
  },
  keep: {
    label: 'Не резать',
    hint: 'убыточны на первом заказе и окупаются на повторных покупках',
    color: '#2f5fd8',
    tone: 'accent',
  },
  cut: {
    label: 'Отключить',
    hint: 'убыточны на любом горизонте — повторные не спасают',
    color: VIZ.neg,
    tone: 'neg',
  },
}

export function Overview({
  horizon,
  onOpenCampaign,
  onGoToTable,
}: {
  horizon: Horizon
  onOpenCampaign: (id: string) => void
  onGoToTable: () => void
}) {
  const first = derive(dataset.totals, 'first')
  const all = derive(dataset.totals, 'all')

  const items = useMemo<Item[]>(
    () =>
      dataset.campaigns.map((c) => {
        const f = derive(c.raw, 'first')
        const a = derive(c.raw, 'all')
        const verdict: Verdict = f.roi >= 0 ? 'buy' : a.roi >= 0 ? 'keep' : 'cut'
        return {
          node: c,
          spend: c.raw.spend,
          roiFirst: f.roi,
          roiAll: a.roi,
          profitFirst: f.profit,
          profitAll: a.profit,
          verdict,
          cpc: f.cpc,
          breakEven: a.breakEvenCpc,
        }
      }),
      [],
  )

  const groups = useMemo(() => {
    const by = (v: Verdict) => items.filter((i) => i.verdict === v)
    return { buy: by('buy'), keep: by('keep'), cut: by('cut') }
  }, [items])

  const totalSpend = dataset.totals.spend
  const cutLoss = groups.cut.reduce((a, i) => a + i.profitAll, 0)
  const keepGain = groups.keep.reduce((a, i) => a + i.profitAll, 0)

  return (
    <div className="space-y-3">
      {/* Главный кадр: разрыв между горизонтами. Это и есть ответ на вопрос,
          где теряются деньги — не в кампаниях, а в способе их считать. */}
      <Panel>
        <BlockHeader
          title="Где я теряю деньги"
          blockId="overview-gap"
          screen={SCREEN}
          subtitle={
            <>
              На первом заказе аккаунт стоит в минусе, на всех покупках клиента — в плюсе.
              Разница не в кампаниях, а в том, до какого заказа считать окупаемость. Отсюда
              и решение: сокращать по первой цифре — значит срезать трафик, который платит
              со второго заказа.
            </>
          }
          right={
            <button
              onClick={onGoToTable}
              className="rounded border border-ink-300 px-2 py-1 text-xs font-medium hover:bg-ink-50"
            >
              Открыть таблицу окупаемости →
            </button>
          }
        />

        <div className="flex items-stretch gap-6">
          <div className="flex items-end gap-6">
            <div>
              <div className="text-2xs uppercase tracking-wide text-ink-400">
                ROI по первому заказу
              </div>
              <div className="mt-0.5">
                <span className="font-mono text-[30px] font-semibold leading-none text-neg tabular-nums">
                  {pctSigned(first.roi)}
                </span>
              </div>
              <div className="mt-1 text-2xs text-ink-500">
                маржа {moneyShort(first.margin)} ₽ при расходе {moneyShort(first.spend)} ₽
              </div>
            </div>

            <div className="pb-2 text-center">
              <div className="text-2xs text-ink-400">разрыв</div>
              <div className="font-mono text-sm font-semibold text-ink-900 tabular-nums">
                {pp(all.roi - first.roi, 0)}
              </div>
              <svg viewBox="0 0 60 12" className="mt-0.5 h-3 w-14 text-ink-300">
                <path
                  d="M0 6 H52 M46 2 L52 6 L46 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </div>

            <div>
              <div className="text-2xs uppercase tracking-wide text-ink-400">
                ROI по всем покупкам клиента
              </div>
              <div className="mt-0.5">
                <span className="font-mono text-[30px] font-semibold leading-none text-pos tabular-nums">
                  {pctSigned(all.roi)}
                </span>
              </div>
              <div className="mt-1 text-2xs text-ink-500">
                маржа {moneyShort(all.margin)} ₽ при том же расходе
              </div>
            </div>
          </div>

          <div className="w-px bg-ink-200" />

          <div className="grid flex-1 grid-cols-3 gap-4">
            <Metric
              label="Бюджет под ложным сокращением"
              value={`${moneyShort(groups.keep.reduce((a, i) => a + i.spend, 0))} ₽`}
              hint={`${groups.keep.length} ${plural(groups.keep.length, 'кампания', 'кампании', 'кампаний')} · ${pct(groups.keep.reduce((a, i) => a + i.spend, 0) / totalSpend, 0)} расхода. Выглядят убыточными на первом заказе, приносят ${moneyShort(keepGain)} ₽ прибыли на всех покупках`}
              tone="pos"
            />
            <Metric
              label="Реально убыточный бюджет"
              value={`${moneyShort(groups.cut.reduce((a, i) => a + i.spend, 0))} ₽`}
              hint={`${groups.cut.length} ${plural(groups.cut.length, 'кампания', 'кампании', 'кампаний')} · теряют ${moneyShort(Math.abs(cutLoss))} ₽ даже с учётом повторных`}
              tone="neg"
            />
            <Metric
              label="Данные, которых не видно по куке"
              value={pct(
                (all.netRevenueByChannel.app + all.netRevenueByChannel.offline) / all.netRevenue,
                0,
              )}
              hint={`дохода приходит из приложения и офлайна · не атрибуцировано ${pct(first.unattributedShare, 0)} покупок`}
            />
          </div>
        </div>

        {/* Полоса расхода по решениям. */}
        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-2xs uppercase tracking-wide text-ink-400">
              Расход {moneyShort(totalSpend)} ₽ по решениям
            </span>
            <NoteButton
              blockId="overview-budget-split"
              blockLabel="Полоса расхода по решениям"
              screen={SCREEN}
            />
          </div>
          <div className="flex h-6 w-full gap-[2px]">
            {(['buy', 'keep', 'cut'] as const).map((v) => {
              const spend = groups[v].reduce((a, i) => a + i.spend, 0)
              return (
                <div
                  key={v}
                  className="flex h-full items-center justify-center rounded-[2px] text-2xs font-medium text-white"
                  style={{ width: `${(spend / totalSpend) * 100}%`, background: VERDICT[v].color }}
                  title={`${VERDICT[v].label}: ${moneyShort(spend)} ₽`}
                >
                  {pct(spend / totalSpend, 0)}
                </div>
              )
            })}
          </div>
          <div className="mt-1 flex gap-4">
            {(['buy', 'keep', 'cut'] as const).map((v) => (
              <span key={v} className="flex items-center gap-1.5 text-2xs text-ink-500">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ background: VERDICT[v].color }}
                />
                {VERDICT[v].label} — {VERDICT[v].hint}
              </span>
            ))}
          </div>
        </div>
      </Panel>

      {/* Три списка решений. */}
      <div className="grid grid-cols-3 gap-3">
        <DecisionList
          verdict="cut"
          items={groups.cut.sort((a, b) => a.profitAll - b.profitAll)}
          horizon={horizon}
          onOpenCampaign={onOpenCampaign}
        />
        <DecisionList
          verdict="keep"
          items={groups.keep.sort((a, b) => b.spend - a.spend)}
          horizon={horizon}
          onOpenCampaign={onOpenCampaign}
        />
        <DecisionList
          verdict="buy"
          items={groups.buy.sort((a, b) => b.roiAll - a.roiAll)}
          horizon={horizon}
          onOpenCampaign={onOpenCampaign}
        />
      </div>

      <Panel>
        <BlockHeader
          title="Чему в этих числах можно верить"
          blockId="overview-trust"
          screen={SCREEN}
          subtitle="Две поправки, которые отчёт не прячет: часть покупок не удалось связать с источником, часть заказов вернули."
        />
        <div className="grid grid-cols-4 gap-4">
          <Metric
            label="Не атрибуцировано"
            value={pct(first.unattributedShare, 0)}
            hint={`${count(dataset.totals.unattributed.orders)} заказов на ${moneyShort(dataset.totals.unattributed.netRevenue)} ₽ выкупа. В ROI не входят — фактическая окупаемость не хуже показанной`}
          />
          <Metric
            label="Возвраты и отмены"
            value={pct(1 - first.buyoutRate, 0)}
            hint={`заказанная выручка ${moneyShort(first.revenue)} ₽ → выкуплено ${moneyShort(first.netRevenue)} ₽. Маржа считается только от выкупленного`}
          />
          <Metric
            label="Горизонт данных"
            value="3 заказа"
            hint="дальше третьего заказа клиента прототип не считает — реальная окупаемость части кампаний выше показанной"
          />
          <Metric
            label="Модель атрибуции"
            value="last-click"
            hint="по клиенту в едином профиле, а не по куке. Других моделей в прототипе нет"
          />
        </div>
      </Panel>
    </div>
  )
}

function DecisionList({
  verdict,
  items,
  horizon,
  onOpenCampaign,
}: {
  verdict: Verdict
  items: Item[]
  horizon: Horizon
  onOpenCampaign: (id: string) => void
}) {
  const v = VERDICT[verdict]
  const spend = items.reduce((a, i) => a + i.spend, 0)

  return (
    <Panel pad={false}>
      <div className="flex items-start justify-between gap-2 border-b border-ink-200 p-2.5">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: v.color }} />
            <h3 className="text-sm font-semibold">{v.label}</h3>
            <Badge tone={v.tone}>{items.length}</Badge>
            <NoteButton
              blockId={`overview-list-${verdict}`}
              blockLabel={`Список «${v.label}»`}
              screen={SCREEN}
            />
          </div>
          <p className="mt-0.5 text-2xs leading-tight text-ink-500">{v.hint}</p>
        </div>
        <div className="text-right">
          <div className="num text-sm font-semibold">{moneyShort(spend)} ₽</div>
          <div className="text-2xs text-ink-400">расход</div>
        </div>
      </div>

      <table className="w-full border-collapse">
        <tbody>
          {items.map((i) => (
            <tr key={i.node.id} className="hover:bg-ink-50">
              <td className="tcell">
                <button
                  onClick={() => onOpenCampaign(i.node.id)}
                  className="block max-w-[190px] truncate text-left text-sm text-ink-900 underline decoration-ink-200 decoration-dotted underline-offset-2 hover:decoration-accent"
                  title={`${i.node.meta!.sourceName} › ${i.node.meta!.fullName}`}
                >
                  {i.node.name}
                </button>
                <div className="text-2xs text-ink-400">
                  {i.node.meta!.sourceName}
                  {verdict === 'buy' && i.breakEven > i.cpc && (
                    <> · ставка {Math.round(i.cpc)} → {Math.round(i.breakEven)} ₽</>
                  )}
                  {verdict === 'cut' && <> · теряет {moneyShort(Math.abs(i.profitAll))} ₽</>}
                  {verdict === 'keep' && <> · плюс {moneyShort(i.profitAll)} ₽ на повторных</>}
                </div>
              </td>
              <td className="tcell w-[92px] text-right">
                <Num muted>{moneyShort(i.spend)}</Num>
                <div className="text-2xs text-ink-400">расход</div>
              </td>
              <td className="tcell w-[104px] pr-2.5 text-right">
                <Roi
                  value={horizon === 'first' ? i.roiFirst : i.roiAll}
                  previous={
                    horizon === 'all' && Math.sign(i.roiFirst) !== Math.sign(i.roiAll)
                      ? i.roiFirst
                      : undefined
                  }
                />
                <div className="text-2xs text-ink-400">
                  {horizon === 'first' ? '1-й заказ' : 'все покупки'}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

/** ROI только по вебу — используется в подсказке о невидимых данных. */
export const webOnly = webOnlyRoi
