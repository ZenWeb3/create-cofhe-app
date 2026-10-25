import path from 'node:path'
import { execa } from 'execa'
import fs from 'fs-extra'
import type { PackageManager } from './prompts.js'

export async function isAvailable(command: string): Promise<boolean> {
  try {
    await execa(command, ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function install(packageManager: PackageManager, cwd: string): Promise<void> {
  await execa(packageManager, ['install'], { cwd, stdio: 'pipe' })
}

/** Installs the project and, when scaffolded, the frontend package. */
export async function installDependencies(packageManager: PackageManager, targetDir: string): Promise<void> {
  await install(packageManager, targetDir)

  const frontendDir = path.join(targetDir, 'frontend')
  if (await fs.pathExists(path.join(frontendDir, 'package.json'))) {
    await install(packageManager, frontendDir)
  }
}
