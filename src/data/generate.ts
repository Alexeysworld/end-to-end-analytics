import { BRAND_BY_ID, CATEGORY_BRAND_MIX } from './brands'
import { CAMPAIGN_SPECS, CATEGORY_BY_ID, SOURCES, type CampaignSpec, type ItemSpec } from './specs'
import type {
  BrandSlice,
  Dataset,
  OrderCohort,
  PurchaseChannel,
  RawMetrics,
  TreeNode,
  WeekPoint,
} from './types'

export const SEED = 20260819

/** mulberry32 — короткий детерминированный PRNG. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const zeroChannels = (): Record<PurchaseChannel, number> => ({ web: 0, app: 0, offline: 0 })

/**
 * Обратный счёт конверсии из целевого ROI первого заказа:
 * roi = (cr · aov · buyout · marginRate) / cpc − 1
 * Средний чек, маржинальность и выкуп берутся из товарной категории.
 */
function deriveCr(spec: CampaignSpec): number {
  const cat = CATEGORY_BY_ID[spec.categoryId]
  return ((1 + spec.targetRoiFirst) * spec.cpc) / (cat.aov * cat.buyoutRate * cat.marginRate)
}

/** Случайные веса, суммирующиеся в 1, с заметным, но не абсурдным разбросом. */
function weights(n: number, rand: () => number, spread = 0.55): number[] {
  const raw = Array.from({ length: n }, () => 1 + (rand() * 2 - 1) * spread)
  const sum = raw.reduce((a, b) => a + b, 0)
  return raw.map((w) => w / sum)
}

/** Веса запросов: заданный в спеке вес плюс небольшой шум. */
function itemWeights(items: ItemSpec[], rand: () => number): number[] {
  const raw = items.map((it) => (it.weight ?? 1) * (1 + (rand() * 2 - 1) * 0.18))
  const sum = raw.reduce((a, b) => a + b, 0)
  return raw.map((w) => w / sum)
}

const jitter = (rand: () => number, amp: number) => 1 + (rand() * 2 - 1) * amp

/** Повторные покупки смещаются в приложение и офлайн — там работает программа лояльности. */
function shiftChannelsForRepeat(
  base: Record<PurchaseChannel, number>,
  orderIndex: 2 | 3,
): Record<PurchaseChannel, number> {
  const step = orderIndex === 2 ? 1 : 2
  const toApp = Math.min(base.web * 0.45, 0.07 * step)
  const toOffline = Math.min(base.web * 0.25, 0.04 * step)
  const web = base.web - toApp - toOffline
  return { web, app: base.app + toApp, offline: base.offline + toOffline }
}

function splitByChannels(
  value: number,
  shares: Record<PurchaseChannel, number>,
): Record<PurchaseChannel, number> {
  return { web: value * shares.web, app: value * shares.app, offline: value * shares.offline }
}

/**
 * Разложение когорты по брендам.
 *
 * Доли задают, кому достались заказы; множители бренда — насколько он
 * отличается от среднего по запросу. Дальше суммы нормируются так, чтобы
 * итог по брендам в точности совпал с числами когорты: вкладка «Товарная
 * аналитика» и таблица окупаемости не имеют права расходиться.
 */
function splitByBrands(
  cohort: {
    orders: number
    netOrders: number
    revenue: number
    netRevenue: number
    margin: number
  },
  mix: Record<string, number>,
): Record<string, BrandSlice> {
  const ids = Object.keys(mix)
  const shareSum = ids.reduce((a, id) => a + mix[id], 0) || 1

  // Сырые значения по множителям бренда.
  const raw = ids.map((id) => {
    const b = BRAND_BY_ID[id]
    const orders = cohort.orders * (mix[id] / shareSum)
    return {
      id,
      orders,
      revenueW: orders * b.aov,
      buyoutW: b.buyout,
      marginW: b.aov * b.margin,
    }
  })

  const revenueNorm = raw.reduce((a, r) => a + r.revenueW, 0) || 1
  // Выкуп: взвешиваем заказы на множитель выкупа и нормируем к общему выкупу.
  const buyoutNorm = raw.reduce((a, r) => a + r.orders * r.buyoutW, 0) || 1
  const marginNorm = raw.reduce((a, r) => a + r.orders * r.marginW, 0) || 1

  const out: Record<string, BrandSlice> = {}
  for (const r of raw) {
    const revenue = cohort.revenue * (r.revenueW / revenueNorm)
    const netOrders = cohort.netOrders * ((r.orders * r.buyoutW) / buyoutNorm)
    // Доход от выкупленных заказов бренда: доля выкупленных заказов × его чек.
    const netRevenue =
      cohort.netRevenue * ((r.orders * r.buyoutW * BRAND_BY_ID[r.id].aov) /
        (raw.reduce((a, x) => a + x.orders * x.buyoutW * BRAND_BY_ID[x.id].aov, 0) || 1))
    out[r.id] = {
      orders: r.orders,
      netOrders,
      revenue,
      netRevenue,
      margin: cohort.margin * ((r.orders * r.marginW) / marginNorm),
    }
  }
  return out
}

/** Три когорты заказов: первый, второй, третий и последующие. */
function buildCohorts(args: {
  orders1: number
  aov: number
  marginRate: number
  buyoutRate: number
  repeatRate: number
  channelShares: Record<PurchaseChannel, number>
  brandMix: Record<string, number>
}): OrderCohort[] {
  const { orders1, aov, marginRate, buyoutRate, repeatRate, channelShares, brandMix } = args
  // Третий и последующие заказы приходят реже второго: затухание 0.8.
  const counts: Record<1 | 2 | 3, number> = {
    1: orders1,
    2: orders1 * repeatRate,
    3: orders1 * repeatRate * repeatRate * 0.8,
  }
  // Средний чек и выкуп немного лучше у постоянных клиентов.
  const aovFactor: Record<1 | 2 | 3, number> = { 1: 1, 2: 1.05, 3: 1.1 }
  const buyoutBonus: Record<1 | 2 | 3, number> = { 1: 0, 2: 0.025, 3: 0.04 }

  return ([1, 2, 3] as const).map((orderIndex) => {
    const orders = counts[orderIndex]
    const cohortAov = aov * aovFactor[orderIndex]
    const buyout = Math.min(0.97, buyoutRate + buyoutBonus[orderIndex])
    const revenue = orders * cohortAov
    const netRevenue = revenue * buyout
    const netOrders = orders * buyout
    const margin = netRevenue * marginRate
    const shares =
      orderIndex === 1 ? channelShares : shiftChannelsForRepeat(channelShares, orderIndex)
    return {
      orderIndex,
      orders,
      netOrders,
      revenue,
      netRevenue,
      margin,
      netRevenueByChannel: splitByChannels(netRevenue, shares),
      ordersByChannel: splitByChannels(orders, shares),
      netOrdersByChannel: splitByChannels(netOrders, shares),
      brands: splitByBrands({ orders, netOrders, revenue, netRevenue, margin }, brandMix),
    }
  })
}

/**
 * Пропорционально масштабирует все «заказные» величины узла.
 * Нужно, чтобы после шума по запросам ROI кампании всё-таки попал
 * в заданный спекой targetRoiFirst: иначе «пограничная» кампания
 * уезжает с +6% на +20% и перестаёт быть пограничной.
 */
function scaleOrders(raw: RawMetrics, k: number): void {
  for (const c of raw.cohorts) {
    c.orders *= k
    c.netOrders *= k
    c.revenue *= k
    c.netRevenue *= k
    c.margin *= k
    for (const ch of ['web', 'app', 'offline'] as const) {
      c.netRevenueByChannel[ch] *= k
      c.ordersByChannel[ch] *= k
      c.netOrdersByChannel[ch] *= k
    }
    for (const slice of Object.values(c.brands)) {
      slice.orders *= k
      slice.netOrders *= k
      slice.revenue *= k
      slice.netRevenue *= k
      slice.margin *= k
    }
  }
  raw.unattributed.orders *= k
  raw.unattributed.netOrders *= k
  raw.unattributed.netRevenue *= k
  raw.unattributed.margin *= k
  for (const ch of ['web', 'app', 'offline'] as const) {
    raw.unattributed.ordersByChannel[ch] *= k
  }
}

function emptyRaw(): RawMetrics {
  return {
    clicks: 0,
    spend: 0,
    cohorts: ([1, 2, 3] as const).map((orderIndex) => ({
      orderIndex,
      orders: 0,
      netOrders: 0,
      revenue: 0,
      netRevenue: 0,
      margin: 0,
      netRevenueByChannel: zeroChannels(),
      ordersByChannel: zeroChannels(),
      netOrdersByChannel: zeroChannels(),
      brands: {},
    })),
    unattributed: {
      orders: 0,
      netOrders: 0,
      netRevenue: 0,
      margin: 0,
      ordersByChannel: zeroChannels(),
    },
  }
}

function addRaw(target: RawMetrics, src: RawMetrics): RawMetrics {
  target.clicks += src.clicks
  target.spend += src.spend
  src.cohorts.forEach((c, i) => {
    const t = target.cohorts[i]
    t.orders += c.orders
    t.netOrders += c.netOrders
    t.revenue += c.revenue
    t.netRevenue += c.netRevenue
    t.margin += c.margin
    for (const ch of ['web', 'app', 'offline'] as const) {
      t.netRevenueByChannel[ch] += c.netRevenueByChannel[ch]
      t.ordersByChannel[ch] += c.ordersByChannel[ch]
      t.netOrdersByChannel[ch] += c.netOrdersByChannel[ch]
    }
    for (const [brandId, slice] of Object.entries(c.brands)) {
      const acc = (t.brands[brandId] ??= {
        orders: 0,
        netOrders: 0,
        revenue: 0,
        netRevenue: 0,
        margin: 0,
      })
      acc.orders += slice.orders
      acc.netOrders += slice.netOrders
      acc.revenue += slice.revenue
      acc.netRevenue += slice.netRevenue
      acc.margin += slice.margin
    }
  })
  target.unattributed.orders += src.unattributed.orders
  target.unattributed.netOrders += src.unattributed.netOrders
  target.unattributed.netRevenue += src.unattributed.netRevenue
  target.unattributed.margin += src.unattributed.margin
  for (const ch of ['web', 'app', 'offline'] as const) {
    target.unattributed.ordersByChannel[ch] += src.unattributed.ordersByChannel[ch]
  }
  return target
}

function sumRaw(nodes: TreeNode[]): RawMetrics {
  return nodes.reduce((acc, n) => addRaw(acc, n.raw), emptyRaw())
}

/** 13 недель динамики. Расход двигается по тренду с шумом, маржа следует за ним. */
function buildWeeks(spec: CampaignSpec, raw: RawMetrics, rand: () => number): WeekPoint[] {
  const n = 13
  const trendWeights = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    return Math.pow(spec.spendTrend, t * 2 - 1) * jitter(rand, 0.14)
  })
  const sumW = trendWeights.reduce((a, b) => a + b, 0)
  // Эффективность плавает по неделям независимо от расхода — иначе график скучный.
  const effWeights = trendWeights.map(() => jitter(rand, 0.18))
  const marginFirstTotal = raw.cohorts[0].margin
  const marginAllTotal = raw.cohorts.reduce((a, c) => a + c.margin, 0)
  const effNorm = trendWeights.reduce((a, w, i) => a + (w / sumW) * effWeights[i], 0)

  // Период заканчивается прошлым воскресеньем; недели считаем назад от 2026-08-17.
  const lastMonday = new Date(Date.UTC(2026, 7, 17))
  return trendWeights.map((w, i) => {
    const share = w / sumW
    const effShare = (share * effWeights[i]) / effNorm
    const d = new Date(lastMonday.getTime() - (n - 1 - i) * 7 * 86400000)
    const iso = d.toISOString().slice(0, 10)
    return {
      week: iso,
      label: `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      clicks: raw.clicks * share,
      spend: raw.spend * share,
      orders: raw.cohorts[0].orders * effShare,
      netRevenue: raw.cohorts[0].netRevenue * effShare,
      marginFirst: marginFirstTotal * effShare,
      marginAll: marginAllTotal * effShare,
    }
  })
}

export function generateDataset(seed: number = SEED): Dataset {
  const rand = rng(seed)
  const campaigns: TreeNode[] = []

  const sources: TreeNode[] = SOURCES.map((s) => ({
    id: `src:${s.id}`,
    level: 'source' as const,
    name: s.name,
    parentId: null,
    campaignId: null,
    children: [],
    raw: emptyRaw(),
  }))

  for (const spec of CAMPAIGN_SPECS) {
    const source = sources.find((s) => s.id === `src:${spec.sourceId}`)!
    const cat = CATEGORY_BY_ID[spec.categoryId]
    const baseCr = deriveCr(spec)
    const groupWeights = weights(spec.groups.length, rand, 0.4)

    const campaign: TreeNode = {
      id: `cmp:${spec.id}`,
      level: 'campaign',
      name: spec.name,
      parentId: source.id,
      campaignId: `cmp:${spec.id}`,
      children: [],
      raw: emptyRaw(),
      meta: {
        sourceId: source.id,
        sourceName: source.name,
        category: cat.name,
        categoryId: cat.id,
        // Заполняется после сборки запросов: зависит от переопределений.
        marginRate: cat.marginRate,
        roiBeforeReturns: 0,
        trafficKind: spec.trafficKind,
        archetype: spec.archetype,
        designNote: spec.designNote,
      },
    }

    spec.groups.forEach((group, gi) => {
      const groupClicks = spec.clicks * groupWeights[gi]
      const kWeights = itemWeights(group.items, rand)
      const groupNode: TreeNode = {
        id: `grp:${spec.id}:${gi}`,
        level: 'adgroup',
        name: group.name,
        parentId: campaign.id,
        campaignId: campaign.id,
        children: [],
        raw: emptyRaw(),
      }

      group.items.forEach((item, ki) => {
        const clicks = Math.round(groupClicks * kWeights[ki])
        // CPC держим в заявленном диапазоне 15–1500 ₽ даже после шума.
        const cpc = Math.min(
          1500,
          Math.max(15, spec.cpc * (item.cpc ?? 1) * jitter(rand, 0.14)),
        )
        const cr = baseCr * (item.cr ?? 1) * jitter(rand, 0.18)
        const aov = cat.aov * (item.aov ?? 1) * jitter(rand, 0.1)
        const marginRate = item.marginRate ?? cat.marginRate
        const buyoutRate = Math.min(
          0.97,
          Math.max(0.5, cat.buyoutRate * (item.buyout ?? 1) * jitter(rand, 0.04)),
        )
        const repeatRate = Math.max(
          0,
          Math.min(0.6, spec.repeatRate * (item.repeat ?? 1) * jitter(rand, 0.18)),
        )

        // Раскладка по каналу покупки: шевелим доли и нормируем.
        const rawShares = {
          web: Math.max(0.02, spec.channelShares.web * jitter(rand, 0.22)),
          app: Math.max(0.01, spec.channelShares.app * jitter(rand, 0.26)),
          offline: Math.max(0.01, spec.channelShares.offline * jitter(rand, 0.3)),
        }
        const shareSum = rawShares.web + rawShares.app + rawShares.offline
        const channelShares: Record<PurchaseChannel, number> = {
          web: rawShares.web / shareSum,
          app: rawShares.app / shareSum,
          offline: rawShares.offline / shareSum,
        }

        const orders1 = clicks * cr
        // Бренды: доли категории, если у запроса нет своего набора.
        const brandMix = item.brandMix ?? CATEGORY_BRAND_MIX[cat.id]

        const cohorts = buildCohorts({
          orders1,
          aov,
          marginRate,
          buyoutRate,
          repeatRate,
          channelShares,
          brandMix,
        })

        // Неатрибуцированные покупки: доля от ВСЕХ покупок, которые дал источник.
        // unatt / (attributed + unatt) = share  →  unatt = attributed · s / (1 − s)
        const s = Math.max(0, Math.min(0.45, spec.unattributedShare * jitter(rand, 0.2)))
        const attributedOrders = cohorts.reduce((a, c) => a + c.orders, 0)
        const attributedNet = cohorts.reduce((a, c) => a + c.netRevenue, 0)
        const unattOrders = (attributedOrders * s) / (1 - s)
        const unattNet = (attributedNet * s) / (1 - s) * jitter(rand, 0.08)
        // Неопознанные покупки чаще офлайновые: на кассе клиента опознать сложнее.
        const unattShares = { web: 0.34, app: 0.18, offline: 0.48 }

        const keyword: TreeNode = {
          id: `kw:${spec.id}:${gi}:${ki}`,
          level: 'keyword',
          name: item.name,
          note: item.note,
          parentId: groupNode.id,
          campaignId: campaign.id,
          children: [],
          raw: {
            clicks,
            spend: clicks * cpc,
            cohorts,
            unattributed: {
              orders: unattOrders,
              netOrders: unattOrders * buyoutRate,
              netRevenue: unattNet,
              margin: unattNet * marginRate,
              ordersByChannel: splitByChannels(unattOrders, unattShares),
            },
          },
        }
        groupNode.children.push(keyword)
      })

      groupNode.raw = sumRaw(groupNode.children)
      campaign.children.push(groupNode)
    })

    campaign.raw = sumRaw(campaign.children)

    // Пин ROI первого заказа к спеке: считаем поправку на уровне кампании
    // и применяем её ко всем запросам, поэтому разброс внутри кампании остаётся.
    const actualRoiFirst = campaign.raw.spend
      ? campaign.raw.cohorts[0].margin / campaign.raw.spend - 1
      : 0
    const correction = (1 + spec.targetRoiFirst) / (1 + actualRoiFirst)
    for (const group of campaign.children) {
      for (const keyword of group.children) scaleOrders(keyword.raw, correction)
      group.raw = sumRaw(group.children)
    }
    campaign.raw = sumRaw(campaign.children)

    // Фактическая маржинальность и ROI до возвратов — уже по собранным числам.
    const c1 = campaign.raw.cohorts[0]
    campaign.meta!.marginRate = c1.netRevenue ? c1.margin / c1.netRevenue : cat.marginRate
    campaign.meta!.roiBeforeReturns = campaign.raw.spend
      ? (c1.revenue * (c1.netRevenue ? c1.margin / c1.netRevenue : cat.marginRate)) /
          campaign.raw.spend -
        1
      : 0

    campaign.weeks = buildWeeks(spec, campaign.raw, rand)
    campaigns.push(campaign)
    source.children.push(campaign)
  }

  for (const source of sources) source.raw = sumRaw(source.children)

  return {
    periodLabel: '19 мая — 17 августа 2026 · 13 недель',
    sources,
    campaigns,
    totals: sumRaw(sources),
    seed,
  }
}

export const dataset = generateDataset()
