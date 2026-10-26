import path from 'node:path'
import { execa } from 'execa'
import fs from 'fs-extra'
import pc from 'picocolors'
import { PATTERNS } from '../patterns.js'
import {
  binRunner,
  detectFrontend,
  detectPackageManager,
  detectToolchains,
  frontendContractName,
  upsertEnvVar,
} from '../project.js'
import type { PackageManager } from '../prompts.js'

export interface DeployOptions {
  cwd?: string | undefined
  network?: string | undefined
  args?: string[] | undefined
  frontend?: boolean | undefined
  dryRun?: boolean | undefined
}

export const DEFAULT_NETWORK = 'arb-sepolia'
const DEPLOYER = '{deployer}'
const PLACEHOLDER_KEY = 'your_private_key_here'
const KEY_RE = /^(0x)?[0-9a-fA-F]{64}$/

const HARDHAT_SCRIPT = [
  "const hre = require('hardhat')",
  '',
  'async function main() {',
  '  const [deployer] = await hre.ethers.getSigners()',
  "  if (!deployer) throw new Error('No signer available - set PRIVATE_KEY in .env')",
  '',
  '  const name = process.env.COFHE_DEPLOY_CONTRACT',
  "  const args = JSON.parse(process.env.COFHE_DEPLOY_ARGS || '[]').map((value) =>",
  "    value === '{deployer}' ? deployer.address : value,",
  '  )',
  '',
  '  const factory = await hre.ethers.getContractFactory(name)',
  '  const contract = await factory.deploy(...args)',
  '  await contract.waitForDeployment()',
  '',
  "  console.log('COFHE_DEPLOYED ' + (await contract.getAddress()))",
  '}',
  '',
  'main().catch((error) => {',
  '  console.error(error)',
  '  process.exit(1)',
  '})',
  '',
].join('\n')

/** forge takes the key as an argument, so it reaches execa's error messages. */
export function redactKey(text: string, key: string | undefined): string {
  if (!key) return text
  return text.split(key).join('$PRIVATE_KEY').split(key.replace(/^0x/, '')).join('$PRIVATE_KEY')
}

interface Deployment {
  address: string
  command: string
}

async function listContracts(cwd: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(cwd, 'contracts')).catch(() => [] as string[])
  return entries
    .filter((entry) => entry.endsWith('.sol'))
    .map((entry) => entry.slice(0, -'.sol'.length))
    .sort()
}

function resolveContract(requested: string | undefined, available: string[]): string | undefined {
  if (!requested) return available.length === 1 ? available[0] : undefined
  const wanted = requested.replace(/\.sol$/i, '').toLowerCase()
  return available.find((name) => name.toLowerCase() === wanted)
}

function defaultArgs(contract: string): string[] {
  const meta = Object.values(PATTERNS).find((pattern) => pattern.contractName === contract)
  return meta ? [...meta.deployArgs] : []
}

function isLocal(network: string): boolean {
  return /^(localhost|hardhat|anvil)$/.test(network) || /127\.0\.0\.1|localhost/.test(network)
}

async function readPrivateKey(cwd: string): Promise<string | undefined> {
  const source = await fs.readFile(path.join(cwd, '.env'), 'utf8').catch(() => '')
  const value = /^PRIVATE_KEY\s*=\s*(.*)$/m.exec(source)?.[1]?.trim().replace(/^["']|["']$/g, '')
  if (!value || value === PLACEHOLDER_KEY || !KEY_RE.test(value)) return undefined
  return value.startsWith('0x') ? value : `0x${value}`
}

async function deployWithHardhat(
  cwd: string,
  contract: string,
  args: string[],
  network: string,
  pm: PackageManager,
  dryRun: boolean,
): Promise<Deployment> {
  const scriptDir = path.join(cwd, 'node_modules', '.cache', 'cofhe')
  const script = path.join(scriptDir, 'deploy.cjs')
  const [bin, ...prefix] = binRunner(pm)
  const argv = [...prefix, 'hardhat', 'run', path.relative(cwd, script), '--network', network]
  const command = `${bin} ${argv.join(' ')}`

  if (dryRun) return { address: '', command }

  await fs.outputFile(script, HARDHAT_SCRIPT)

  try {
    const { stdout } = await execa(bin as string, argv, {
      cwd,
      env: { COFHE_DEPLOY_CONTRACT: contract, COFHE_DEPLOY_ARGS: JSON.stringify(args) },
    })

    const address = /COFHE_DEPLOYED (0x[0-9a-fA-F]{40})/.exec(stdout)?.[1]
    if (!address) throw new Error(`Deployment printed no address:\n${stdout}`)

    return { address, command }
  } finally {
    await fs.remove(scriptDir)
  }
}

async function resolveDeployer(key: string): Promise<string> {
  const { stdout } = await execa('cast', ['wallet', 'address', '--private-key', key])
  return stdout.trim()
}

async function deployWithFoundry(
  cwd: string,
  contract: string,
  args: string[],
  network: string,
  key: string | undefined,
  dryRun: boolean,
): Promise<Deployment> {
  const keyArg = key ?? '$PRIVATE_KEY'
  const argv = [
    'create',
    `contracts/${contract}.sol:${contract}`,
    '--rpc-url',
    network,
    '--private-key',
    keyArg,
    '--broadcast',
  ]

  const resolved = args.includes(DEPLOYER) && key && !dryRun ? await resolveDeployer(key) : DEPLOYER
  if (args.length > 0) argv.push('--constructor-args', ...args.map((arg) => (arg === DEPLOYER ? resolved : arg)))

  const command = `forge ${redactKey(argv.join(' '), key)}`
  if (dryRun) return { address: '', command }

  try {
    const { stdout } = await execa('forge', argv, { cwd })
    const address = /Deployed to:\s*(0x[0-9a-fA-F]{40})/.exec(stdout)?.[1]
    if (!address) throw new Error(`Deployment printed no address:\n${stdout}`)

    return { address, command }
  } catch (cause) {
    throw new Error(redactKey(cause instanceof Error ? cause.message : String(cause), key))
  }
}

async function recordDeployment(cwd: string, network: string, contract: string, address: string): Promise<string> {
  const file = path.join(cwd, 'deployments.json')
  const existing = (await fs.readJson(file).catch(() => ({}))) as Record<string, Record<string, unknown>>

  existing[network] = {
    ...existing[network],
    [contract]: { address, deployedAt: new Date().toISOString() },
  }

  await fs.outputFile(file, `${JSON.stringify(existing, null, 2)}\n`)
  return file
}

function field(label: string, value: string): void {
  console.log(`    ${pc.dim(label.padEnd(9))} ${value}`)
}

export async function runDeploy(contractArg: string | undefined, options: DeployOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd()
  const network = options.network ?? DEFAULT_NETWORK
  const dryRun = options.dryRun ?? false

  const toolchains = await detectToolchains(cwd)
  if (toolchains.length === 0) {
    console.log(`\n  ${pc.red('No CoFHE project here.')}`)
    console.log(`  ${pc.dim('Expected a hardhat.config.ts or a foundry.toml in this directory.')}\n`)
    return 1
  }

  const available = await listContracts(cwd)
  if (available.length === 0) {
    console.log(`\n  ${pc.red('No contracts to deploy.')}`)
    console.log(`  ${pc.dim('contracts/ holds no .sol files. Add one with `cofhe add <pattern>`.')}\n`)
    return 1
  }

  const contract = resolveContract(contractArg, available)
  if (!contract) {
    const problem = contractArg ? `Unknown contract: ${contractArg}` : 'Several contracts here — name the one to deploy'
    console.log(`\n  ${pc.red(problem)}\n`)
    for (const name of available) console.log(`  ${pc.cyan(name)}`)
    console.log(`\n  ${pc.dim('Usage: npx cofhe deploy <contract>')}\n`)
    return 1
  }

  const toolchain = toolchains.includes('hardhat') ? 'hardhat' : 'foundry'
  const args = options.args?.length ? options.args : defaultArgs(contract)
  const key = await readPrivateKey(cwd)

  if (!dryRun && !key && !(toolchain === 'hardhat' && isLocal(network))) {
    console.log(`\n  ${pc.red('No usable PRIVATE_KEY in .env.')}`)
    console.log(`  ${pc.dim('Copy .env.example to .env and set a 32-byte hex key.')}\n`)
    return 1
  }

  console.log(`\n  ${pc.bold(dryRun ? `Would deploy ${contract}` : `Deploying ${contract}`)} ${pc.dim(`→ ${network}`)}`)
  if (args.length > 0) console.log(`  ${pc.dim(`constructor(${args.join(', ')})`)}`)
  console.log('')

  let deployment: Deployment
  try {
    deployment =
      toolchain === 'hardhat'
        ? await deployWithHardhat(cwd, contract, args, network, await detectPackageManager(cwd), dryRun)
        : await deployWithFoundry(cwd, contract, args, network, key, dryRun)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    console.log(`  ${pc.red('Deployment failed.')}\n`)
    console.log(message.trimEnd())
    console.log('')
    return 1
  }

  if (dryRun) {
    field('toolchain', toolchain)
    field('command', deployment.command)
    console.log('')
    return 0
  }

  const recorded = await recordDeployment(cwd, network, contract, deployment.address)
  const frontend = options.frontend === false ? undefined : await detectFrontend(cwd)
  if (frontend) await upsertEnvVar(frontend.envFile, frontend.envVar, deployment.address)

  console.log(`  ${pc.green('✓')} ${pc.bold(contract)} deployed`)
  field('address', deployment.address)
  field('recorded', path.relative(cwd, recorded))

  if (frontend) {
    field('frontend', `${path.relative(cwd, frontend.envFile)} (${frontend.envVar})`)

    const wired = await frontendContractName(frontend)
    if (wired && wired !== contract) {
      console.log(`\n  ${pc.yellow(`The frontend is still wired to ${wired}.`)}`)
      console.log(`  ${pc.dim(`Update its ABI in ${path.relative(cwd, frontend.contractModule)} to drive ${contract}.`)}`)
    }
  }

  console.log('')
  return 0
}
