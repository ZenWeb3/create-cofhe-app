import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { redactKey, runDeploy } from '../dist/commands/deploy.js'
import { runAdd } from '../dist/commands/add.js'
import { detectFrontend, frontendContractName, upsertEnvVar } from '../dist/project.js'
import { scaffold } from '../dist/scaffold.js'
import { plain } from './ansi.mjs'

const root = await mkdtemp(path.join(tmpdir(), 'create-cofhe-app-deploy-'))
after(() => rm(root, { recursive: true, force: true }))

const KEY = `0x${'a'.repeat(64)}`

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

async function project(name, { toolchain = 'hardhat', pattern = 'encrypted-token', frontend = 'none', key } = {}) {
  const targetDir = path.join(root, name)
  await scaffold({
    projectName: name,
    targetDir,
    toolchain,
    frontend,
    pattern,
    packageManager: 'pnpm',
    git: false,
    install: false,
  })
  if (key) await writeFile(path.join(targetDir, '.env'), `PRIVATE_KEY=${key}\n`)
  return targetDir
}

test('deploy builds the hardhat command and defaults to the only contract', async () => {
  const cwd = await project('dry-hardhat', { key: KEY })

  assert.equal(await runDeploy(undefined, { cwd, dryRun: true }), 0)
  assert.match(text(), /Would deploy EncryptedToken/)
  assert.match(text(), /hardhat run node_modules\/\.cache\/cofhe\/deploy\.cjs --network arb-sepolia/)
  assert.match(text(), /constructor\(Encrypted Token, eTKN\)/)
})

test('deploy builds the forge command without exposing the key', async () => {
  const cwd = await project('dry-foundry', { toolchain: 'foundry', key: KEY })

  assert.equal(await runDeploy('EncryptedToken', { cwd, dryRun: true, network: 'arb-sepolia' }), 0)
  assert.match(text(), /forge create contracts\/EncryptedToken\.sol:EncryptedToken/)
  assert.match(text(), /--private-key \$PRIVATE_KEY/)
  assert.doesNotMatch(text(), new RegExp(KEY.slice(2)))
})

test('deploy accepts a contract name case-insensitively and with the .sol suffix', async () => {
  const cwd = await project('naming', { key: KEY })

  assert.equal(await runDeploy('encryptedtoken', { cwd, dryRun: true }), 0)
  assert.equal(await runDeploy('EncryptedToken.sol', { cwd, dryRun: true }), 0)
})

test('deploy overrides the pattern constructor arguments', async () => {
  const cwd = await project('args', { pattern: 'private-vote', key: KEY })

  assert.equal(await runDeploy('PrivateVoting', { cwd, dryRun: true, args: ['9'] }), 0)
  assert.match(text(), /constructor\(9\)/)
})

test('deploy asks which contract when several are present', async () => {
  const cwd = await project('ambiguous', { key: KEY })
  await runAdd('sealed-bid', { cwd })
  output = []

  assert.equal(await runDeploy(undefined, { cwd, dryRun: true }), 1)
  assert.match(text(), /name the one to deploy/)
  assert.match(text(), /SealedBidAuction/)
})

test('deploy rejects an unknown contract', async () => {
  const cwd = await project('unknown-contract', { key: KEY })

  assert.equal(await runDeploy('Ghost', { cwd, dryRun: true }), 1)
  assert.match(text(), /Unknown contract: Ghost/)
})

test('deploy reports an empty contracts directory', async () => {
  const cwd = await project('empty', { key: KEY })
  await rm(path.join(cwd, 'contracts'), { recursive: true, force: true })

  assert.equal(await runDeploy(undefined, { cwd }), 1)
  assert.match(text(), /No contracts to deploy/)
})

test('deploy refuses a remote network without a usable key', async () => {
  const cwd = await project('nokey')

  assert.equal(await runDeploy('EncryptedToken', { cwd }), 1)
  assert.match(text(), /No usable PRIVATE_KEY/)

  await writeFile(path.join(cwd, '.env'), 'PRIVATE_KEY=your_private_key_here\n')
  output = []
  assert.equal(await runDeploy('EncryptedToken', { cwd }), 1)
  assert.match(text(), /No usable PRIVATE_KEY/)
})

test('deploy refuses to run outside a project', async () => {
  assert.equal(await runDeploy(undefined, { cwd: root }), 1)
  assert.match(text(), /No CoFHE project here/)
})

test('the frontend env var is upserted, not appended twice', async () => {
  const file = path.join(root, 'env-test', '.env.local')

  await upsertEnvVar(file, 'NEXT_PUBLIC_CONTRACT_ADDRESS', '0xaaa')
  await upsertEnvVar(file, 'OTHER', 'keep-me')
  await upsertEnvVar(file, 'NEXT_PUBLIC_CONTRACT_ADDRESS', '0xbbb')

  const contents = await readFile(file, 'utf8')
  assert.equal(contents, 'NEXT_PUBLIC_CONTRACT_ADDRESS=0xbbb\nOTHER=keep-me\n')
})

test('an env file without a trailing newline keeps its last line', async () => {
  const file = path.join(root, 'env-tail', '.env')
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, 'KEEP=1')

  await upsertEnvVar(file, 'VITE_CONTRACT_ADDRESS', '0xccc')
  assert.equal(await readFile(file, 'utf8'), 'KEEP=1\nVITE_CONTRACT_ADDRESS=0xccc\n')
})

test('the frontend is detected along with the contract it is wired to', async () => {
  const nextjs = await project('fe-next', { frontend: 'nextjs' })
  const found = await detectFrontend(nextjs)
  assert.equal(found?.kind, 'nextjs')
  assert.equal(found?.envVar, 'NEXT_PUBLIC_CONTRACT_ADDRESS')
  assert.equal(path.basename(found.envFile), '.env.local')
  assert.equal(await frontendContractName(found), 'EncryptedToken')

  const vite = await project('fe-vite', { frontend: 'vite', pattern: 'sealed-bid' })
  const viteFound = await detectFrontend(vite)
  assert.equal(viteFound?.kind, 'vite')
  assert.equal(viteFound?.envVar, 'VITE_CONTRACT_ADDRESS')
  assert.equal(await frontendContractName(viteFound), 'SealedBidAuction')

  assert.equal(await detectFrontend(await project('fe-none')), undefined)
})

test('redactKey removes the key in both prefixed and bare form', () => {
  const bare = KEY.slice(2)
  assert.equal(redactKey(`--private-key ${KEY} --broadcast`, KEY), '--private-key $PRIVATE_KEY --broadcast')
  assert.equal(redactKey(`key is ${bare}`, KEY), 'key is $PRIVATE_KEY')
  assert.equal(redactKey('nothing to hide', undefined), 'nothing to hide')
})
