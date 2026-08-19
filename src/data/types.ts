/**
 * Модель данных прототипа сквозной аналитики.
 *
 * Ключевая идея: все числа считаются на листьях иерархии (запрос / креатив),
 * а узлы выше — это сумма листьев. Поэтому цифры в таблице всегда сходятся
 * при разворачивании строк.
 *
 * Атрибуция — только last-click по клиенту в едином профиле (см. README).
 */

/** Канал, в котором произошла покупка (не канал трафика). */
export type PurchaseChannel = 'web' | 'app' | 'offline'

export const PURCHASE_CHANNELS: PurchaseChannel[] = ['web', 'app', 'offline']

export const PURCHASE_CHANNEL_LABEL: Record<PurchaseChannel, string> = {
  web: 'Веб',
  app: 'Приложение',
  offline: 'Офлайн',
}

/** Горизонт окупаемости: первый заказ или все покупки клиента за период жизни. */
export type Horizon = 'first' | 'all'

/** Уровень в иерархии: канал трафика → кампания → группа → запрос. */
export type NodeLevel = 'source' | 'campaign' | 'adgroup' | 'keyword'

/**
 * Заказы одной «когорты клиентов», приведённых узлом.
 * orderIndex: 1 — первый заказ клиента, 2 — второй, 3 — третий и последующие.
 */
export interface OrderCohort {
  orderIndex: 1 | 2 | 3
  orders: number
  /** Выручка в заказе (до отмен и возвратов). */
  revenue: number
  /** Выручка по факту выкупа (после отмен и возвратов). */
  netRevenue: number
  /** Маржа от выкупленной выручки. */
  margin: number
  /** Раскладка выкупленной выручки по каналу покупки. */
  netRevenueByChannel: Record<PurchaseChannel, number>
  /** Раскладка заказов по каналу покупки. */
  ordersByChannel: Record<PurchaseChannel, number>
}

/** Сырые метрики узла: то, что «измерено». Всё остальное — производные. */
export interface RawMetrics {
  clicks: number
  spend: number
  cohorts: OrderCohort[]
  /**
   * Покупки, которые система видит, но не смогла связать с источником:
   * клиент не идентифицирован или окно атрибуции истекло.
   * Никогда не попадают в ROI — только в отдельную строку и в бейдж.
   */
  unattributed: {
    orders: number
    netRevenue: number
    margin: number
    ordersByChannel: Record<PurchaseChannel, number>
  }
}

/** Точка недельной динамики (для карточки кампании). */
export interface WeekPoint {
  /** ISO-дата понедельника недели. */
  week: string
  label: string
  clicks: number
  spend: number
  orders: number
  netRevenue: number
  /** Маржа по первому заказу. */
  marginFirst: number
  /** Маржа со всех покупок клиентов этой недели. */
  marginAll: number
}

export interface TreeNode {
  id: string
  level: NodeLevel
  name: string
  parentId: string | null
  /** id кампании, к которой относится узел (для кампании — она сама). */
  campaignId: string | null
  children: TreeNode[]
  raw: RawMetrics
  /** Только у кампаний: контекст, который нужен карточке. */
  meta?: CampaignMeta
  /** Только у кампаний: недельная динамика. */
  weeks?: WeekPoint[]
}

export interface CampaignMeta {
  sourceId: string
  sourceName: string
  /** Товарная категория задаёт маржинальность. */
  category: string
  marginRate: number
  /** Тип трафика — влияет на долю мобильных покупок и повторяемость. */
  trafficKind: 'brand' | 'warm' | 'cold' | 'retargeting' | 'influencer'
  /** Заложенный в генератор архетип — для отладки и README, в UI не показываем как ярлык. */
  archetype: Archetype
  /** Заметка о том, что этот кейс должен проверить. */
  designNote: string
}

export type Archetype =
  | 'profitable'
  | 'unprofitable'
  | 'repeat-saves'
  | 'mobile-heavy'
  | 'unattributed-heavy'
  | 'marginal'

/** Производные метрики. Считаются для выбранного горизонта. */
export interface DerivedMetrics {
  clicks: number
  spend: number
  cpc: number
  orders: number
  revenue: number
  netRevenue: number
  margin: number
  cpo: number
  aov: number
  /** ROI = маржа / расход − 1. 0% — точка безубыточности. */
  roi: number
  profit: number
  buyoutRate: number
  repeatRate: number
  ordersByChannel: Record<PurchaseChannel, number>
  netRevenueByChannel: Record<PurchaseChannel, number>
  channelShare: Record<PurchaseChannel, number>
  unattributedOrders: number
  unattributedNetRevenue: number
  unattributedShare: number
  breakEvenCpc: number
  /** Запас (или перебор) по ставке: breakEvenCpc / cpc − 1. */
  cpcHeadroom: number
}

export interface Dataset {
  periodLabel: string
  /** Корневые узлы — каналы трафика. */
  sources: TreeNode[]
  campaigns: TreeNode[]
  /** Сводная неатрибуцированная часть по всему аккаунту. */
  totals: RawMetrics
  seed: number
}
