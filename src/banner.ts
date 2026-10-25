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

const ART = [
  '   ___      _____ _  _ ___ ',
  "  / __|___ |  ___| || | __|",
  ' | (_/ _ \\ | |__ | __ | _| ',
  '  \\___\\___/|_|   |_||_|___|',
]

export function printBanner(): void {
  const lines = ART.map((line) => pc.cyan(line))
  lines[ART.length - 1] += pc.dim(`  v${getVersion()}`)
  console.log(`\n${lines.join('\n')}\n${pc.dim('  Fully Homomorphic Encryption dApps on Fhenix CoFHE')}\n`)
}
