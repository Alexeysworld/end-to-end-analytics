/** Единый формат чисел на весь прототип: узкий пробел в разрядах, минус — U+2212. */
const nf = (min = 0, max = 0) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: min, maximumFractionDigits: max })

const fix = (s: string) => s.replace(/-/g, '−').replace(/ /g, ' ')

export const money = (v: number): string => fix(nf().format(Math.round(v)))

/**
 * Короткий формат денег для таблиц. Всё, что от тысячи и выше, показываем
 * в тыс/млн — иначе в одной колонке соседствуют «55 тыс» и «5 483»,
 * и колонка перестаёт сканироваться по разрядам.
 */
export const moneyShort = (v: number): string => {
  const a = Math.abs(v)
  if (a >= 1e9) return fix(nf(1, 1).format(v / 1e9)) + ' млрд'
  if (a >= 1e6) return fix(nf(1, 1).format(v / 1e6)) + ' млн'
  if (a >= 1e4) return fix(nf().format(Math.round(v / 1e3))) + ' тыс'
  if (a >= 1e3) return fix(nf(1, 1).format(v / 1e3)) + ' тыс'
  return fix(nf().format(Math.round(v)))
}

export const int = (v: number): string => fix(nf().format(Math.round(v)))

/**
 * Счётчик заказов. У мелких кампаний доля канала даёт меньше одного заказа:
 * печатать «0» рядом с подписью «9%» нельзя — читается как ошибка в данных.
 */
export const count = (v: number): string => (v > 0 && v < 0.5 ? '<1' : int(v))

export const pct = (v: number, digits = 1): string => fix(nf(digits, digits).format(v * 100)) + '%'

/** Проценты со знаком — для ROI и разниц. */
export const pctSigned = (v: number, digits = 1): string => (v > 0 ? '+' : '') + pct(v, digits)

export const pp = (v: number, digits = 1): string =>
  (v > 0 ? '+' : '') + fix(nf(digits, digits).format(v * 100)) + ' п.п.'

export const rub = (v: number): string => money(v) + ' ₽'
