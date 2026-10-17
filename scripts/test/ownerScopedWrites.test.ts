/**
 * A bulk write on somebody's own photos is scoped by owner in the query.
 *
 * The guarantee is that `updateMany({ where: { id: { in: ids }, userId } })`
 * cannot touch a row belonging to another account even when the caller sends
 * an id that is not theirs. It is enforced by the shape of the where clause
 * rather than by a check beforehand, which is the right way round: a check can
 * be skipped for one of the ids, and a scoped write cannot.
 *
 * That makes it invisible to review. Dropping `userId` from the where leaves
 * code that works perfectly for every honest caller and hands every photo on
 * the site to a dishonest one, and no test that exercises the happy path would
 * notice. So this asserts the shape.
 *
 * The admin surface is exempt and listed below, because an administrator
 * acting on any row is the entire point of it, and that surface has its own
 * gate in lib/admin/auth.
 *
 *   npx tsx scripts/test/ownerScopedWrites.test.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Writes that may reach a row the caller does not own, and why. */
const ALLOWED: Array<{ file: string; why: string }> = [
  {
    file: 'src/lib/admin/repository.ts',
    why: 'The admin surface. Acting on any row is its purpose; requireAdmin is its gate.',
  },
  {
    file: 'src/app/api/admin/route.ts',
    why: 'The admin surface, same reasoning.',
  },
  {
    file: 'src/app/api/admin/screening/[id]/route.ts',
    why: 'The admin decision on a held photo. Single record by id, behind requireAdmin.',
  },
  {
    file: 'src/app/api/photos/[id]/route.ts',
    why: 'Single record, addressed by id. Ownership is checked against the loaded row before the write.',
  },
  {
    file: 'src/app/api/upload/cleanup/route.ts',
    why: 'Deletes unpublished drafts by age. Scoped by ownership where it acts on a caller-supplied id, and by published=false where it sweeps.',
  },
]

/** Bulk writes are the ones a single missing clause turns into a site-wide hole. */
const BULK = ['updateMany', 'deleteMany']

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++
    console.log(`  PASS  ${name}`)
  } else {
    fail++
    console.log(`  FAIL  ${name}${detail ? `  ${detail}` : ''}`)
  }
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

/**
 * The text of the call starting at `from`, to its closing parenthesis.
 *
 * Counted rather than matched with a regular expression: the argument holds
 * nested braces and parentheses, and a lazy match stops at the first one.
 */
function callText(source: string, from: number): string {
  const open = source.indexOf('(', from)
  if (open === -1) return ''
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++
    else if (source[i] === ')') {
      depth--
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  return source.slice(open)
}

console.log('bulk photo writes are scoped by owner')

const allowedFiles = new Set(ALLOWED.map(a => a.file))
const unscoped: string[] = []
let examined = 0

for (const file of sourceFiles('src')) {
  const relative = file.replace(/\\/g, '/')
  const source = readFileSync(file, 'utf8')

  for (const method of BULK) {
    const needle = `prisma.photo.${method}`
    let at = source.indexOf(needle)
    while (at !== -1) {
      examined++
      const call = callText(source, at + needle.length)
      if (!call.includes('userId') && !allowedFiles.has(relative)) {
        const line = source.slice(0, at).split('\n').length
        unscoped.push(`${relative}:${line} ${method} has no userId in its where`)
      }
      at = source.indexOf(needle, at + needle.length)
    }
  }
}

check('found bulk photo writes to examine', examined > 0, `examined=${examined}`)
check(
  'every bulk photo write outside the admin surface is scoped by userId',
  unscoped.length === 0,
  unscoped.join('; ')
)

// The exemptions have to keep naming real files, or the list silently starts
// permitting nothing while looking like it permits something.
for (const entry of ALLOWED) {
  let exists = true
  try {
    statSync(entry.file)
  } catch {
    exists = false
  }
  check(`exempt file still exists: ${entry.file}`, exists)
}

console.log(`\n  ${examined} bulk writes examined, ${ALLOWED.length} files exempt`)
console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
