#!/usr/bin/env node
// Every command file must have a matching skill directory. This guards drift
// between the command surface and the bundled skills.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const commandsDir = path.join(root, 'commands');
const skillsDir = path.join(root, 'skills');

const commandFiles = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.toml'));

test('every command has a matching skill', () => {
  for (const file of commandFiles) {
    const name = path.basename(file, '.toml');
    assert.ok(
      fs.existsSync(path.join(skillsDir, name, 'SKILL.md')),
      `missing skill for command: skills/${name}/SKILL.md`,
    );
  }
});

test('every skill has a matching command', () => {
  for (const name of fs.readdirSync(skillsDir)) {
    if (!fs.existsSync(path.join(skillsDir, name, 'SKILL.md'))) continue;
    assert.ok(
      fs.existsSync(path.join(commandsDir, `${name}.toml`)),
      `missing command for skill: commands/${name}.toml`,
    );
  }
});
