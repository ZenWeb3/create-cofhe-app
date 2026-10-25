#!/usr/bin/env node
import pc from 'picocolors'
import { printBanner } from './banner.js'
import { buildProgram, createApp, optionsToDefaults } from './create.js'

const program = buildProgram().action(
  async (projectName: string | undefined, opts: Record<string, unknown>) => {
    printBanner()
    await createApp(optionsToDefaults(projectName, opts, program))
  },
)

program.parseAsync(process.argv).catch((cause: unknown) => {
  console.error(pc.red(cause instanceof Error ? cause.message : String(cause)))
  process.exitCode = 1
})
