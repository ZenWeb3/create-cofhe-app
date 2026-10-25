import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { explain, listConcepts } from '../dist/commands/explain.js'
import { runDoctor } from '../dist/commands/doctor.js'
import { scaffold } from '../dist/scaffold.js'

const root = await mkdtemp(path.join(tmpdir(), 'create-cofhe-app-cmd-'))
after(() => rm(root, { recursive: true, force: true }))

let output = []
const log = console.log

beforeEach(() => {
  output = []
  console.log = (...args) => output.push(args.join(' '))
})

after(() => {
  console.log = log
})

const CONCEPTS = ['handles', 'acps', 'encrypt', 'decrypt', 'allow', 'fhe', 'cofhe', 'euint', 'external', 'mocks']

test('explains every documented concept', () => {
  for (const concept of CONCEPTS) {
    output = []
    assert.equal(explain(concept), 0, `${concept} should be explained`)
    assert.ok(output.join('\n').length > 200, `${concept} needs a real explanation`)
  }
})

test('resolves permits to acps', () => {
  assert.equal(explain('permits'), 0)
  assert.match(output.join('\n'), /Access Control Permission/)
})

test('ignores case and surrounding whitespace', () => {
  assert.equal(explain('  HANDLES '), 0)
})

test('lists the concepts when one is unknown', () => {
  assert.equal(explain('quantum'), 1)
  const text = output.join('\n')
  assert.match(text, /Unknown concept: quantum/)
  for (const concept of CONCEPTS) assert.match(text, new RegExp(concept))
})

test('lists every concept with a summary', () => {
  listConcepts()
  const text = output.join('\n')
  for (const concept of CONCEPTS) assert.match(text, new RegExp(concept))
})

test('doctor reports the missing env file in a fresh project', async () => {
  const targetDir = path.join(root, 'fresh')
  await scaffold({
    projectName: 'fresh',
    targetDir,
    toolchain: 'hardhat',
    frontend: 'none',
    pattern: 'blank',
    packageManager: 'pnpm',
    git: false,
    install: false,
  })

  const code = await runDoctor(targetDir)
  const text = output.join('\n')

  assert.equal(code, 1)
  assert.match(text, /\.env not found/)
  assert.match(text, /evmVersion: 'cancun' set/)
})

test('doctor accepts a private key once it is set', async () => {
  const targetDir = path.join(root, 'keyed')
  await scaffold({
    projectName: 'keyed',
    targetDir,
    toolchain: 'foundry',
    frontend: 'none',
    pattern: 'blank',
    packageManager: 'pnpm',
    git: false,
    install: false,
  })
  await writeFile(path.join(targetDir, '.env'), 'PRIVATE_KEY=0xdeadbeef\n')

  await runDoctor(targetDir)
  const text = output.join('\n')

  assert.match(text, /PRIVATE_KEY set in \.env/)
  assert.match(text, /evm_version = 'cancun' set/)
  assert.doesNotMatch(text, /TypeScript/, 'a foundry project has no typescript to check')
})

test('doctor rejects the placeholder private key', async () => {
  const targetDir = path.join(root, 'placeholder')
  await scaffold({
    projectName: 'placeholder',
    targetDir,
    toolchain: 'hardhat',
    frontend: 'none',
    pattern: 'blank',
    packageManager: 'pnpm',
    git: false,
    install: false,
  })
  await writeFile(path.join(targetDir, '.env'), 'PRIVATE_KEY=your_private_key_here\n')

  assert.equal(await runDoctor(targetDir), 1)
  assert.match(output.join('\n'), /PRIVATE_KEY not set/)
})

test('doctor runs outside a project without crashing', async () => {
  const code = await runDoctor(root)
  assert.equal(typeof code, 'number')
  assert.match(output.join('\n'), /No package.json here/)
})
