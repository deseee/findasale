/**
 * Tests for lib/swUpdateToast.ts and its use in pages/_app.tsx.
 * Run: npm test   (node:test through tsx, no extra dependencies)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { shouldShowSwUpdateToast } from '../swUpdateToast';

const HERE = typeof __dirname !== 'undefined' ? __dirname : path.join(process.cwd(), 'lib', '__tests__');

test('first install (no prior controller) never shows the toast', () => {
  assert.equal(shouldShowSwUpdateToast({ hadController: false, alreadyNotified: false }), false);
  assert.equal(shouldShowSwUpdateToast({ hadController: false, alreadyNotified: true }), false);
});

test('real update (had a controller) shows the toast once', () => {
  assert.equal(shouldShowSwUpdateToast({ hadController: true, alreadyNotified: false }), true);
  assert.equal(shouldShowSwUpdateToast({ hadController: true, alreadyNotified: true }), false);
});

test('_app.tsx ServiceWorkerUpdateNotifier uses the helper and captures the prior controller', () => {
  const src = fs.readFileSync(path.resolve(HERE, '..', '..', 'pages', '_app.tsx'), 'utf8');
  const start = src.indexOf('function ServiceWorkerUpdateNotifier');
  assert.ok(start >= 0, 'ServiceWorkerUpdateNotifier not found');
  const block = src.slice(start, src.indexOf('function OAuthBridge', start));
  assert.match(src, /from ['"]\.\.\/lib\/swUpdateToast['"]/);
  assert.match(block, /const hadController = !!navigator\.serviceWorker\.controller/);
  assert.match(block, /shouldShowSwUpdateToast\(\{ hadController, alreadyNotified: notified \}\)/);
  assert.ok(
    block.indexOf('hadController') < block.indexOf("addEventListener('controllerchange'"),
    'hadController must be captured before the listener is attached'
  );
});
