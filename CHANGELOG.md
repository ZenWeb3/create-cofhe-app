# Changelog

## 0.2.0

### Added

- `cofhe add <pattern>` — adds a pattern's contract and test to a project that is already
  scaffolded, detecting the toolchain and refusing to overwrite without `--force`.
- `cofhe deploy [contract]` — deploys through Hardhat or Foundry, records the address in
  `deployments.json` and writes it into the frontend's env file. Constructor arguments default to the
  pattern's own and can be overridden with `--args`.
- `cofhe handle <ctHash>` — decodes a ciphertext handle's type, security zone and trivial-encryption
  flag, then reads the chain for its published result, its global allowance and which known
  addresses may decrypt it. Needs no private key.
- An encrypted crowdfund pattern, the first that reveals a comparison rather than a value:
  contributions stay encrypted and only the met-or-missed outcome is published.

### Changed

- `cofhe doctor` also compares `@fhenixprotocol/cofhe-contracts` against the exact version
  `@cofhe/mock-contracts` was built against, catching both a drifted install and a caret range that
  will drift on the next one. Either one otherwise surfaces as
  `Contract "MockTaskManager" should be marked as abstract`, which names neither package.
- A new banner: the CoFHE wordmark in solid blocks with the outline dimmed into a drop shadow, over a
  line showing a plaintext 42 becoming a real `euint64` handle. It drops the cipher line in a narrow
  terminal, collapses to one line in a very narrow one, and falls back to pure ASCII where box
  characters would come out as mojibake.

### Fixed

- `--pattern` kept its own list of patterns and rejected one the prompt offered.

### Notes

- A test parses each pattern's Solidity and compares it against the hand-written ABI, the
  constructor argument strings and the function names the frontend calls, so drift between them
  fails the suite rather than the generated app.

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
- `cofhe new` — the scaffolder as a subcommand.

### Notes

- Contracts use the current batch input API throughout: `externalEuintN[] calldata values,
  bytes calldata signature` verified with `FHE.asEuintNs(values, signature)`. The removed `InEuintN`
  type does not appear anywhere.
- `@fhenixprotocol/cofhe-contracts` is pinned to an exact version because `@cofhe/mock-contracts`
  implements `ITaskManager` from one specific release.
- The Next.js frontend builds with webpack. Turbopack deadlocks while bundling the module worker the
  SDK uses for proof generation.
