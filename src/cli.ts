#!/usr/bin/env node
import { Command } from 'commander'
import pc from 'picocolors'
import { getVersion, printBanner } from './banner.js'
import { PATTERN_NAMES, runAdd } from './commands/add.js'
import { DEFAULT_NETWORK, runDeploy } from './commands/deploy.js'
import { runDoctor } from './commands/doctor.js'
import { explain, listConcepts } from './commands/explain.js'
import { buildProgram, createApp, optionsToDefaults } from './create.js'

const program = new Command()
  .name('cofhe')
  .description('Tools for Fhenix CoFHE projects')
  .version(getVersion())

program
  .command('doctor')
  .description('Check that this environment can build and deploy a CoFHE project')
  .action(async () => {
    process.exitCode = await runDoctor()
  })

program
  .command('explain')
  .description('Explain a CoFHE concept')
  .argument('[concept]', 'handles, acps, encrypt, decrypt, allow, fhe, cofhe, euint, external, mocks')
  .action((concept: string | undefined) => {
    if (!concept) {
      listConcepts()
      return
    }
    process.exitCode = explain(concept)
  })

program
  .command('add')
  .description('Add a pattern to the project in this directory')
  .argument('[pattern]', PATTERN_NAMES.join(', '))
  .option('-f, --force', 'overwrite files that already exist')
  .action(async (pattern: string | undefined, opts: { force?: boolean }) => {
    process.exitCode = await runAdd(pattern, { force: Boolean(opts.force) })
  })

program
  .command('deploy')
  .description('Deploy a contract, record the address and wire it into the frontend')
  .argument('[contract]', 'contract to deploy; defaults to the only one in contracts/')
  .option('-n, --network <network>', `network name or RPC url (default: ${DEFAULT_NETWORK})`)
  .option('-a, --args <values...>', 'constructor arguments, overriding the pattern defaults')
  .option('--no-frontend', 'leave the frontend env file alone')
  .option('--dry-run', 'print the deploy command without running it')
  .action(
    async (
      contract: string | undefined,
      opts: { network?: string; args?: string[]; frontend?: boolean; dryRun?: boolean },
    ) => {
      process.exitCode = await runDeploy(contract, {
        network: opts.network,
        args: opts.args,
        frontend: opts.frontend,
        dryRun: opts.dryRun,
      })
    },
  )

const create = buildProgram()
create
  .name('new')
  .description('Scaffold a new CoFHE project')
  .action(async (projectName: string | undefined, opts: Record<string, unknown>) => {
    printBanner()
    await createApp(optionsToDefaults(projectName, opts, create))
  })
program.addCommand(create)

program.parseAsync(process.argv).catch((cause: unknown) => {
  console.error(pc.red(cause instanceof Error ? cause.message : String(cause)))
  process.exitCode = 1
})
