import { createRequire } from 'node:module'
import path from 'node:path'
import { execa } from 'execa'
import fs from 'fs-extra'
import type { PackageManager, Toolchain } from './prompts.js'

export type FrontendKind = 'nextjs' | 'vite'

export interface FrontendInfo {
  kind: FrontendKind
  dir: string
  envFile: string
  envVar: string
  contractModule: string
}

const FRONTENDS: Record<FrontendKind, { config: string; envFile: string; envVar: string; contractModule: string }> = {
  nextjs: {
    config: 'next.config.ts',
    envFile: '.env.local',
    envVar: 'NEXT_PUBLIC_CONTRACT_ADDRESS',
    contractModule: path.join('lib', 'contract.ts'),
  },
  vite: {
    config: 'vite.config.ts',
    envFile: '.env',
    envVar: 'VITE_CONTRACT_ADDRESS',
    contractModule: path.join('src', 'contract.ts'),
  },
}

export async function detectToolchains(cwd: string): Promise<Toolchain[]> {
  const found: Toolchain[] = []
  if (await fs.pathExists(path.join(cwd, 'hardhat.config.ts'))) found.push('hardhat')
  if (await fs.pathExists(path.join(cwd, 'foundry.toml'))) found.push('foundry')
  return found
}

export async function detectPackageManager(cwd: string): Promise<PackageManager> {
  if (await fs.pathExists(path.join(cwd, 'yarn.lock'))) return 'yarn'
  if (await fs.pathExists(path.join(cwd, 'package-lock.json'))) return 'npm'
  return 'pnpm'
}

export async function readProjectName(cwd: string): Promise<string> {
  const manifest = (await fs.readJson(path.join(cwd, 'package.json')).catch(() => undefined)) as
    | { name?: string }
    | undefined
  return manifest?.name ?? path.basename(cwd)
}

export async function detectFrontend(cwd: string): Promise<FrontendInfo | undefined> {
  const dir = path.join(cwd, 'frontend')
  if (!(await fs.pathExists(dir))) return undefined

  for (const [kind, meta] of Object.entries(FRONTENDS) as [FrontendKind, (typeof FRONTENDS)[FrontendKind]][]) {
    if (!(await fs.pathExists(path.join(dir, meta.config)))) continue
    return {
      kind,
      dir,
      envFile: path.join(dir, meta.envFile),
      envVar: meta.envVar,
      contractModule: path.join(dir, meta.contractModule),
    }
  }

  return undefined
}

/** The contract name the frontend is wired to, so a mismatch can be reported. */
export async function frontendContractName(frontend: FrontendInfo): Promise<string | undefined> {
  const source = await fs.readFile(frontend.contractModule, 'utf8').catch(() => undefined)
  return source ? /contractName\s*=\s*'([^']+)'/.exec(source)?.[1] : undefined
}

export async function upsertEnvVar(file: string, key: string, value: string): Promise<void> {
  const existing = (await fs.readFile(file, 'utf8').catch(() => '')) as string
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')

  if (pattern.test(existing)) {
    await fs.outputFile(file, existing.replace(pattern, line))
    return
  }

  const prefix = existing && !existing.endsWith('\n') ? `${existing}\n` : existing
  await fs.outputFile(file, `${prefix}${line}\n`)
}

/** How to invoke a package's own binary with the project's package manager. */
export function binRunner(pm: PackageManager): string[] {
  if (pm === 'npm') return ['npx', '--no-install']
  return [pm]
}

/**
 * Deriving an address from a key needs secp256k1, which the CLI does not depend on — so borrow it
 * from whatever the project itself already installed.
 */
export async function deployerAddress(cwd: string, key: string): Promise<string | undefined> {
  try {
    const projectRequire = createRequire(path.join(cwd, 'package.json'))
    const { Wallet } = projectRequire('ethers') as { Wallet: new (key: string) => { address: string } }
    return new Wallet(key).address
  } catch {
    // Foundry projects have no ethers, but they do have cast.
  }

  try {
    const { stdout } = await execa('cast', ['wallet', 'address', '--private-key', key])
    return stdout.trim()
  } catch {
    return undefined
  }
}
