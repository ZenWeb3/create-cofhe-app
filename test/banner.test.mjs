import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { ART, bannerLines, printBanner } from '../dist/banner.js'
import { plain } from './ansi.mjs'

const rows = { blocks: ART.blocks(), plain: ART.plain() }
const width = (line) => [...line].length

test('every row of each art is the same width', () => {
  for (const [name, art] of Object.entries(rows)) {
    const widths = new Set(art.map(width))
    assert.equal(widths.size, 1, `${name} rows differ in width: ${[...widths].join('/')}`)
  }

  assert.equal(rows.blocks.length, 6)
  assert.equal(width(rows.blocks[0]), 41)
  assert.equal(rows.plain.length, 5)
  assert.equal(width(rows.plain[0]), 35)
})

test('the fallback art and banner are pure ascii', () => {
  const text = rows.plain.join('\n') + plain(bannerLines({ columns: 100, unicode: false }))
  const high = [...text].filter((char) => char.codePointAt(0) > 127)

  assert.deepEqual(high, [], 'the non-unicode banner must not reach past U+007F')
})

test('a wide terminal gets the art, the version and the cipher line', () => {
  const text = plain(bannerLines({ columns: 100, unicode: true }))

  assert.match(text, /██████/)
  assert.match(text, /v\d+\.\d+\.\d+/)
  assert.match(text, /42\s+──▶\s+euint64 0x43662edd…8500/)
  assert.match(text, /Fully Homomorphic Encryption dApps on Fhenix CoFHE/)
})

test('a terminal too narrow for the cipher line keeps the art', () => {
  const text = plain(bannerLines({ columns: 50, unicode: true }))

  assert.match(text, /██████/)
  assert.doesNotMatch(text, /euint64/)
  assert.match(text, /Fully Homomorphic Encryption/)
})

test('a terminal narrower than the art falls back to one line', () => {
  const text = plain(bannerLines({ columns: 30, unicode: true }))

  assert.doesNotMatch(text, /██████/)
  assert.match(text, /create-cofhe-app\s+v\d+\.\d+\.\d+/)
  assert.match(text, /Fully Homomorphic Encryption/)
})

test('the ascii banner swaps the arrow and ellipsis it cannot draw', () => {
  const text = plain(bannerLines({ columns: 100, unicode: false }))

  assert.match(text, /42\s+-->\s+euint64 0x43662edd\.\.\.8500/)
})

test('printBanner writes the banner to stdout', () => {
  const log = console.log
  const output = []
  console.log = (...args) => output.push(args.join(' '))

  try {
    printBanner()
  } finally {
    console.log = log
  }

  assert.equal(output.length, 1)
  assert.match(plain(output), /Fully Homomorphic Encryption/)
})
