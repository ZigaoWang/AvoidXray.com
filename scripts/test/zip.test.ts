/**
 * The archive a batch export hands over.
 *
 * Written by hand rather than installed, because every file in it is a JPEG and
 * so there is nothing to compress — which removes the only part of the format
 * worth a dependency. That is a reasonable trade only if the result actually
 * opens, so this builds one and hands it to the system's own unzip: a checksum
 * off by a byte or a directory offset counted wrong produces a file that looks
 * fine, has the right length, and cannot be opened by anything.
 *
 *   npx tsx scripts/test/zip.test.ts
 */
import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { crc32, makeZip, safeName } from '../../src/lib/zip'

let pass = 0
let fail = 0

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    pass++
    console.log(`  PASS ${name}`)
  } else {
    fail++
    console.error(`  FAIL ${name}${detail ? `: ${detail}` : ''}`)
  }
}

const text = (s: string) => new TextEncoder().encode(s)

async function main() {
  console.log('the checksum matches the one every other tool computes')
  {
    // Known CRC32 values, so a rewrite of the table cannot quietly change them.
    check('empty', crc32(new Uint8Array(0)) === 0)
    check('"123456789" is 0xCBF43926', crc32(text('123456789')) === 0xcbf43926,
      crc32(text('123456789')).toString(16))
    check('"The quick brown fox jumps over the lazy dog" is 0x414FA339',
      crc32(text('The quick brown fox jumps over the lazy dog')) === 0x414fa339)
  }

  console.log('\na name cannot escape the archive or the file system')
  {
    check('a slash cannot make a directory', !safeName('a/b.jpg').includes('/'))
    check('a backslash cannot either', !safeName('a\\b.jpg').includes('\\'))
    check('a leading dot is dropped', !safeName('...hidden.jpg').startsWith('.'))
    check('an empty name still names something', safeName('   ') === 'photo.jpg')
    check('an ordinary name is left alone', safeName('avoidxray-portra-400.jpg') === 'avoidxray-portra-400.jpg')
    // Not squeamishness: the format has carried a UTF-8 flag since 2007, this
    // writer sets it, and the unzip shipped with macOS ignores it — a member
    // called "café.jpg" comes out under a mangled name and reported truncated.
    check('the result is ASCII, whatever went in',
      /^[\x20-\x7e]+$/.test(safeName('café-naïve-日本.jpg')), safeName('café-naïve-日本.jpg'))
  }

  console.log('\nthe system can open what this writes')
  {
    // Bytes that exercise the parts a naive writer gets wrong: an empty member,
    // one large enough to cross a buffer, and one whose name is not ASCII.
    const files = [
      { name: 'first.jpg', bytes: text('hello') },
      { name: 'empty.jpg', bytes: new Uint8Array(0) },
      { name: 'large.bin', bytes: new Uint8Array(200_000).map((_, i) => i % 251) },
      { name: 'café-naïve.jpg', bytes: text('unicode name') },
    ]

    const blob = await makeZip(files, new Date(Date.UTC(2026, 8, 14, 12, 30, 30)))
    const buffer = Buffer.from(await blob.arrayBuffer())

    const dir = mkdtempSync(join(tmpdir(), 'avx-zip-'))
    const archive = join(dir, 'batch.zip')
    writeFileSync(archive, buffer)

    try {
      // -t is the format's own integrity check: every checksum, every size.
      const tested = execFileSync('unzip', ['-t', archive], { encoding: 'utf8' })
      check('unzip -t reports no errors', tested.includes('No errors detected'), tested.trim().split('\n').pop())

      execFileSync('unzip', ['-qq', '-o', archive, '-d', join(dir, 'out')])
      const out = join(dir, 'out')
      const names = readdirSync(out).sort()
      check('every member comes back out', names.length === files.length, names.join(', '))

      for (const file of files) {
        // Under the name the writer chose, not the one that went in: a member
        // is stored under safeName, and that is the guarantee being checked.
        const got = readFileSync(join(out, safeName(file.name)))
        const same = got.length === file.bytes.length && got.every((b, i) => b === file.bytes[i])
        check(`${file.name} round trips byte for byte`, same, `${got.length} vs ${file.bytes.length}`)
      }
    } catch (error) {
      check('unzip could read the archive', false, error instanceof Error ? error.message : String(error))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  console.log('\na member handed over as a blob is written the same way')
  {
    // The path a batch export actually takes: each file arrives from the
    // network as a blob and is passed straight through, so its bytes are never
    // all resident at once. Checked against the array path rather than
    // described, because a size or a checksum read off the wrong object
    // produces an archive that is the right length and cannot be opened.
    const bytes = new Uint8Array(5000).map((_, i) => (i * 7) % 253)
    const asArray = await makeZip([{ name: 'a.jpg', bytes }], new Date(Date.UTC(2026, 8, 14)))
    const asBlob = await makeZip([{ name: 'a.jpg', bytes: new Blob([bytes]) }], new Date(Date.UTC(2026, 8, 14)))
    const [one, two] = [Buffer.from(await asArray.arrayBuffer()), Buffer.from(await asBlob.arrayBuffer())]
    check('byte for byte the same archive', one.equals(two), `${one.length} vs ${two.length}`)
  }

  console.log('\nan archive of nothing is still an archive')
  {
    const blob = await makeZip([])
    const buffer = Buffer.from(await blob.arrayBuffer())
    check('it is just the end record', buffer.length === 22, String(buffer.length))
    check('and carries the end signature', buffer.readUInt32LE(0) === 0x06054b50)
  }

  console.log(`\n  ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

main()
