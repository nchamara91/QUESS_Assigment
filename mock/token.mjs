// Mints the HS256 bearer tokens the mock and the acceptance script use.
//
//   node mock/token.mjs            → prints all three demo tokens
//   node mock/token.mjs owner-a    → prints one token
//
// The secret is a development constant shared by the mock, the acceptance
// script and your backend (env MOCK_JWT_SECRET / AUTH_HS256_SECRET). There is
// no login flow in this assignment: a client simply presents one of these.
import crypto from 'node:crypto';

export const SECRET = process.env.MOCK_JWT_SECRET || 'assignment-dev-secret';
export const ISSUER = 'assignment-mock';

export const ORG_A = '3f9c2a1e-6b7d-4e8f-9a0b-1c2d3e4f5a61';
export const ORG_B = 'b7e1d4c2-0a9f-4c3b-8d5e-6f7a8b9c0d12';

export const SUBJECTS = {
  'owner-a': { sub: 'idp|owner-a', email: 'owner@acme-robotics.test', orgs: [ORG_A] },
  'owner-b': { sub: 'idp|owner-b', email: 'owner@bluefin-studio.test', orgs: [ORG_B] },
  advisor: { sub: 'idp|advisor', email: 'advisor@ledgerline.test', orgs: [ORG_A, ORG_B] },
};

const b64url = (input) => Buffer.from(input).toString('base64url');

export function mint(name, { exp = Date.UTC(2030, 0, 1) / 1000, iat = Date.UTC(2026, 8, 1) / 1000 } = {}) {
  const subject = SUBJECTS[name];
  if (!subject) throw new Error(`unknown subject ${name}; one of ${Object.keys(SUBJECTS).join(', ')}`);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: ISSUER, ...subject, iat, exp }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verify(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
  if (claims.iss !== ISSUER) return null;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
  if (typeof claims.sub !== 'string' || !Array.isArray(claims.orgs) || claims.orgs.length === 0) return null;
  return claims;
}

if (process.argv[1] && process.argv[1].endsWith('token.mjs')) {
  const names = process.argv.slice(2);
  const list = names.length ? names : Object.keys(SUBJECTS);
  for (const n of list) console.log(names.length === 1 ? mint(n) : `${n}\t${mint(n)}`);
}
