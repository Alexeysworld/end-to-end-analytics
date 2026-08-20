import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * Заметки к блокам интерфейса. Нужны, чтобы собирать обратную связь внутри
 * команды прямо по ходу просмотра прототипа: любой блок можно прокомментировать,
 * а потом выгрузить всё в JSON. Хранится только в памяти страницы —
 * бэкенда у прототипа нет.
 */
export interface Note {
  id: string
  /** Идентификатор блока, к которому оставлен комментарий. */
  blockId: string
  /** Человекочитаемое название блока — чтобы JSON можно было читать глазами. */
  blockLabel: string
  /** Экран, на котором оставлен комментарий. */
  screen: string
  text: string
  author: string
  createdAt: string
  /** Состояние отчёта на момент комментария: горизонт, режим каналов и т.п. */
  context: Record<string, string>
}

interface NotesApi {
  notes: Note[]
  countFor: (blockId: string) => number
  add: (note: Omit<Note, 'id' | 'createdAt'>) => void
  remove: (id: string) => void
  exportJson: () => void
  /** Сообщение о результате выгрузки: показываем рядом с кнопкой. */
  exportStatus: string | null
  /** Контекст отчёта, который подмешивается в каждую новую заметку. */
  reportContext: Record<string, string>
  setReportContext: (ctx: Record<string, string>) => void
}

const NotesCtx = createContext<NotesApi | null>(null)

let seq = 0

export function NotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([])
  const ctxRef = useRef<Record<string, string>>({})
  const [reportContext, setReportContextState] = useState<Record<string, string>>({})

  const setReportContext = useCallback((ctx: Record<string, string>) => {
    ctxRef.current = ctx
    setReportContextState(ctx)
  }, [])

  const add = useCallback((note: Omit<Note, 'id' | 'createdAt'>) => {
    setNotes((prev) => [
      ...prev,
      {
        ...note,
        context: { ...ctxRef.current, ...note.context },
        id: `note-${++seq}`,
        createdAt: new Date().toISOString(),
      },
    ])
  }, [])

  const remove = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const [exportStatus, setExportStatus] = useState<string | null>(null)

  const exportJson = useCallback(() => {
    const payload = {
      prototype: 'Сквозная аналитика Mindbox — прототип',
      exportedAt: new Date().toISOString(),
      notesCount: notes.length,
      notes,
    }
    const json = JSON.stringify(payload, null, 2)
    const filename = `mindbox-prototype-notes-${new Date().toISOString().slice(0, 10)}.json`

    /** Локально в браузере: обычная ссылка со Blob. */
    const saveViaLink = () => {
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    }

    // Когда страница открыта как артефакт, скачивание идёт только через
    // window.claude.downloads — обычная ссылка там ничего не делает.
    const host = window.claude
    if (!host) {
      saveViaLink()
      return
    }
    setExportStatus('Готовим файл…')
    host
      .use('downloads')
      .then((downloads) => {
        if (!downloads) {
          setExportStatus('Скачивание здесь недоступно — скопируйте заметки из панели')
          return
        }
        return downloads.save({ filename, data: json }).then(() => {
          setExportStatus('Файл сохранён')
        })
      })
      .catch((e: { code?: string }) => {
        // «declined» — человек сам отказался, повторять и объяснять нечего.
        if (e?.code === 'declined') {
          setExportStatus(null)
          return
        }
        setExportStatus('Не удалось сохранить файл')
      })
  }, [notes])

  // Сообщение живёт несколько секунд, потом убирается само.
  useEffect(() => {
    if (!exportStatus) return
    const id = window.setTimeout(() => setExportStatus(null), 4000)
    return () => window.clearTimeout(id)
  }, [exportStatus])

  const countFor = useCallback(
    (blockId: string) => notes.filter((n) => n.blockId === blockId).length,
    [notes],
  )

  const api = useMemo<NotesApi>(
    () => ({
      notes,
      countFor,
      add,
      remove,
      exportJson,
      exportStatus,
      reportContext,
      setReportContext,
    }),
    [notes, countFor, add, remove, exportJson, exportStatus, reportContext, setReportContext],
  )

  return <NotesCtx.Provider value={api}>{children}</NotesCtx.Provider>
}

export function useNotes(): NotesApi {
  const ctx = useContext(NotesCtx)
  if (!ctx) throw new Error('useNotes вне NotesProvider')
  return ctx
}

/** Кнопка-скрепка с поповером: комментарий к конкретному блоку. */
export function NoteButton({
  blockId,
  blockLabel,
  screen,
  className = '',
}: {
  blockId: string
  blockLabel: string
  screen: string
  className?: string
}) {
  const { notes, add, remove, countFor } = useNotes()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const count = countFor(blockId)
  const mine = notes.filter((n) => n.blockId === blockId)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const submit = () => {
    const t = text.trim()
    if (!t) return
    add({ blockId, blockLabel, screen, text: t, author: 'Внутренний ревьюер', context: {} })
    setText('')
  }

  return (
    <span className={`relative inline-flex ${className}`} ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={count ? `Комментариев: ${count}` : 'Оставить комментарий к блоку'}
        className={`inline-flex h-[18px] min-w-[18px] items-center justify-center gap-0.5 rounded border px-1 text-2xs transition-colors ${
          count
            ? 'border-accent bg-accent-soft text-accent'
            : 'border-ink-200 bg-white text-ink-400 hover:border-ink-400 hover:text-ink-600'
        }`}
      >
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M1.5 2.5h9v5.5h-5L3 10.5V8H1.5z" strokeLinejoin="round" />
        </svg>
        {count > 0 && <span className="font-mono">{count}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-6 z-50 w-[320px] rounded-md border border-ink-200 bg-white p-2.5 shadow-lg">
          <div className="mb-1.5 text-2xs uppercase tracking-wide text-ink-400">
            Комментарий к блоку
          </div>
          <div className="mb-2 text-sm font-medium leading-tight text-ink-800">{blockLabel}</div>

          {mine.length > 0 && (
            <ul className="mb-2 max-h-[160px] space-y-1.5 overflow-auto">
              {mine.map((n) => (
                <li key={n.id} className="group rounded border border-ink-100 bg-ink-50 p-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm leading-snug text-ink-800">{n.text}</p>
                    <button
                      onClick={() => remove(n.id)}
                      className="text-2xs text-ink-300 opacity-0 transition-opacity hover:text-neg group-hover:opacity-100"
                      title="Удалить"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-1 text-2xs text-ink-400">
                    {Object.entries(n.context)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ')}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
            }}
            rows={3}
            autoFocus
            placeholder="Что непонятно или мешает принять решение?"
            className="w-full resize-none rounded border border-ink-200 p-1.5 text-sm outline-none focus:border-accent"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-2xs text-ink-400">⌘↵ — сохранить</span>
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="rounded bg-ink-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-30"
            >
              Сохранить
            </button>
          </div>
        </div>
      )}
    </span>
  )
}

/** Панель со всеми заметками и выгрузкой в JSON. */
export function NotesPanel({ onClose }: { onClose: () => void }) {
  const { notes, remove, exportJson, exportStatus } = useNotes()
  const byScreen = useMemo(() => {
    const m = new Map<string, Note[]>()
    for (const n of notes) m.set(n.screen, [...(m.get(n.screen) ?? []), n])
    return [...m.entries()]
  }, [notes])

  return (
    <div className="fixed inset-y-0 right-0 z-[60] flex w-[420px] flex-col border-l border-ink-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
        <div>
          <h2 className="text-base font-semibold">Заметки ревью</h2>
          <p className="text-xs text-ink-500">
            {exportStatus ?? `${notes.length} шт. · только в памяти страницы`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={exportJson}
            disabled={!notes.length}
            className="rounded border border-ink-300 px-2 py-1 text-xs font-medium hover:bg-ink-50 disabled:opacity-40"
          >
            Выгрузить JSON
          </button>
          <button onClick={onClose} className="px-1.5 py-1 text-sm text-ink-400 hover:text-ink-900">
            ✕
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-3">
        {!notes.length && (
          <p className="text-sm leading-relaxed text-ink-500">
            Пока пусто. Нажмите на иконку комментария рядом с любым блоком — заметка попадёт сюда
            вместе с состоянием отчёта: горизонт окупаемости, режим раскладки по каналам, открытая
            кампания.
          </p>
        )}
        {byScreen.map(([screen, list]) => (
          <section key={screen} className="mb-4">
            <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-400">
              {screen}
            </h3>
            <ul className="space-y-1.5">
              {list.map((n) => (
                <li key={n.id} className="group rounded border border-ink-100 bg-ink-50 p-2">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-ink-700">{n.blockLabel}</span>
                    <button
                      onClick={() => remove(n.id)}
                      className="text-2xs text-ink-300 opacity-0 transition-opacity hover:text-neg group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-sm leading-snug text-ink-900">{n.text}</p>
                  <div className="mt-1 font-mono text-2xs text-ink-400">
                    {Object.entries(n.context)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ')}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
