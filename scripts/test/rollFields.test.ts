/**
 * Roll dates as owners type them: a month or a day, never in the future.
 *
 *   npx tsx scripts/test/rollFields.test.ts
 */
import { formatRollDate, parseRollDate } from '../../src/lib/library/rollFields'

let pass = 0
let fail = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

const parsed = (value: string) => {
  const p = parseRollDate(value)
  return p ? [p.date.toISOString().slice(0, 10), p.precision] : null
}

check('a month is stored as its 1st', parsed('2026-03'), ['2026-03-01', 'MONTH'])
check('a day is stored as given', parsed('2026-03-14'), ['2026-03-14', 'DAY'])
check('a day that does not exist is refused', parsed('2026-02-30'), null)
check('month 13 is refused', parsed('2026-13'), null)
check('a date in the future is refused', parsed(`${new Date().getUTCFullYear() + 2}-01`), null)
check('a date before photography is refused', parsed('1700-01'), null)
check('other formats are refused', [parsed('03/2026'), parsed('2026-3'), parsed('')], [null, null, null])

check('a month is shown as a month', formatRollDate(new Date('2026-03-01'), 'MONTH'), '2026-03')
check('a day is shown as a day', formatRollDate(new Date('2026-03-14'), 'DAY'), '2026-03-14')
check('no date is no date', formatRollDate(null, null), null)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
