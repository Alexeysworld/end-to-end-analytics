import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Собирает из dist одностраничный prototype.html: CSS и JS вклеиваются внутрь.
 *
 * Нужен, чтобы прототип можно было открыть двойным кликом по файлу, без
 * npm run dev и без локального сервера — коллегам на ревью так проще,
 * а нам не приходится объяснять, почему у них старая версия.
 *
 * Запуск: npm run build:page
 */

const dist = 'dist'
const html = readFileSync(join(dist, 'index.html'), 'utf8')

const jsPath = html.match(/src="\/(assets\/[^"]+\.js)"/)?.[1]
const cssPath = html.match(/href="\/(assets\/[^"]+\.css)"/)?.[1]
if (!jsPath || !cssPath) {
  console.error('Не нашёл ссылки на ассеты в dist/index.html — сначала npm run build')
  process.exit(1)
}

// Внутри валидного JS последовательность </script может встретиться только
// в строке или регулярке, поэтому экранирование безопасно и обязательно:
// иначе браузер закроет тег script раньше времени.
const js = readFileSync(join(dist, jsPath), 'utf8').replaceAll('</script', String.raw`<\/script`)
const css = readFileSync(join(dist, cssPath), 'utf8')
const favicon = html.match(/<link\s+rel="icon"[^>]*>/)?.[0] ?? ''

const out = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1280" />
    ${favicon}
    <title>Сквозная аналитика — прототип · Mindbox</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
${js}
    </script>
  </body>
</html>
`

writeFileSync('prototype.html', out)
const mb = (Buffer.byteLength(out) / 1024 / 1024).toFixed(2)
console.log(`prototype.html собран, ${mb} МБ`)
