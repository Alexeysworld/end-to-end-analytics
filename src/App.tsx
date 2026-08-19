import { useEffect, useMemo, useState } from 'react'
import { CampaignCard } from './components/CampaignCard'
import { ChannelBreakdown } from './components/ChannelBreakdown'
import { CHANNEL_MODE_LABEL, RoiTable, plural, type ChannelMode } from './components/RoiTable'
import { dataset } from './data/generate'
import { derive } from './data/metrics'
import type { Horizon } from './data/types'
import { moneyShort, pct } from './lib/format'
import { NotesPanel, NotesProvider, useNotes } from './state/notes'
import { Segmented } from './components/ui'

type Tab = 'overview' | 'roi' | 'products' | 'channels'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Сводка' },
  { id: 'roi', label: 'Окупаемость' },
  { id: 'products', label: 'Товарная аналитика' },
  { id: 'channels', label: 'Каналы покупки' },
]

const HORIZON_LABEL: Record<Horizon, string> = {
  first: 'Первый заказ',
  all: 'Все покупки клиента',
}

export function App() {
  return (
    <NotesProvider>
      <Shell />
    </NotesProvider>
  )
}

function Shell() {
  const [tab, setTab] = useState<Tab>('roi')
  const [horizon, setHorizon] = useState<Horizon>('first')
  const [channelMode, setChannelMode] = useState<ChannelMode>('online-offline')
  const [openCampaign, setOpenCampaign] = useState<string | null>(null)
  const [onlyLosing, setOnlyLosing] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const { notes, setReportContext } = useNotes()

  // Состояние отчёта попадает в каждую заметку — иначе комментарий «тут непонятно»
  // невозможно потом привязать к тому, что человек видел.
  useEffect(() => {
    setReportContext({
      экран: TABS.find((t) => t.id === tab)!.label,
      горизонт: HORIZON_LABEL[horizon],
      'канал покупки': CHANNEL_MODE_LABEL[channelMode],
      ...(openCampaign
        ? { кампания: dataset.campaigns.find((c) => c.id === openCampaign)?.name ?? '' }
        : {}),
    })
  }, [tab, horizon, channelMode, openCampaign, setReportContext])

  const flip = useMemo(() => {
    const flipped = dataset.campaigns.filter(
      (c) => derive(c.raw, 'first').roi < 0 && derive(c.raw, 'all').roi >= 0,
    )
    return {
      count: flipped.length,
      spend: flipped.reduce((a, c) => a + c.raw.spend, 0),
      share: flipped.reduce((a, c) => a + c.raw.spend, 0) / dataset.totals.spend,
    }
  }, [])

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white">
        <div className="flex items-center justify-between px-4 pt-2">
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-semibold tracking-tight">Сквозная аналитика</span>
            <span className="text-xs text-ink-400">
              Магазин одежды «Северный склон» · {dataset.periodLabel}
            </span>
            <span className="rounded border border-warn/30 bg-warn-soft px-1 py-px text-2xs font-medium text-warn">
              прототип на синтетических данных
            </span>
          </div>
          <button
            onClick={() => setNotesOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded border border-ink-300 px-2 py-1 text-xs font-medium hover:bg-ink-50"
          >
            Заметки ревью
            <span className="rounded bg-ink-900 px-1 font-mono text-2xs text-white">
              {notes.length}
            </span>
          </button>
        </div>

        <div className="flex items-end justify-between px-4">
          <nav className="flex gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`border-b-2 px-2.5 py-2 text-sm transition-colors ${
                  tab === t.id
                    ? 'border-ink-900 font-medium text-ink-900'
                    : 'border-transparent text-ink-500 hover:text-ink-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="pl-6">
            <HorizonSwitch horizon={horizon} onChange={setHorizon} flip={flip} />
          </div>
        </div>
      </header>

      <main className="flex-1 p-4">
        {tab === 'roi' && (
          <RoiTable
            horizon={horizon}
            channelMode={channelMode}
            onChannelMode={setChannelMode}
            onOpenCampaign={setOpenCampaign}
            onlyLosing={onlyLosing}
            onOnlyLosing={setOnlyLosing}
          />
        )}
        {tab === 'channels' && (
          <ChannelBreakdown horizon={horizon} onOpenCampaign={setOpenCampaign} />
        )}
        {tab !== 'roi' && tab !== 'channels' && (
          <div className="rounded-md border border-dashed border-ink-300 bg-white p-8 text-center text-sm text-ink-400">
            Экран «{TABS.find((t) => t.id === tab)!.label}» — в работе.
          </div>
        )}
      </main>

      {notesOpen && <NotesPanel onClose={() => setNotesOpen(false)} />}
      {openCampaign && (
        <CampaignCard
          campaign={dataset.campaigns.find((c) => c.id === openCampaign)!}
          horizon={horizon}
          onClose={() => setOpenCampaign(null)}
        />
      )}
    </div>
  )
}

/**
 * Переключатель горизонта окупаемости — единственное место, где прототип
 * позволяет себе выразительность. Это не смена цифры, а смена решения,
 * поэтому рядом всегда стоит цена вопроса: сколько бюджета переезжает.
 */
function HorizonSwitch({
  horizon,
  onChange,
  flip,
}: {
  horizon: Horizon
  onChange: (h: Horizon) => void
  flip: { count: number; spend: number; share: number }
}) {
  return (
    <div className="flex items-center gap-2.5 pb-1.5">
      <div className="text-right">
        <div className="text-2xs uppercase tracking-wide text-ink-400">Горизонт окупаемости</div>
        <div
          className={`text-2xs leading-tight transition-colors ${
            horizon === 'first' ? 'text-warn' : 'text-accent'
          }`}
        >
          {horizon === 'first' ? (
            <>
              {flip.count} {plural(flip.count, 'кампания', 'кампании', 'кампаний')} выглядят убыточными · {moneyShort(flip.spend)} ₽ под сокращение
            </>
          ) : (
            <>
              {flip.count} {plural(flip.count, 'кампания', 'кампании', 'кампаний')} окупаются позже · {pct(flip.share, 0)} бюджета спасено
            </>
          )}
        </div>
      </div>
      <Segmented
        size="lg"
        value={horizon}
        onChange={onChange}
        options={[
          { value: 'first', label: 'Первый заказ', hint: 'Только первая покупка клиента' },
          { value: 'all', label: 'Все покупки клиента', hint: 'Первая и все последующие покупки' },
        ]}
      />
    </div>
  )
}
