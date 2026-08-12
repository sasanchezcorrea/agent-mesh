const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

test('statusline updater writes a valid settings file atomically without Python', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentmesh-statusline-'));
  try {
    const settingsPath = path.join(temp, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify({ editor: { fontSize: 14 } }));
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'setup', 'update-statusline.js'), settingsPath, '/tmp/agentmesh-statusline.sh'],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, 'utf8')), {
      editor: { fontSize: 14 },
      statusLine: { type: 'command', command: '/tmp/agentmesh-statusline.sh' },
    });
    assert.deepEqual(
      fs.readdirSync(temp),
      ['settings.json'],
      'temporary files must not remain after the atomic rename',
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
