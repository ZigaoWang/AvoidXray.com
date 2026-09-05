/**
 * Every mapped enum has a label covering every member.
 *
 * Prisma hands back the member name, not the value the column stores, so a page
 * rendering an enum directly prints the schema at the reader: COMPACT instead of
 * "Point & shoot", MM35 instead of "35mm". That shipped three times before this
 * test existed, each time as a separate discovery rather than an instance of a
 * pattern.
 *
 * Two failures are checked, because they look different. A missing entry is the
 * obvious one. The subtler one is a label that returns the member name itself,
 * which happens when a lookup falls through to its input and reads as working
 * until somebody sees an underscore on a page.
 *
 * The members come from the generated client, so adding one to the schema and
 * forgetting to label it fails here rather than on a page.
 *
 *   npx tsx scripts/test/enumLabels.test.ts
 */
import { $Enums } from '@prisma/client'
import { colorBalanceLabel, filmFormatLabel, filmProcessLabel } from '../../src/lib/filmFields'
import { bodyTypeLabel, frameFormatLabel } from '../../src/lib/cameraFields'

let pass = 0
let fail = 0

function check(name: string, condition: boolean, detail: string) {
  if (condition) {
    pass++
  } else {
    fail++
    console.error(`  FAIL ${name}: ${detail}`)
  }
}

/**
 * Each mapped enum, its members as the client reports them, and the function
 * that turns one into words.
 */
const COVERAGE: Array<{
  enumName: string
  members: Record<string, string>
  label: (value: never) => string | null
}> = [
  { enumName: 'FilmProcess', members: $Enums.FilmProcess, label: filmProcessLabel as never },
  { enumName: 'ColorBalance', members: $Enums.ColorBalance, label: colorBalanceLabel as never },
  { enumName: 'FilmFormat', members: $Enums.FilmFormat, label: filmFormatLabel as never },
  { enumName: 'CameraBodyType', members: $Enums.CameraBodyType, label: bodyTypeLabel as never },
  { enumName: 'FrameFormat', members: $Enums.FrameFormat, label: frameFormatLabel as never },
]

console.log('enum labels')

for (const { enumName, members, label } of COVERAGE) {
  const names = Object.keys(members)
  check(enumName, names.length > 0, 'the generated client reports no members')

  for (const member of names) {
    const rendered = label(member as never)

    check(
      `${enumName}.${member}`,
      typeof rendered === 'string' && rendered.length > 0,
      'has no label, so it would render as its member name'
    )

    // A label equal to the member name means the lookup fell through. Allowed
    // only where the member name genuinely is the word a reader wants: SLR and
    // TLR are initialisms and are spelled the same either way.
    const SPELLED_THE_SAME = new Set(['SLR', 'TLR'])
    if (rendered && !SPELLED_THE_SAME.has(member)) {
      check(
        `${enumName}.${member}`,
        rendered !== member,
        `label returns the member name "${member}", which leaks the schema into the UI`
      )
    }
  }
}

// Nothing renders an underscore at a reader.
for (const { enumName, members, label } of COVERAGE) {
  for (const member of Object.keys(members)) {
    const rendered = label(member as never)
    check(`${enumName}.${member}`, !rendered?.includes('_'), `label "${rendered}" still contains an underscore`)
  }
}

console.log(`  ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
