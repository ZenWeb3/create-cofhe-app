import { createRequire } from 'node:module'
import pc from 'picocolors'

const require = createRequire(import.meta.url)

export function getVersion(): string {
  try {
    const pkg = require('../package.json') as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** Exported so the tests can pin the row count and widths against a careless edit. */
export const ART = { blocks: () => BLOCKS, plain: () => PLAIN }

const BLOCKS = [
  ' ██████╗ ██████╗ ███████╗██╗  ██╗███████╗',
  '██╔════╝██╔═══██╗██╔════╝██║  ██║██╔════╝',
  '██║     ██║   ██║█████╗  ███████║█████╗  ',
  '██║     ██║   ██║██╔══╝  ██╔══██║██╔══╝  ',
  '╚██████╗╚██████╔╝██║     ██║  ██║███████╗',
  ' ╚═════╝ ╚═════╝ ╚═╝     ╚═╝  ╚═╝╚══════╝',
]

const PLAIN = [
  '  ____         _____  _   _  _____ ',
  ' / ___|  ___  |  ___|| | | || ____|',
  '| |     / _ \\ | |_   | |_| ||  _|  ',
  '| |___ | (_) ||  _|  |  _  || |___ ',
  ' \\____| \\___/ |_|    |_| |_||_____|',
]

const TAGLINE = 'Fully Homomorphic Encryption dApps on Fhenix CoFHE'

/** A real euint64 handle — the trailing 8500 is the trivial flag, type 5 and security zone 0. */
const HANDLE = '0x43662edd'
const TAIL = '8500'

const CIPHER_WIDTH = 64

export interface BannerOptions {
  columns?: number | undefined
  unicode?: boolean | undefined
}

/** The linux console and pre-Terminal windows consoles draw box characters as mojibake. */
function unicodeSupported(): boolean {
  if (process.platform !== 'win32') return process.env.TERM !== 'linux'
  return Boolean(process.env.WT_SESSION) || process.env.TERM_PROGRAM === 'vscode'
}

/** Paints the solid blocks bright and the outline dim, which reads as a drop shadow. */
function shade(line: string): string {
  let painted = ''
  let run = ''
  let solid = line.startsWith('█')

  for (const char of line) {
    if (char !== ' ' && (char === '█') !== solid) {
      painted += solid ? pc.cyan(run) : pc.dim(pc.cyan(run))
      run = ''
      solid = char === '█'
    }
    run += char
  }

  return painted + (solid ? pc.cyan(run) : pc.dim(pc.cyan(run)))
}

export function bannerLines(options: BannerOptions = {}): string[] {
  const unicode = options.unicode ?? unicodeSupported()
  const columns = options.columns ?? process.stdout.columns ?? 80
  const art = unicode ? BLOCKS : PLAIN
  const version = pc.dim(`  v${getVersion()}`)

  if (columns < (art[0] as string).length) {
    return ['', `  ${pc.bold(pc.cyan('create-cofhe-app'))}${version}`, `  ${pc.dim(TAGLINE)}`, '']
  }

  const paint = unicode ? shade : pc.cyan
  const lines = ['', ...art.map((line, index) => (index === art.length - 1 ? paint(line) + version : paint(line))), '']

  if (columns >= CIPHER_WIDTH) {
    const arrow = unicode ? '──▶' : '-->'
    const handle = `${HANDLE}${unicode ? '…' : '...'}${TAIL}`
    lines.push(`  ${pc.bold('42')}  ${pc.dim(arrow)}  ${pc.cyan('euint64')} ${pc.dim(handle)}`)
  }

  lines.push(`  ${pc.dim(TAGLINE)}`, '')
  return lines
}

export function printBanner(): void {
  console.log(bannerLines().join('\n'))
}
