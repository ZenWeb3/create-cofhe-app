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

Each pattern ships with a working test suite — `hardhat test` or `forge test` passes immediately
after scaffolding, with no testnet or API key.

## The `cofhe` command

The package also installs a `cofhe` binary.

### `cofhe doctor`

Checks the environment and the current project: Node and pnpm versions, the `@cofhe/sdk` and
`@fhenixprotocol/cofhe-contracts` installs, `evmVersion: 'cancun'` in `hardhat.config.ts`, a
`PRIVATE_KEY` in `.env`, and TypeScript 5 or newer.

```
$ npx cofhe doctor

  CoFHE Environment Check

  ✓ Node.js v22.23.1
  ✓ pnpm 10.34.1
  ✓ @cofhe/sdk 1.0.1
  ✓ @fhenixprotocol/cofhe-contracts 1.0.0
  ✓ evmVersion: 'cancun' set in hardhat.config.ts
  ✗ PRIVATE_KEY not set in .env
    → Copy .env.example to .env and add your key
  ✓ TypeScript 5.9.3

  1 issue found. Fix them before deploying.
```

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
node dist/index.js my-app --no-install
```

Templates live in `src/templates` as `.tmpl` files and are copied into `dist` by the build.
`{{placeholders}}` and `{{#if key}}…{{/if}}` blocks are resolved by `src/scaffold.ts` from the
pattern metadata in `src/patterns.ts`.

## Links

- CoFHE docs: https://cofhesdk.fhenix.io
- Fhenix Discord: https://discord.gg/FuVgxrvJMY

## License

MIT
