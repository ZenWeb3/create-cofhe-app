# Contributing

Thanks for looking. This is a scaffolder, so most changes are either a template change or a new
command — the sections below say where each lives and what will fail if you get it wrong.

## Setup

```bash
pnpm install
pnpm build          # tsc, then copies src/templates into dist/templates
pnpm test           # 97 tests, node's built-in runner
pnpm typecheck
```

`pnpm test` rebuilds first, because the tests import from `dist/` — that is what ships, and the
template files are only in `dist/templates` after a build.

## Layout

- `src/commands/` — one file per `cofhe` subcommand, each exporting a `run*` function that returns
  an exit code and does its own printing. Keep them importable and side-effect free so the tests can
  call them directly.
- `src/templates/<toolchain>/base/` — the files every project of that toolchain gets.
- `src/templates/hardhat/patterns/<pattern>/contracts/` — the Solidity for a pattern. It is shared:
  Foundry projects get their contracts from here too, and only the tests differ.
- `src/templates/<toolchain>/patterns/<pattern>/test/` — that toolchain's tests for the pattern.
- `src/patterns.ts` — the metadata that drives the deploy scripts and the generated frontend.

Every template file ends in `.tmpl` and is rendered with `{{placeholders}}` and
`{{#if key}}blocks{{/if}}`. A file without `.tmpl` is not copied.

## Adding a pattern

1. Write the contract under `hardhat/patterns/<name>/contracts/`.
2. Write both test suites: `hardhat/patterns/<name>/test/` and `foundry/patterns/<name>/test/`.
3. Add the entry to `PATTERNS` in `src/patterns.ts`, and to `PATTERN_LABELS` and
   `PATTERN_CONTRACTS` in `src/prompts.ts`.
4. Add it to the CI matrix in `.github/workflows/ci.yml`.

`test/patterns.test.mjs` parses your contract and compares it against the metadata, so a wrong ABI,
a constructor argument list that does not fit, or a function the frontend calls but the contract
does not have will fail the suite rather than the generated app.

## Three rules the templates cannot break

- **`evmVersion: 'cancun'`.** CoFHE contracts use transient storage and will not compile without it.
- **`@fhenixprotocol/cofhe-contracts` stays pinned to an exact version.** `@cofhe/mock-contracts`
  implements `ITaskManager` from one specific release, so a caret range resolves past it and
  `MockTaskManager` stops compiling. `cofhe doctor` checks this. An upstream fix is in review, so
  re-check `@cofhe/mock-contracts`'s own dependency before relaxing it.
- **The Next.js template builds with `--webpack`.** A Turbopack build of a page importing
  `@cofhe/sdk/web` does not finish. Re-test before dropping the flag.

## Tests

Output assertions go through `plain()` from `test/ansi.mjs`. picocolors emits colour whenever `CI`
is set, so an assertion that spans a colour boundary passes locally and fails on the runner —
reproduce any CI-only failure with `CI=true pnpm test` first.

## Commits

Conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `test:`), and a body that says why when
the subject cannot.
