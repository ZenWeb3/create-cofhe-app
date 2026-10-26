import fs from 'fs-extra'
import path from 'node:path'

interface Network {
  url: string
  envVar?: string
}

/** The same defaults the generated hardhat.config.ts and foundry.toml use. */
const NETWORKS: Record<string, Network> = {
  'arb-sepolia': { url: 'https://sepolia-rollup.arbitrum.io/rpc', envVar: 'ARBITRUM_SEPOLIA_RPC_URL' },
  'eth-sepolia': { url: 'https://ethereum-sepolia.publicnode.com', envVar: 'SEPOLIA_RPC_URL' },
  localhost: { url: 'http://127.0.0.1:8545' },
  hardhat: { url: 'http://127.0.0.1:8545' },
  anvil: { url: 'http://127.0.0.1:8545' },
}

export function knownNetworks(): string[] {
  return Object.keys(NETWORKS)
}

export async function readEnvFile(cwd: string): Promise<Record<string, string>> {
  const source = await fs.readFile(path.join(cwd, '.env'), 'utf8').catch(() => '')
  const values: Record<string, string> = {}

  for (const line of source.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (match?.[1]) values[match[1]] = (match[2] ?? '').trim().replace(/^["']|["']$/g, '')
  }

  return values
}

export async function resolveRpcUrl(cwd: string, network: string): Promise<string> {
  if (/^https?:\/\//.test(network)) return network

  const known = NETWORKS[network]
  if (!known) throw new Error(`Unknown network: ${network}. Pass an RPC url or one of ${knownNetworks().join(', ')}`)

  const override = known.envVar ? (await readEnvFile(cwd))[known.envVar] : undefined
  return override || known.url
}

export async function ethCall(url: string, to: string, data: string): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
    signal: AbortSignal.timeout(20_000),
  }).catch((cause: unknown) => {
    throw new Error(`Cannot reach ${url}: ${cause instanceof Error ? cause.message : String(cause)}`)
  })

  if (!response.ok) throw new Error(`${url} answered with HTTP ${response.status}`)

  const body = (await response.json()) as { result?: string; error?: { message?: string } }
  if (body.error) throw new Error(body.error.message ?? 'eth_call failed')

  return body.result ?? '0x'
}

export function encodeUint(value: bigint): string {
  return value.toString(16).padStart(64, '0')
}

export function encodeAddress(address: string): string {
  return address.replace(/^0x/, '').toLowerCase().padStart(64, '0')
}

function word(data: string, index: number): string {
  const body = data.replace(/^0x/, '')
  return body.slice(index * 64, (index + 1) * 64)
}

export function decodeBool(data: string, index = 0): boolean {
  return BigInt(`0x${word(data, index) || '0'}`) !== 0n
}

export function decodeUint(data: string, index = 0): bigint {
  return BigInt(`0x${word(data, index) || '0'}`)
}

export function decodeAddress(data: string, index = 0): string {
  return `0x${word(data, index).slice(24)}`
}
