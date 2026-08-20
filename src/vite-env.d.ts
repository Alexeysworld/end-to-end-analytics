/// <reference types="vite/client" />

/** Метка сборки, подставляется в vite.config.ts. */
declare const __BUILD__: string

/**
 * Возможности времени выполнения, которые страница получает, когда открыта
 * как артефакт claude.ai. Локально в dev-сборке window.claude отсутствует,
 * поэтому все обращения к нему обязаны быть необязательными.
 */
interface ClaudeDownloads {
  save(request: {
    filename: string
    data: string | Blob | ArrayBuffer | ArrayBufferView
  }): Promise<{ status: 'saved' }>
}

interface Window {
  claude?: {
    use(name: 'downloads'): Promise<ClaudeDownloads | null>
  }
}
