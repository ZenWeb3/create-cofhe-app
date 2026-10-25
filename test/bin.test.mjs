import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, symlink, stat, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const root = await mkdtemp(path.join(tmpdir(), 'create-cofhe-app-bin-'))
after(() => rm(root, { recursive: true, force: true }))

test('the scaffolder runs through a symlink, the way node_modules/.bin invokes it', async () => {
  const link = path.join(root, 'create-cofhe-app')
  await symlink(path.join(dist, 'index.js'), link)

  const { stdout } = await run(process.execPath, [
    link,
    'linked',
    '-t',
    'hardhat',
    '-f',
    'none',
    '-p',
    'blank',
    '-m',
    'pnpm',
    '--no-git',
    '--no-install',
    '-y',
  ], { cwd: root })

  assert.match(stdout, /Contracts written/)

  const pkg = JSON.parse(await readFile(path.join(root, 'linked', 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'linked')
  await stat(path.join(root, 'linked', 'contracts', 'Blank.sol'))
})

test('the cofhe binary runs through a symlink too', async () => {
  const link = path.join(root, 'cofhe')
  await symlink(path.join(dist, 'cli.js'), link)

  const { stdout } = await run(process.execPath, [link, 'explain', 'handles'], { cwd: root })
  assert.match(stdout, /ciphertext handle/)
})

test('importing the scaffolder as a module does not start it', async () => {
  const { stdout, stderr } = await run(process.execPath, [
    '--input-type=module',
    '-e',
    `await import(${JSON.stringify(path.join(dist, 'create.js'))}); console.log('imported')`,
  ], { cwd: root })

  assert.match(stdout, /imported/)
  assert.doesNotMatch(stdout + stderr, /create-cofhe-app/)
})

test('--help and --version work from both binaries', async () => {
  for (const bin of ['index.js', 'cli.js']) {
    const help = await run(process.execPath, [path.join(dist, bin), '--help'])
    assert.ok(help.stdout.length > 50)

    const version = await run(process.execPath, [path.join(dist, bin), '--version'])
    assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/)
  }
})

test('an invalid option value is rejected with a clear message', async () => {
  await assert.rejects(
    () => run(process.execPath, [path.join(dist, 'index.js'), 'x', '-t', 'truffle', '-y'], { cwd: root }),
    (error) => {
      assert.match(String(error.stderr ?? '') + String(error.stdout ?? ''), /Invalid toolchain: truffle/)
      return true
    },
  )
})
