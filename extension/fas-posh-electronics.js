// fas-posh-electronics.js -- pure helper (extension 1.0.17, 2026-10-17).
// Poshmark's Prohibited Items Policy lists Electronics as RESTRICTED, not prohibited: "Qualifying electronic items must be
// reset to factory settings if applicable. Sellers must sign out of or disable any personal accounts prior to shipping."
// This returns a plain, non-blocking review hint for a powered electronic device, or '' for anything else. It never
// touches the listing description and states nothing about the item's actual condition.
(function (root) {
  'use strict';
  // Powered / account-bearing gear. Whole-word-ish regex on category + title + tags. Deliberately excludes passive
  // photo gear (lenses, tripods, bags, film) and passive accessories so they do not get a pointless hint.
  var POWERED_RE = /\b(electronics?|electronic|camera|cameras|camcorder|flash|speakers?|headphones?|earbuds?|radio|stereo|receiver|amplifier|amp|turntable|record player|laptop|computer|tablet|ipad|kindle|e-?reader|console|playstation|xbox|nintendo|switch|smart ?watch|fitbit|phone|smartphone|iphone|printer|television|tv|monitor|projector|drone|gps|walkie|synthesizer|keyboard|effects? pedal|pedal|battery|rechargeable|bluetooth|wireless)\b/i;
  var PASSIVE_RE = /\b(lens|lenses|tripod|monopod|bag|case|strap|cable|cord|film|filter|hood|cap)\b/i;
  function textOf(item) {
    var parts = [item && item.category, item && item.title];
    var tags = item && item.tags;
    if (Array.isArray(tags)) parts = parts.concat(tags); else if (tags) parts.push(String(tags));
    return parts.filter(Boolean).join(' ');
  }
  function looksLikePoweredElectronic(item) {
    var t = textOf(item);
    if (!t) return false;
    if (!POWERED_RE.test(t)) return false;
    // A passive accessory with no stronger powered signal (e.g. "camera strap", "lens") does not need the hint.
    var strong = /\b(electronic flash|flash|camera|camcorder|speakers?|headphones?|radio|stereo|laptop|tablet|console|smart ?watch|printer|television|tv|monitor|projector|drone|gps|synthesizer|turntable|amplifier|pedal|bluetooth|battery|rechargeable)\b/i.test(t);
    if (PASSIVE_RE.test(String(item && item.title || '')) && !/\b(flash|camcorder|speakers?|headphones?|radio|stereo|laptop|tablet|console|printer|monitor|projector|drone|gps|synthesizer|turntable|amplifier|pedal)\b/i.test(String(item && item.title || ''))) return false;
    return strong || /\belectronics?\b/i.test(t);
  }
  var HINT = 'Powered electronics on Poshmark: reset the device to factory settings and sign out of any personal accounts before shipping (Poshmark policy). Nothing was added to the description.';
  function factoryResetHint(item) { return looksLikePoweredElectronic(item) ? HINT : ''; }
  var api = { looksLikePoweredElectronic: looksLikePoweredElectronic, factoryResetHint: factoryResetHint, HINT: HINT };
  root.FAS_POSH_ELECTRONICS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
