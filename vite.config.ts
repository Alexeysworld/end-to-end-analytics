import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Метка сборки. Нужна, чтобы по скриншоту было видно, какой ревизии
 * соответствует то, что человек видит на экране: несовпадение версии
 * иначе диагностируется только по косвенным признакам вроде порядка цифр.
 */
const buildInfo = () => {
  try {
    const sha = execSync('git rev-parse --short HEAD').toString().trim()
    const date = execSync('git log -1 --format=%cd --date=format:%d.%m.%Y %H:%M')
      .toString()
      .trim()
    return `${sha} · ${date}`
  } catch {
    return 'без git'
  }
}

export default defineConfig({
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(buildInfo()) },
  server: { port: 5173, open: false },
})
