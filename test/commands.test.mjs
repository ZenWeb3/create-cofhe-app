import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { explain, listConcepts } from '../dist/commands/explain.js'
import { runDoctor } from '../dist/commands/doctor.js'
import { resolvePattern, runAdd } from '../dist/commands/add.js'
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

const PATTERNS = ['blank', 'sealed-bid', 'private-vote', 'encrypted-token', 'encrypted-escrow']

async function blankProject(name, toolchain = 'hardhat') {
  const targetDir = path.join(root, name)
  await scaffold({
    projectName: name,
    targetDir,
    toolchain,
    frontend: 'none',
    pattern: 'blank',
    packageManager: 'pnpm',
    git: false,
    install: false,
  })
  return targetDir
}

const exists = (file) => stat(file).then(() => true, () => false)

test('add drops a pattern into an existing hardhat project', async () => {
  const cwd = await blankProject('add-hardhat')

  assert.equal(await runAdd('sealed-bid', { cwd }), 0)
  assert.ok(await exists(path.join(cwd, 'contracts/SealedBidAuction.sol')))
  assert.ok(await exists(path.join(cwd, 'test/SealedBidAuction.test.ts')))
  assert.ok(await exists(path.join(cwd, 'contracts/Blank.sol')), 'the original pattern stays')
})

test('add writes the foundry test for a foundry project', async () => {
  const cwd = await blankProject('add-foundry', 'foundry')

  assert.equal(await runAdd('encrypted-token', { cwd }), 0)
  assert.ok(await exists(path.join(cwd, 'contracts/EncryptedToken.sol')))
  assert.ok(await exists(path.join(cwd, 'test/EncryptedToken.t.sol')))
  assert.equal(await exists(path.join(cwd, 'test/EncryptedToken.test.ts')), false)
})

test('add covers both toolchains when both configs are present', async () => {
  const cwd = await blankProject('add-both')
  await writeFile(path.join(cwd, 'foundry.toml'), '[profile.default]\nevm_version = "cancun"\n')

  assert.equal(await runAdd('private-vote', { cwd }), 0)
  assert.ok(await exists(path.join(cwd, 'test/PrivateVoting.test.ts')))
  assert.ok(await exists(path.join(cwd, 'test/PrivateVoting.t.sol')))
})

test('add refuses to overwrite until forced', async () => {
  const cwd = await blankProject('add-twice')
  await runAdd('escrow', { cwd })

  const contract = path.join(cwd, 'contracts/EncryptedEscrow.sol')
  await writeFile(contract, '// edited by hand\n')

  assert.equal(await runAdd('escrow', { cwd }), 1)
  assert.match(output.join('\n'), /already in this project/)
  assert.equal(await readFile(contract, 'utf8'), '// edited by hand\n')

  assert.equal(await runAdd('escrow', { cwd, force: true }), 0)
  assert.match(await readFile(contract, 'utf8'), /contract EncryptedEscrow/)
})

test('add resolves pattern aliases', () => {
  assert.equal(resolvePattern('auction'), 'sealed-bid')
  assert.equal(resolvePattern('ERC20'), 'encrypted-token')
  assert.equal(resolvePattern('  Private Voting '), 'private-vote')
  assert.equal(resolvePattern('blank'), 'blank')
  assert.equal(resolvePattern('quantum'), undefined)
})

test('add lists the patterns when none is given', async () => {
  const cwd = await blankProject('add-list')

  assert.equal(await runAdd(undefined, { cwd }), 0)
  for (const pattern of PATTERNS) assert.match(output.join('\n'), new RegExp(pattern))
})

test('add rejects an unknown pattern', async () => {
  const cwd = await blankProject('add-unknown')

  assert.equal(await runAdd('quantum', { cwd }), 1)
  assert.match(output.join('\n'), /Unknown pattern: quantum/)
})

test('add refuses to run outside a project', async () => {
  assert.equal(await runAdd('sealed-bid', { cwd: root }), 1)
  assert.match(output.join('\n'), /No CoFHE project here/)
  assert.equal(await exists(path.join(root, 'contracts')), false)
})
