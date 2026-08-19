import { dataset } from '../src/data/generate'
import { cumulativeRoi, derive, repeatRateGapToBreakEven, webOnlyRoi } from '../src/data/metrics'
import type { TreeNode } from '../src/data/types'

const money = (v: number) => Math.round(v).toLocaleString('ru-RU')
const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`

function row(node: TreeNode) {
  const f = derive(node.raw, 'first')
  const a = derive(node.raw, 'all')
  console.log(`\n[${node.level}] ${node.name}   id=${node.id}`)
  console.log(
    `  клики ${money(f.clicks)} · расход ${money(f.spend)} ₽ · CPC ${f.cpc.toFixed(0)} ₽ · ` +
      `заказы(1-й) ${money(f.orders)} · ср. чек ${money(f.aov)} ₽`,
  )
  console.log(
    `  выручка ${money(f.revenue)} ₽ → выкуп ${money(f.netRevenue)} ₽ (${(f.buyoutRate * 100).toFixed(1)}%) · ` +
      `маржа ${money(f.margin)} ₽ · CPO ${f.cpo.toFixed(0)} ₽`,
  )
  console.log(
    `  ROI первый заказ ${pct(f.roi)}  |  ROI все покупки ${pct(a.roi)}  ` +
      `(заказы всего ${money(a.orders)}, повторяемость ${(f.repeatRate * 100).toFixed(1)}%)`,
  )
  console.log(
    `  канал покупки: веб ${(a.channelShare.web * 100).toFixed(0)}% / прил. ${(a.channelShare.app * 100).toFixed(0)}% / офлайн ${(a.channelShare.offline * 100).toFixed(0)}%` +
      ` · не атрибуцировано ${money(f.unattributedOrders)} зак. (${(f.unattributedShare * 100).toFixed(1)}%)`,
  )
  console.log(
    `  break-even CPC: ${f.breakEvenCpc.toFixed(0)} ₽ по 1-му / ${a.breakEvenCpc.toFixed(0)} ₽ по всем · ` +
      `запас по ставке ${pct(a.cpcHeadroom)}`,
  )
  console.log(`  ROI «как видит обычная сквозная» (только веб, 1-й заказ): ${pct(webOnlyRoi(node.raw))}`)
}

const src = dataset.sources[0]
const cmp = src.children.find((c) => c.id === 'cmp:ya-competitors')!
const grp = cmp.children[0]
const kw = grp.children[0]

console.log('='.repeat(92))
console.log('ПРИМЕР СТРОКИ НА КАЖДОМ УРОВНЕ ИЕРАРХИИ  (сид ' + dataset.seed + ', период: ' + dataset.periodLabel + ')')
console.log('='.repeat(92))
;[src, cmp, grp, kw].forEach(row)

console.log('\n' + '='.repeat(92))
console.log('КРИВАЯ ОКУПАЕМОСТИ КАМПАНИИ «' + cmp.name + '»')
console.log('='.repeat(92))
for (const p of cumulativeRoi(cmp.raw)) {
  console.log(`  к заказу №${p.orderIndex}: накопленная маржа ${money(p.margin)} ₽ → ROI ${pct(p.roi)}`)
}
const gap = repeatRateGapToBreakEven(cmp.raw)
console.log(`  не хватает повторяемости до ROI 0: ${gap === null ? '—' : (gap * 100).toFixed(1) + ' п.п.'}`)

console.log('\n' + '='.repeat(92))
console.log('ВСЕ КАМПАНИИ: ПРОВЕРКА, ЧТО ЕСТЬ ВСЕ ИНТЕРЕСНЫЕ ТИПЫ')
console.log('='.repeat(92))
console.log(
  'кампания'.padEnd(38) +
    'расход'.padStart(11) +
    'ROI 1-й'.padStart(9) +
    'ROI все'.padStart(9) +
    'повтор'.padStart(8) +
    'прил.'.padStart(7) +
    'офлайн'.padStart(8) +
    'н/атр.'.padStart(8) +
    '  архетип',
)
for (const c of dataset.campaigns) {
  const f = derive(c.raw, 'first')
  const a = derive(c.raw, 'all')
  const flip = f.roi < 0 && a.roi > 0 ? ' ⟵ РАЗВОРОТ' : ''
  console.log(
    `${c.meta!.sourceName.slice(0, 9)} / ${c.name}`.slice(0, 37).padEnd(38) +
      money(f.spend).padStart(11) +
      pct(f.roi).padStart(9) +
      pct(a.roi).padStart(9) +
      `${(f.repeatRate * 100).toFixed(0)}%`.padStart(8) +
      `${(a.channelShare.app * 100).toFixed(0)}%`.padStart(7) +
      `${(a.channelShare.offline * 100).toFixed(0)}%`.padStart(8) +
      `${(f.unattributedShare * 100).toFixed(0)}%`.padStart(8) +
      `  ${c.meta!.archetype}${flip}`,
  )
}

const t = dataset.totals
const tf = derive(t, 'first')
const ta = derive(t, 'all')
const flipSpend = dataset.campaigns
  .filter((c) => derive(c.raw, 'first').roi < 0 && derive(c.raw, 'all').roi > 0)
  .reduce((acc, c) => acc + c.raw.spend, 0)
console.log('\n' + '='.repeat(92))
console.log('ИТОГО ПО АККАУНТУ')
console.log('='.repeat(92))
console.log(`  расход ${money(tf.spend)} ₽ · клики ${money(tf.clicks)} · заказов (1-й) ${money(tf.orders)}`)
console.log(`  ROI по первому заказу ${pct(tf.roi)} · ROI по всем покупкам ${pct(ta.roi)}`)
console.log(`  не атрибуцировано: ${money(tf.unattributedOrders)} заказов, ${money(tf.unattributedNetRevenue)} ₽ выкупа (${(tf.unattributedShare * 100).toFixed(1)}%)`)
console.log(`  бюджет в кампаниях, которые убыточны на 1-м заказе и прибыльны на всех: ${money(flipSpend)} ₽ (${((flipSpend / tf.spend) * 100).toFixed(1)}% расхода)`)
console.log(`  запросов в дереве: ${dataset.campaigns.reduce((a, c) => a + c.children.reduce((b, g) => b + g.children.length, 0), 0)} · групп: ${dataset.campaigns.reduce((a, c) => a + c.children.length, 0)} · кампаний: ${dataset.campaigns.length}`)
