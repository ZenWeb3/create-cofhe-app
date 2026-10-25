import { test } from 'node:test'
import assert from 'node:assert/strict'

import { renderTemplate, buildVars } from '../dist/scaffold.js'
import { validateProjectName } from '../dist/prompts.js'
import { PATTERNS } from '../dist/patterns.js'

const options = {
  projectName: 'demo',
  targetDir: '/tmp/demo',
  toolchain: 'hardhat',
  frontend: 'nextjs',
  pattern: 'sealed-bid',
  packageManager: 'pnpm',
  git: true,
  install: true,
}

test('substitutes known placeholders', () => {
  assert.equal(renderTemplate('hello {{name}}', { name: 'world' }), 'hello world')
})

test('leaves an unknown placeholder visible', () => {
  assert.equal(renderTemplate('{{missing}}', {}), '{{missing}}')
})

test('keeps an if-block when the variable is set', () => {
  assert.equal(renderTemplate('a{{#if on}}b{{/if}}c', { on: 'yes' }), 'abc')
})

test('drops an if-block when the variable is empty', () => {
  assert.equal(renderTemplate('a{{#if on}}b{{/if}}c', { on: '' }), 'ac')
})

test('collapses the blank lines a dropped block leaves behind', () => {
  assert.equal(renderTemplate('a\n{{#if on}}\nb\n{{/if}}\nc', { on: '' }), 'a\n\nc')
})

test('renders every pattern placeholder for every package manager', () => {
  for (const packageManager of ['pnpm', 'npm', 'yarn']) {
    for (const pattern of Object.keys(PATTERNS)) {
      const vars = buildVars({ ...options, packageManager, pattern })
      for (const [key, value] of Object.entries(vars)) {
        assert.equal(typeof value, 'string', `${key} must render as a string`)
      }
      assert.equal(vars.contractName, PATTERNS[pattern].contractName)
    }
  }
})

test('points the frontend scripts at the right package manager', () => {
  assert.equal(buildVars({ ...options, packageManager: 'pnpm' }).frontendDevCommand, 'pnpm --dir frontend dev')
  assert.equal(buildVars({ ...options, packageManager: 'npm' }).frontendDevCommand, 'npm --prefix frontend run dev')
  assert.equal(buildVars({ ...options, packageManager: 'yarn' }).frontendDevCommand, 'yarn --cwd frontend dev')
})

test('leaves the frontend variables empty when there is no frontend', () => {
  const vars = buildVars({ ...options, frontend: 'none' })
  assert.equal(vars.frontend, '')
  assert.equal(vars.frontendDevCommand, '')
})

test('rejects unusable project names', () => {
  assert.ok(validateProjectName(''))
  assert.ok(validateProjectName('.'))
  assert.ok(validateProjectName('My App'))
  assert.equal(validateProjectName('my-app'), undefined)
  assert.equal(validateProjectName('my_app.2'), undefined)
})
