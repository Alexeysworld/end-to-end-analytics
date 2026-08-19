import { chromium } from 'playwright'

const out = process.argv[2] ?? '/tmp/shot.png'
const steps = process.argv[3] ?? ''

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message))
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE:', m.text()))
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })

for (const step of steps.split('|').filter(Boolean)) {
  const [kind, arg] = step.split('::')
  if (kind === 'click') await page.click(arg)
  if (kind === 'text') await page.getByText(arg, { exact: false }).first().click()
  if (kind === 'wait') await page.waitForTimeout(Number(arg))
}
await page.waitForTimeout(400)
await page.screenshot({ path: out, fullPage: true })
console.log('saved', out)
await browser.close()
