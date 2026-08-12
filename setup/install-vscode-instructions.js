#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const marker = '<!-- Managed by Agentmesh. -->';
const sourcePath = path.join(root, '.github', 'copilot-instructions.md');
const home = process.env.HOME || process.env.USERPROFILE;

if (!home) {
  throw new Error('HOME or USERPROFILE is required to configure VS Code instructions.');
}

const instructionDirectory = process.env.AGENTMESH_VSCODE_INSTRUCTIONS_DIR
  || path.join(home, '.copilot', 'instructions');
const targetPath = path.join(instructionDirectory, 'agentmesh.instructions.md');
const args = process.argv.slice(2);

if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error('Usage: node setup/install-vscode-instructions.js [--check]');
}

function expectedContent() {
  const body = fs.readFileSync(sourcePath, 'utf8').trimEnd();
  return [
    '---',
    'name: Agentmesh',
    'description: Cost-aware engineering policy',
    'applyTo: "**"',
    '---',
    '',
    marker,
    '',
    body,
    '',
  ].join('\n');
}

function stateFor(content) {
  if (!fs.existsSync(targetPath)) return 'missing';

  const existing = fs.readFileSync(targetPath, 'utf8');
  if (!existing.includes(marker)) return 'unmanaged';
  return existing === content ? 'current' : 'needs-update';
}

function writeAtomically(content) {
  fs.mkdirSync(instructionDirectory, { recursive: true });
  const temporaryPath = path.join(
    instructionDirectory,
    `.${path.basename(targetPath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`,
  );

  try {
    fs.writeFileSync(temporaryPath, content, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, targetPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function main() {
  const content = expectedContent();
  const state = stateFor(content);

  if (args[0] === '--check') {
    console.log(`VS Code instructions: ${state} (${targetPath})`);
    if (state === 'unmanaged') {
      process.exitCode = 1;
    }
    return;
  }

  if (state === 'unmanaged') {
    throw new Error(`Refusing to overwrite unmanaged instruction file: ${targetPath}`);
  }
  if (state === 'current') {
    console.log(`VS Code instructions already configured: ${targetPath}`);
    return;
  }

  writeAtomically(content);
  console.log(`VS Code instructions installed: ${targetPath}`);
}

try {
  main();
} catch (error) {
  console.error(`VS Code instruction install failed: ${error.message}`);
  process.exitCode = 1;
}
