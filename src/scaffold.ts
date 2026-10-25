import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'fs-extra'
import { PATTERNS } from './patterns.js'
import type { Frontend, PackageManager, ProjectOptions } from './prompts.js'

export type ScaffoldStep = 'contracts' | 'config' | 'frontend'

const TEMPLATE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates')

const FRONTEND_LABELS: Record<Exclude<Frontend, 'none'>, string> = {
  nextjs: 'Next.js',
  vite: 'Vite',
}

const FRONTEND_ENV: Record<Exclude<Frontend, 'none'>, { prefix: string; file: string }> = {
  nextjs: { prefix: 'NEXT_PUBLIC_', file: '.env.local' },
  vite: { prefix: 'VITE_', file: '.env' },
}

function runScript(pm: PackageManager, dir: string, script: string): string {
  if (pm === 'npm') return `npm --prefix ${dir} run ${script}`
  if (pm === 'yarn') return `yarn --cwd ${dir} ${script}`
  return `pnpm --dir ${dir} ${script}`
}

export function buildVars(options: ProjectOptions): Record<string, string> {
  const meta = PATTERNS[options.pattern]
  const pm = options.packageManager
  const hasFrontend = options.frontend !== 'none'
  const frontend = hasFrontend ? (options.frontend as Exclude<Frontend, 'none'>) : undefined

  return {
    projectName: options.projectName,
    toolchain: options.toolchain,
    pattern: options.pattern,
    patternLabel: meta.label,
    patternDescription: meta.description,
    contractName: meta.contractName,
    constructorArgs: meta.constructorArgs,
    solConstructorArgs: meta.solConstructorArgs,
    contractAbi: JSON.stringify(meta.abi, null, 2),
    fheType: meta.fheType,
    encryptableFn: meta.encryptableFn,
    amountLabel: meta.amountLabel,
    actionLabel: meta.actionLabel,
    actionLabelLower: meta.actionLabel.toLowerCase(),
    writeFn: meta.writeFn,
    writeArgs: meta.writeArgs,
    readFn: meta.readFn,
    readArgs: meta.readArgs,
    extraField: meta.extraField ? 'true' : '',
    extraLabel: meta.extraField?.label ?? '',
    extraPlaceholder: meta.extraField?.placeholder ?? '',
    pm,
    pmRun: pm === 'npm' ? 'npm run' : pm,
    frontend: frontend ?? '',
    frontendLabel: frontend ? FRONTEND_LABELS[frontend] : '',
    frontendEnvPrefix: frontend ? FRONTEND_ENV[frontend].prefix : '',
    frontendEnvFile: frontend ? FRONTEND_ENV[frontend].file : '',
    frontendDevCommand: frontend ? runScript(pm, 'frontend', 'dev') : '',
    frontendBuildCommand: frontend ? runScript(pm, 'frontend', 'build') : '',
  }
}

export function renderTemplate(source: string, vars: Record<string, string>): string {
  const withBlocks = source.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, key: string, body: string) => (vars[key] ? body : ''),
  )

  const substituted = withBlocks.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match)

  return substituted.replace(/\n{3,}/g, '\n\n')
}

export async function assertTargetUsable(targetDir: string): Promise<void> {
  if (!(await fs.pathExists(targetDir))) return

  const stat = await fs.stat(targetDir)
  if (!stat.isDirectory()) throw new Error(`${targetDir} exists and is not a directory`)

  const entries = await fs.readdir(targetDir)
  if (entries.length > 0) throw new Error(`${targetDir} is not empty`)
}

async function copyTree(from: string, to: string, vars: Record<string, string>): Promise<string[]> {
  const written: string[] = []
  const entries = await fs.readdir(from, { withFileTypes: true })

  for (const entry of entries) {
    const source = path.join(from, entry.name)

    if (entry.isDirectory()) {
      written.push(...(await copyTree(source, path.join(to, entry.name), vars)))
      continue
    }

    if (!entry.name.endsWith('.tmpl')) continue

    const target = path.join(to, entry.name.slice(0, -'.tmpl'.length))
    const rendered = renderTemplate(await fs.readFile(source, 'utf8'), vars)

    await fs.outputFile(target, rendered)
    written.push(target)
  }

  return written
}

export async function scaffold(
  options: ProjectOptions,
  onStep?: (step: ScaffoldStep) => void,
): Promise<string[]> {
  await assertTargetUsable(options.targetDir)

  const preexisting = await fs.pathExists(options.targetDir)

  try {
    return await write(options, onStep)
  } catch (cause) {
    if (!preexisting) await fs.remove(options.targetDir)
    throw cause
  }
}

async function write(options: ProjectOptions, onStep?: (step: ScaffoldStep) => void): Promise<string[]> {
  const vars = buildVars(options)
  const { targetDir, toolchain, pattern, frontend } = options
  const written: string[] = []

  // Solidity sources are shared between toolchains; only the tests differ.
  written.push(
    ...(await copyTree(
      path.join(TEMPLATE_ROOT, 'hardhat', 'patterns', pattern, 'contracts'),
      path.join(targetDir, 'contracts'),
      vars,
    )),
  )
  written.push(
    ...(await copyTree(
      path.join(TEMPLATE_ROOT, toolchain, 'patterns', pattern, 'test'),
      path.join(targetDir, 'test'),
      vars,
    )),
  )
  onStep?.('contracts')

  written.push(...(await copyTree(path.join(TEMPLATE_ROOT, toolchain, 'base'), targetDir, vars)))
  onStep?.('config')

  if (frontend !== 'none') {
    written.push(
      ...(await copyTree(path.join(TEMPLATE_ROOT, 'frontend', frontend), path.join(targetDir, 'frontend'), vars)),
    )
    onStep?.('frontend')
  }

  return written
}
