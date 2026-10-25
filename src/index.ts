#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command, Option } from 'commander'
import pc from 'picocolors'
import { getVersion, printBanner } from './banner.js'
import { initGitRepo } from './git.js'
import { installDependencies, isAvailable } from './install.js'
import { clack as p, runPrompts, type Frontend, type PackageManager, type Pattern, type PromptDefaults, type Toolchain } from './prompts.js'
import { assertTargetUsable, scaffold, type ScaffoldStep } from './scaffold.js'

const STEP_LABELS: Record<ScaffoldStep, string> = {
  contracts: 'Contracts written',
  config: 'Config files written',
  frontend: 'Frontend written',
}

function fail(message: string): never {
  p.cancel(message)
  process.exit(1)
}

export async function createApp(defaults: PromptDefaults): Promise<void> {
  const options = await runPrompts(defaults)
  const relative = path.relative(process.cwd(), options.targetDir) || '.'

  try {
    await assertTargetUsable(options.targetDir)
  } catch (cause) {
    fail(cause instanceof Error ? cause.message : String(cause))
  }

  const spinner = p.spinner()
  const steps: string[] = []

  spinner.start(`Scaffolding ${options.projectName}`)
  try {
    await scaffold(options, (step) => steps.push(STEP_LABELS[step]))
  } catch (cause) {
    spinner.stop('Scaffolding failed')
    fail(cause instanceof Error ? cause.message : String(cause))
  }
  spinner.stop(`Scaffolded ${options.projectName}`)

  for (const step of steps) p.log.success(step)

  const pm = options.packageManager

  if (options.install) {
    if (!(await isAvailable(pm))) {
      p.log.warn(`${pm} is not installed — skipping dependency install`)
      options.install = false
    } else {
      spinner.start(`Installing dependencies with ${pm}`)
      try {
        await installDependencies(pm, options.targetDir)
        spinner.stop('Dependencies installed')
      } catch (cause) {
        spinner.stop('Dependency install failed')
        p.log.warn(cause instanceof Error ? cause.message.split('\n')[0] ?? 'Install failed' : 'Install failed')
        options.install = false
      }
    }
  }

  if (options.git) {
    const result = await initGitRepo(options.targetDir, 'chore: scaffold CoFHE project')
    if (result === 'committed') p.log.success('Git initialized')
    else if (result === 'initialized') p.log.warn('Git initialized, but no commit was made — set user.name and user.email')
    else p.log.warn('git is not installed — skipping repository init')
  }

  const pmRun = pm === 'npm' ? 'npm run' : pm
  const next = [`cd ${relative}`]
  if (!options.install) next.push(`${pm} install`)
  next.push(`${pmRun} test`)
  if (options.frontend !== 'none') next.push(`${pmRun} dev`)

  p.note(next.join('\n'), 'Get started')
  p.outro(`Docs ${pc.cyan('https://cofhesdk.fhenix.io')} · ${pc.dim('npx cofhe explain fhe')}`)
}

function parsed<T extends string>(name: string, allowed: readonly T[]) {
  return (value: string): T => {
    if (!(allowed as readonly string[]).includes(value)) {
      throw new Error(`Invalid ${name}: ${value} (expected ${allowed.join(', ')})`)
    }
    return value as T
  }
}

const TOOLCHAINS = ['hardhat', 'foundry'] as const
const FRONTENDS = ['nextjs', 'vite', 'none'] as const
const PATTERNS_LIST = ['blank', 'sealed-bid', 'private-vote', 'encrypted-token', 'encrypted-escrow'] as const
const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn'] as const

export function buildProgram(): Command {
  return new Command()
    .name('create-cofhe-app')
    .description('Scaffold a Fhenix CoFHE dApp')
    .version(getVersion())
    .argument('[project-name]', 'directory to create the project in')
    .addOption(
      new Option('-t, --toolchain <toolchain>', 'hardhat or foundry').argParser(
        parsed<Toolchain>('toolchain', TOOLCHAINS),
      ),
    )
    .addOption(
      new Option('-f, --frontend <frontend>', 'nextjs, vite or none').argParser(
        parsed<Frontend>('frontend', FRONTENDS),
      ),
    )
    .addOption(
      new Option('-p, --pattern <pattern>', `one of ${PATTERNS_LIST.join(', ')}`).argParser(
        parsed<Pattern>('pattern', PATTERNS_LIST),
      ),
    )
    .addOption(
      new Option('-m, --package-manager <manager>', 'pnpm, npm or yarn').argParser(
        parsed<PackageManager>('package manager', PACKAGE_MANAGERS),
      ),
    )
    .option('--no-git', 'skip git initialization')
    .option('--no-install', 'skip dependency installation')
    .option('-y, --yes', 'accept the defaults for every unanswered prompt')
}

/**
 * Commander gives a negated flag like --no-git a default of true, so the flag has to be read from
 * its value source to tell "not passed" (ask) from "passed" (use it).
 */
export function optionsToDefaults(
  projectName: string | undefined,
  opts: Record<string, unknown>,
  command?: Command,
): PromptDefaults {
  const passed = (name: string): boolean => command?.getOptionValueSource(name) === 'cli'

  return {
    projectName,
    toolchain: opts.toolchain as Toolchain | undefined,
    frontend: opts.frontend as Frontend | undefined,
    pattern: opts.pattern as Pattern | undefined,
    packageManager: opts.packageManager as PackageManager | undefined,
    git: passed('git') ? (opts.git as boolean) : undefined,
    install: passed('install') ? (opts.install as boolean) : true,
    yes: opts.yes as boolean | undefined,
  }
}

async function main(): Promise<void> {
  const program: Command = buildProgram().action(
    async (projectName: string | undefined, opts: Record<string, unknown>) => {
      printBanner()
      await createApp(optionsToDefaults(projectName, opts, program))
    },
  )

  await program.parseAsync(process.argv)
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main().catch((cause: unknown) => {
    console.error(pc.red(cause instanceof Error ? cause.message : String(cause)))
    process.exitCode = 1
  })
}
