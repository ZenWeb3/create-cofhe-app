import pc from 'picocolors'

interface Concept {
  title: string
  summary: string
  body: string[]
  example?: string[]
  related?: string[]
}

const CONCEPTS: Record<string, Concept> = {
  handles: {
    title: 'handles',
    summary: 'the bytes32 pointer a contract stores instead of a value',
    body: [
      'A handle (also called a ctHash or ciphertext handle) is a bytes32 value stored',
      'on-chain that points to an encrypted value managed by the CoFHE coprocessor.',
      '',
      'Think of it like a pointer — the contract stores the handle, not the encrypted',
      'data. The CoFHE network holds the ciphertext and uses the handle to identify it.',
      '',
      "When you call FHE.add(a, b) you are not computing on ciphertext in the EVM; you",
      'are telling the coprocessor to add the values behind those two handles and hand',
      'back a new handle for the result.',
      '',
      'Handles are not secrets. Anyone can read one off-chain. What protects the value',
      'is the access control list — see `cofhe explain acps` and `cofhe explain allow`.',
    ],
    example: ['euint64 private balance;  // stores a handle, not a number'],
    related: ['euint', 'acps'],
  },
  acps: {
    title: 'acps',
    summary: 'Access Control Permissions — the signed object that authorizes decryption',
    body: [
      'An ACP (Access Control Permission) is a signed object that proves to the',
      'threshold network that an account is allowed to decrypt a handle. ACPs replace',
      'the old "permits" from fhenixjs.',
      '',
      'A self ACP lets you read handles the contract allowed to your own address. A',
      'sharing ACP delegates that right to another account, which completes its half',
      'and imports it.',
      '',
      'The SDK stores ACPs for you, keyed by chain and account, and reuses the active',
      'one. `getOrCreateSelfACP()` returns the active ACP or signs a new one.',
      '',
      'An ACP alone is not enough: the contract must also have called FHE.allow for',
      'that account. The ACP proves who you are; the on-chain ACL decides what you may',
      'read.',
    ],
    example: [
      'const client = createCofheClient(config)',
      'await client.connect(publicClient, walletClient)',
      'await client.acp.getOrCreateSelfACP()',
    ],
    related: ['allow', 'decrypt'],
  },
  encrypt: {
    title: 'encrypt',
    summary: 'encryptInputs batches values into one proof with one shared signature',
    body: [
      'Encryption happens in the client, never on-chain. `encryptInputs` takes a list',
      'of Encryptable items, packs them into a single zero-knowledge proof, and has',
      'CoFHE verify it.',
      '',
      'The result is a flat tuple: one handle per input, in input order, followed by a',
      'single signature that covers the whole batch. One value gives you two elements,',
      'three values give you four.',
      '',
      '`setConsumingContract` is required. The target address is bound into the proof,',
      'so a batch encrypted for one contract cannot be replayed into another. The',
      'batch is also bound to the sending account, so the transaction must come from',
      'the account that encrypted it.',
      '',
      'On the contract side the batch is verified once with the plural converter:',
      'FHE.asEuint32s(handles, signature).',
    ],
    example: [
      'const [low, high, signature] = await client',
      '  .encryptInputs([Encryptable.uint32(1n), Encryptable.uint32(99n)])',
      '  .setConsumingContract(await contract.getAddress())',
      '  .execute()',
    ],
    related: ['external', 'handles'],
  },
  decrypt: {
    title: 'decrypt',
    summary: 'decryptForView reads a value off-chain, decryptForTx publishes it on-chain',
    body: [
      'There are two decryption paths, and they are not interchangeable.',
      '',
      'decryptForView asks the threshold network to seal the plaintext to your ACP so',
      'only you can unseal it. It returns a plain JS value — a bigint, a boolean, or a',
      'checksummed address. Use it to show a balance or a tally in a UI. Nothing goes',
      'on-chain.',
      '',
      'decryptForTx returns the plaintext plus a threshold-network signature over it.',
      'You then pass both to FHE.publishDecryptResult in a transaction, which writes',
      'the plaintext into the task manager where any contract can read it. Use it when',
      'a result has to become public — the winning bid, a final vote tally.',
      '',
      'decryptForTx takes an explicit mode: withACP() uses your permission, while',
      'withoutACP() works only on handles the contract made globally readable with',
      'FHE.allowGlobal.',
    ],
    example: [
      'const tally = await client.decryptForView(ctHash, FheTypes.Uint32).execute()',
      '',
      'const { decryptedValue, signature } = await client',
      '  .decryptForTx(ctHash)',
      '  .withoutACP()',
      '  .execute()',
    ],
    related: ['acps', 'allow'],
  },
  allow: {
    title: 'allow',
    summary: 'the on-chain ACL calls that decide who can decrypt a handle',
    body: [
      'Every handle starts out readable by nobody. A contract grants access with four',
      'calls, and forgetting them is the single most common CoFHE bug — the operation',
      'succeeds and the later decryption fails.',
      '',
      'FHE.allowThis(handle) lets this contract keep using the handle in later',
      'transactions. Anything you write to storage needs it.',
      '',
      'FHE.allowSender(handle) lets msg.sender decrypt it. Use it for a value that',
      'belongs to the caller.',
      '',
      'FHE.allow(handle, account) lets a specific address decrypt it — a transfer',
      'recipient, an escrow beneficiary.',
      '',
      'FHE.allowGlobal(handle) makes it readable by anyone. This reveals the value, so',
      'it is for results that are meant to be public.',
      '',
      'Each FHE operation returns a new handle, so the allowances must be re-applied',
      'to the result, not to the inputs.',
    ],
    example: [
      'euint64 updated = FHE.add(_balances[to], amount);',
      '_balances[to] = updated;',
      'FHE.allowThis(updated);',
      'FHE.allow(updated, to);',
    ],
    related: ['handles', 'acps'],
  },
  fhe: {
    title: 'fhe',
    summary: 'computing on encrypted data without decrypting it',
    body: [
      'Fully Homomorphic Encryption is encryption you can do arithmetic on. Given the',
      'encryptions of 2 and 3, an FHE scheme produces the encryption of 5 without',
      'anyone involved ever seeing 2, 3 or 5.',
      '',
      'That turns the usual blockchain trade-off around. Normally a public chain has',
      'to see your data to compute on it. With FHE the chain can compute on data it',
      'cannot read, so balances, bids and votes stay private while the logic over them',
      'stays verifiable.',
      '',
      'The cost is speed: FHE operations are orders of magnitude more expensive than',
      'plaintext ones, which is why CoFHE moves them off the EVM.',
      '',
      'Two consequences shape how you write contracts. You cannot branch on an',
      'encrypted condition, so use FHE.select instead of if. And you cannot revert on',
      'one, so an invalid encrypted amount has to resolve to a no-op.',
    ],
    example: ['euint64 sent = FHE.select(FHE.gte(balance, amount), amount, FHE.asEuint64(0));'],
    related: ['cofhe', 'euint'],
  },
  cofhe: {
    title: 'cofhe',
    summary: 'the coprocessor that runs FHE work off-chain for an ordinary EVM chain',
    body: [
      'CoFHE is a coprocessor. Your contracts stay on a normal EVM chain — Ethereum',
      'Sepolia, Arbitrum Sepolia — and the FHE work happens on the CoFHE network.',
      '',
      'The flow is: your contract calls into FHE.sol, which forwards the request to',
      'the on-chain task manager and immediately returns a handle for the result. The',
      'CoFHE network picks the task up, computes on the ciphertext, and stores the',
      'result against that handle.',
      '',
      'Because the handle comes back straight away, your contract never waits. The',
      'value behind it becomes available a moment later, which is why reads are',
      'asynchronous and done through the client.',
      '',
      'Decryption is held by a threshold network, so no single operator can read a',
      'value. Keys are split across nodes and a quorum is needed to decrypt.',
    ],
    related: ['handles', 'mocks'],
  },
  euint: {
    title: 'euint',
    summary: 'the encrypted types: euint8 … euint128, ebool and eaddress',
    body: [
      'CoFHE gives you encrypted counterparts to Solidity\'s value types:',
      '',
      '  ebool      an encrypted boolean, produced by comparisons',
      '  euint8     0 … 255',
      '  euint16    0 … 65,535',
      '  euint32    0 … ~4.29e9',
      '  euint64    0 … ~1.84e19',
      '  euint128   0 … ~3.4e38',
      '  eaddress   an encrypted address',
      '',
      'Each is a user-defined value type wrapping bytes32 — the handle. They cost the',
      'same storage as any bytes32 regardless of the width, but wider types cost more',
      'to compute on, so pick the narrowest that fits. euint64 suits token balances,',
      'euint32 suits counters and tallies.',
      '',
      'Mixing widths is not allowed: convert first with FHE.asEuint64(someEuint32).',
    ],
    example: ['euint64 private _balance;', 'ebool canSend = FHE.gte(_balance, amount);'],
    related: ['handles', 'external'],
  },
  external: {
    title: 'external',
    summary: 'externalEuint32 is an unverified handle arriving from a caller',
    body: [
      'externalEuint32 (and externalEuint64, externalEbool, externalEaddress, …) is',
      'the type of a handle that has come in from outside and has not been verified',
      'yet. It is deliberately a different type from euint32.',
      '',
      'The distinction is what stops forged inputs. A caller can put any bytes32 in a',
      'transaction, so a raw handle proves nothing. Passing it through',
      'FHE.asEuint32s(values, signature) checks the batch signature — covering the',
      'values, the sending account and the consuming contract — and only then do you',
      'get euint32 values you can compute on.',
      '',
      'So the type system enforces the rule: externalEuint32 goes in, euint32 comes',
      'out, and there is no way to skip the check.',
      '',
      'This replaces the old InEuint32 struct, which carried a per-value proof. One',
      'signature now covers a whole batch.',
    ],
    example: [
      'function setValues(externalEuint32[] calldata values, bytes calldata signature) external {',
      '    euint32[] memory decoded = FHE.asEuint32s(values, signature);',
      '}',
    ],
    related: ['encrypt', 'euint'],
  },
  mocks: {
    title: 'mocks',
    summary: 'the local stack that replaces the CoFHE network during tests',
    body: [
      'Local testing does not touch the CoFHE network. @cofhe/hardhat-plugin deploys a',
      'set of mock contracts into the Hardhat network before every test run, and',
      '@cofhe/foundry-plugin does the same from CofheTest.deployMocks().',
      '',
      'The mocks replicate the off-chain parts on-chain: a mock task manager that',
      'performs each FHE operation in plaintext and stores the result, a mock ZK',
      'verifier that accepts locally signed input batches, a mock threshold network',
      'that signs decryption results, and the real ACL.',
      '',
      'Two things follow. Plaintexts are readable on the test chain, so tests can',
      'assert on them directly — mock_expectPlaintext in Hardhat, expectPlaintext in',
      'Foundry. And the ACL is real, so a missing FHE.allowThis fails locally exactly',
      'as it would on a testnet.',
      '',
      'Mock gas is inflated because the FHE work really runs in the EVM. Use',
      'hre.cofhe.getAdjustedGasUsed(receipt) for a figure close to the real cost.',
    ],
    example: [
      'const [signer] = await hre.ethers.getSigners()',
      'const client = await hre.cofhe.createClientWithBatteries(signer)',
    ],
    related: ['cofhe', 'decrypt'],
  },
}

const ALIASES: Record<string, string> = {
  permits: 'acps',
  permit: 'acps',
  acp: 'acps',
  handle: 'handles',
  ctHash: 'handles',
  mock: 'mocks',
  select: 'fhe',
  encryption: 'encrypt',
  decryption: 'decrypt',
  allowthis: 'allow',
  allowsender: 'allow',
  externaleuint: 'external',
  euints: 'euint',
  types: 'euint',
}

export function listConcepts(): void {
  console.log(`\n  ${pc.bold('Available concepts')}\n`)

  for (const [key, concept] of Object.entries(CONCEPTS)) {
    console.log(`  ${pc.cyan(key.padEnd(10))} ${pc.dim(concept.summary)}`)
  }

  console.log(`\n  ${pc.dim('Usage: npx cofhe explain <concept>')}\n`)
}

export function explain(rawConcept: string): number {
  const key = rawConcept.trim().toLowerCase()
  const resolved = CONCEPTS[key] ? key : ALIASES[key]
  const concept = resolved ? CONCEPTS[resolved] : undefined

  if (!concept) {
    console.log(`\n  ${pc.red(`Unknown concept: ${rawConcept}`)}`)
    listConcepts()
    return 1
  }

  console.log(`\n  ${pc.bold(pc.cyan(concept.title))}\n`)
  for (const line of concept.body) console.log(line ? `  ${line}` : '')

  if (concept.example) {
    console.log(`\n  ${pc.dim('Example:')}`)
    for (const line of concept.example) console.log(line ? `    ${pc.dim(line)}` : '')
  }

  if (concept.related?.length) {
    const related = concept.related.map((name) => `npx cofhe explain ${name}`).join(', ')
    console.log(`\n  ${pc.dim(`Related: ${related}`)}`)
  }

  console.log('')
  return 0
}
