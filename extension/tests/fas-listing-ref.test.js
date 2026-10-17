// Node tests for fas-listing-ref.js. Run: node --test extension/tests/fas-listing-ref.test.js
const test = require('node:test');
const assert = require('node:assert');
const R = require('../fas-listing-ref.js');

test('normalizeRemoteId validates each platform format', () => {
  assert.strictEqual(R.normalizeRemoteId('POSHMARK', 'ABCDEF0123456789abcdef01'), 'abcdef0123456789abcdef01');
  assert.strictEqual(R.normalizeRemoteId('POSHMARK', 'abc'), '');
  assert.strictEqual(R.normalizeRemoteId('MERCARI', 'M12345678901'), 'm12345678901');
  assert.strictEqual(R.normalizeRemoteId('MERCARI', '12345'), '');
  assert.strictEqual(R.normalizeRemoteId('GRAILED', '98400943'), '98400943');
  assert.strictEqual(R.normalizeRemoteId('GRAILED', '98x'), '');
  assert.strictEqual(R.normalizeRemoteId('FACEBOOK', '1234567890123'), '1234567890123');
  assert.strictEqual(R.normalizeRemoteId('FACEBOOK', '123'), '');
  assert.strictEqual(R.normalizeRemoteId('CRAIGSLIST', '7712345678'), '7712345678');
  assert.strictEqual(R.normalizeRemoteId('CRAIGSLIST', '12345678'), '');
  assert.strictEqual(R.normalizeRemoteId('GUMTREE_AU', '1234567890'), '1234567890');
  assert.strictEqual(R.normalizeRemoteId('GUMTREE_AU', '1234567'), '');
  assert.strictEqual(R.normalizeRemoteId('NOPE', '123456789'), '');
  assert.strictEqual(R.normalizeRemoteId('GRAILED', null), '');
});

test('listingRefFromUrl parses each platform URL shape and rejects foreign hosts', () => {
  const p = R.listingRefFromUrl('POSHMARK', 'https://poshmark.com/listing/Cool-Thing-ABCDEF0123456789abcdef01?x=1#top');
  assert.deepStrictEqual(p, { remoteListingId: 'abcdef0123456789abcdef01', remoteListingUrl: 'https://poshmark.com/listing/Cool-Thing-ABCDEF0123456789abcdef01?x=1' });
  assert.strictEqual(R.listingRefFromUrl('POSHMARK', 'https://poshmark.com/closet/me'), null);
  assert.strictEqual(R.listingRefFromUrl('POSHMARK', 'https://evil.example/listing/abcdef0123456789abcdef01'), null);
  assert.strictEqual(R.listingRefFromUrl('POSHMARK', 'https://poshmark.com.evil.example/listing/abcdef0123456789abcdef01'), null);
  assert.strictEqual(R.listingRefFromUrl('GRAILED', 'https://www.grailed.com/listings/98400943-thing').remoteListingId, '98400943');
  assert.strictEqual(R.listingRefFromUrl('MERCARI', 'https://www.mercari.com/us/item/M12345678901/').remoteListingId, 'm12345678901');
  assert.strictEqual(R.listingRefFromUrl('MERCARI', 'https://www.mercari.com/sell/edit/m12345678901/').remoteListingId, 'm12345678901');
  assert.strictEqual(R.listingRefFromUrl('FACEBOOK', 'https://www.facebook.com/marketplace/item/1234567890123/?ref=x').remoteListingId, '1234567890123');
  assert.strictEqual(R.listingRefFromUrl('FACEBOOK', 'https://www.facebook.com/marketplace/create/item'), null);
  assert.strictEqual(R.listingRefFromUrl('CRAIGSLIST', 'https://post.craigslist.org/manage/7712345678/abc').remoteListingId, '7712345678');
  assert.strictEqual(R.listingRefFromUrl('CRAIGSLIST', 'https://grandrapids.craigslist.org/msg/d/thing/7712345678.html').remoteListingId, '7712345678');
  assert.strictEqual(R.listingRefFromUrl('CRAIGSLIST', 'https://post.craigslist.org/k/abc'), null);
  assert.strictEqual(R.listingRefFromUrl('GUMTREE_AU', 'https://www.gumtree.com.au/s-ad/perth/lamp/1312345678').remoteListingId, '1312345678');
  assert.strictEqual(R.listingRefFromUrl('GUMTREE_AU', 'https://www.gumtree.com.au/p-post-ad.html?adId=1312345678').remoteListingId, '1312345678');
  assert.strictEqual(R.listingRefFromUrl('GUMTREE_AU', 'https://www.gumtree.com.au/p-post-ad.html'), null);
  assert.strictEqual(R.listingRefFromUrl('GRAILED', 'not a url'), null);
  assert.strictEqual(R.listingRefFromUrl('GRAILED', null), null);
});

test('sanitizeListedRef accepts id, url, or url-in-id-field and drops contradictions', () => {
  const fb = 'https://www.facebook.com/marketplace/item/1234567890123/';
  assert.deepStrictEqual(R.sanitizeListedRef('FACEBOOK', fb, undefined), { remoteListingId: '1234567890123', remoteListingUrl: fb });
  assert.deepStrictEqual(R.sanitizeListedRef('GRAILED', '98400943', null), { remoteListingId: '98400943', remoteListingUrl: null });
  assert.deepStrictEqual(R.sanitizeListedRef('GRAILED', null, 'https://www.grailed.com/listings/98400943'), { remoteListingId: '98400943', remoteListingUrl: 'https://www.grailed.com/listings/98400943' });
  assert.deepStrictEqual(R.sanitizeListedRef('GRAILED', '111', 'https://www.grailed.com/listings/98400943'), { remoteListingId: '111', remoteListingUrl: null });
  assert.deepStrictEqual(R.sanitizeListedRef('GRAILED', '98400943', 'https://www.grailed.com/listings/55555555'), { remoteListingId: '98400943', remoteListingUrl: null });
  assert.deepStrictEqual(R.sanitizeListedRef('GRAILED', 'junk', 'https://evil.example/listings/98400943'), { remoteListingId: null, remoteListingUrl: null });
  assert.deepStrictEqual(R.sanitizeListedRef('POSHMARK', null, null), { remoteListingId: null, remoteListingUrl: null });
  assert.deepStrictEqual(R.sanitizeListedRef('FACEBOOK', 'https://www.facebook.com/marketplace/create/item', null), { remoteListingId: null, remoteListingUrl: null });
});

function fakeDoc({ canonical, og, anchors } = {}) {
  return {
    querySelector(s) {
      if (s.indexOf('canonical') >= 0 && canonical) return { getAttribute: () => canonical };
      if (s.indexOf('og:url') >= 0 && og) return { getAttribute: () => og };
      return null;
    },
    querySelectorAll() { return (anchors || []).map((h) => ({ getAttribute: () => h })); }
  };
}

test('capturePageListingRef: page URL first, canonical next, anchors only for Craigslist/Gumtree and only when unambiguous', () => {
  assert.strictEqual(R.capturePageListingRef('POSHMARK', { href: 'https://poshmark.com/listing/Thing-abcdef0123456789abcdef01' }, fakeDoc()).remoteListingId, 'abcdef0123456789abcdef01');
  assert.strictEqual(R.capturePageListingRef('POSHMARK', { href: 'https://poshmark.com/closet/me' }, fakeDoc({ canonical: 'https://poshmark.com/listing/Thing-abcdef0123456789abcdef01' })).remoteListingId, 'abcdef0123456789abcdef01');
  // Poshmark feed links must never be trusted
  assert.strictEqual(R.capturePageListingRef('POSHMARK', { href: 'https://poshmark.com/feed' }, fakeDoc({ anchors: ['https://poshmark.com/listing/Other-abcdef0123456789abcdef02'] })), null);
  const cl = { href: 'https://post.craigslist.org/k/abc/def' };
  assert.strictEqual(R.capturePageListingRef('CRAIGSLIST', cl, fakeDoc({ anchors: ['https://post.craigslist.org/manage/7712345678', '/manage/7712345678/'] })).remoteListingId, '7712345678');
  assert.strictEqual(R.capturePageListingRef('CRAIGSLIST', cl, fakeDoc({ anchors: ['https://post.craigslist.org/manage/7712345678', 'https://post.craigslist.org/manage/7712345679'] })), null);
  assert.strictEqual(R.capturePageListingRef('GUMTREE_AU', { href: 'https://www.gumtree.com.au/p-post-ad.html' }, fakeDoc({ anchors: ['https://www.gumtree.com.au/p-edit-ad.html?adId=1312345678'] })).remoteListingId, '1312345678');
  assert.strictEqual(R.capturePageListingRef('MERCARI', { href: 'https://www.mercari.com/sell/' }, fakeDoc()), null);
  assert.strictEqual(R.capturePageListingRef('MERCARI', null, null), null);
  assert.strictEqual(R.capturePageListingRef('MERCARI', { href: 'https://www.mercari.com/sell/' }, { querySelector() { throw new Error('boom'); } }), null);
});

test('pickPostedListing accepts exactly one live match and refuses guesses', () => {
  const A = 'abcdef0123456789abcdef01', B = 'abcdef0123456789abcdef02';
  const one = R.pickPostedListing('POSHMARK', [{ id: A, url: 'https://poshmark.com/listing/Thing-' + A }], false);
  assert.strictEqual(one.reason, 'ok');
  assert.deepStrictEqual(one.ref, { remoteListingId: A, remoteListingUrl: 'https://poshmark.com/listing/Thing-' + A });
  assert.strictEqual(R.pickPostedListing('POSHMARK', [{ id: A }, { id: B }], false).reason, 'ambiguous');
  assert.strictEqual(R.pickPostedListing('POSHMARK', [{ id: A }, { id: A }], false).reason, 'ok');
  assert.strictEqual(R.pickPostedListing('POSHMARK', [{ id: A }], true).reason, 'truncated');
  assert.strictEqual(R.pickPostedListing('POSHMARK', [], false).reason, 'none');
  assert.strictEqual(R.pickPostedListing('POSHMARK', [{ id: 'bad' }], false).reason, 'none');
  assert.strictEqual(R.pickPostedListing('POSHMARK', [{ id: A, url: 'https://evil.example/listing/' + A }], false).ref.remoteListingUrl, null);
});

test('unconfirmedPublishVerdict: a live closet copy means published; otherwise it stays unconfirmed', () => {
  assert.deepStrictEqual(R.unconfirmedPublishVerdict([{ state: 'clear' }, { state: 'failed' }, { state: 'dup' }]), { published: true, reason: 'live_in_closet' });
  assert.deepStrictEqual(R.unconfirmedPublishVerdict([{ state: 'clear' }, { state: 'clear' }]), { published: false, reason: 'not_in_closet' });
  assert.deepStrictEqual(R.unconfirmedPublishVerdict([{ state: 'failed' }, { state: 'failed' }]), { published: false, reason: 'closet_unreadable' });
  assert.deepStrictEqual(R.unconfirmedPublishVerdict([]), { published: false, reason: 'no_checks' });
});
