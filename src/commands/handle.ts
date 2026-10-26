import path from 'node:path'
import fs from 'fs-extra'
import pc from 'picocolors'
import { deployerAddress } from '../project.js'
import {
  decodeAddress,
  decodeBool,
  decodeUint,
  encodeAddress,
  encodeUint,
  ethCall,
  readEnvFile,
  resolveRpcUrl,
} from '../rpc.js'

export interface HandleOptions {
  cwd?: string | undefined
  network?: string | undefined
  for?: string[] | undefined
}

/** One fixed address on every chain; it resolves the TaskManager for this chain. */
const ADDRESS_BOOK = '0xC0F4e00E531a2B086492Ae3DCC1515038307196b'
const TASK_MANAGER_ID = 1n

// Signatures are stable, so the selectors are constants rather than a keccak dependency.
const GET_TM = '0x25adb56b' // getTm(uint256)
const IS_ALLOWED = '0x5faa299a' // isAllowed(uint256,address)
const IS_PUBLICLY_ALLOWED = '0x8eef9ae7' // isPubliclyAllowed(uint256)
const GET_DECRYPT_RESULT_SAFE = '0x458693c9' // getDecryptResultSafe(uint256)

/** Utils.*_TFHE in @fhenixprotocol/cofhe-contracts. */
const TYPES: Record<number, string> = {
  0: 'ebool',
  2: 'euint8',
  3: 'euint16',
  4: 'euint32',
  5: 'euint64',
  6: 'euint128',
  7: 'eaddress',
  8: 'euint256',
}

interface Account {
  address: string
  label: string
}

export function parseHandle(input: string): bigint | undefined {
  const trimmed = input.trim()
  const value = /^0x[0-9a-fA-F]+$/.test(trimmed)
    ? BigInt(trimmed)
    : /^[0-9]+$/.test(trimmed)
      ? BigInt(trimmed)
      : undefined

  if (value === undefined || value < 0n || value >= 1n << 256n) return undefined
  return value
}

export function describeHandle(handle: bigint): { type: string; securityZone: number; trivial: boolean } {
  const typeByte = Number((handle >> 8n) & 0xffn)
  return {
    type: TYPES[typeByte & 0x7f] ?? `unknown type ${typeByte & 0x7f}`,
    securityZone: Number(handle & 0xffn),
    trivial: (typeByte & 0x80) !== 0,
  }
}

function short(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`
}

async function candidates(cwd: string, network: string, extra: string[]): Promise<Account[]> {
  const accounts: Account[] = extra.map((address) => ({ address, label: 'given with --for' }))

  const deployments = (await fs.readJson(path.join(cwd, 'deployments.json')).catch(() => undefined)) as
    | Record<string, Record<string, { address?: string }>>
    | undefined

  if (deployments) {
    const matching = deployments[network]
    for (const [key, contracts] of Object.entries(matching ? { [network]: matching } : deployments)) {
      for (const [name, record] of Object.entries(contracts)) {
        if (!record?.address) continue
        accounts.push({ address: record.address, label: matching ? name : `${name} on ${key}` })
      }
    }
  }

  const key = (await readEnvFile(cwd)).PRIVATE_KEY
  if (key && /^(0x)?[0-9a-fA-F]{64}$/.test(key)) {
    const address = await deployerAddress(cwd, key.startsWith('0x') ? key : `0x${key}`)
    if (address) accounts.push({ address, label: 'your PRIVATE_KEY' })
  }

  const seen = new Set<string>()
  return accounts.filter((account) => {
    const lower = account.address.toLowerCase()
    if (seen.has(lower)) return false
    seen.add(lower)
    return true
  })
}

function field(label: string, value: string): void {
  console.log(`    ${pc.dim(label.padEnd(14))} ${value}`)
}

export async function runHandle(rawHandle: string | undefined, options: HandleOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd()
  const network = options.network ?? 'arb-sepolia'

  if (!rawHandle) {
    console.log(`\n  ${pc.red('Give a ciphertext handle to inspect.')}`)
    console.log(`  ${pc.dim('Usage: npx cofhe handle <ctHash> [--network arb-sepolia]')}\n`)
    return 1
  }

  const handle = parseHandle(rawHandle)
  if (handle === undefined) {
    console.log(`\n  ${pc.red(`Not a ciphertext handle: ${rawHandle}`)}`)
    console.log(`  ${pc.dim('Expected a 32-byte hex value, the bytes32 a contract stores.')}\n`)
    return 1
  }

  const { type, securityZone, trivial } = describeHandle(handle)
  const hex = `0x${handle.toString(16).padStart(64, '0')}`

  console.log(`\n  ${pc.bold('Handle')} ${pc.dim(short(hex))}\n`)
  field('type', type)
  field('security zone', String(securityZone))
  if (trivial) field('trivial', 'yes — encrypted from a plaintext constant, so the value is public')

  let url: string
  try {
    url = await resolveRpcUrl(cwd, network)
  } catch (cause) {
    console.log(`\n  ${pc.red(cause instanceof Error ? cause.message : String(cause))}\n`)
    return 1
  }

  field('network', `${network} ${pc.dim(url)}`)

  let taskManager: string
  try {
    const result = await ethCall(url, ADDRESS_BOOK, `${GET_TM}${encodeUint(TASK_MANAGER_ID)}`)
    taskManager = decodeAddress(result)
    if (/^0x0*$/.test(taskManager)) throw new Error('the address book has no TaskManager for this chain')
  } catch (cause) {
    console.log(`\n  ${pc.red('Could not reach CoFHE on this chain.')}`)
    console.log(`  ${pc.dim(cause instanceof Error ? cause.message : String(cause))}`)
    console.log(`  ${pc.dim('On a local chain the mocks must be deployed — `hardhat node` does it for you.')}\n`)
    return 1
  }

  field('task manager', taskManager)

  const call = (selector: string, args = '') => ethCall(url, taskManager, `${selector}${encodeUint(handle)}${args}`)

  const [publicResult, decryptResult] = await Promise.all([
    call(IS_PUBLICLY_ALLOWED),
    call(GET_DECRYPT_RESULT_SAFE),
  ])

  const globallyAllowed = decodeBool(publicResult)
  const published = decodeBool(decryptResult, 1)

  console.log(`\n  ${pc.bold('Decryption')}\n`)
  console.log(
    published
      ? `    ${pc.green('✓')} published on-chain as ${pc.bold(String(decodeUint(decryptResult, 0)))}`
      : `    ${pc.dim('·')} not published on-chain ${pc.dim('(no FHE.publishDecryptResult yet)')}`,
  )
  console.log(
    globallyAllowed
      ? `    ${pc.green('✓')} globally allowed — anyone can decrypt it`
      : `    ${pc.dim('·')} not globally allowed ${pc.dim('(no FHE.allowGlobal)')}`,
  )

  const accounts = await candidates(cwd, network, options.for ?? [])

  if (accounts.length === 0) {
    console.log(`\n  ${pc.dim('No addresses to check. Pass --for <address> or deploy with `cofhe deploy`.')}\n`)
    return 0
  }

  const allowances = await Promise.all(
    accounts.map(async (account) => ({
      account,
      allowed: decodeBool(await call(IS_ALLOWED, encodeAddress(account.address))),
    })),
  )

  console.log(`\n  ${pc.bold('Access')}\n`)
  const width = Math.max(...allowances.map(({ account }) => account.address.length))
  for (const { account, allowed } of allowances) {
    const mark = allowed ? pc.green('✓') : pc.red('✗')
    console.log(`    ${mark} ${account.address.padEnd(width)}  ${pc.dim(account.label)}`)
  }

  if (!globallyAllowed && !allowances.some(({ allowed }) => allowed)) {
    console.log(`\n  ${pc.yellow('Nothing listed above can decrypt this handle.')}`)
    console.log(`  ${pc.dim('The contract has to call FHE.allowThis, FHE.allowSender or FHE.allow on it')}`)
    console.log(`  ${pc.dim('in the same transaction that produced it — see `cofhe explain allow`.')}`)
  }

  console.log('')
  return 0
}
