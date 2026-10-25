import { execa } from 'execa'
import { isAvailable } from './install.js'

export type GitResult = 'committed' | 'initialized' | 'unavailable'

async function run(args: string[], cwd: string): Promise<void> {
  await execa('git', args, { cwd, stdio: 'pipe' })
}

/**
 * Initializes a repository and makes the first commit. A missing git identity leaves the
 * repository in place with everything staged rather than failing the scaffold.
 */
export async function initGitRepo(targetDir: string, message: string): Promise<GitResult> {
  if (!(await isAvailable('git'))) return 'unavailable'

  try {
    await run(['init', '-b', 'main'], targetDir)
  } catch {
    await run(['init'], targetDir)
  }

  await run(['add', '-A'], targetDir)

  try {
    await run(['commit', '-m', message], targetDir)
    return 'committed'
  } catch {
    return 'initialized'
  }
}
