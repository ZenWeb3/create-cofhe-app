import path from 'node:path'
import { execa } from 'execa'
import fs from 'fs-extra'
import pc from 'picocolors'

interface Check {
  ok: boolean
  label: string
  fix?: string
}

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  version?: string
}

const SDK = '@cofhe/sdk'
const CONTRACTS = '@fhenixprotocol/cofhe-contracts'
const FOUNDRY_PLUGIN = '@cofhe/foundry-plugin'
const MOCKS = '@cofhe/mock-contracts'

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return (await fs.readJson(file)) as T
  } catch {
    return undefined
  }
}

function declaredRange(pkg: PackageJson | undefined, name: string): string | undefined {
  return pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name]
}

async function installedVersion(cwd: string, name: string): Promise<string | undefined> {
  const manifest = await readJson<PackageJson>(path.join(cwd, 'node_modules', ...name.split('/'), 'package.json'))
  return manifest?.version
}

function majorOf(version: string): number {
  const match = /(\d+)/.exec(version)
  return match ? Number(match[1]) : 0
}

async function commandVersion(command: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execa(command, args)
    return stdout.trim()
  } catch {
    return undefined
  }
}

async function checkDependency(cwd: string, pkg: PackageJson, name: string): Promise<Check> {
  const installed = await installedVersion(cwd, name)
  if (installed) return { ok: true, label: `${name} ${installed}` }

  const range = declaredRange(pkg, name)
  if (range) {
    return {
      ok: false,
      label: `${name} ${range} declared but not installed`,
      fix: 'Run your package manager install',
    }
  }

  return { ok: false, label: `${name} missing`, fix: `Add ${name} to the project dependencies` }
}

/**
 * MockTaskManager implements ITaskManager from one exact release of the contracts package, so a
 * project that resolves past it stops compiling with an error that names neither package.
 */
async function checkContractsPin(cwd: string, pkg: PackageJson): Promise<Check | undefined> {
  const mock = await readJson<PackageJson>(path.join(cwd, 'node_modules', ...MOCKS.split('/'), 'package.json'))
  const required = mock?.dependencies?.[CONTRACTS]

  // Only an exact pin can be compared without resolving semver ranges.
  if (!mock || !required || !/^\d/.test(required)) return undefined

  const installed = await installedVersion(cwd, CONTRACTS)
  if (installed && installed !== required) {
    return {
      ok: false,
      label: `${CONTRACTS} ${installed} installed, but ${MOCKS} ${mock.version} needs exactly ${required}`,
      fix: `Pin "${CONTRACTS}": "${required}" in package.json, then reinstall`,
    }
  }

  const range = declaredRange(pkg, CONTRACTS)
  if (range && /^[\^~]/.test(range) && range.slice(1) === required) {
    return {
      ok: false,
      label: `${CONTRACTS} ${range} will resolve past the ${required} that ${MOCKS} needs exactly`,
      fix: `Pin "${CONTRACTS}": "${required}" in package.json`,
    }
  }

  return { ok: true, label: `${CONTRACTS} matches the ${required} that ${MOCKS} ${mock.version} needs` }
}

async function checkHardhatConfig(cwd: string): Promise<Check> {
  const source = await fs.readFile(path.join(cwd, 'hardhat.config.ts'), 'utf8')

  if (/evmVersion\s*:\s*['"]cancun['"]/.test(source)) {
    return { ok: true, label: "evmVersion: 'cancun' set in hardhat.config.ts" }
  }

  return {
    ok: false,
    label: "evmVersion not set to 'cancun' in hardhat.config.ts",
    fix: "Add evmVersion: 'cancun' to your solidity settings",
  }
}

async function checkFoundryConfig(cwd: string): Promise<Check> {
  const source = await fs.readFile(path.join(cwd, 'foundry.toml'), 'utf8')

  if (/evm[_-]version\s*=\s*['"]cancun['"]/.test(source)) {
    return { ok: true, label: "evm_version = 'cancun' set in foundry.toml" }
  }

  return {
    ok: false,
    label: "evm_version not set to 'cancun' in foundry.toml",
    fix: 'Add evm_version = "cancun" to [profile.default]',
  }
}

async function checkEnv(cwd: string): Promise<Check> {
  const envPath = path.join(cwd, '.env')
  if (!(await fs.pathExists(envPath))) {
    return {
      ok: false,
      label: '.env not found',
      fix: 'Copy .env.example to .env and add your key',
    }
  }

  const source = await fs.readFile(envPath, 'utf8')
  const value = /^PRIVATE_KEY\s*=\s*(.*)$/m.exec(source)?.[1]?.trim()

  if (!value || value === 'your_private_key_here') {
    return {
      ok: false,
      label: 'PRIVATE_KEY not set in .env',
      fix: 'Copy .env.example to .env and add your key',
    }
  }

  return { ok: true, label: 'PRIVATE_KEY set in .env' }
}

async function checkTypeScript(cwd: string, pkg: PackageJson): Promise<Check | undefined> {
  const relevant = (await fs.pathExists(path.join(cwd, 'tsconfig.json'))) || declaredRange(pkg, 'typescript')
  if (!relevant) return undefined

  const installed = (await installedVersion(cwd, 'typescript')) ?? (await commandVersion('tsc', ['--version']))
  const version = installed?.replace(/^Version\s+/, '')

  if (!version) {
    const range = declaredRange(pkg, 'typescript')
    return range
      ? { ok: false, label: `TypeScript ${range} declared but not installed`, fix: 'Run your package manager install' }
      : { ok: false, label: 'TypeScript not found', fix: 'Add typescript to your devDependencies' }
  }

  return majorOf(version) >= 5
    ? { ok: true, label: `TypeScript ${version}` }
    : { ok: false, label: `TypeScript ${version} is too old`, fix: 'Upgrade to TypeScript 5 or newer' }
}

export async function runDoctor(cwd = process.cwd()): Promise<number> {
  const checks: Check[] = []

  const nodeMajor = majorOf(process.versions.node)
  checks.push(
    nodeMajor >= 18
      ? { ok: true, label: `Node.js ${process.version}` }
      : { ok: false, label: `Node.js ${process.version} is too old`, fix: 'Upgrade to Node.js 18 or newer' },
  )

  const pnpmVersion = await commandVersion('pnpm', ['--version'])
  checks.push(
    pnpmVersion
      ? { ok: true, label: `pnpm ${pnpmVersion}` }
      : { ok: false, label: 'pnpm not installed', fix: 'Install it with: npm install -g pnpm' },
  )

  const pkg = await readJson<PackageJson>(path.join(cwd, 'package.json'))

  if (pkg) {
    const isHardhat = await fs.pathExists(path.join(cwd, 'hardhat.config.ts'))
    const isFoundry = await fs.pathExists(path.join(cwd, 'foundry.toml'))

    checks.push(await checkDependency(cwd, pkg, isFoundry && !isHardhat ? FOUNDRY_PLUGIN : SDK))
    checks.push(await checkDependency(cwd, pkg, CONTRACTS))
    const pinCheck = await checkContractsPin(cwd, pkg)
    if (pinCheck) checks.push(pinCheck)

    if (isHardhat) checks.push(await checkHardhatConfig(cwd))
    if (isFoundry) checks.push(await checkFoundryConfig(cwd))

    checks.push(await checkEnv(cwd))

    const typeScriptCheck = await checkTypeScript(cwd, pkg)
    if (typeScriptCheck) checks.push(typeScriptCheck)
  }

  const issues = checks.filter((check) => !check.ok)

  console.log(`\n  ${pc.bold('CoFHE Environment Check')}\n`)

  for (const check of checks) {
    const mark = check.ok ? pc.green('✓') : pc.red('✗')
    console.log(`  ${mark} ${check.ok ? check.label : pc.red(check.label)}`)
    if (!check.ok && check.fix) console.log(`    ${pc.dim('→')} ${pc.dim(check.fix)}`)
  }

  if (!pkg) {
    console.log(`\n  ${pc.dim('No package.json here — run this inside a CoFHE project for the full check.')}`)
  }

  if (issues.length === 0) {
    console.log(`\n  ${pc.green('No issues found.')}\n`)
    return 0
  }

  const noun = issues.length === 1 ? 'issue' : 'issues'
  const pronoun = issues.length === 1 ? 'it' : 'them'
  console.log(`\n  ${pc.yellow(`${issues.length} ${noun} found. Fix ${pronoun} before deploying.`)}\n`)
  return 1
}
