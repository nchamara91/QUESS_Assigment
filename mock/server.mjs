// Reference mock for the "Transaction categories" assignment.
//
// Serves, over plain HTTP on :8080 (MOCK_PORT), with no dependencies:
//   • the transactions read surface  — contracts/transactions.public.openapi.yaml
//   • the categories domain          — contracts/transaction-categories.public.openapi.yaml
//     (an in-memory reference implementation: the behaviour your backend must match)
//   • POST /mock/reset (reseed), GET /healthz
//
// Everything lives in memory and is re-seeded deterministically on start, so two
// runs see the same transaction ids. Nothing here is money: it is a stand-in for
// the production feed with the same shapes, enums and error bodies.
//
// Failure injection for client work: send `X-Mock-Delay-Ms: 800` to slow one
// response down, `X-Mock-Fail-Status: 500` to make one request fail.
//
//   node mock/server.mjs              start
//   node mock/server.mjs --dump DIR   write the seeded feed as JSON fixtures and exit
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { verify, mint, ORG_A, ORG_B, SUBJECTS } from './token.mjs';

const PORT = Number(process.env.MOCK_PORT || 8080);
const APP = '/api/v1/app';
const MICRO = 1_000_000; // USDC minor units (6 decimals)
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const CUSTOM_LIMIT = 50;
const LOOKUP_LIMIT = 100;
const TXN_ID = /^txn_[0-9a-f]{32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const uuid = () => crypto.randomUUID();
const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');

// ───────────────────────── deterministic seed ─────────────────────────
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function seededHex(r, n) { let out = ''; for (let i = 0; i < n; i++) out += Math.floor(r() * 16).toString(16); return out; }
function seededUUID(r) {
  const h = seededHex(r, 32).split('');
  h[12] = '4'; h[16] = '89ab'[Math.floor(r() * 4)];
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

const DEPOSIT_SENDERS = [
  { name: 'Acme Robotics Inc', bank_name: 'JPMorgan Chase', bank_routing_number: '021000021' },
  { name: 'Northwind Traders LLC', bank_name: 'Bank of America', bank_routing_number: '026009593' },
  { name: 'Globex Corporation', bank_name: 'Wells Fargo', bank_routing_number: '121000248' },
  { name: 'Initech Ltd', bank_name: 'Citibank', bank_routing_number: '021000089' },
  { name: 'Stark Industries', bank_name: 'U.S. Bank', bank_routing_number: '091000022' },
];
const PAYEES = [
  { name: 'Amazon Web Services', bank_name: 'Wells Fargo', bank_routing_number: '121000248', memo: 'Cloud hosting' },
  { name: 'Gusto Payroll', bank_name: 'Silicon Valley Bank', bank_routing_number: '121140399', memo: 'Payroll run' },
  { name: 'WeWork Inc', bank_name: 'JPMorgan Chase', bank_routing_number: '021000021', memo: 'Office rent' },
  { name: 'Internal Revenue Service', bank_name: 'Federal Reserve', bank_routing_number: '000000518', memo: 'Estimated tax' },
  { name: 'Figma Inc', bank_name: 'Bank of America', bank_routing_number: '026009593', memo: 'Design seats' },
  { name: 'United Airlines', bank_name: 'Citibank', bank_routing_number: '021000089', memo: 'Team travel' },
  { name: 'Slack Technologies', bank_name: 'U.S. Bank', bank_routing_number: '091000022', memo: 'Workspace plan' },
];

const SYSTEM_CATEGORIES = [
  { code: 'income', name: 'Income', color: 'green' },
  { code: 'payroll', name: 'Payroll', color: 'blue' },
  { code: 'suppliers', name: 'Suppliers', color: 'teal' },
  { code: 'taxes', name: 'Taxes', color: 'red' },
  { code: 'fees', name: 'Fees', color: 'amber' },
  { code: 'software', name: 'Software', color: 'purple' },
  { code: 'travel', name: 'Travel', color: 'orange' },
  { code: 'transfer', name: 'Internal transfer', color: 'slate' },
  { code: 'other', name: 'Other', color: 'slate' },
];
const COLORS = new Set(['slate', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'purple']);
const RATES_PER_USD = { USD: 1, USDC: 1, EUR: 0.92, CAD: 1.36 }; // presentation currencies the mock can price
const FIAT_SCALE = { USD: 2, USDC: 6, EUR: 2, CAD: 2 };

const NOW = Date.UTC(2026, 8, 8, 12, 0, 0); // fixed "now" so the seed is stable: 2026-09-08T12:00:00Z

function seedOrg({ id, seed, name, count }) {
  const r = rng(seed);
  const org = {
    id, name,
    account: { account_id: seededUUID(r), name: `${name} · Operating`, currency: 'USDC' },
    wallet: { wallet_id: `wlt_${seededHex(r, 32)}`, name: 'Operating USDC' },
    transactions: [],
    categories: new Map(),
    assignments: new Map(),
    created_at: iso(NOW - 120 * DAY),
  };
  for (const c of SYSTEM_CATEGORIES) {
    const t = org.created_at;
    org.categories.set(seededUUID(r), { kind: 'system', code: c.code, name: c.name, color: c.color, created_at: t, updated_at: t });
  }
  for (let i = 0; i < count; i++) {
    const at = NOW - Math.floor(r() * 90) * DAY - Math.floor(r() * 14 * HOUR);
    const roll = r();
    let t;
    if (roll < 0.42) {
      const s = pick(r, DEPOSIT_SENDERS);
      const rail = r() < 0.7 ? 'ach' : 'wire';
      t = { kind: 'deposit', direction: 'in', amount: 500 + Math.floor(r() * 24000),
        counterparty: { ...s, account_last_four: seededHex(r, 4).replace(/[a-f]/g, (c) => String(c.charCodeAt(0) % 10)), rail,
          description: `${rail.toUpperCase()} credit from ${s.name.toUpperCase()}` },
        reference: `INV-${1000 + Math.floor(r() * 9000)}` };
    } else if (roll < 0.82) {
      const p = pick(r, PAYEES);
      const rail = r() < 0.75 ? 'ach' : 'wire';
      t = { kind: 'withdrawal', direction: 'out', amount: 40 + Math.floor(r() * 9000),
        counterparty: { name: p.name, bank_name: p.bank_name, bank_routing_number: p.bank_routing_number,
          account_last_four: seededHex(r, 4).replace(/[a-f]/g, (c) => String(c.charCodeAt(0) % 10)), rail, description: p.memo },
        reference: `PAY-${100 + Math.floor(r() * 900)}`, fee: 2.5, withdrawal_id: `bwd_${seededHex(r, 32)}` };
    } else {
      t = { kind: 'receive', direction: 'in', amount: 10 + Math.floor(r() * 1500), counterparty: null, reference: null };
    }
    const sr = r();
    const status = sr < 0.86 ? 'confirmed' : sr < 0.95 ? 'pending' : 'failed';
    const amount_minor = Math.round(t.amount * MICRO);
    org.transactions.push({
      transaction_id: `txn_${seededHex(r, 32)}`,
      account_id: org.account.account_id,
      wallet_id: org.wallet.wallet_id,
      kind: t.kind,
      direction: t.direction,
      status,
      amount_minor,
      asset: 'USDC',
      counterparty_name: t.counterparty ? t.counterparty.name : null,
      counterparty: t.counterparty,
      recipient_context: { can_save: status === 'confirmed' && t.direction === 'in' && t.counterparty !== null, recipient_id: null },
      reference: t.reference,
      fee_amount_minor: t.fee ? Math.round(t.fee * MICRO) : null,
      source_wallet_id: null,
      destination_wallet_id: null,
      source_wallet_name: null,
      destination_wallet_name: null,
      transfer_id: null,
      withdrawal_id: t.withdrawal_id ?? null,
      failure_code: status === 'failed' ? (t.kind === 'withdrawal' ? 'insufficient_funds' : 'provider_rejected') : null,
      created_at: iso(at),
      updated_at: iso(at + (status === 'pending' ? 0 : 7 * MIN)),
    });
  }
  org.transactions.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return org;
}

const state = { orgs: new Map() };
function reseed() {
  state.orgs.clear();
  state.orgs.set(ORG_A, seedOrg({ id: ORG_A, seed: 20260908, name: 'Acme Robotics', count: 140 }));
  state.orgs.set(ORG_B, seedOrg({ id: ORG_B, seed: 424242, name: 'Bluefin Studio', count: 36 }));
}
reseed();

// ───────────────────────── response helpers ─────────────────────────
const validationError = (fields) => ({ status: 422, body: { type: 'ValidationError', correlation_id: uuid(), error: fields } });
const issue = (code, message, data) => ({ code, message, ...(data ? { data } : {}) });
const domainError = (status, code, message, data) => ({
  status, body: { type: status >= 500 ? 'server_error' : 'client_error', correlation_id: uuid(), error: { code, message, ...(data ? { data } : {}) } },
});
const ok = (data, status = 200) => ({ status, body: { data, correlation_id: uuid() } });
const noContent = () => ({ status: 204, body: null });

function categoryView(id, c) {
  return { category_id: id, kind: c.kind, code: c.code, name: c.name, color: c.color, created_at: c.created_at, updated_at: c.updated_at };
}
function sortedCategories(org) {
  const order = new Map(SYSTEM_CATEGORIES.map((c, i) => [c.code, i]));
  return [...org.categories.entries()]
    .map(([id, c]) => categoryView(id, c))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'system' ? -1 : 1;
      if (a.kind === 'system') return order.get(a.code) - order.get(b.code);
      const n = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
      return n !== 0 ? n : a.created_at.localeCompare(b.created_at);
    });
}
const fold = (s) => s.normalize('NFKC').toLowerCase();
function nameConflict(org, name, exceptId) {
  const f = fold(name);
  for (const [id, c] of org.categories) if (id !== exceptId && fold(c.name) === f) return id;
  return null;
}
function validateName(name, fields, required) {
  if (name === undefined) { if (required) fields.name = [issue('required', 'name is required')]; return undefined; }
  if (typeof name !== 'string') { fields.name = [issue('invalid_format', 'name must be a string')]; return undefined; }
  const trimmed = name.trim();
  if (!trimmed) { fields.name = [issue('blank', 'name must not be blank')]; return undefined; }
  if ([...trimmed].length > 40) { fields.name = [issue('too_long', 'name must be at most 40 characters', { max_length: 40 })]; return undefined; }
  return trimmed;
}
function validateColor(color, fields, required) {
  if (color === undefined) { if (required) fields.color = [issue('required', 'color is required')]; return undefined; }
  if (typeof color !== 'string' || !COLORS.has(color)) { fields.color = [issue('invalid_choice', `color must be one of ${[...COLORS].join(', ')}`, { choices: [...COLORS] })]; return undefined; }
  return color;
}

// ───────────────────────── transactions ─────────────────────────
function listTransactions(org, q) {
  const fields = {};
  const page = q.get('page') ?? '1', size = q.get('page_size') ?? '20';
  if (!/^\d+$/.test(page) || Number(page) < 1) fields.page = [issue('invalid_format', 'page must be an integer ≥ 1')];
  if (!/^\d+$/.test(size) || Number(size) < 1 || Number(size) > 100) fields.page_size = [issue('invalid_format', 'page_size must be an integer between 1 and 100')];
  const kind = q.get('kind');
  if (kind !== null && !['deposit', 'transfer', 'withdrawal', 'receive'].includes(kind)) fields.kind = [issue('invalid_choice', 'unknown kind')];
  const statuses = q.getAll('status');
  if (statuses.some((s) => !['initiated', 'pending', 'confirmed', 'failed'].includes(s))) fields.status = [issue('invalid_choice', 'unknown status')];
  const sortOrder = q.get('sort_order') ?? 'desc';
  if (!['asc', 'desc'].includes(sortOrder)) fields.sort_order = [issue('invalid_choice', 'sort_order must be asc or desc')];
  const accountId = q.get('account_id');
  if (accountId !== null && !UUID.test(accountId)) fields.account_id = [issue('invalid_format', 'account_id must be a UUID')];
  const walletId = q.get('wallet_id');
  if (walletId !== null && !/^wlt_[0-9a-f]{32}$/.test(walletId)) fields.wallet_id = [issue('invalid_format', 'wallet_id must match ^wlt_[0-9a-f]{32}$')];
  const dateFrom = q.get('date_from'), dateTo = q.get('date_to');
  for (const [k, v] of [['date_from', dateFrom], ['date_to', dateTo]]) {
    if (v !== null && (!RFC3339_WITH_OFFSET.test(v) || Number.isNaN(Date.parse(v)))) fields[k] = [issue('invalid_format', `${k} must be RFC 3339 with a time-zone offset`)];
  }
  if (!fields.date_from && !fields.date_to && dateFrom && dateTo && Date.parse(dateFrom) > Date.parse(dateTo)) fields.date_from = [issue('invalid_format', 'date_from must be less than or equal to date_to')];
  const minS = q.get('amount_min_minor'), maxS = q.get('amount_max_minor');
  for (const [k, v] of [['amount_min_minor', minS], ['amount_max_minor', maxS]]) if (v !== null && !/^\d+$/.test(v)) fields[k] = [issue('invalid_format', `${k} must be an integer ≥ 0`)];
  if (!fields.amount_min_minor && !fields.amount_max_minor && minS !== null && maxS !== null && Number(minS) > Number(maxS)) fields.amount_min_minor = [issue('invalid_format', 'amount_min_minor must be less than or equal to amount_max_minor')];
  const pcRaw = q.get('presentation_currency');
  const pc = pcRaw === null ? null : pcRaw.toUpperCase();
  if (pc !== null && !(pc in RATES_PER_USD)) fields.presentation_currency = [issue('invalid_choice', `presentation_currency ${pcRaw} has no known minor-unit scale, so an amount range cannot be read in it`)];
  if (Object.keys(fields).length) return validationError(fields);

  let items = org.transactions;
  if (accountId) items = items.filter((t) => t.account_id === accountId);
  if (walletId) items = items.filter((t) => t.wallet_id === walletId);
  if (kind) items = items.filter((t) => t.kind === kind);
  if (statuses.length) items = items.filter((t) => statuses.includes(t.status));
  if (dateFrom) { const f = Date.parse(dateFrom); items = items.filter((t) => Date.parse(t.created_at) >= f); }
  if (dateTo) { const to = Date.parse(dateTo); items = items.filter((t) => Date.parse(t.created_at) <= to); }
  const search = q.get('search');
  if (search) { const s = search.toLowerCase(); items = items.filter((t) => [t.transaction_id, t.reference ?? '', t.wallet_id].some((v) => v.toLowerCase().includes(s))); }
  let amountFilter = null;
  if (pc !== null) {
    const rate = RATES_PER_USD[pc], scale = FIAT_SCALE[pc];
    const valued = (t) => Math.round((t.amount_minor / MICRO) * rate * 10 ** scale);
    if (minS !== null) items = items.filter((t) => valued(t) >= Number(minS));
    if (maxS !== null) items = items.filter((t) => valued(t) <= Number(maxS));
    amountFilter = { currency: pc, as_of: pc === 'USD' || pc === 'USDC' ? null : iso(NOW - 25 * MIN), stale: false, unpriced_currencies: [] };
  } else {
    if (minS !== null) items = items.filter((t) => t.amount_minor >= Number(minS));
    if (maxS !== null) items = items.filter((t) => t.amount_minor <= Number(maxS));
  }
  if (sortOrder === 'asc') items = [...items].reverse();
  const p = Number(page), s = Number(size);
  const data = { items: items.slice((p - 1) * s, p * s), page: { page: p, page_size: s, total: items.length, has_more: p * s < items.length } };
  if (pcRaw !== null) data.amount_filter = amountFilter;
  return ok(data);
}

// ───────────────────────── routes ─────────────────────────
const routes = [];
function route(method, pattern, handler, { auth = true } = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler, auth });
}

route('GET', '/healthz', () => ok({ status: 'ok' }), { auth: false });
route('POST', '/mock/reset', () => { reseed(); return ok({ reseeded: true }); }, { auth: false });

route('GET', `${APP}/transactions`, ({ org, q }) => listTransactions(org, q));
route('GET', `${APP}/transactions/:transaction_id`, ({ org, params }) => {
  if (!TXN_ID.test(params.transaction_id)) return validationError({ transaction_id: [issue('invalid_format', 'transaction_id must match ^txn_[0-9a-f]{32}$')] });
  const t = org.transactions.find((x) => x.transaction_id === params.transaction_id);
  return t ? ok(t) : domainError(404, 'transaction_not_found', 'Unknown transaction.');
});

route('GET', `${APP}/transaction-categories`, ({ org }) => ok({ items: sortedCategories(org) }));

route('POST', `${APP}/transaction-categories`, ({ org, body }) => {
  const fields = {};
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const name = validateName(src.name, fields, true);
  const color = validateColor(src.color, fields, true);
  for (const k of Object.keys(src)) if (!['name', 'color'].includes(k)) fields[k] = [issue('invalid_format', 'unknown field')];
  if (Object.keys(fields).length) return validationError(fields);
  const holder = nameConflict(org, name, null);
  if (holder) return domainError(409, 'transaction_category_name_taken', `A category named "${org.categories.get(holder).name}" already exists.`, { category_id: holder });
  const customCount = [...org.categories.values()].filter((c) => c.kind === 'custom').length;
  if (customCount >= CUSTOM_LIMIT) return domainError(409, 'transaction_category_limit_reached', `An organisation may have at most ${CUSTOM_LIMIT} custom categories.`, { limit: CUSTOM_LIMIT });
  const id = uuid(), t = iso(Date.now());
  org.categories.set(id, { kind: 'custom', code: null, name, color, created_at: t, updated_at: t });
  return ok(categoryView(id, org.categories.get(id)), 201);
});

route('PATCH', `${APP}/transaction-categories/:category_id`, ({ org, params, body }) => {
  if (!UUID.test(params.category_id)) return validationError({ category_id: [issue('invalid_format', 'category_id must be a UUID')] });
  const c = org.categories.get(params.category_id);
  if (!c) return domainError(404, 'transaction_category_not_found', 'Unknown category.');
  const fields = {};
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const name = validateName(src.name, fields, false);
  const color = validateColor(src.color, fields, false);
  for (const k of Object.keys(src)) if (!['name', 'color'].includes(k)) fields[k] = [issue('invalid_format', 'unknown field')];
  if (!Object.keys(fields).length && name === undefined && color === undefined) fields.non_field_errors = [issue('empty', 'at least one of name, color is required')];
  if (Object.keys(fields).length) return validationError(fields);
  if (c.kind === 'system') return domainError(409, 'system_category_immutable', 'System categories cannot be changed.');
  if (name !== undefined) {
    const holder = nameConflict(org, name, params.category_id);
    if (holder) return domainError(409, 'transaction_category_name_taken', `A category named "${org.categories.get(holder).name}" already exists.`, { category_id: holder });
    c.name = name;
  }
  if (color !== undefined) c.color = color;
  c.updated_at = iso(Date.now());
  return ok(categoryView(params.category_id, c));
});

route('DELETE', `${APP}/transaction-categories/:category_id`, ({ org, params }) => {
  if (!UUID.test(params.category_id)) return validationError({ category_id: [issue('invalid_format', 'category_id must be a UUID')] });
  const c = org.categories.get(params.category_id);
  if (!c) return domainError(404, 'transaction_category_not_found', 'Unknown category.');
  if (c.kind === 'system') return domainError(409, 'system_category_immutable', 'System categories cannot be deleted.');
  org.categories.delete(params.category_id);
  for (const [txn, a] of org.assignments) if (a.category_id === params.category_id) org.assignments.delete(txn);
  return noContent();
});

const assignmentView = (txn, a) => ({ transaction_id: txn, category_id: a?.category_id ?? null, assigned_at: a?.assigned_at ?? null, assigned_by: a?.assigned_by ?? null });

route('PUT', `${APP}/transactions/:transaction_id/category`, ({ org, params, body, claims }) => {
  const fields = {};
  if (!TXN_ID.test(params.transaction_id)) fields.transaction_id = [issue('invalid_format', 'transaction_id must match ^txn_[0-9a-f]{32}$')];
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  if (!src || !('category_id' in src)) fields.category_id = [issue('required', 'category_id is required (null clears the category)')];
  else if (src.category_id !== null && (typeof src.category_id !== 'string' || !UUID.test(src.category_id))) fields.category_id = [issue('invalid_format', 'category_id must be a UUID or null')];
  if (src) for (const k of Object.keys(src)) if (k !== 'category_id') fields[k] = [issue('invalid_format', 'unknown field')];
  if (Object.keys(fields).length) return validationError(fields);
  // The reference implementation is co-located with the feed; your backend must ask
  // GET /api/v1/app/transactions/{transaction_id} with the caller's bearer instead.
  if (!org.transactions.some((t) => t.transaction_id === params.transaction_id)) return domainError(404, 'transaction_not_found', 'Unknown transaction.');
  if (src.category_id === null) {
    org.assignments.delete(params.transaction_id);
    return ok(assignmentView(params.transaction_id, null));
  }
  if (!org.categories.has(src.category_id)) return domainError(404, 'transaction_category_not_found', 'Unknown category.');
  const current = org.assignments.get(params.transaction_id);
  const next = current && current.category_id === src.category_id ? current : { category_id: src.category_id, assigned_at: iso(Date.now()), assigned_by: claims.sub };
  org.assignments.set(params.transaction_id, next);
  return ok(assignmentView(params.transaction_id, next));
});

route('GET', `${APP}/transaction-category-assignments`, ({ org, q }) => {
  const ids = q.getAll('transaction_id');
  if (ids.length === 0) return validationError({ transaction_id: [issue('required', 'at least one transaction_id is required')] });
  if (ids.length > LOOKUP_LIMIT) return validationError({ transaction_id: [issue('too_many_items', `at most ${LOOKUP_LIMIT} transaction ids per request`, { max_items: LOOKUP_LIMIT })] });
  const bad = ids.find((id) => !TXN_ID.test(id));
  if (bad) return validationError({ transaction_id: [issue('invalid_format', `${bad} does not match ^txn_[0-9a-f]{32}$`)] });
  const distinct = [...new Set(ids)];
  return ok({ items: distinct.map((id) => assignmentView(id, org.assignments.get(id) ?? null)) });
});

// ───────────────────────── HTTP layer ─────────────────────────
const CORS = (req) => {
  const origin = req.headers.origin;
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Organization-Id, X-Mock-Delay-Ms, X-Mock-Fail-Status',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Correlation-Id',
    Vary: 'Origin',
  };
};

function resolveOrg(claims, headerValue) {
  if (headerValue === undefined) return { org: state.orgs.get(claims.orgs[0]) ?? null };
  if (!UUID.test(headerValue)) return { error: domainError(400, 'validation_error', 'X-Organization-Id must be a UUID.') };
  if (!claims.orgs.includes(headerValue) || !state.orgs.has(headerValue)) return { error: domainError(403, 'organization_context_forbidden', 'No active membership in the requested organization.') };
  return { org: state.orgs.get(headerValue) };
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = ({ status, body }, extra = {}) => {
    const data = body === null ? '' : JSON.stringify(body);
    const headers = { 'X-Correlation-Id': body?.correlation_id ?? uuid(), ...CORS(req), ...extra };
    if (body !== null) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    res.writeHead(status, headers);
    res.end(data);
    console.log(`${new Date().toISOString()} ${status} ${req.method} ${url.pathname}${url.search} ${Date.now() - started}ms`);
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS(req)); res.end(); return; }

  const delay = Number(req.headers['x-mock-delay-ms'] || 0);
  if (delay > 0) await new Promise((r) => setTimeout(r, Math.min(delay, 10_000)));
  const failStatus = Number(req.headers['x-mock-fail-status'] || 0);
  if (failStatus >= 400) return send(domainError(failStatus, 'mock_failure', `Failed on request because X-Mock-Fail-Status: ${failStatus}.`));

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  let body = null, bodyInvalid = false;
  if (raw.length) {
    if (!/json/.test(req.headers['content-type'] || '')) bodyInvalid = true;
    else { try { body = JSON.parse(raw.toString()); } catch { bodyInvalid = true; } }
  }
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const ctx = { req, url, q: url.searchParams, params, body, claims: null, org: null };
      if (r.auth) {
        const auth = req.headers.authorization || '';
        const claims = auth.startsWith('Bearer ') ? verify(auth.slice(7)) : null;
        if (!claims) return send(domainError(401, 'unauthorized', 'Access token is missing, expired or invalid.'));
        const resolved = resolveOrg(claims, req.headers['x-organization-id']);
        if (resolved.error) return send(resolved.error);
        if (!resolved.org) return send(domainError(403, 'organization_context_forbidden', 'No active membership.'));
        ctx.claims = claims; ctx.org = resolved.org;
      }
      if (bodyInvalid) return send(validationError({ non_field_errors: [issue('invalid_format', 'body must be application/json')] }));
      return send(await r.handler(ctx));
    }
    const known = routes.some((r) => url.pathname.match(r.re));
    return send(known ? domainError(405, 'method_not_allowed', `${req.method} is not allowed on ${url.pathname}.`) : domainError(404, 'not_found', `Mock has no route for ${req.method} ${url.pathname}.`));
  } catch (e) {
    console.error('handler crashed', req.method, url.pathname, e);
    return send(domainError(500, 'internal_error', 'Mock handler crashed.'));
  }
});

// ───────────────────────── entrypoint ─────────────────────────
const dumpIdx = process.argv.indexOf('--dump');
if (dumpIdx !== -1) {
  const dir = process.argv[dumpIdx + 1] || 'fixtures';
  fs.mkdirSync(dir, { recursive: true });
  for (const [id, org] of state.orgs) {
    const slug = id === ORG_A ? 'org-a' : 'org-b';
    fs.writeFileSync(path.join(dir, `transactions.${slug}.json`), JSON.stringify({ organization_id: id, organization_name: org.name, account: org.account, wallet: org.wallet, transactions: org.transactions }, null, 2));
    fs.writeFileSync(path.join(dir, `categories.${slug}.system.json`), JSON.stringify({ organization_id: id, items: sortedCategories(org) }, null, 2));
  }
  fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify(Object.fromEntries(Object.keys(SUBJECTS).map((n) => [n, { ...SUBJECTS[n], token: mint(n) }])), null, 2));
  console.log(`fixtures written to ${dir}`);
} else {
  server.listen(PORT, () => {
    console.log(`mock listening on http://localhost:${PORT}`);
    console.log(`organisations: A=${ORG_A} (${state.orgs.get(ORG_A).transactions.length} txns)  B=${ORG_B} (${state.orgs.get(ORG_B).transactions.length} txns)`);
    console.log('tokens: node mock/token.mjs');
  });
}
