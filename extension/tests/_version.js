'use strict';
// Manifest version checks: a pin means "at least this version", so a version bump does not need every test edited.
function atLeast(v, min) {
  const a = String(v).split('.').map(Number), b = String(min).split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x > y; }
  return true;
}
module.exports = { atLeast };
