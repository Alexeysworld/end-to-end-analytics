import type { Archetype, PurchaseChannel } from './types'

/**
 * Модель клиента: интернет-магазин одежды с мобильным приложением
 * и сетью офлайн-магазинов.
 *
 * Товарная категория задаёт три вещи сразу: средний чек, маржинальность
 * и долю выкупа. Из-за этого в отчёте появляются две независимые ловушки:
 *   — штаны конвертят нормально, но половину возвращают по размеру;
 *   — куртки дают большой чек при низкой маржинальности.
 * Обе ловушки не видны по выручке и видны только по марже.
 */
export interface Category {
  id: string
  name: string
  /** Средний чек заказа. */
  aov: number
  /** Маржинальность категории. */
  marginRate: number
  /** Доля выкупа: 1 − отмены и возвраты. */
  buyoutRate: number
  note: string
}

export const CATEGORIES: Category[] = [
  {
    id: 'jackets',
    name: 'Куртки и верхняя одежда',
    aov: 11000,
    marginRate: 0.24,
    buyoutRate: 0.86,
    note: 'Большой чек при низкой маржинальности: 1 000 ₽ выручки приносит 240 ₽ маржи.',
  },
  {
    id: 'pants',
    name: 'Штаны и брюки',
    aov: 5400,
    marginRate: 0.31,
    buyoutRate: 0.68,
    note: 'Треть заказов возвращают по размеру. Разрыв между выручкой и выкупом — главный риск категории.',
  },
  {
    id: 'accessories',
    name: 'Аксессуары: носки, ремни',
    aov: 2100,
    marginRate: 0.38,
    buyoutRate: 0.94,
    note: 'Маленький чек, высокая маржинальность и почти нет возвратов. Живёт только на дешёвом трафике.',
  },
  {
    id: 'mix',
    name: 'Микс — весь ассортимент',
    aov: 7600,
    marginRate: 0.29,
    buyoutRate: 0.83,
    note: 'Средневзвешенные значения по всему каталогу. Для кампаний без товарного фокуса.',
  },
  {
    id: 'workwear',
    name: 'Спецодежда оптом',
    aov: 92000,
    marginRate: 0.15,
    buyoutRate: 0.8,
    note: 'B2B-направление: огромный чек, маржинальность вдвое ниже розницы.',
  },
]

export const CATEGORY_BY_ID: Record<string, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
)

/**
 * Запрос или креатив. Множители применяются к значениям кампании и категории —
 * так внутри одной кампании соседствуют запросы с разной экономикой.
 */
export interface ItemSpec {
  name: string
  /** Доля кликов кампании (веса нормируются). */
  weight?: number
  /** Множитель среднего чека. */
  aov?: number
  /** Переопределение маржинальности (иначе берётся из категории). */
  marginRate?: number
  /** Множитель доли выкупа. */
  buyout?: number
  /** Множитель конверсии. */
  cr?: number
  /** Множитель CPC. */
  cpc?: number
  /** Множитель повторяемости. */
  repeat?: number
  /** Пояснение к запросу — показываем подсказкой в таблице. */
  note?: string
}

export interface CampaignSpec {
  id: string
  name: string
  sourceId: string
  categoryId: string
  trafficKind: 'brand' | 'warm' | 'cold' | 'retargeting' | 'influencer'
  archetype: Archetype
  designNote: string
  clicks: number
  cpc: number
  /** ROI по первому заказу, к которому подгоняется конверсия. */
  targetRoiFirst: number
  repeatRate: number
  channelShares: Record<PurchaseChannel, number>
  unattributedShare: number
  groups: { name: string; items: ItemSpec[] }[]
  /** Тренд расхода за 13 недель: 1 — ровно, >1 — разгон, <1 — затухание. */
  spendTrend: number
}

export const SOURCES: { id: string; name: string }[] = [
  { id: 'yandex', name: 'Яндекс Директ' },
  { id: 'vk', name: 'VK Ads' },
  { id: 'tg', name: 'Telegram Ads' },
  { id: 'infl', name: 'Реклама у блогеров' },
]

export const CAMPAIGN_SPECS: CampaignSpec[] = [
  {
    id: 'ya-brand',
    name: 'Поиск — Бренд',
    sourceId: 'yandex',
    categoryId: 'mix',
    trafficKind: 'brand',
    archetype: 'profitable',
    designNote: 'Явно прибыльная на любом горизонте. Опора, с которой сравнивают остальное.',
    clicks: 44600,
    cpc: 38,
    targetRoiFirst: 1.15,
    repeatRate: 0.41,
    channelShares: { web: 0.42, app: 0.46, offline: 0.12 },
    unattributedShare: 0.09,
    spendTrend: 1.05,
    groups: [
      {
        name: 'Бренд — точные',
        items: [
          { name: 'купить [бренд]', weight: 1.4 },
          { name: '[бренд] официальный сайт', weight: 1.1 },
          { name: '[бренд] интернет-магазин' },
        ],
      },
      {
        name: 'Бренд + категория',
        items: [
          { name: '[бренд] куртка', aov: 1.5, marginRate: 0.24 },
          { name: '[бренд] носки', aov: 0.35, marginRate: 0.38, buyout: 1.12, repeat: 1.3 },
        ],
      },
    ],
  },
  {
    id: 'ya-jackets',
    name: 'Поиск — Куртки',
    sourceId: 'yandex',
    categoryId: 'jackets',
    trafficKind: 'warm',
    archetype: 'mixed-inside',
    designNote:
      'ГЛАВНЫЙ КЕЙС DRILL-DOWN: кампания −11% на первом заказе, но внутри «куртка кожаная» +20%, а «куртка дешёвая» −58%. Резать надо запрос, а не кампанию.',
    clicks: 71200,
    cpc: 95,
    targetRoiFirst: -0.11,
    repeatRate: 0.22,
    channelShares: { web: 0.58, app: 0.29, offline: 0.13 },
    unattributedShare: 0.12,
    spendTrend: 1.1,
    groups: [
      {
        name: 'Куртки — общие',
        items: [
          {
            name: 'куртка дешёвая',
            weight: 1.8,
            aov: 0.52,
            marginRate: 0.13,
            buyout: 0.92,
            cr: 1.25,
            cpc: 0.72,
            repeat: 0.45,
            note: 'Интент дешевизны: конвертит хорошо, но чек вдвое ниже и маржинальность 13%. Скидку сюда давать нельзя — маржи уже нет.',
          },
          {
            name: 'купить куртку недорого',
            weight: 1.3,
            aov: 0.66,
            marginRate: 0.16,
            buyout: 0.95,
            cr: 1.1,
            cpc: 0.8,
            repeat: 0.6,
            note: 'Та же проблема, что у «куртка дешёвая», но мягче.',
          },
          { name: 'куртка женская зимняя', weight: 1.2, aov: 1.05 },
          { name: 'куртка мужская зимняя', aov: 1.1 },
        ],
      },
      {
        name: 'Куртки — премиум',
        items: [
          {
            name: 'куртка кожаная',
            weight: 0.9,
            aov: 1.9,
            marginRate: 0.31,
            buyout: 1.06,
            cr: 0.72,
            cpc: 1.45,
            repeat: 1.35,
            note: 'Высокий чек и маржинальность выше категории. Есть запас по ставке — можно докупать.',
          },
          {
            name: 'куртка кожаная мужская',
            weight: 0.6,
            aov: 1.8,
            marginRate: 0.3,
            buyout: 1.05,
            cr: 0.7,
            cpc: 1.4,
            repeat: 1.25,
          },
          { name: 'пуховик зимний', weight: 0.7, aov: 1.35, marginRate: 0.26, cpc: 1.15 },
        ],
      },
    ],
  },
  {
    id: 'ya-pants',
    name: 'Поиск — Штаны и брюки',
    sourceId: 'yandex',
    categoryId: 'pants',
    trafficKind: 'warm',
    archetype: 'returns-heavy',
    designNote:
      'КЕЙС ВОЗВРАТОВ: по заказанной выручке ROI был бы +12%, по факту выкупа −24%. На всех покупках еле выходит в ноль (+4%).',
    clicks: 58400,
    cpc: 42,
    targetRoiFirst: -0.24,
    repeatRate: 0.26,
    channelShares: { web: 0.6, app: 0.28, offline: 0.12 },
    unattributedShare: 0.13,
    spendTrend: 1.0,
    groups: [
      {
        name: 'Брюки',
        items: [
          { name: 'брюки женские', weight: 1.4 },
          { name: 'брюки классические мужские', aov: 1.15, buyout: 1.12 },
          { name: 'брюки на работу', buyout: 1.08 },
        ],
      },
      {
        name: 'Джинсы и джоггеры',
        items: [
          {
            name: 'джинсы женские',
            weight: 1.5,
            buyout: 0.82,
            note: 'Худший выкуп в отчёте: 56%. Размер не подходит — заказ возвращают.',
          },
          { name: 'джоггеры мужские', aov: 0.8, buyout: 1.15, repeat: 1.2 },
        ],
      },
    ],
  },
  {
    id: 'ya-accessories',
    name: 'Поиск — Носки и ремни',
    sourceId: 'yandex',
    categoryId: 'accessories',
    trafficKind: 'warm',
    archetype: 'profitable',
    designNote:
      'Маленький чек, но маржинальность 38% и почти нет возвратов. Живёт на CPC 22 ₽ — проверяет, читается ли «маленькая, но прибыльная».',
    clicks: 39800,
    cpc: 22,
    targetRoiFirst: 0.3,
    repeatRate: 0.44,
    channelShares: { web: 0.44, app: 0.38, offline: 0.18 },
    unattributedShare: 0.11,
    spendTrend: 1.05,
    groups: [
      {
        name: 'Носки',
        items: [
          { name: 'носки мужские набор', weight: 1.6, repeat: 1.25 },
          { name: 'носки женские набор', weight: 1.2 },
          { name: 'термоноски', aov: 1.4, cpc: 1.2 },
        ],
      },
      {
        name: 'Ремни и мелочь',
        items: [
          { name: 'ремень мужской кожаный', aov: 1.8, marginRate: 0.36, cpc: 1.35 },
          { name: 'ремень женский', aov: 1.5, cpc: 1.2 },
        ],
      },
    ],
  },
  {
    id: 'ya-retargeting',
    name: 'РСЯ — Ретаргетинг брошенных корзин',
    sourceId: 'yandex',
    categoryId: 'mix',
    trafficKind: 'retargeting',
    archetype: 'profitable',
    designNote: 'Дешёвый прибыльный трафик, малый объём. Очевидный кандидат «докупить».',
    clicks: 21900,
    cpc: 26,
    targetRoiFirst: 0.74,
    repeatRate: 0.29,
    channelShares: { web: 0.49, app: 0.4, offline: 0.11 },
    unattributedShare: 0.1,
    spendTrend: 1.1,
    groups: [
      {
        name: 'Корзина',
        items: [
          { name: 'брошенная корзина 1–3 дня', weight: 1.4 },
          { name: 'брошенная корзина 4–7 дней', cr: 0.75 },
        ],
      },
      {
        name: 'Смотрел товар',
        items: [
          { name: 'смотрел карточку — 7 дней' },
          { name: 'смотрел категорию — 14 дней', cr: 0.6 },
        ],
      },
    ],
  },
  {
    id: 'ya-broad',
    name: 'РСЯ — Широкий охват',
    sourceId: 'yandex',
    categoryId: 'jackets',
    trafficKind: 'cold',
    archetype: 'unprofitable',
    designNote: 'Убыточна на любом горизонте, повторяемость 6%. Однозначно отключить.',
    clicks: 104000,
    cpc: 19,
    targetRoiFirst: -0.46,
    repeatRate: 0.06,
    channelShares: { web: 0.78, app: 0.14, offline: 0.08 },
    unattributedShare: 0.16,
    spendTrend: 0.95,
    groups: [
      {
        name: 'Автотаргетинг',
        items: [
          { name: 'автотаргетинг — широкий', weight: 1.6 },
          { name: 'автотаргетинг — альтернативный' },
        ],
      },
      {
        name: 'Интересы',
        items: [
          { name: 'интерес: одежда и обувь', weight: 1.3 },
          { name: 'интерес: скидки и распродажи', cr: 1.15, aov: 0.7, marginRate: 0.17 },
        ],
      },
    ],
  },
  {
    id: 'ya-feed',
    name: 'Товарная кампания по фиду',
    sourceId: 'yandex',
    categoryId: 'mix',
    trafficKind: 'warm',
    archetype: 'profitable',
    designNote: 'Прибыльная, заметная офлайн-доля: примерка и самовывоз в магазине.',
    clicks: 47300,
    cpc: 44,
    targetRoiFirst: 0.38,
    repeatRate: 0.19,
    channelShares: { web: 0.55, app: 0.21, offline: 0.24 },
    unattributedShare: 0.12,
    spendTrend: 1.0,
    groups: [
      {
        name: 'Фид — верхняя одежда',
        items: [
          { name: 'фид: куртки и пуховики', weight: 1.3, aov: 1.6, marginRate: 0.24 },
          { name: 'фид: пальто', aov: 1.4, marginRate: 0.25 },
        ],
      },
      {
        name: 'Фид — базовый гардероб',
        items: [
          { name: 'фид: брюки и джинсы', aov: 0.75, marginRate: 0.31, buyout: 0.85 },
          { name: 'фид: аксессуары', aov: 0.3, marginRate: 0.38, buyout: 1.13, repeat: 1.3 },
        ],
      },
    ],
  },
  {
    id: 'ya-workwear',
    name: 'Поиск — Спецодежда оптом',
    sourceId: 'yandex',
    categoryId: 'workwear',
    trafficKind: 'cold',
    archetype: 'unprofitable',
    designNote:
      'CPC до 1500 ₽, мизерный объём, убыточна везде. Проверяет читаемость строк с очень большими и очень маленькими числами рядом.',
    clicks: 1080,
    cpc: 1250,
    targetRoiFirst: -0.62,
    repeatRate: 0.14,
    channelShares: { web: 0.88, app: 0.03, offline: 0.09 },
    unattributedShare: 0.19,
    spendTrend: 0.8,
    groups: [
      {
        name: 'Опт',
        items: [
          { name: 'спецодежда оптом', weight: 1.2 },
          { name: 'рабочая одежда оптом от производителя', cpc: 1.2, cr: 0.85 },
        ],
      },
    ],
  },
  {
    id: 'vk-lal',
    name: 'Look-alike по покупателям',
    sourceId: 'vk',
    categoryId: 'mix',
    trafficKind: 'cold',
    archetype: 'repeat-saves',
    designNote: 'КЕЙС РАЗВОРОТА: −12% на первом заказе, +26% на всех покупках. Повторяемость 31%.',
    clicks: 82500,
    cpc: 31,
    targetRoiFirst: -0.12,
    repeatRate: 0.31,
    channelShares: { web: 0.44, app: 0.43, offline: 0.13 },
    unattributedShare: 0.17,
    spendTrend: 1.25,
    groups: [
      {
        name: 'LAL 1% покупателей',
        items: [
          { name: 'LAL 1% — покупатели 12 мес', weight: 1.3 },
          { name: 'LAL 1% — высокий чек', aov: 1.35, cr: 0.85 },
        ],
      },
      {
        name: 'LAL 3% покупателей',
        items: [
          { name: 'LAL 3% — покупатели 12 мес', weight: 1.2, cr: 0.8 },
          { name: 'LAL 3% — покупатели 3 мес', cr: 0.9 },
        ],
      },
    ],
  },
  {
    id: 'vk-interests',
    name: 'Интересы — широкий охват',
    sourceId: 'vk',
    categoryId: 'jackets',
    trafficKind: 'cold',
    archetype: 'unprofitable',
    designNote: 'Убыточна на любом горизонте. Второй очевидный кандидат на отключение.',
    clicks: 136000,
    cpc: 16,
    targetRoiFirst: -0.39,
    repeatRate: 0.09,
    channelShares: { web: 0.71, app: 0.19, offline: 0.1 },
    unattributedShare: 0.18,
    spendTrend: 0.9,
    groups: [
      {
        name: 'Интересы — одежда',
        items: [
          { name: 'интерес: женская одежда', weight: 1.5 },
          { name: 'интерес: мужская одежда' },
        ],
      },
      {
        name: 'Интересы — распродажи',
        items: [
          { name: 'интерес: скидки', weight: 1.2, aov: 0.7, marginRate: 0.16 },
          { name: 'интерес: маркетплейсы', cr: 0.8 },
        ],
      },
    ],
  },
  {
    id: 'vk-retarget',
    name: 'Ретаргет по каталогу',
    sourceId: 'vk',
    categoryId: 'accessories',
    trafficKind: 'retargeting',
    archetype: 'profitable',
    designNote: 'Прибыльная, 60% покупок в приложении — трафик из мобильного VK.',
    clicks: 33400,
    cpc: 18,
    targetRoiFirst: 0.52,
    repeatRate: 0.34,
    channelShares: { web: 0.31, app: 0.57, offline: 0.12 },
    unattributedShare: 0.11,
    spendTrend: 1.05,
    groups: [
      {
        name: 'Динамический ретаргет',
        items: [
          { name: 'динамический ретаргет — корзина', weight: 1.4 },
          { name: 'динамический ретаргет — просмотры', cr: 0.7 },
        ],
      },
      {
        name: 'База клиентов',
        items: [
          { name: 'загруженная база — активные', repeat: 1.2 },
          { name: 'загруженная база — спящие', cr: 0.65 },
        ],
      },
    ],
  },
  {
    id: 'tg-discounts',
    name: 'Каналы про скидки',
    sourceId: 'tg',
    categoryId: 'pants',
    trafficKind: 'cold',
    archetype: 'unattributed-heavy',
    designNote:
      'Убыточна на первом заказе и остаётся убыточной на всех, при 31% неатрибуцированного. Проверяет, не спишет ли маркетолог убыточность на «плохие данные».',
    clicks: 56800,
    cpc: 34,
    targetRoiFirst: -0.36,
    repeatRate: 0.1,
    channelShares: { web: 0.64, app: 0.24, offline: 0.12 },
    unattributedShare: 0.29,
    spendTrend: 1.15,
    groups: [
      {
        name: 'Скидочные каналы',
        items: [
          { name: 'канал: скидки и промокоды', weight: 1.6, aov: 0.8, marginRate: 0.22 },
          { name: 'канал: находки для гардероба' },
        ],
      },
      {
        name: 'Кэшбэк-каналы',
        items: [
          { name: 'канал: кэшбэк и бонусы', aov: 0.85, marginRate: 0.24 },
          { name: 'канал: распродажи', cr: 1.1, buyout: 0.9 },
        ],
      },
    ],
  },
  {
    id: 'tg-thematic',
    name: 'Тематические каналы',
    sourceId: 'tg',
    categoryId: 'mix',
    trafficKind: 'warm',
    archetype: 'repeat-saves',
    designNote: 'Мягкий разворот: −8% → +19%. Небольшой бюджет, легко докупить.',
    clicks: 20600,
    cpc: 48,
    targetRoiFirst: -0.08,
    repeatRate: 0.23,
    channelShares: { web: 0.5, app: 0.36, offline: 0.14 },
    unattributedShare: 0.21,
    spendTrend: 1.1,
    groups: [
      {
        name: 'Мода и стиль',
        items: [
          { name: 'канал: разборы гардероба', weight: 1.3 },
          { name: 'канал: streetwear', aov: 0.9 },
        ],
      },
      {
        name: 'Лайфстайл',
        items: [
          { name: 'канал: городской лайфстайл' },
          { name: 'канал: материнство', repeat: 1.3, aov: 0.8 },
        ],
      },
    ],
  },
  {
    id: 'infl-macro',
    name: 'Макро-инфлюенсеры',
    sourceId: 'infl',
    categoryId: 'jackets',
    trafficKind: 'influencer',
    archetype: 'mobile-heavy',
    designNote:
      'Эквивалент CPC 190 ₽, −26% на первом заказе → +18% на всех. 66% покупок в приложении, 26% не атрибуцировано. Без мобильных покупок кампания выглядит катастрофой.',
    clicks: 26400,
    cpc: 190,
    targetRoiFirst: -0.26,
    repeatRate: 0.36,
    channelShares: { web: 0.24, app: 0.61, offline: 0.15 },
    unattributedShare: 0.26,
    spendTrend: 1.3,
    groups: [
      {
        name: 'Инфлюенсеры 1М+',
        items: [
          { name: 'интеграция: блогер А', weight: 1.4, cpc: 1.25 },
          { name: 'интеграция: блогер Б', cpc: 1.1, cr: 0.85 },
        ],
      },
      {
        name: 'Инфлюенсеры 300К+',
        items: [
          { name: 'интеграция: блогер В', cpc: 0.8, repeat: 1.15 },
          { name: 'интеграция: блогер Г', cpc: 0.75, cr: 1.1 },
        ],
      },
    ],
  },
  {
    id: 'infl-promo',
    name: 'Промокоды у блогеров',
    sourceId: 'infl',
    categoryId: 'accessories',
    trafficKind: 'influencer',
    archetype: 'profitable',
    designNote:
      'Прибыльная и самая офлайновая: промокод гасят на кассе. 36% покупок офлайн — обычная сквозная аналитика их не видит вообще.',
    clicks: 24700,
    cpc: 26,
    targetRoiFirst: 0.34,
    repeatRate: 0.24,
    channelShares: { web: 0.36, app: 0.28, offline: 0.36 },
    unattributedShare: 0.14,
    spendTrend: 1.0,
    groups: [
      {
        name: 'Промокоды — мода',
        items: [
          { name: 'промокод: бьюти и мода', weight: 1.4 },
          { name: 'промокод: капсульный гардероб', aov: 1.3 },
        ],
      },
      {
        name: 'Промокоды — лайфстайл',
        items: [
          { name: 'промокод: семейные каналы', repeat: 1.2 },
          { name: 'промокод: локальные сообщества', aov: 0.85 },
        ],
      },
    ],
  },
]
