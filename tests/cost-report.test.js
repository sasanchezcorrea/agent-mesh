const test = require('node:test');
const assert = require('node:assert/strict');

const { parseUsage } = require('../dashboard/cost-report');

test('cost report parses Copilot usage output', () => {
  assert.deepEqual(
    parseUsage('Tokens ↑ 1.2k\\nAI Credits 3.5'),
    { tokens: '1.2k', credits: 3.5 },
  );
});

test('cost report rejects missing credit output instead of returning NaN', () => {
  assert.throws(
    () => parseUsage('Copilot failed before printing usage'),
    /could not parse AI Credits/,
  );
});
