/**
 * Товарные бренды — измерение для вкладки «Товарная аналитика».
 *
 * ВАЖНО про честность цифр: бренды не считаются независимо. Это разложение
 * уже посчитанных чисел запроса: доли брендов задают, кому достались заказы,
 * а множители — насколько бренд отличается от среднего по запросу. После
 * разложения суммы нормируются, поэтому сумма по брендам всегда точно равна
 * итогам кампании. Иначе вкладки не сходились бы между собой.
 */
export interface Brand {
  id: string
  name: string
  kind: 'премиум' | 'масс-маркет' | 'дискаунт' | 'СТМ'
  /** Категории, в которых бренд представлен. */
  categories: string[]
  /** Множитель среднего чека относительно среднего по запросу. */
  aov: number
  /** Множитель маржинальности. */
  margin: number
  /** Множитель доли выкупа. */
  buyout: number
  /** Множитель повторяемости. */
  repeat: number
  note: string
}

export const BRANDS: Brand[] = [
  {
    id: 'nordvik',
    name: 'Nordvik',
    kind: 'премиум',
    categories: ['jackets'],
    aov: 1.85,
    margin: 1.3,
    buyout: 1.08,
    repeat: 1.2,
    note: 'Премиальные пуховики. Дорого, маржинально, почти не возвращают.',
  },
  {
    id: 'kozha',
    name: 'Kozha & Co',
    kind: 'премиум',
    categories: ['jackets', 'accessories'],
    aov: 1.95,
    margin: 1.28,
    buyout: 1.1,
    repeat: 1.1,
    note: 'Кожаные куртки и ремни. Самый высокий чек в отчёте.',
  },
  {
    id: 'alpengrad',
    name: 'Alpengrad',
    kind: 'премиум',
    categories: ['jackets'],
    aov: 1.5,
    margin: 1.08,
    buyout: 1.02,
    repeat: 0.95,
    note: 'Технологичная горнолыжка. Высокий чек, но маржинальность средняя.',
  },
  {
    id: 'vetrograd',
    name: 'Ветроград',
    kind: 'масс-маркет',
    categories: ['jackets', 'pants'],
    aov: 0.85,
    margin: 0.86,
    buyout: 0.94,
    repeat: 0.95,
    note: 'Основной объём в куртках. Средний по всем показателям.',
  },
  {
    id: 'basico',
    name: 'Basico',
    kind: 'дискаунт',
    categories: ['jackets', 'pants'],
    aov: 0.45,
    margin: 0.5,
    buyout: 0.8,
    repeat: 0.55,
    note: 'Дискаунт. Много заказов, мало маржи, много возвратов и никто не возвращается.',
  },
  {
    id: 'fjord',
    name: 'Fjord Line (СТМ)',
    kind: 'СТМ',
    categories: ['jackets', 'pants', 'accessories'],
    aov: 1.0,
    margin: 1.7,
    buyout: 1.05,
    repeat: 1.25,
    note: 'Собственная торговая марка: маржинальность в 1.7 раза выше средней. Главный вывод вкладки — трафик надо гнать сюда.',
  },
  {
    id: 'denimlab',
    name: 'Denim Lab',
    kind: 'масс-маркет',
    categories: ['pants'],
    aov: 1.15,
    margin: 0.78,
    buyout: 0.76,
    repeat: 1.05,
    note: 'Джинсы. Худший выкуп в отчёте — размерная сетка.',
  },
  {
    id: 'classicline',
    name: 'Classic Line',
    kind: 'масс-маркет',
    categories: ['pants'],
    aov: 1.05,
    margin: 1.0,
    buyout: 1.18,
    repeat: 1.0,
    note: 'Классические брюки. Возвратов мало: покупают по знакомому размеру.',
  },
  {
    id: 'profspec',
    name: 'Профспец',
    kind: 'масс-маркет',
    categories: ['workwear'],
    aov: 1.0,
    margin: 1.0,
    buyout: 1.0,
    repeat: 1.0,
    note: 'Спецодежда для B2B-направления. Отдельный бренд, чтобы опт не смешивался с розницей.',
  },
  {
    id: 'sockstar',
    name: 'Sockstar',
    kind: 'масс-маркет',
    categories: ['accessories'],
    aov: 0.9,
    margin: 0.95,
    buyout: 1.0,
    repeat: 1.15,
    note: 'Носки и мелочь. Копеечный чек, зато возвращаются за новой партией.',
  },
]

export const BRAND_BY_ID: Record<string, Brand> = Object.fromEntries(BRANDS.map((b) => [b.id, b]))

/** Доли брендов по умолчанию внутри товарной категории. */
export const CATEGORY_BRAND_MIX: Record<string, Record<string, number>> = {
  jackets: { vetrograd: 0.3, basico: 0.22, nordvik: 0.16, alpengrad: 0.13, kozha: 0.11, fjord: 0.08 },
  pants: { denimlab: 0.38, classicline: 0.26, vetrograd: 0.16, basico: 0.12, fjord: 0.08 },
  accessories: { sockstar: 0.52, kozha: 0.22, fjord: 0.26 },
  mix: {
    vetrograd: 0.22,
    denimlab: 0.16,
    sockstar: 0.14,
    basico: 0.13,
    nordvik: 0.11,
    classicline: 0.1,
    fjord: 0.09,
    kozha: 0.05,
  },
  workwear: { profspec: 1 },
}
