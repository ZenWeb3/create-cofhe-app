import type { Pattern } from './prompts.js'

export interface PatternMeta {
  label: string
  description: string
  contractName: string
  /** Arguments for `new Contract(...)` in the Hardhat deploy script. */
  constructorArgs: string
  /** Arguments for `new Contract(...)` in the Foundry deploy script. */
  solConstructorArgs: string
  /** Literal constructor values for `cofhe deploy`; `{deployer}` resolves at deploy time. */
  deployArgs: string[]
  fheType: 'Uint32' | 'Uint64' | 'Uint128'
  encryptableFn: 'uint32' | 'uint64' | 'uint128'
  amountLabel: string
  actionLabel: string
  writeFn: string
  writeArgs: string
  readFn: string
  readArgs: string
  extraField?: { label: string; inputType: 'text' | 'number'; placeholder: string }
  abi: unknown[]
}

const encryptedInput = [
  { name: 'values', type: 'bytes32[]' },
  { name: 'signature', type: 'bytes' },
]

function fn(name: string, inputs: unknown[], outputs: unknown[] = [], stateMutability = 'nonpayable') {
  return { type: 'function', name, inputs, outputs, stateMutability }
}

const handleOutput = [{ name: '', type: 'bytes32' }]

export const PATTERNS: Record<Pattern, PatternMeta> = {
  blank: {
    label: 'Blank',
    description:
      'A minimal CoFHE project: one contract that stores a single encrypted number and adds to it without ever decrypting on-chain.',
    contractName: 'Blank',
    deployArgs: [],
    constructorArgs: '',
    solConstructorArgs: '',
    fheType: 'Uint32',
    encryptableFn: 'uint32',
    amountLabel: 'Value',
    actionLabel: 'Set value',
    writeFn: 'setValue',
    writeArgs: '[[handle], signature]',
    readFn: 'value',
    readArgs: '[]',
    abi: [fn('setValue', encryptedInput), fn('value', [], handleOutput, 'view')],
  },
  'sealed-bid': {
    label: 'Sealed Bid Auction',
    description:
      'A sealed bid auction. Bids are compared with `FHE.gt` while still encrypted, so no bidder ever learns another bid, and only the winning bid is published once the auction closes.',
    contractName: 'SealedBidAuction',
    deployArgs: [],
    constructorArgs: '',
    solConstructorArgs: '',
    fheType: 'Uint128',
    encryptableFn: 'uint128',
    amountLabel: 'Bid amount',
    actionLabel: 'Place bid',
    writeFn: 'placeBid',
    writeArgs: '[[handle], signature]',
    readFn: 'encryptedHighestBid',
    readArgs: '[]',
    abi: [fn('placeBid', encryptedInput), fn('encryptedHighestBid', [], handleOutput, 'view')],
  },
  'private-vote': {
    label: 'Private Voting',
    description:
      'A poll with one encrypted tally per option. Ballots are added homomorphically, so no running count is visible until the owner closes voting and publishes the results.',
    contractName: 'PrivateVoting',
    deployArgs: ['3'],
    constructorArgs: '3',
    solConstructorArgs: '3',
    fheType: 'Uint32',
    encryptableFn: 'uint32',
    amountLabel: 'Ballot weight',
    actionLabel: 'Cast vote',
    writeFn: 'castVote',
    writeArgs: '[BigInt(extra), [handle], signature]',
    readFn: 'encryptedTally',
    readArgs: '[BigInt(extra)]',
    extraField: { label: 'Option', inputType: 'number', placeholder: '0' },
    abi: [
      fn('castVote', [{ name: 'option', type: 'uint256' }, ...encryptedInput]),
      fn('encryptedTally', [{ name: 'option', type: 'uint256' }], handleOutput, 'view'),
    ],
  },
  'encrypted-token': {
    label: 'Encrypted ERC-20 Token',
    description:
      'An ERC-20 shaped token whose balances and total supply are ciphertext handles. Transfers use `FHE.select` with `FHE.gte` so an overdraft moves nothing instead of reverting and leaking the balance.',
    contractName: 'EncryptedToken',
    deployArgs: ['Encrypted Token', 'eTKN'],
    constructorArgs: "'Encrypted Token', 'eTKN'",
    solConstructorArgs: '"Encrypted Token", "eTKN"',
    fheType: 'Uint64',
    encryptableFn: 'uint64',
    amountLabel: 'Amount',
    actionLabel: 'Transfer',
    writeFn: 'transfer',
    writeArgs: '[extra as `0x${string}`, [handle], signature]',
    readFn: 'balanceOf',
    readArgs: '[account]',
    extraField: { label: 'Recipient', inputType: 'text', placeholder: '0x...' },
    abi: [
      fn('transfer', [{ name: 'to', type: 'address' }, ...encryptedInput]),
      fn('balanceOf', [{ name: 'account', type: 'address' }], handleOutput, 'view'),
    ],
  },
  'encrypted-escrow': {
    label: 'Encrypted Escrow',
    description:
      'An escrow holding an encrypted deposit. Release moves the encrypted balance to the beneficiary and grants them decryption rights; refund returns it to the depositor.',
    contractName: 'EncryptedEscrow',
    deployArgs: ['{deployer}'],
    constructorArgs: 'process.env.BENEFICIARY ?? (await deployer.getAddress())',
    solConstructorArgs: 'vm.envOr("BENEFICIARY", vm.addr(deployerKey))',
    fheType: 'Uint64',
    encryptableFn: 'uint64',
    amountLabel: 'Deposit amount',
    actionLabel: 'Deposit',
    writeFn: 'deposit',
    writeArgs: '[[handle], signature]',
    readFn: 'escrowedAmount',
    readArgs: '[]',
    abi: [fn('deposit', encryptedInput), fn('escrowedAmount', [], handleOutput, 'view')],
  },
  'encrypted-crowdfund': {
    label: 'Encrypted Crowdfund',
    description:
      'A crowdfunding campaign whose contributions stay encrypted. The running total is compared against the goal with `FHE.gte` while still encrypted, so only the outcome — met or missed — is ever published.',
    contractName: 'EncryptedCrowdfund',
    deployArgs: ['1000'],
    constructorArgs: '1000',
    solConstructorArgs: '1000',
    fheType: 'Uint64',
    encryptableFn: 'uint64',
    amountLabel: 'Contribution',
    actionLabel: 'Contribute',
    writeFn: 'contribute',
    writeArgs: '[[handle], signature]',
    readFn: 'contributionOf',
    readArgs: '[account]',
    abi: [
      fn('contribute', encryptedInput),
      fn('contributionOf', [{ name: 'backer', type: 'address' }], handleOutput, 'view'),
    ],
  },
}
