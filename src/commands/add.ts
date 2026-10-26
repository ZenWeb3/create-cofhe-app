import path from 'node:path'
import fs from 'fs-extra'
import pc from 'picocolors'
import { PATTERNS } from '../patterns.js'
import type { PackageManager, Pattern, Toolchain } from '../prompts.js'
import { detectPackageManager, detectToolchains, readProjectName } from '../project.js'
import { buildVars, patternContractsDir, patternTestDir, planTemplateDir, renderFiles } from '../scaffold.js'
import type { TemplateFile } from '../scaffold.js'

export interface AddOptions {
  cwd?: string
  force?: boolean
}

export const PATTERN_NAMES = Object.keys(PATTERNS) as Pattern[]

const ALIASES: Record<string, Pattern> = {
  auction: 'sealed-bid',
  sealedbid: 'sealed-bid',
  'sealed-bid-auction': 'sealed-bid',
  vote: 'private-vote',
  voting: 'private-vote',
  'private-voting': 'private-vote',
  token: 'encrypted-token',
  erc20: 'encrypted-token',
  'encrypted-erc20': 'encrypted-token',
  escrow: 'encrypted-escrow',
  crowdfund: 'encrypted-crowdfund',
  fundraiser: 'encrypted-crowdfund',
  campaign: 'encrypted-crowdfund',
}

export function resolvePattern(input: string): Pattern | undefined {
  const key = input.trim().toLowerCase().replace(/[\s_]+/g, '-')
  if ((PATTERN_NAMES as string[]).includes(key)) return key as Pattern
  return ALIASES[key]
}

export function listPatterns(): void {
  console.log(`\n  ${pc.bold('Available patterns')}\n`)

  const width = Math.max(...PATTERN_NAMES.map((name) => name.length))
  for (const name of PATTERN_NAMES) {
    console.log(`  ${pc.cyan(name.padEnd(width))}  ${pc.dim(PATTERNS[name].label)}`)
  }

  console.log(`\n  ${pc.dim('Usage: npx cofhe add <pattern>')}\n`)
}

export async function runAdd(rawPattern: string | undefined, options: AddOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd()

  if (!rawPattern) {
    listPatterns()
    return 0
  }

  const pattern = resolvePattern(rawPattern)
  if (!pattern) {
    console.log(`\n  ${pc.red(`Unknown pattern: ${rawPattern}`)}`)
    listPatterns()
    return 1
  }

  const toolchains = await detectToolchains(cwd)
  if (toolchains.length === 0) {
    console.log(`\n  ${pc.red('No CoFHE project here.')}`)
    console.log(`  ${pc.dim('Expected a hardhat.config.ts or a foundry.toml in this directory.')}`)
    console.log(`  ${pc.dim('Run `npx create-cofhe-app` to start a new project.')}\n`)
    return 1
  }

  const meta = PATTERNS[pattern]
  const vars = buildVars({
    projectName: await readProjectName(cwd),
    targetDir: cwd,
    toolchain: toolchains[0] as Toolchain,
    frontend: 'none',
    pattern,
    packageManager: await detectPackageManager(cwd),
    git: false,
    install: false,
  })

  const planned: TemplateFile[] = await planTemplateDir(patternContractsDir(pattern), path.join(cwd, 'contracts'))
  for (const toolchain of toolchains) {
    planned.push(...(await planTemplateDir(patternTestDir(toolchain, pattern), path.join(cwd, 'test'))))
  }

  const clashes: string[] = []
  for (const file of planned) {
    if (await fs.pathExists(file.target)) clashes.push(path.relative(cwd, file.target))
  }

  if (clashes.length > 0 && !options.force) {
    console.log(`\n  ${pc.red(`${meta.contractName} is already in this project.`)}\n`)
    for (const clash of clashes) console.log(`  ${pc.red('✗')} ${clash}`)
    console.log(`\n  ${pc.dim('Pass --force to overwrite these files.')}\n`)
    return 1
  }

  const written = await renderFiles(planned, vars)

  console.log(`\n  ${pc.bold(pc.cyan(meta.label))} ${pc.dim(`(${pattern})`)}\n`)
  for (const file of written) console.log(`  ${pc.green('+')} ${path.relative(cwd, file)}`)

  const pm = vars.pm as PackageManager
  const run = pm === 'npm' ? 'npm run' : pm
  console.log(`\n  ${pc.dim('Next:')}`)
  console.log(`    ${run} compile`)
  console.log(`    ${run} test`)

  console.log(`\n  ${pc.dim(`The deploy script still targets the contract you scaffolded with.`)}`)
  console.log(`  ${pc.dim(`Point it at ${meta.contractName} when you want to deploy this one.`)}`)

  if (await fs.pathExists(path.join(cwd, 'frontend'))) {
    console.log(`  ${pc.dim('The frontend is untouched — update its ABI and address to drive this contract.')}`)
  }

  console.log('')
  return 0
}
