import type {
  DerivedMetrics,
  Horizon,
  PurchaseChannel,
  RawMetrics,
  TreeNode,
} from './types'

const CH = ['web', 'app', 'offline'] as const

const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b)

/** Какие когорты входят в горизонт: первый заказ или все покупки клиента. */
function cohortsFor(raw: RawMetrics, horizon: Horizon) {
  return horizon === 'first' ? raw.cohorts.slice(0, 1) : raw.cohorts
}

export function derive(raw: RawMetrics, horizon: Horizon): DerivedMetrics {
  const used = cohortsFor(raw, horizon)
  const orders = used.reduce((a, c) => a + c.orders, 0)
  const revenue = used.reduce((a, c) => a + c.revenue, 0)
  const netRevenue = used.reduce((a, c) => a + c.netRevenue, 0)
  const margin = used.reduce((a, c) => a + c.margin, 0)

  const ordersByChannel = { web: 0, app: 0, offline: 0 } as Record<PurchaseChannel, number>
  const netRevenueByChannel = { web: 0, app: 0, offline: 0 } as Record<PurchaseChannel, number>
  for (const c of used) {
    for (const ch of CH) {
      ordersByChannel[ch] += c.ordersByChannel[ch]
      netRevenueByChannel[ch] += c.netRevenueByChannel[ch]
    }
  }
  const channelShare = {
    web: safeDiv(ordersByChannel.web, orders),
    app: safeDiv(ordersByChannel.app, orders),
    offline: safeDiv(ordersByChannel.offline, orders),
  }

  const firstOrders = raw.cohorts[0].orders
  const repeatOrders = raw.cohorts[1].orders
  // Доля неатрибуцированного считается от всех покупок за период, независимо
  // от горизонта: иначе цифра «доверия к данным» скакала бы от переключателя.
  const attributedAll = raw.cohorts.reduce((a, c) => a + c.orders, 0)

  return {
    clicks: raw.clicks,
    spend: raw.spend,
    cpc: safeDiv(raw.spend, raw.clicks),
    orders,
    revenue,
    netRevenue,
    margin,
    cpo: safeDiv(raw.spend, orders),
    aov: safeDiv(revenue, orders),
    roi: raw.spend === 0 ? 0 : margin / raw.spend - 1,
    profit: margin - raw.spend,
    buyoutRate: safeDiv(netRevenue, revenue),
    repeatRate: safeDiv(repeatOrders, firstOrders),
    ordersByChannel,
    netRevenueByChannel,
    channelShare,
    unattributedOrders: raw.unattributed.orders,
    unattributedNetRevenue: raw.unattributed.netRevenue,
    unattributedShare: safeDiv(raw.unattributed.orders, attributedAll + raw.unattributed.orders),
    breakEvenCpc: safeDiv(margin, raw.clicks),
    cpcHeadroom: safeDiv(margin, raw.clicks) / (safeDiv(raw.spend, raw.clicks) || 1) - 1,
  }
}

/** ROI, каким его видит обычная сквозная аналитика: только веб-покупки, только первый заказ. */
export function webOnlyRoi(raw: RawMetrics): number {
  if (raw.spend === 0) return 0
  const marginRate = safeDiv(raw.cohorts[0].margin, raw.cohorts[0].netRevenue)
  return (raw.cohorts[0].netRevenueByChannel.web * marginRate) / raw.spend - 1
}

/** Маржа только по веб-покупкам первого заказа. */
export function webOnlyMargin(raw: RawMetrics): number {
  const marginRate = safeDiv(raw.cohorts[0].margin, raw.cohorts[0].netRevenue)
  return raw.cohorts[0].netRevenueByChannel.web * marginRate
}

/** Кумулятивный ROI к N-му заказу — для кривой окупаемости. */
export function cumulativeRoi(raw: RawMetrics): { orderIndex: number; roi: number; margin: number }[] {
  let acc = 0
  return raw.cohorts.map((c) => {
    acc += c.margin
    return {
      orderIndex: c.orderIndex,
      margin: acc,
      roi: raw.spend === 0 ? 0 : acc / raw.spend - 1,
    }
  })
}

/**
 * Сколько процентных пунктов повторяемости не хватает кампании до ROI = 0.
 * Считаем при фиксированной марже первого заказа: нужен множитель k = spend / margin1,
 * а k(r) = 1 + 1.05·r + 0.84·r² (те же коэффициенты, что в генераторе).
 */
export function repeatRateGapToBreakEven(raw: RawMetrics): number | null {
  const m1 = raw.cohorts[0].margin
  if (m1 <= 0 || raw.spend <= 0) return null
  const needed = raw.spend / m1
  if (needed <= 1) return 0
  // 0.84r² + 1.05r + (1 − needed) = 0
  const a = 0.84
  const b = 1.05
  const c = 1 - needed
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const r = (-b + Math.sqrt(disc)) / (2 * a)
  const current = safeDiv(raw.cohorts[1].orders, raw.cohorts[0].orders)
  return r - current
}

export function deriveNode(node: TreeNode, horizon: Horizon): DerivedMetrics {
  return derive(node.raw, horizon)
}
