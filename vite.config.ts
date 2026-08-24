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
    // Формат даты обязан быть в кавычках: без них шелл разрезает строку
    // по пробелу, git принимает «%H:%M» за имя объекта и падает,
    // а метка молча превращается в «без git».
    const out = execSync('git log -1 --format="%h · %cd" --date=format:"%d.%m.%Y %H:%M"')
    return out.toString().trim()
  } catch {
    return 'без git'
  }
}

export default defineConfig({
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(buildInfo()) },
  server: { port: 5173, open: false },
})
