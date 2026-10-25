import { cp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'src', 'templates')
const to = join(root, 'dist', 'templates')

await rm(to, { recursive: true, force: true })
await cp(from, to, { recursive: true })
