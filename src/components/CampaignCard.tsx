import { useEffect } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cumulativeRoi, derive, repeatRateGapToBreakEven, webOnlyRoi } from '../data/metrics'
import { PURCHASE_CHANNEL_LABEL, type Horizon, type TreeNode } from '../data/types'
import { count, int, money, moneyShort, pct, pctSigned, pp } from '../lib/format'
import { NoteButton } from '../state/notes'
import { Legend, TooltipBox, TooltipRow, VIZ, axisProps } from './chart'
import { Badge, Metric, Num, Panel, Roi } from './ui'

const SCREEN = 'Карточка кампании'

export function CampaignCard({
  campaign,
  horizon,
  onClose,
}: {
  campaign: TreeNode
  horizon: Horizon
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const meta = campaign.meta!
  const m = derive(campaign.raw, horizon)
  const first = derive(campaign.raw, 'first')
  const all = derive(campaign.raw, 'all')
  const curve = cumulativeRoi(campaign.raw)
  const weeks = campaign.weeks ?? []
  const blockPrefix = `campaign:${campaign.id}`

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-ink-900/25 p-6"
      onClick={onClose}
    >
      <div
        className="h-fit w-[1180px] rounded-lg border border-ink-200 bg-ink-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка */}
        <header className="flex items-start justify-between gap-4 border-b border-ink-200 bg-white px-4 py-3">
          <div>
            <div className="flex items-center gap-1.5 text-2xs text-ink-400">
              <span>{meta.sourceName}</span>
              {meta.placementName && (
                <>
                  <span>›</span>
                  <span>{meta.placementName}</span>
                </>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <h2 className="text-[17px] font-semibold leading-tight">{campaign.name}</h2>
              <Badge title={meta.category}>{meta.category}</Badge>
              <Badge tone="neutral" title="Маржинальность с учётом переопределений по запросам">
                маржа {pct(meta.marginRate, 0)}
              </Badge>
              <NoteButton
                blockId={`${blockPrefix}:header`}
                blockLabel={`Карточка кампании «${meta.fullName}» — шапка`}
                screen={SCREEN}
              />
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-ink-200 px-2 py-1 text-xs text-ink-500 hover:bg-ink-50 hover:text-ink-900"
          >
            Закрыть · Esc
          </button>
        </header>

        {/* Полоса метрик по текущему горизонту */}
        <div className="grid grid-cols-9 gap-3 border-b border-ink-200 bg-white px-4 py-2.5">
          <Metric label="Расход" value={`${moneyShort(m.spend)} ₽`} hint={`CPC ${Math.round(m.cpc)} ₽`} />
          <Metric label="Клики" value={int(m.clicks)} />
          <Metric
            label="Заказы"
            value={count(m.orders)}
            hint={horizon === 'first' ? 'первые заказы' : 'все покупки'}
          />
          <Metric
            label="Выкуплено"
            value={count(m.netOrders)}
            hint={`${pct(m.buyoutRate, 0)} от заказанного`}
            tone={m.buyoutRate < 0.75 ? 'neg' : undefined}
          />
          <Metric label="Доход от выкупл." value={`${moneyShort(m.netRevenue)} ₽`} />
          <Metric label="Маржа" value={`${moneyShort(m.margin)} ₽`} />
          <Metric label="CPO" value={`${int(m.cpo)} ₽`} hint={`выкупл. ${int(m.cpoNet)} ₽`} />
          <Metric
            label="% повторных"
            value={pct(m.repeatOrdersShare, 0)}
            hint={`повторяемость ${pct(first.repeatRate, 0)}`}
          />
          <div>
            <div className="text-2xs uppercase tracking-wide text-ink-400">
              ROI · {horizon === 'first' ? 'первый заказ' : 'все покупки'}
            </div>
            <div className="mt-0.5">
              <Roi value={m.roi} size="lg" strong />
            </div>
            <div className="num text-2xs text-ink-400">
              {m.profit >= 0 ? '+' : '−'}
              {moneyShort(Math.abs(m.profit))} ₽
            </div>
          </div>
        </div>

        {/* Вывод-подсказка */}
        <Verdict campaign={campaign} horizon={horizon} blockPrefix={blockPrefix} />

        <div className="space-y-3 px-4 pb-4">
          <WeeklyChart weeks={weeks} horizon={horizon} blockPrefix={blockPrefix} />

          <div className="grid grid-cols-[1.15fr_1fr] items-start gap-3">
            <PaybackCurve curve={curve} spend={campaign.raw.spend} blockPrefix={blockPrefix} />
            <div className="space-y-3">
              <ChannelSplit campaign={campaign} horizon={horizon} blockPrefix={blockPrefix} />
              <BidHeadroom first={first} all={all} horizon={horizon} blockPrefix={blockPrefix} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Текстовый вывод. Собирается из данных, а не из заранее написанных фраз:
 * порядок предложений всегда один, меняются только факты.
 */
function Verdict({
  campaign,
  horizon,
  blockPrefix,
}: {
  campaign: TreeNode
  horizon: Horizon
  blockPrefix: string
}) {
  const first = derive(campaign.raw, 'first')
  const all = derive(campaign.raw, 'all')
  const curve = cumulativeRoi(campaign.raw)
  const breakEvenAt = curve.find((p) => p.roi >= 0)?.orderIndex ?? null
  const gap = repeatRateGapToBreakEven(campaign.raw)
  const webOnly = webOnlyRoi(campaign.raw)
  const offSiteShare = all.channelShare.app + all.channelShare.offline

  const lines: { text: string; tone: 'pos' | 'neg' | 'warn' | 'neutral' }[] = []

  if (first.roi >= 0) {
    lines.push({
      text: `Окупается уже на первом заказе: ROI ${pctSigned(first.roi)}, на всех покупках ${pctSigned(all.roi)}. Ставку можно поднять с ${int(first.cpc)} ₽ до ${int(first.breakEvenCpc)} ₽ по первому заказу и до ${int(all.breakEvenCpc)} ₽ с учётом повторных.`,
      tone: 'pos',
    })
  } else if (breakEvenAt) {
    lines.push({
      text: `Окупается на ${breakEvenAt}-м заказе: по первому заказу ROI ${pctSigned(first.roi)}, по всем покупкам ${pctSigned(all.roi)}. Повторяемость ${pct(first.repeatRate, 0)} — именно она вытаскивает кампанию в плюс.`,
      tone: 'pos',
    })
  } else if (gap !== null && gap > 0) {
    lines.push({
      text: `Убыточна на всём горизонте: ROI ${pctSigned(first.roi)} по первому заказу и ${pctSigned(all.roi)} по всем покупкам. До безубыточности не хватает ${pp(gap)} повторяемости — сейчас она ${pct(first.repeatRate, 0)}.`,
      tone: 'neg',
    })
  } else {
    lines.push({
      text: `Убыточна на всём горизонте: ROI ${pctSigned(first.roi)} по первому заказу и ${pctSigned(all.roi)} по всем покупкам. Повторяемость ${pct(first.repeatRate, 0)} не спасает.`,
      tone: 'neg',
    })
  }

  if (first.buyoutRate < 0.8) {
    const roiBeforeReturns = campaign.meta!.roiBeforeReturns
    lines.push({
      text: `Возвраты забирают ${pct(1 - first.buyoutRate, 0)} заказанной выручки: по заказанному ROI был бы ${pctSigned(roiBeforeReturns)}, по факту выкупа ${pctSigned(first.roi)}. Проблема в размерах, а не в ставке.`,
      tone: 'warn',
    })
  }

  if (offSiteShare > 0.4) {
    lines.push({
      text: `${pct(offSiteShare, 0)} покупок происходит вне сайта: ${pct(all.channelShare.app, 0)} в приложении и ${pct(all.channelShare.offline, 0)} в офлайне. Сквозная аналитика по куке видела бы только веб — там ROI ${pctSigned(webOnly)}.`,
      tone: 'neutral',
    })
  }

  if (first.unattributedShare > 0.2) {
    lines.push({
      text: `${pct(first.unattributedShare, 0)} покупок не связано с источником — клиента не удалось идентифицировать. Эти ${count(campaign.raw.unattributed.orders)} заказов в ROI не входят, фактическая окупаемость не хуже показанной.`,
      tone: 'warn',
    })
  }

  const tint = {
    pos: 'border-l-pos bg-pos-soft/40',
    neg: 'border-l-neg bg-neg-soft/40',
    warn: 'border-l-warn bg-warn-soft/40',
    neutral: 'border-l-accent bg-accent-soft/40',
  } as const

  return (
    <div className="flex items-start gap-2 border-b border-ink-200 bg-white px-4 py-2.5">
      <div className="flex-1 space-y-1">
        {lines.map((l, i) => (
          <p
            key={i}
            className={`border-l-2 py-0.5 pl-2 text-base leading-snug text-ink-800 ${tint[l.tone]}`}
          >
            {l.text}
          </p>
        ))}
      </div>
      <NoteButton
        blockId={`${blockPrefix}:verdict`}
        blockLabel={`Вывод по кампании «${campaign.meta!.fullName}»`}
        screen={SCREEN}
      />
      <span className="text-2xs text-ink-300">
        горизонт: {horizon === 'first' ? 'первый заказ' : 'все покупки'}
      </span>
    </div>
  )
}

function ChartHeader({
  title,
  hint,
  blockId,
  blockLabel,
  right,
}: {
  title: string
  hint?: string
  blockId: string
  blockLabel: string
  right?: React.ReactNode
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <div className="flex items-baseline gap-1.5">
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
        {hint && <span className="text-2xs text-ink-400">{hint}</span>}
        <NoteButton blockId={blockId} blockLabel={blockLabel} screen={SCREEN} />
      </div>
      {right}
    </div>
  )
}

/**
 * Недельная динамика. Два графика, а не две шкалы на одном:
 *  — сверху уровни: расход столбцами, маржа линией, обе величины в ₽;
 *  — снизу недельный ROI со знаком.
 * Полоса ROI нужна потому, что зазор между линией и столбцами бывает
 * порядка десяти процентов — глазом такую разницу по неделям не сложить.
 * Обе оси X идентичны, поэтому колонки стоят друг под другом.
 */
function WeeklyChart({
  weeks,
  horizon,
  blockPrefix,
}: {
  weeks: NonNullable<TreeNode['weeks']>
  horizon: Horizon
  blockPrefix: string
}) {
  const data = weeks.map((w) => {
    const margin = horizon === 'first' ? w.marginFirst : w.marginAll
    return {
      label: w.label,
      spend: w.spend,
      margin,
      roi: w.spend ? (margin / w.spend - 1) * 100 : 0,
    }
  })
  const CHART_MARGIN = { top: 4, right: 8, bottom: 0, left: 4 }
  const Y_WIDTH = 54

  const tooltip = (
    <Tooltip
      cursor={{ fill: 'rgba(18,22,28,0.04)' }}
      content={({ active, payload, label }) => {
        if (!active || !payload?.length) return null
        const p = payload[0].payload as (typeof data)[number]
        return (
          <TooltipBox
            title={`Неделя ${label}`}
            rows={
              <>
                <TooltipRow label="Расход" swatch={VIZ.spendFill} value={`${money(p.spend)} ₽`} />
                <TooltipRow label="Маржа" swatch={VIZ.marginLine} value={`${money(p.margin)} ₽`} />
                <TooltipRow
                  label="Прибыль"
                  value={`${money(p.margin - p.spend)} ₽`}
                  tone={p.margin - p.spend >= 0 ? 'pos' : 'neg'}
                />
                <TooltipRow
                  label="ROI недели"
                  value={pctSigned(p.roi / 100)}
                  tone={p.roi >= 0 ? 'pos' : 'neg'}
                />
              </>
            }
          />
        )
      }}
    />
  )

  return (
    <Panel>
      <ChartHeader
        title="Расход и маржа по неделям"
        hint="обе величины в ₽, одна шкала"
        blockId={`${blockPrefix}:weekly`}
        blockLabel="График «Расход и маржа по неделям»"
        right={
          <Legend
            items={[
              { label: 'Расход', color: VIZ.spendFill, shape: 'bar' },
              {
                label: horizon === 'first' ? 'Маржа с первых заказов' : 'Маржа со всех покупок',
                color: VIZ.marginLine,
                shape: 'line',
              },
            ]}
          />
        }
      />
      <div className="h-[148px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid stroke={VIZ.grid} vertical={false} />
            <XAxis dataKey="label" {...axisProps} hide />
            <YAxis
              {...axisProps}
              width={Y_WIDTH}
              tickFormatter={(v: number) => moneyShort(v)}
              axisLine={false}
            />
            {tooltip}
            <Bar dataKey="spend" fill={VIZ.spendFill} radius={[4, 4, 0, 0]} maxBarSize={26} />
            <Line
              dataKey="margin"
              stroke={VIZ.marginLine}
              strokeWidth={2}
              dot={{ r: 2, fill: VIZ.marginLine, stroke: 'white', strokeWidth: 1 }}
              activeDot={{ r: 4, stroke: 'white', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-2xs uppercase tracking-wide text-ink-400">ROI недели</span>
        <span className="text-2xs text-ink-300">знак дублирует цвет</span>
      </div>
      <div className="h-[74px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={CHART_MARGIN}>
            <XAxis dataKey="label" {...axisProps} interval={0} />
            <YAxis
              {...axisProps}
              width={Y_WIDTH}
              tickFormatter={(v: number) => `${Math.round(v)}%`}
              axisLine={false}
              tickCount={3}
            />
            <ReferenceLine y={0} stroke={VIZ.zero} strokeWidth={1} />
            {tooltip}
            <Bar dataKey="roi" maxBarSize={26} radius={[2, 2, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.roi >= 0 ? VIZ.pos : VIZ.neg} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-2xs leading-tight text-ink-400">
        Верхний график — уровни расхода и маржи, нижний — окупалась ли кампания в конкретную
        неделю. Столбец ниже нуля означает, что маржа за неделю не покрыла расход.
      </p>
    </Panel>
  )
}

/**
 * Точка кривой окупаемости, окрашенная по знаку.
 *
 * Передаём элементом, а не функцией: в этой версии Recharts функциональная
 * форма dot/label молча ничего не рисует, а элемент клонируется с пропсами.
 */
function SignDot(props: { cx?: number; cy?: number; value?: number }) {
  const { cx, cy, value = 0 } = props
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={value >= 0 ? VIZ.pos : VIZ.neg}
      stroke="white"
      strokeWidth={2}
    />
  )
}

/** Подпись точки: знак дублируется символом, поэтому цвет не единственный носитель. */
function SignLabel(props: { x?: number; y?: number; value?: number; index?: number }) {
  const { x, y, value = 0, index = 0 } = props
  // У первой точки подпись сдвинута вправо: по центру она налезает на ось Y.
  return (
    <text
      x={(x ?? 0) + (index === 0 ? 6 : 0)}
      y={(y ?? 0) - 10}
      textAnchor={index === 0 ? 'start' : 'middle'}
      fontSize={11}
      fontWeight={600}
      fill={value >= 0 ? VIZ.pos : VIZ.neg}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {pctSigned(value / 100, 0)}
    </text>
  )
}

/** Кривая окупаемости: накопленный ROI к первому, второму и третьему заказу. */
function PaybackCurve({
  curve,
  spend,
  blockPrefix,
}: {
  curve: { orderIndex: number; roi: number; margin: number }[]
  spend: number
  blockPrefix: string
}) {
  const data = curve.map((p) => ({
    label: `${p.orderIndex}-й заказ`,
    roi: p.roi * 100,
    margin: p.margin,
  }))
  const crossing = curve.find((p) => p.roi >= 0)

  return (
    <Panel>
      <ChartHeader
        title="Кривая окупаемости"
        hint="накопленный ROI к N-му заказу · серая линия — безубыточность"
        blockId={`${blockPrefix}:payback`}
        blockLabel="График «Кривая окупаемости»"
      />
      <div className="h-[228px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 20, right: 96, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={VIZ.grid} vertical={false} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={44} tickFormatter={(v: number) => `${v}%`} axisLine={false} />
            {/* Подпись нуля вынесена в подзаголовок: при некоторых формах кривой
                она налезала на подписи точек, а безопасного положения нет. */}
            <ReferenceLine y={0} stroke={VIZ.zero} strokeWidth={1} />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={String(label)}
                    rows={
                      <>
                        <TooltipRow
                          label="Накопленный ROI"
                          value={pctSigned(payload[0].payload.roi / 100)}
                          tone={payload[0].payload.roi >= 0 ? 'pos' : 'neg'}
                        />
                        <TooltipRow
                          label="Накопленная маржа"
                          value={`${money(payload[0].payload.margin)} ₽`}
                        />
                        <TooltipRow label="Расход" value={`${money(spend)} ₽`} />
                      </>
                    }
                  />
                ) : null
              }
            />
            <Line
              dataKey="roi"
              stroke={VIZ.ink}
              strokeWidth={2}
              isAnimationActive={false}
              dot={<SignDot />}
              label={<SignLabel />}
              activeDot={{ r: 6, stroke: 'white', strokeWidth: 2, fill: VIZ.ink }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-2xs leading-tight text-ink-400">
        {crossing
          ? `Точка безубыточности пройдена на ${crossing.orderIndex}-м заказе.`
          : 'Безубыточность не достигается даже к третьему заказу.'}
      </p>
    </Panel>
  )
}

/** Раскладка покупок по каналу. Прямые подписи обязательны: у аквамарина низкий контраст. */
function ChannelSplit({
  campaign,
  horizon,
  blockPrefix,
}: {
  campaign: TreeNode
  horizon: Horizon
  blockPrefix: string
}) {
  const m = derive(campaign.raw, horizon)
  const un = campaign.raw.unattributed
  const channels = (['web', 'app', 'offline'] as const).map((ch) => ({
    ch,
    label: PURCHASE_CHANNEL_LABEL[ch],
    orders: m.ordersByChannel[ch],
    share: m.channelShare[ch],
    revenue: m.netRevenueByChannel[ch],
    color: VIZ.channel[ch],
  }))

  return (
    <Panel>
      <ChartHeader
        title="Покупки по каналу"
        hint="доля заказов"
        blockId={`${blockPrefix}:channels`}
        blockLabel="Блок «Покупки по каналу» в карточке"
      />

      {/* Один стопка-бар: доли видны сразу, между сегментами зазор в цвет поверхности. */}
      <div className="flex h-4 w-full gap-[2px] overflow-hidden">
        {channels.map((c) => (
          <div
            key={c.ch}
            className="h-full rounded-[2px]"
            style={{ width: `${c.share * 100}%`, background: c.color }}
            title={`${c.label}: ${pct(c.share, 0)}`}
          />
        ))}
      </div>

      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr>
            <th className="thead-cell text-left">Канал</th>
            <th className="thead-cell text-right">Заказы</th>
            <th className="thead-cell text-right">Доля</th>
            <th className="thead-cell text-right">Доход от выкупл.</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((c) => (
            <tr key={c.ch}>
              <td className="tcell">
                <span className="flex items-center gap-1.5 text-sm">
                  <span className="h-2 w-2 rounded-sm" style={{ background: c.color }} />
                  {c.label}
                </span>
              </td>
              <td className="tcell text-right"><Num>{count(c.orders)}</Num></td>
              <td className="tcell text-right"><Num>{pct(c.share, 0)}</Num></td>
              <td className="tcell text-right"><Num>{moneyShort(c.revenue)} ₽</Num></td>
            </tr>
          ))}
          <tr className="bg-warn-soft/50">
            <td className="tcell">
              <span className="flex items-center gap-1.5 text-sm text-ink-700">
                <span className="h-2 w-2 rounded-sm border border-dashed border-warn" />
                Не атрибуцировано
              </span>
            </td>
            <td className="tcell text-right"><Num>{count(un.orders)}</Num></td>
            <td className="tcell text-right">
              <Num title="Доля во всех покупках источника">{pct(m.unattributedShare, 0)}</Num>
            </td>
            <td className="tcell text-right"><Num>{moneyShort(un.netRevenue)} ₽</Num></td>
          </tr>
        </tbody>
      </table>
    </Panel>
  )
}

/**
 * Запас по ставке. Форма — bullet, а не столбики.
 *
 * Важно: запас В ПРОЦЕНТАХ тождественен ROI — break-even CPC / CPC − 1 это
 * то же самое, что маржа / расход − 1. Поэтому процент здесь не показываем,
 * он уже есть в шапке; показываем ставки в рублях, что и есть действие.
 */
function BidHeadroom({
  first,
  all,
  horizon,
  blockPrefix,
}: {
  first: ReturnType<typeof derive>
  all: ReturnType<typeof derive>
  horizon: Horizon
  blockPrefix: string
}) {
  const m = horizon === 'first' ? first : all
  const other = horizon === 'first' ? all : first
  const cpc = m.cpc
  const be = m.breakEvenCpc
  const scale = Math.max(cpc, first.breakEvenCpc, all.breakEvenCpc) * 1.15
  const ok = be >= cpc
  const delta = be - cpc

  const marker = (value: number, label: string, dashed: boolean) => (
    <div
      className="absolute -top-1 flex flex-col items-center"
      style={{ left: `${Math.min(99, (value / scale) * 100)}%` }}
    >
      <span
        className={`h-[24px] w-0 border-l ${
          dashed ? 'border-dashed border-ink-400' : 'border-solid border-ink-900'
        }`}
      />
      <span className="mt-0.5 whitespace-nowrap text-2xs text-ink-500">{label}</span>
    </div>
  )

  return (
    <Panel>
      <ChartHeader
        title="Запас по ставке"
        hint={`текущий CPC против break-even · ${
          horizon === 'first' ? 'первый заказ' : 'все покупки'
        }`}
        blockId={`${blockPrefix}:bid`}
        blockLabel="Блок «Запас по ставке»"
      />

      <div className="relative mb-7 mt-1 h-4 w-full rounded-sm bg-ink-100">
        <div
          className="h-full rounded-sm"
          style={{
            width: `${Math.min(100, (cpc / scale) * 100)}%`,
            background: ok ? VIZ.pos : VIZ.neg,
          }}
          title={`Текущий CPC ${int(cpc)} ₽`}
        />
        {marker(be, `${int(be)} ₽`, false)}
        {marker(
          other.breakEvenCpc,
          `${int(other.breakEvenCpc)} ₽ · ${horizon === 'first' ? 'все покупки' : 'первый заказ'}`,
          true,
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric label="Текущий CPC" value={`${int(cpc)} ₽`} />
        <Metric
          label="Break-even CPC"
          value={`${int(be)} ₽`}
          hint={horizon === 'first' ? 'по первому заказу' : 'со всеми покупками'}
        />
        <Metric
          label={ok ? 'Можно поднять на' : 'Надо снизить на'}
          value={`${delta >= 0 ? '+' : '−'}${int(Math.abs(delta))} ₽`}
          tone={ok ? 'pos' : 'neg'}
          hint={ok ? 'до точки безубыточности' : 'иначе трафик в минус'}
        />
      </div>
    </Panel>
  )
}
