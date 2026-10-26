# Changelog

## 0.1.0

First release. Replaces `create-fhenix-dapp`, which scaffolded onto the retired
`cofhejs`/`fhenixjs` stack.

### Added

- `npx create-cofhe-app [name]` with an interactive flow and non-interactive flags
  (`--toolchain`, `--frontend`, `--pattern`, `--package-manager`, `--no-git`, `--no-install`, `--yes`).
- Hardhat and Foundry project templates on `@cofhe/sdk` 1.0, `@cofhe/hardhat-plugin` 1.0 and
  `@cofhe/foundry-plugin` 1.0.
- Five starting patterns, each with a passing test suite: blank, sealed-bid auction, private voting,
  encrypted ERC-20 token, encrypted escrow.
- Optional Next.js or Vite frontend with a `useCofhe` hook and a connect / encrypt / decrypt demo.
- `cofhe doctor` — environment and project check, aware of both toolchains.
- `cofhe explain <concept>` — offline explanations of handles, ACPs, encryption, decryption,
  allowances, FHE, CoFHE, the encrypted types, external inputs and the mock stack.
- `cofhe add <pattern>` — adds a pattern's contract and test to an existing project, detecting the
  toolchain and refusing to overwrite without `--force`.
- `cofhe new` — the scaffolder as a subcommand.

### Notes

- Contracts use the current batch input API throughout: `externalEuintN[] calldata values,
  bytes calldata signature` verified with `FHE.asEuintNs(values, signature)`. The removed `InEuintN`
  type does not appear anywhere.
- `@fhenixprotocol/cofhe-contracts` is pinned to an exact version because `@cofhe/mock-contracts`
  implements `ITaskManager` from one specific release.
- The Next.js frontend builds with webpack. Turbopack deadlocks while bundling the module worker the
  SDK uses for proof generation.
