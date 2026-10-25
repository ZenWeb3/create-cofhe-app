import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, stat, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { scaffold, assertTargetUsable } from '../dist/scaffold.js'
import { PATTERNS } from '../dist/patterns.js'

const root = await mkdtemp(path.join(tmpdir(), 'create-cofhe-app-'))
after(() => rm(root, { recursive: true, force: true }))

const TOOLCHAINS = ['hardhat', 'foundry']
const FRONTENDS = ['nextjs', 'vite', 'none']
const PATTERN_NAMES = Object.keys(PATTERNS)

function optionsFor(name, toolchain, frontend, pattern) {
  return {
    projectName: name,
    targetDir: path.join(root, name),
    toolchain,
    frontend,
    pattern,
    packageManager: 'pnpm',
    git: false,
    install: false,
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    else files.push(full)
  }
  return files
}

for (const toolchain of TOOLCHAINS) {
  for (const pattern of PATTERN_NAMES) {
    test(`${toolchain} + ${pattern} scaffolds a complete project`, async () => {
      const name = `${toolchain}-${pattern}`
      const options = optionsFor(name, toolchain, 'none', pattern)
      const written = await scaffold(options)

      assert.ok(written.length > 0)

      const contract = PATTERNS[pattern].contractName
      const expected = [
        path.join('contracts', `${contract}.sol`),
        toolchain === 'hardhat' ? path.join('test', `${contract}.test.ts`) : path.join('test', `${contract}.t.sol`),
        toolchain === 'hardhat' ? 'hardhat.config.ts' : 'foundry.toml',
        'package.json',
        'README.md',
        '.gitignore',
        '.env.example',
      ]

      for (const file of expected) {
        await stat(path.join(options.targetDir, file))
      }

      const pkg = JSON.parse(await readFile(path.join(options.targetDir, 'package.json'), 'utf8'))
      assert.equal(pkg.name, name)
      assert.equal(pkg.scripts.dev, undefined, 'no frontend means no dev script')
    })
  }
}

for (const frontend of ['nextjs', 'vite']) {
  test(`${frontend} frontend is scaffolded and wired into the root scripts`, async () => {
    const name = `front-${frontend}`
    const options = optionsFor(name, 'hardhat', frontend, 'encrypted-token')
    await scaffold(options)

    const pkg = JSON.parse(await readFile(path.join(options.targetDir, 'package.json'), 'utf8'))
    assert.equal(pkg.scripts.dev, 'pnpm --dir frontend dev')

    const frontendPkg = JSON.parse(
      await readFile(path.join(options.targetDir, 'frontend', 'package.json'), 'utf8'),
    )
    assert.equal(frontendPkg.name, `${name}-frontend`)
    assert.ok(frontendPkg.dependencies['@cofhe/sdk'])

    const entry = frontend === 'nextjs' ? 'app/demo.tsx' : 'src/App.tsx'
    const source = await readFile(path.join(options.targetDir, 'frontend', entry), 'utf8')
    assert.match(source, /Encryptable\.uint64/)
    assert.match(source, /Recipient/)
  })
}

test('no rendered file keeps an unresolved placeholder', async () => {
  for (const toolchain of TOOLCHAINS) {
    for (const frontend of FRONTENDS) {
      for (const pattern of PATTERN_NAMES) {
        const name = `full-${toolchain}-${frontend}-${pattern}`
        const options = optionsFor(name, toolchain, frontend, pattern)
        await scaffold(options)

        for (const file of await walk(options.targetDir)) {
          const source = await readFile(file, 'utf8')
          assert.doesNotMatch(source, /\{\{[#/]?\w/, `${path.relative(root, file)} has an unresolved placeholder`)
        }
      }
    }
  }
})

test('every scaffolded json and toml file is parseable', async () => {
  const options = optionsFor('parse-check', 'hardhat', 'nextjs', 'private-vote')
  await scaffold(options)

  for (const file of await walk(options.targetDir)) {
    if (!file.endsWith('.json')) continue
    JSON.parse(await readFile(file, 'utf8'))
  }

  const foundry = optionsFor('parse-foundry', 'foundry', 'none', 'blank')
  await scaffold(foundry)
  const toml = await readFile(path.join(foundry.targetDir, 'foundry.toml'), 'utf8')
  assert.match(toml, /evm_version = "cancun"/)
})

test('every hardhat config pins the cancun evm version', async () => {
  const options = optionsFor('cancun-check', 'hardhat', 'none', 'blank')
  await scaffold(options)

  const config = await readFile(path.join(options.targetDir, 'hardhat.config.ts'), 'utf8')
  assert.match(config, /evmVersion: 'cancun'/)
  assert.match(config, /@cofhe\/hardhat-plugin/)
  assert.match(config, /'eth-sepolia'/)
  assert.match(config, /'arb-sepolia'/)
})

test('the hardhat config ignores a private key that is not a 32-byte hex string', async () => {
  const options = optionsFor('key-guard', 'hardhat', 'none', 'blank')
  await scaffold(options)

  const config = await readFile(path.join(options.targetDir, 'hardhat.config.ts'), 'utf8')
  assert.match(config, /\^\(0x\)\?\[0-9a-fA-F\]\{64\}\$/, 'a placeholder key must not break hardhat test')

  const example = await readFile(path.join(options.targetDir, '.env.example'), 'utf8')
  assert.match(example, /PRIVATE_KEY=your_private_key_here/)
  assert.doesNotMatch(example, /^PRIVATE_KEY=(0x)?[0-9a-fA-F]{64}$/m, 'the example must not ship a usable key')
})

test('every contract uses the batch input api and allows what it stores', async () => {
  for (const pattern of PATTERN_NAMES) {
    const options = optionsFor(`api-${pattern}`, 'hardhat', 'none', pattern)
    await scaffold(options)

    const contract = PATTERNS[pattern].contractName
    const source = await readFile(path.join(options.targetDir, 'contracts', `${contract}.sol`), 'utf8')

    assert.match(source, /pragma solidity \^0\.8\.28/)
    assert.match(source, /@fhenixprotocol\/cofhe-contracts\/FHE\.sol/)
    assert.match(source, /FHE\.asE(uint\d+|bool|address)s\(/, `${contract} must use the batch converter`)
    assert.match(source, /FHE\.allowThis\(/, `${contract} must allow itself`)
    assert.doesNotMatch(source, /InEuint/, `${contract} must not use the removed InEuint type`)
  }
})

test('the vite frontend ships production cross-origin isolation headers', async () => {
  const options = optionsFor('isolation', 'hardhat', 'vite', 'blank')
  await scaffold(options)

  const headers = await readFile(path.join(options.targetDir, 'frontend', 'public', '_headers'), 'utf8')
  assert.match(headers, /Cross-Origin-Opener-Policy: same-origin/)
  assert.match(headers, /Cross-Origin-Embedder-Policy: credentialless/)

  const vercel = JSON.parse(await readFile(path.join(options.targetDir, 'frontend', 'vercel.json'), 'utf8'))
  assert.equal(vercel.headers[0].headers.length, 2)

  const readme = await readFile(path.join(options.targetDir, 'README.md'), 'utf8')
  assert.match(readme, /## Hosting the frontend/)
})

test('a project without a frontend has no hosting section', async () => {
  const options = optionsFor('no-hosting', 'foundry', 'none', 'blank')
  await scaffold(options)

  const readme = await readFile(path.join(options.targetDir, 'README.md'), 'utf8')
  assert.doesNotMatch(readme, /Hosting the frontend/)
  assert.match(readme, /## Deploying to Arbitrum Sepolia/)
})

test('refuses a target directory that already has files', async () => {
  const dir = path.join(root, 'occupied')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'keep.txt'), 'hi')

  await assert.rejects(() => assertTargetUsable(dir), /not empty/)
})

test('removes a directory it created when scaffolding fails', async () => {
  const options = optionsFor('broken', 'hardhat', 'none', 'nope')
  await assert.rejects(() => scaffold(options))
  await assert.rejects(() => stat(options.targetDir))
})
