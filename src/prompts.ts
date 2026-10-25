import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'

export type Toolchain = 'hardhat' | 'foundry'
export type Frontend = 'nextjs' | 'vite' | 'none'
export type Pattern = 'blank' | 'sealed-bid' | 'private-vote' | 'encrypted-token' | 'encrypted-escrow'
export type PackageManager = 'pnpm' | 'npm' | 'yarn'

export interface ProjectOptions {
  projectName: string
  targetDir: string
  toolchain: Toolchain
  frontend: Frontend
  pattern: Pattern
  packageManager: PackageManager
  git: boolean
  install: boolean
}

export interface PromptDefaults {
  projectName?: string | undefined
  toolchain?: Toolchain | undefined
  frontend?: Frontend | undefined
  pattern?: Pattern | undefined
  packageManager?: PackageManager | undefined
  git?: boolean | undefined
  install?: boolean | undefined
  yes?: boolean | undefined
}

export const PATTERN_LABELS: Record<Pattern, string> = {
  blank: 'Blank — just the CoFHE setup',
  'sealed-bid': 'Sealed Bid Auction',
  'private-vote': 'Private Voting',
  'encrypted-token': 'Encrypted ERC-20 Token',
  'encrypted-escrow': 'Encrypted Escrow',
}

export const PATTERN_CONTRACTS: Record<Pattern, string> = {
  blank: 'Blank',
  'sealed-bid': 'SealedBidAuction',
  'private-vote': 'PrivateVoting',
  'encrypted-token': 'EncryptedToken',
  'encrypted-escrow': 'EncryptedEscrow',
}

const NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

export function validateProjectName(value: string | undefined): string | undefined {
  const name = (value ?? '').trim()
  if (!name) return 'Project name is required'
  if (name === '.') return 'Run in an empty directory with an explicit name instead'
  if (!NAME_RE.test(path.basename(name))) {
    return 'Use lowercase letters, digits, dashes, dots or underscores'
  }
  return undefined
}

function cancel(): never {
  p.cancel('Scaffolding cancelled.')
  process.exit(0)
}

function unwrap<T>(value: T | symbol): Exclude<T, symbol> {
  if (p.isCancel(value)) cancel()
  return value as Exclude<T, symbol>
}

export async function runPrompts(defaults: PromptDefaults = {}): Promise<ProjectOptions> {
  p.intro(pc.bgCyan(pc.black(' create-cofhe-app ')))

  const projectName = defaults.projectName
    ? defaults.projectName.trim()
    : unwrap(
        await p.text({
          message: 'Project name',
          placeholder: 'my-cofhe-app',
          defaultValue: 'my-cofhe-app',
          validate: validateProjectName,
        }),
      )

  const nameError = validateProjectName(projectName)
  if (nameError) {
    p.cancel(nameError)
    process.exit(1)
  }

  const resolve = <T>(preset: T | undefined, fallback: T, ask: () => Promise<T | symbol>): Promise<T> | T => {
    if (preset !== undefined) return preset
    if (defaults.yes) return fallback
    return ask().then(unwrap)
  }

  const toolchain = await resolve<Toolchain>(defaults.toolchain, 'hardhat', () =>
    p.select({
      message: 'What toolchain?',
      initialValue: 'hardhat' as Toolchain,
      options: [
        { value: 'hardhat' as Toolchain, label: 'Hardhat', hint: 'recommended' },
        { value: 'foundry' as Toolchain, label: 'Foundry' },
      ],
    }),
  )

  const frontend = await resolve<Frontend>(defaults.frontend, 'nextjs', () =>
    p.select({
      message: 'Add a frontend?',
      initialValue: 'nextjs' as Frontend,
      options: [
        { value: 'nextjs' as Frontend, label: 'Next.js' },
        { value: 'vite' as Frontend, label: 'Vite' },
        { value: 'none' as Frontend, label: 'None' },
      ],
    }),
  )

  const pattern = await resolve<Pattern>(defaults.pattern, 'blank', () =>
    p.select({
      message: 'Starting pattern',
      initialValue: 'blank' as Pattern,
      options: (Object.keys(PATTERN_LABELS) as Pattern[]).map((value) => ({
        value,
        label: PATTERN_LABELS[value],
      })),
    }),
  )

  const packageManager = await resolve<PackageManager>(defaults.packageManager, 'pnpm', () =>
    p.select({
      message: 'Package manager',
      initialValue: 'pnpm' as PackageManager,
      options: [
        { value: 'pnpm' as PackageManager, label: 'pnpm', hint: 'recommended' },
        { value: 'npm' as PackageManager, label: 'npm' },
        { value: 'yarn' as PackageManager, label: 'yarn' },
      ],
    }),
  )

  const git = await resolve<boolean>(defaults.git, true, () =>
    p.confirm({ message: 'Initialize git repo?', initialValue: true }),
  )

  const install = defaults.install ?? true

  return {
    projectName: path.basename(projectName),
    targetDir: path.resolve(process.cwd(), projectName),
    toolchain,
    frontend,
    pattern,
    packageManager,
    git,
    install,
  }
}

export { p as clack }
