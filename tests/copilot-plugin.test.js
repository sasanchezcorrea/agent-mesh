#!/usr/bin/env node
// Smoke test for the Copilot plugin adapter: keep command wiring minimal and
// ensure the mesh commands are part of the shared command surface.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const REQUIRED_COMMAND_FILES = [
  'mesh.toml',
  'mesh-status.toml',
  'mesh-cost.toml',
  'mesh-evaluate.toml',
];

function readJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
}

test('copilot plugin command directory includes the mesh commands', () => {
  const manifest = readJSON('.github/plugin/plugin.json');
  assert.equal(manifest.name, 'agentmesh');
  assert.equal(manifest.commands, 'commands/');

  for (const file of REQUIRED_COMMAND_FILES) {
    assert.ok(
      fs.existsSync(path.join(root, manifest.commands, file)),
      `missing command file: ${manifest.commands}${file}`,
    );
  }
  assert.deepEqual(
    fs.readdirSync(path.join(root, manifest.commands)).filter(file => file.endsWith('.toml')).sort(),
    [...REQUIRED_COMMAND_FILES].sort(),
    'Agentmesh must publish only its mesh command surface',
  );
});
