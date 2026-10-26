import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PATTERNS } from '../dist/patterns.js'
import { PATTERN_CONTRACTS, PATTERN_LABELS } from '../dist/prompts.js'

const templates = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'templates')

/** Encrypted types are user-defined value types over bytes32, which is how they reach an ABI. */
function abiType(declaration) {
  const type = declaration.trim().replace(/\s+(calldata|memory|storage)\b/, '').split(/\s+/)[0]
  if (/^externalE(uint\d+|bool|address)\[\]$/.test(type)) return 'bytes32[]'
  if (/^(externalE|e)(uint\d+|bool|address)$/.test(type)) return 'bytes32'
  return type
}

/** Splits on commas that are not inside brackets or quotes. */
function split(source) {
  if (source.trim() === '') return []

  const parts = []
  let current = ''
  let depth = 0
  let quote

  for (const char of source) {
    if (quote) {
      current += char
      if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'") quote = char
    if ('([{'.includes(char)) depth += 1
    if (')]}'.includes(char)) depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }

  parts.push(current)
  return parts
}

function parameters(list) {
  return split(list).map(abiType)
}

function parseContract(source) {
  const functions = []
  const pattern = /function\s+(\w+)\s*\(([^)]*)\)([^{;]*)[{;]/g

  for (const match of source.matchAll(pattern)) {
    const [, name, inputs, tail] = match
    if (!/\b(external|public)\b/.test(tail)) continue

    const returns = /returns\s*\(([^)]*)\)/.exec(tail)
    functions.push({
      name,
      inputs: parameters(inputs),
      outputs: returns ? parameters(returns[1]) : [],
      stateMutability: /\bview\b/.test(tail) ? 'view' : /\bpayable\b/.test(tail) ? 'payable' : 'nonpayable',
    })
  }

  const constructor = /constructor\s*\(([^)]*)\)/.exec(source)
  return { functions, constructorInputs: constructor ? parameters(constructor[1]) : [] }
}

const parsed = Object.fromEntries(
  await Promise.all(
    Object.entries(PATTERNS).map(async ([name, meta]) => {
      const file = path.join(templates, 'hardhat', 'patterns', name, 'contracts', `${meta.contractName}.sol.tmpl`)
      return [name, parseContract(await readFile(file, 'utf8'))]
    }),
  ),
)

test('the parser finds the functions it is meant to find', () => {
  const blank = parsed.blank.functions
  assert.deepEqual(
    blank.find((fn) => fn.name === 'setValue'),
    { name: 'setValue', inputs: ['bytes32[]', 'bytes'], outputs: [], stateMutability: 'nonpayable' },
  )
  assert.deepEqual(
    blank.find((fn) => fn.name === 'value'),
    { name: 'value', inputs: [], outputs: ['bytes32'], stateMutability: 'view' },
  )
  assert.ok(blank.length >= 3, 'blank exposes setValue, addToValue and value')
})

test('every hand-written ABI entry matches the contract it describes', () => {
  for (const [name, meta] of Object.entries(PATTERNS)) {
    for (const entry of meta.abi) {
      const actual = parsed[name].functions.find((fn) => fn.name === entry.name)
      assert.ok(actual, `${meta.contractName} has no ${entry.name}, but the ABI lists it`)

      assert.deepEqual(
        actual.inputs,
        entry.inputs.map((input) => input.type),
        `${meta.contractName}.${entry.name} inputs drifted from the ABI`,
      )
      assert.deepEqual(
        actual.outputs,
        (entry.outputs ?? []).map((output) => output.type),
        `${meta.contractName}.${entry.name} outputs drifted from the ABI`,
      )
      assert.equal(
        actual.stateMutability,
        entry.stateMutability,
        `${meta.contractName}.${entry.name} mutability drifted from the ABI`,
      )
    }
  }
})

test('the functions the frontend calls are in the ABI', () => {
  for (const [name, meta] of Object.entries(PATTERNS)) {
    for (const fn of [meta.writeFn, meta.readFn]) {
      assert.ok(
        meta.abi.some((entry) => entry.name === fn),
        `${name}: ${fn} is called by the frontend but missing from the ABI`,
      )
      assert.ok(
        parsed[name].functions.some((entry) => entry.name === fn),
        `${name}: ${fn} is called by the frontend but missing from ${meta.contractName}`,
      )
    }
  }
})

test('deploy arguments match each constructor', () => {
  for (const [name, meta] of Object.entries(PATTERNS)) {
    assert.equal(
      meta.deployArgs.length,
      parsed[name].constructorInputs.length,
      `${meta.contractName} takes ${parsed[name].constructorInputs.length} constructor arguments but deployArgs has ${meta.deployArgs.length}`,
    )
  }
})

test('constructor argument lists agree across the deploy scripts', () => {
  for (const [name, meta] of Object.entries(PATTERNS)) {
    const expected = parsed[name].constructorInputs.length

    assert.equal(
      split(meta.constructorArgs).length,
      expected,
      `${name}: constructorArgs does not fit the constructor`,
    )
    assert.equal(
      split(meta.solConstructorArgs).length,
      expected,
      `${name}: solConstructorArgs does not fit the constructor`,
    )
  }
})

test('pattern metadata is consistent across the modules that duplicate it', () => {
  for (const [name, meta] of Object.entries(PATTERNS)) {
    assert.equal(PATTERN_CONTRACTS[name], meta.contractName, `${name}: PATTERN_CONTRACTS disagrees with PATTERNS`)
    assert.ok(PATTERN_LABELS[name], `${name} has no prompt label`)
    assert.ok(meta.description.length > 40, `${name} needs a real description`)
  }

  assert.deepEqual(Object.keys(PATTERN_LABELS), Object.keys(PATTERNS))
  assert.deepEqual(Object.keys(PATTERN_CONTRACTS), Object.keys(PATTERNS))
})

test('the CLI accepts every pattern it offers', async () => {
  const { buildProgram } = await import('../dist/create.js')
  const option = buildProgram().options.find((candidate) => candidate.long === '--pattern')

  for (const name of Object.keys(PATTERNS)) {
    assert.equal(option.parseArg(name), name, `--pattern ${name} is rejected by the CLI`)
    assert.match(option.description, new RegExp(name), `${name} is missing from the --pattern help`)
  }

  assert.throws(() => option.parseArg('nope'), /Invalid pattern: nope/)
})
