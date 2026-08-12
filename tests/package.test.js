#!/usr/bin/env node

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('npm package files entry ships only existing paths', () => {
  for (const entry of pkg.files) {
    const target = path.join(root, entry.replace(/\/$/, ''));
    assert.ok(
      fs.existsSync(target),
      `package.json "files" references missing path: ${entry}`,
    );
  }
});

test('root test script only runs kept test suite', () => {
  assert.match(pkg.scripts.test, /node --test tests\/\*\.test\.js/);
});

test('README tells users to run the cleanup script and it ships', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.ok(readme.includes('node scripts/uninstall.js'));
  assert.ok(fs.existsSync(path.join(root, 'scripts', 'uninstall.js')));
});

test('package ships a changelog for published releases', () => {
  assert.ok(pkg.files.includes('CHANGELOG.md'));
  assert.ok(fs.existsSync(path.join(root, 'CHANGELOG.md')));
  assert.ok(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('CHANGELOG.md'));
});

test('package ships the VS Code instruction source', () => {
  assert.ok(pkg.files.includes('.github/copilot-instructions.md'));
  assert.ok(fs.existsSync(path.join(root, '.github', 'copilot-instructions.md')));
  assert.ok(fs.existsSync(path.join(root, 'setup', 'install-vscode-instructions.js')));
});

test('versioned stack lock matches the plugin version and ships', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'stack.lock.json'), 'utf8'));
  const claudePlugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  const copilotPlugin = JSON.parse(fs.readFileSync(path.join(root, '.github', 'plugin', 'plugin.json'), 'utf8'));
  assert.equal(lock.agentmesh, pkg.version);
  assert.equal(claudePlugin.version, pkg.version);
  assert.equal(copilotPlugin.version, pkg.version);
  assert.deepEqual(
    Object.keys(lock.tools).sort(),
    ['ax', 'codegraph', 'engram', 'ponytail', 'rtk', 'serena'],
  );
  assert.deepEqual(lock.tools.ponytail, {
    version: '4.8.4',
    source: 'DietrichGebert/ponytail',
    plugin: 'ponytail@ponytail',
    hosts: ['claude', 'copilot'],
  });
  assert.ok(fs.existsSync(path.join(root, 'tests', 'docker-install.sh')));
});

test('fast repository checks are configured without Python-only tooling', () => {
  const scripts = pkg.scripts;
  assert.equal(scripts.check, 'npm run check-syntax && npm test');
  assert.equal(scripts['check-syntax'], 'node scripts/check-syntax.js');
  assert.ok(fs.existsSync(path.join(root, 'prek.toml')));
  assert.ok(fs.existsSync(path.join(root, 'renovate.json')));
});
