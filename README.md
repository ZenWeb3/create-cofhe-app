# create-cofhe-app

Scaffold a [Fhenix CoFHE](https://cofhesdk.fhenix.io) dApp — encrypted smart contracts, tests that
run against the CoFHE mock network, and an optional frontend — on the current `@cofhe/sdk` 1.0 stack.

```bash
npx create-cofhe-app my-app
```

## What you get

```
my-app/
├── contracts/            Solidity using @fhenixprotocol/cofhe-contracts
├── test/                 tests against the CoFHE mocks
├── scripts/deploy.ts     deployment to eth-sepolia / arb-sepolia
├── frontend/             optional Next.js or Vite dApp
└── hardhat.config.ts     evmVersion: 'cancun', CoFHE plugin, both testnets
```

Everything is bundled with the package — scaffolding makes no network calls.

## Options

```
npx create-cofhe-app [project-name] [options]

  -t, --toolchain <name>         hardhat | foundry
  -f, --frontend <name>          nextjs | vite | none
  -p, --pattern <name>           blank | sealed-bid | private-vote
                                 | encrypted-token | encrypted-escrow
  -m, --package-manager <name>   pnpm | npm | yarn
      --no-git                   skip git init
      --no-install               skip dependency install
  -y, --yes                      accept defaults for unanswered prompts
```

Run it with no options for the interactive flow.

## Patterns

| Pattern            | What it demonstrates                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| `blank`            | Storing and adding to one encrypted number — the smallest complete setup        |
| `sealed-bid`       | `FHE.gt` + `FHE.select` to find a maximum without revealing any bid             |
| `private-vote`     | One encrypted tally per option, published on-chain when voting closes           |
| `encrypted-token`  | Encrypted ERC-20 balances; `FHE.gte` + `FHE.select` instead of an underflow revert |
| `encrypted-escrow` | Moving an encrypted balance between parties and handing over decryption rights  |
| `encrypted-crowdfund` | `FHE.gte` against a goal: the outcome is published, the amounts never are |

Each pattern ships with a working test suite — `hardhat test` or `forge test` passes immediately
after scaffolding, with no testnet or API key.

Pick one while scaffolding, and add any of the others later with `cofhe add <pattern>`.

## The `cofhe` command

The package also installs a `cofhe` binary.

### `cofhe doctor`

Checks the environment and the current project: Node and pnpm versions, the CoFHE package installs,
`evmVersion: 'cancun'` in `hardhat.config.ts` (or `evm_version` in `foundry.toml`), a `PRIVATE_KEY`
in `.env`, and TypeScript 5 or newer. Checks that do not apply to the project are skipped, so it
reads sensibly in both Hardhat and Foundry projects.

It also compares `@fhenixprotocol/cofhe-contracts` against the exact version `@cofhe/mock-contracts`
was built against, including a caret range that has not drifted yet but will on the next install.
A mismatch there fails the build with `Contract "MockTaskManager" should be marked as abstract`,
which names neither package.

```
$ npx cofhe doctor

  CoFHE Environment Check

  ✓ Node.js v22.23.1
  ✓ pnpm 10.34.1
  ✓ @cofhe/sdk 1.0.1
  ✓ @fhenixprotocol/cofhe-contracts 1.0.0
  ✓ @fhenixprotocol/cofhe-contracts matches the 1.0.0 that @cofhe/mock-contracts 1.0.1 needs
  ✓ evmVersion: 'cancun' set in hardhat.config.ts
  ✗ PRIVATE_KEY not set in .env
    → Copy .env.example to .env and add your key
  ✓ TypeScript 5.9.3

  1 issue found. Fix them before deploying.
```

### `cofhe deploy [contract]`

Deploys a contract, records the address, and writes it into the frontend's env file — the step that
otherwise means copying an address out of the terminal by hand.

```
$ npx cofhe deploy EncryptedToken --network arb-sepolia

  Deploying EncryptedToken → arb-sepolia
  constructor(Encrypted Token, eTKN)

  ✓ EncryptedToken deployed
    address   0x9A676e781A523b5d0C0e43731313A708CB607508
    recorded  deployments.json
    frontend  frontend/.env.local (NEXT_PUBLIC_CONTRACT_ADDRESS)
```

- The contract name is optional when `contracts/` holds only one; otherwise the command lists what
  is there and asks.
- Constructor arguments default to the pattern's own — `3` options for `private-vote`, a name and
  symbol for `encrypted-token`, the deployer's address for `encrypted-escrow`. Override with
  `--args 9` or `--args "My Token" MTK`.
- `--network` takes a configured network name (`arb-sepolia`, `eth-sepolia`, `localhost`) or an RPC
  url. A local network needs no `PRIVATE_KEY`.
- Addresses accumulate in `deployments.json`, keyed by network and contract.
- `--no-frontend` leaves the env file alone, and `--dry-run` prints the command without deploying.

If the frontend is wired to a different contract than the one you deployed, the command says so
instead of leaving you to wonder why the page does nothing.

Hardhat deploys through `hardhat run`, Foundry through `forge create`. Foundry takes the key as a
command-line argument, so it is visible in the process list while `forge` runs; `cofhe deploy` keeps
it out of its own output, but use a throwaway testnet key either way.

### `cofhe add <pattern>`

Adds a pattern to a project you already have. Run it inside the project directory and it drops in
the contract and its test — nothing else is touched, and no dependencies change.

```
$ npx cofhe add sealed-bid

  Sealed Bid Auction (sealed-bid)

  + contracts/SealedBidAuction.sol
  + test/SealedBidAuction.test.ts
```

The toolchain is detected from `hardhat.config.ts` or `foundry.toml`, so the test arrives as
`.test.ts` or `.t.sol` to match. Short names work too: `auction`, `vote`, `token`, `escrow`. Run
`cofhe add` with no argument for the list.

Existing files are never overwritten — the command stops and lists them instead. Pass `--force` to
overwrite anyway. Your deploy script and frontend still point at the contract you scaffolded with.

### `cofhe handle <ctHash>`

Answers the question FHE development keeps raising: *why can't this be decrypted?* Encrypted state
is a `bytes32` handle, and a decrypt that fails tells you nothing — the access list lives on the
coprocessor, not in the revert message.

```
$ npx cofhe handle 0xcf9ae956…c5f90400 --network localhost

  Handle 0xcf9ae956…c5f90400

    type           euint32
    security zone  0
    network        localhost http://127.0.0.1:8545
    task manager   0x0000000000000000000000000000000000005000

  Decryption

    · not published on-chain (no FHE.publishDecryptResult yet)
    · not globally allowed (no FHE.allowGlobal)

  Access

    ✓ 0x9A676e781A523b5d0C0e43731313A708CB607508  Blank
    ✗ 0x0B306BF915C4d645ff596e518fAf3F9669b97016  PrivateVoting
    ✓ 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266  your PRIVATE_KEY
```

The type and security zone are decoded from the handle itself. Everything else is read from the
chain, so it needs no key — only `eth_call`. The addresses checked are the contracts in
`deployments.json`, the account behind `PRIVATE_KEY`, and anything passed with `--for`. When nothing
has access the command says which `FHE.allow` call is missing.

`--network` takes a configured name or an RPC url, the same as `cofhe deploy`. It works against a
local `hardhat node`, where the mocks stand in for the coprocessor.

### `cofhe explain <concept>`

Short, offline explanations of the concepts that trip people up:

```
npx cofhe explain handles
npx cofhe explain acps
npx cofhe explain allow
```

Available: `handles`, `acps` (alias `permits`), `encrypt`, `decrypt`, `allow`, `fhe`, `cofhe`,
`euint`, `external`, `mocks`. Run `cofhe explain` with no argument for the list.

## Requirements

- Node.js 18 or newer
- pnpm, npm or yarn
- Foundry, for the `--toolchain foundry` projects

## Development

```bash
pnpm install
pnpm build
pnpm test                               # 36 tests over the renderer, every pattern and both commands
node dist/index.js my-app --no-install
```

CI builds the CLI, runs the test suite, then scaffolds every toolchain x pattern combination and runs
the generated project's own tests, plus a Next.js and a Vite frontend build.

Templates live in `src/templates` as `.tmpl` files and are copied into `dist` by the build.
`{{placeholders}}` and `{{#if key}}…{{/if}}` blocks are resolved by `src/scaffold.ts` from the
pattern metadata in `src/patterns.ts`. Solidity sources are shared: a Foundry project takes its
contracts from `src/templates/hardhat/patterns/<pattern>/contracts` and only its tests from
`src/templates/foundry/...`.

Two constraints are worth knowing before bumping anything:

- `@fhenixprotocol/cofhe-contracts` is pinned to an exact version in the scaffolded `package.json`
  because `@cofhe/mock-contracts` implements `ITaskManager` from one specific release — a caret range
  resolves to a newer interface and the mocks stop compiling. When bumping the stack, read the
  version `@cofhe/mock-contracts` itself depends on and pin to that.
- The Next.js template passes `--webpack` to `next dev` and `next build`. Turbopack deadlocks while
  bundling the module worker the SDK uses for proof generation; webpack emits it correctly.

## Links

- CoFHE docs: https://cofhesdk.fhenix.io
- Fhenix Discord: https://discord.gg/FuVgxrvJMY

## License

MIT
