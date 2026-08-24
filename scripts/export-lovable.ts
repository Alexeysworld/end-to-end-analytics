import { mkdirSync, writeFileSync } from 'node:fs'
import { BRANDS } from '../src/data/brands'
import { CATEGORIES } from '../src/data/specs'
import { dataset } from '../src/data/generate'
import {
  brandTotals,
  cumulativeRoi,
  derive,
  repeatRateGapToBreakEven,
  webOnlyRoi,
} from '../src/data/metrics'
import { PURCHASE_CHANNEL_LABEL, type Horizon, type TreeNode } from '../src/data/types'

/**
 * Экспорт датасета для сборки дашборда во внешнем инструменте (Lovable).
 *
 * Ключевое решение: выгружаем УЖЕ ПОСЧИТАННЫЕ метрики по каждому узлу для
 * обоих горизонтов, а не сырые клики с формулами. Иначе принимающая сторона
 * реализует арифметику заново, цифры разойдутся с нашим прототипом,
 * и сравнивать две версии станет невозможно.
 *
 * Запуск: npm run export:lovable
 */

const money = (v: number) => Math.round(v)
const rate = (v: number) => Math.round(v * 10000) / 10000

const derivedOf = (node: TreeNode, horizon: Horizon) => {
  const m = derive(node.raw, horizon)
  return {
    clicks: money(m.clicks),
    spend: money(m.spend),
    cpc: money(m.cpc),
    orders: rate(m.orders),
    netOrders: rate(m.netOrders),
    revenue: money(m.revenue),
    netRevenue: money(m.netRevenue),
    margin: money(m.margin),
    profit: money(m.profit),
    cpo: money(m.cpo),
    cpoNet: money(m.cpoNet),
    aov: money(m.aov),
    roi: rate(m.roi),
    buyoutRate: rate(m.buyoutRate),
    repeatRate: rate(m.repeatRate),
    repeatOrdersShare: rate(m.repeatOrdersShare),
    breakEvenCpc: money(m.breakEvenCpc),
    ordersByChannel: {
      web: rate(m.ordersByChannel.web),
      app: rate(m.ordersByChannel.app),
      offline: rate(m.ordersByChannel.offline),
    },
    netRevenueByChannel: {
      web: money(m.netRevenueByChannel.web),
      app: money(m.netRevenueByChannel.app),
      offline: money(m.netRevenueByChannel.offline),
    },
    channelShare: {
      web: rate(m.channelShare.web),
      app: rate(m.channelShare.app),
      offline: rate(m.channelShare.offline),
    },
    onlineOrders: rate(m.onlineOrders),
    onlineNetRevenue: money(m.onlineNetRevenue),
    onlineShare: rate(m.onlineShare),
    unattributedOrders: rate(m.unattributedOrders),
    unattributedNetRevenue: money(m.unattributedNetRevenue),
    unattributedShare: rate(m.unattributedShare),
  }
}

const brandRows = (node: TreeNode, horizon: Horizon) =>
  brandTotals(node, horizon)
    .filter((b) => b.orders > 0.5)
    .map((b) => ({
      brandId: b.brandId,
      orders: rate(b.orders),
      netOrders: rate(b.netOrders),
      revenue: money(b.revenue),
      netRevenue: money(b.netRevenue),
      margin: money(b.margin),
      allocatedSpend: money(b.allocatedSpend),
      roi: rate(b.roi),
      buyoutRate: rate(b.buyoutRate),
      returnRate: rate(b.returnRate),
      aov: money(b.aov),
      marginRate: rate(b.marginRate),
      repeatOrdersShare: rate(b.repeatOrdersShare),
      revenueShare: rate(b.revenueShare),
    }))

/** Плоский список узлов: связь через parentId, чтобы дерево собиралось в один проход. */
const nodes: unknown[] = []

const walk = (node: TreeNode) => {
  const isCampaign = node.level === 'campaign'
  nodes.push({
    id: node.id,
    parentId: node.parentId,
    level: node.level,
    name: node.name,
    ...(node.note ? { note: node.note } : {}),
    ...(isCampaign
      ? {
          fullName: node.meta!.fullName,
          sourceName: node.meta!.sourceName,
          placementName: node.meta!.placementName ?? null,
          category: node.meta!.category,
          categoryId: node.meta!.categoryId,
          marginRate: rate(node.meta!.marginRate),
          roiBeforeReturns: rate(node.meta!.roiBeforeReturns),
          trafficKind: node.meta!.trafficKind,
        }
      : {}),
    first: derivedOf(node, 'first'),
    all: derivedOf(node, 'all'),
    webOnlyRoi: rate(webOnlyRoi(node.raw)),
    ...(isCampaign
      ? {
          paybackCurve: cumulativeRoi(node.raw).map((p) => ({
            orderIndex: p.orderIndex,
            margin: money(p.margin),
            roi: rate(p.roi),
          })),
          repeatRateGapToBreakEven: (() => {
            const gap = repeatRateGapToBreakEven(node.raw)
            return gap === null ? null : rate(gap)
          })(),
          weeks: (node.weeks ?? []).map((w) => ({
            week: w.week,
            label: w.label,
            spend: money(w.spend),
            clicks: money(w.clicks),
            orders: rate(w.orders),
            netRevenue: money(w.netRevenue),
            marginFirst: money(w.marginFirst),
            marginAll: money(w.marginAll),
          })),
          brands: { first: brandRows(node, 'first'), all: brandRows(node, 'all') },
        }
      : {}),
  })
  node.children.forEach(walk)
}
dataset.sources.forEach(walk)

const root: TreeNode = {
  id: 'root',
  level: 'source',
  name: 'Все источники',
  parentId: null,
  campaignId: null,
  children: dataset.sources,
  raw: dataset.totals,
}

const payload = {
  meta: {
    title: 'Сквозная аналитика — синтетические данные',
    advertiser: 'Магазин одежды «Северный склон»',
    periodLabel: dataset.periodLabel,
    currency: 'RUB',
    seed: dataset.seed,
    generatedFrom: 'https://github.com/Alexeysworld/end-to-end-analytics',
    definitions: {
      roi: 'маржа / расход − 1. Ноль — точка безубыточности',
      horizonFirst: 'только первый заказ клиента',
      horizonAll: 'первый и все последующие заказы клиента',
      netOrders: 'выкупленные заказы: без отмен и возвратов',
      netRevenue: 'доход от выкупленных заказов',
      webOnlyRoi:
        'ROI, каким его видит сквозная аналитика по куке: только покупки на сайте и только первый заказ',
      unattributed:
        'покупки, которые не удалось связать с источником. В ROI не входят — ни в числитель, ни в знаменатель',
      allocatedSpend:
        'расход, отнесённый на бренд внутри каждого запроса пропорционально числу заказов',
    },
  },
  purchaseChannels: (['web', 'app', 'offline'] as const).map((id) => ({
    id,
    label: PURCHASE_CHANNEL_LABEL[id],
  })),
  categories: CATEGORIES.map((c) => ({
    id: c.id,
    name: c.name,
    aov: c.aov,
    marginRate: c.marginRate,
    buyoutRate: c.buyoutRate,
    note: c.note,
  })),
  brands: BRANDS.map((b) => ({ id: b.id, name: b.name, kind: b.kind, note: b.note })),
  totals: {
    first: derivedOf(root, 'first'),
    all: derivedOf(root, 'all'),
    unattributed: {
      orders: rate(dataset.totals.unattributed.orders),
      netOrders: rate(dataset.totals.unattributed.netOrders),
      netRevenue: money(dataset.totals.unattributed.netRevenue),
      margin: money(dataset.totals.unattributed.margin),
    },
  },
  brandTotals: { first: brandRows(root, 'first'), all: brandRows(root, 'all') },
  nodes,
}

/**
 * Компактный вариант: только источники, размещения и кампании — без групп,
 * запросов, недельной динамики и брендов внутри кампаний. Нужен для случая,
 * когда файл загрузить нельзя и датасет приходится вставлять текстом в чат.
 * Drill-down до запроса на нём не собрать, для этого нужен полный файл.
 */
const compact = {
  ...payload,
  meta: { ...payload.meta, variant: 'compact: только источники и кампании' },
  nodes: (nodes as { level: string }[])
    .filter((n) => n.level !== 'adgroup' && n.level !== 'keyword')
    .map((n) => {
      const { weeks, brands, ...rest } = n as Record<string, unknown>
      void weeks
      void brands
      return rest
    }),
}

mkdirSync('lovable', { recursive: true })
writeFileSync('lovable/dataset.json', JSON.stringify(payload))
writeFileSync('lovable/dataset.pretty.json', JSON.stringify(payload, null, 2))
writeFileSync('lovable/dataset.compact.json', JSON.stringify(compact, null, 2))

const kb = (n: number) => `${Math.round(n / 1024)} КБ`
console.log('lovable/dataset.json        —', kb(JSON.stringify(payload).length), `· ${nodes.length} узлов`)
console.log('lovable/dataset.pretty.json —', kb(JSON.stringify(payload, null, 2).length))
console.log('lovable/dataset.compact.json —', kb(JSON.stringify(compact, null, 2).length), `· ${compact.nodes.length} узлов`)
