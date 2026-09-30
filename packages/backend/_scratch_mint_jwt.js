const crypto = require('crypto');
function b64url(input) {
  return Buffer.from(JSON.stringify(input)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const secret = '0PKjFmN8usZth9bX64XdjB2u7HQKd2FQfAbCmm5uFMp';
const now = Math.floor(Date.now() / 1000);
const header = { alg: 'HS256', typ: 'JWT' };
const payload = {
  id: 'cmnxueo790003tfv8nx6rlmjt',
  email: 'artifactmi@gmail.com',
  role: 'ORGANIZER',
  roles: ['USER', 'ORGANIZER'],
  tokenVersion: 0,
  organizerTokenVersion: 0,
  iat: now,
  exp: now + 3600,
};
const h = b64url(header);
const p = b64url(payload);
const signingInput = h + '.' + p;
const sig = crypto.createHmac('sha256', secret).update(signingInput).digest('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
console.log(signingInput + '.' + sig);
