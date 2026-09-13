import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('theme loads before rendering and survives unavailable browser storage', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  for (const [saved, expected] of [['dark','dark'], ['light','light'], [null,'light'], ['invalid','light']]) {
    const document = {documentElement: {dataset: {theme: ''}}};
    runInNewContext(script, {document, localStorage: {getItem: () => saved}});
    assert.equal(document.documentElement.dataset.theme, expected);
  }
  const document = {documentElement: {dataset: {theme: ''}}};
  runInNewContext(script, {document, localStorage: {getItem() {throw new Error('blocked');}}});
  assert.equal(document.documentElement.dataset.theme, 'light');
});
