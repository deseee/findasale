/**
 * proxySecret: the eBay proxy shared-secret check fails closed.
 * Run: npm test   (node:test through tsx)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorizedProxyRequest } from '../proxySecret';

test('refuses every request when the secret is not configured', () => {
  assert.equal(isAuthorizedProxyRequest('anything', undefined), false);
  assert.equal(isAuthorizedProxyRequest('', ''), false);
  assert.equal(isAuthorizedProxyRequest(undefined, undefined), false);
});

test('accepts only the exact secret', () => {
  assert.equal(isAuthorizedProxyRequest('s3cret', 's3cret'), true);
  assert.equal(isAuthorizedProxyRequest('s3cre', 's3cret'), false);
  assert.equal(isAuthorizedProxyRequest('s3cret!', 's3cret'), false);
  assert.equal(isAuthorizedProxyRequest(['s3cret'], 's3cret'), false);
  assert.equal(isAuthorizedProxyRequest(undefined, 's3cret'), false);
});
