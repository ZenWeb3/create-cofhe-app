import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describeHandle, parseHandle, runHandle } from '../dist/commands/handle.js'
import { decodeAddress, decodeBool, decodeUint, encodeAddress, encodeUint, resolveRpcUrl } from '../dist/rpc.js'
import { plain } from './ansi.mjs'

const root = await mkdtemp(path.join(tmpdir(), 'create-cofhe-app-handle-'))
after(() => rm(root, { recursive: true, force: true }))

// Handles produced by @cofhe/sdk on a mock network, kept verbatim as fixtures.
const UINT32 = '0xa8d185e6a2312fb648b12afff315af5c3548e10f832aaff2dc44822f906b0400'
const UINT64 = '0x347b5076d2c57184b4af0985152de97e98e04c01d78bd3d001199bd04b540500'
const UINT128 = '0xef1340b2268dfbbb07609860375e2f72a991168af84a431710ae31c63f510600'
const BOOL = '0xf5ad46ed6152d67d9227801475cfa709c59c5f72a6782debe984f8d6df4c0000'

const TASK_MANAGER = '0x0000000000000000000000000000000000005000'
const ALLOWED = '0x9A676e781A523b5d0C0e43731313A708CB607508'
const DENIED = '0x0B306BF915C4d645ff596e518fAf3F9669b97016'

let output = []
const log = console.log

beforeEach(() => {
  output = []
  console.log = (...args) => output.push(args.join(' '))
})

after(() => {
  console.log = log
})

const text = () => plain(output)
const word = (value) => value.toString(16).padStart(64, '0')

let server
let url
let answers

before(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const { params } = JSON.parse(body)
      const data = params[0].data
      const selector = data.slice(0, 10)
      const result = answers(selector, data)
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result }))
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${server.address().port}`
})

after(() => server?.close())

function chain({ published = false, global: isGlobal = false, allow = [] } = {}) {
  const allowed = new Set(allow.map((address) => address.toLowerCase().replace(/^0x/, '')))

  answers = (selector, data) => {
    if (selector === '0x25adb56b') return `0x${encodeAddress(TASK_MANAGER)}`
    if (selector === '0x8eef9ae7') return `0x${word(isGlobal ? 1n : 0n)}`
    if (selector === '0x458693c9') return `0x${word(published ? 7n : 0n)}${word(published ? 1n : 0n)}`
    if (selector === '0x5faa299a') {
      const account = data.slice(10 + 64).slice(24)
      return `0x${word(allowed.has(account) ? 1n : 0n)}`
    }
    throw new Error(`unexpected selector ${selector}`)
  }
}

test('parseHandle accepts hex and decimal, and rejects the rest', () => {
  assert.equal(parseHandle(UINT32), BigInt(UINT32))
  assert.equal(parseHandle('  42 '), 42n)
  assert.equal(parseHandle('0xnope'), undefined)
  assert.equal(parseHandle(''), undefined)
  assert.equal(parseHandle(`0x${'f'.repeat(65)}`), undefined)
})

test('describeHandle reads the type out of real handles', () => {
  assert.equal(describeHandle(BigInt(UINT32)).type, 'euint32')
  assert.equal(describeHandle(BigInt(UINT64)).type, 'euint64')
  assert.equal(describeHandle(BigInt(UINT128)).type, 'euint128')
  assert.equal(describeHandle(BigInt(BOOL)).type, 'ebool')
  assert.equal(describeHandle(BigInt(UINT32)).securityZone, 0)
  assert.equal(describeHandle(BigInt(UINT32)).trivial, false)
  assert.equal(describeHandle(BigInt('0x0000000000000000000000000000000000000000000000000000000000008401')).trivial, true)
  assert.equal(describeHandle(BigInt('0x0000000000000000000000000000000000000000000000000000000000008401')).type, 'euint32')
  assert.equal(describeHandle(BigInt('0x0000000000000000000000000000000000000000000000000000000000000701')).type, 'eaddress')
  assert.match(describeHandle(BigInt('0x0000000000000000000000000000000000000000000000000000000000001f00')).type, /unknown type 31/)
})

test('the rpc url comes from the network name, the env file or the argument', async () => {
  assert.equal(await resolveRpcUrl(root, 'arb-sepolia'), 'https://sepolia-rollup.arbitrum.io/rpc')
  assert.equal(await resolveRpcUrl(root, 'localhost'), 'http://127.0.0.1:8545')
  assert.equal(await resolveRpcUrl(root, 'http://example.test:1234'), 'http://example.test:1234')
  await assert.rejects(() => resolveRpcUrl(root, 'mainnet'), /Unknown network: mainnet/)

  await writeFile(path.join(root, '.env'), 'ARBITRUM_SEPOLIA_RPC_URL=https://my-node.test\n')
  assert.equal(await resolveRpcUrl(root, 'arb-sepolia'), 'https://my-node.test')
  await rm(path.join(root, '.env'))
})

test('abi encoding and decoding round-trips', () => {
  assert.equal(encodeUint(1n), `${'0'.repeat(63)}1`)
  assert.equal(encodeAddress(ALLOWED), `${'0'.repeat(24)}${ALLOWED.slice(2).toLowerCase()}`)
  assert.equal(decodeAddress(`0x${encodeAddress(ALLOWED)}`), ALLOWED.toLowerCase())
  assert.equal(decodeBool(`0x${word(1n)}`), true)
  assert.equal(decodeBool(`0x${word(0n)}`), false)
  assert.equal(decodeUint(`0x${word(5n)}${word(9n)}`, 1), 9n)
  assert.equal(decodeUint('0x'), 0n)
})

test('handle reports a handle nothing can decrypt', async () => {
  chain({ allow: [] })

  assert.equal(await runHandle(UINT32, { cwd: root, network: url, for: [ALLOWED] }), 0)
  assert.match(text(), /type\s+euint32/)
  assert.match(text(), /not published on-chain/)
  assert.match(text(), /not globally allowed/)
  assert.match(text(), /✗ 0x9A676e/)
  assert.match(text(), /Nothing listed above can decrypt this handle/)
})

test('handle reports access, a published result and a global allowance', async () => {
  chain({ published: true, global: true, allow: [ALLOWED] })

  assert.equal(await runHandle(UINT32, { cwd: root, network: url, for: [ALLOWED, DENIED] }), 0)
  assert.match(text(), /published on-chain as 7/)
  assert.match(text(), /globally allowed/)
  assert.match(text(), /✓ 0x9A676e/)
  assert.match(text(), /✗ 0x0B306B/)
  assert.doesNotMatch(text(), /Nothing listed above/)
})

test('handle checks the contracts recorded for that network', async () => {
  const cwd = await mkdtemp(path.join(root, 'deployed-'))
  await writeFile(
    path.join(cwd, 'deployments.json'),
    JSON.stringify({ [url]: { Blank: { address: ALLOWED } }, 'arb-sepolia': { Other: { address: DENIED } } }),
  )
  chain({ allow: [ALLOWED] })

  assert.equal(await runHandle(UINT32, { cwd, network: url }), 0)
  assert.match(text(), /✓ 0x9A676e781A523b5d0C0e43731313A708CB607508\s+Blank/)
  assert.doesNotMatch(text(), /Other/, 'contracts from another network are not checked')
})

test('handle needs an argument and a plausible one', async () => {
  assert.equal(await runHandle(undefined, { cwd: root }), 1)
  assert.match(text(), /Give a ciphertext handle/)

  output = []
  assert.equal(await runHandle('banana', { cwd: root }), 1)
  assert.match(text(), /Not a ciphertext handle: banana/)
})

test('handle explains an unknown network and an unreachable one', async () => {
  assert.equal(await runHandle(UINT32, { cwd: root, network: 'mainnet' }), 1)
  assert.match(text(), /Unknown network: mainnet/)

  output = []
  assert.equal(await runHandle(UINT32, { cwd: root, network: 'http://127.0.0.1:1' }), 1)
  assert.match(text(), /Could not reach CoFHE on this chain/)
  assert.match(text(), /mocks must be deployed/)
})

test('handle reports a chain with no CoFHE deployment', async () => {
  answers = () => `0x${'0'.repeat(64)}`

  assert.equal(await runHandle(UINT32, { cwd: root, network: url }), 1)
  assert.match(text(), /no TaskManager for this chain/)
})
