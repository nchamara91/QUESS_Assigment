// Acceptance run for the categories backend.
//
//   node acceptance/run.mjs                                   # against the reference mock, both APIs on :8080
//   CATEGORIES_URL=http://localhost:8081 node acceptance/run.mjs
//
// Environment:
//   TRANSACTIONS_URL  base URL of the transactions API (default http://localhost:8080)
//   CATEGORIES_URL    base URL of the categories API under test (default = TRANSACTIONS_URL)
//   MOCK_JWT_SECRET   the shared HS256 secret (default is the one in mock/token.mjs)
//
// The run is self-cleaning: every custom category it creates it deletes at the end,
// and every assignment it makes it clears, so it can be repeated against the same
// database. It exits 0 only when every check passes; the report names each failure.
import { mint, ORG_A, ORG_B, SUBJECTS } from '../mock/token.mjs';

const TX = (process.env.TRANSACTIONS_URL || 'http://localhost:8080').replace(/\/$/, '');
const CAT = (process.env.CATEGORIES_URL || TX).replace(/\/$/, '');
const APP = '/api/v1/app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const SYSTEM = ['income', 'payroll', 'suppliers', 'taxes', 'fees', 'software', 'travel', 'transfer', 'other'];

const tokens = { a: mint('owner-a'), b: mint('owner-b'), both: mint('advisor') };
const results = [];
let current = null;
const cleanup = [];

function check(name, cond, detail) {
  results.push({ group: current, name, ok: Boolean(cond), detail: cond ? undefined : detail });
}
async function call(base, method, path, { token = tokens.a, org, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (org) h['X-Organization-Id'] = org;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json, text, headers: res.headers };
}
const cat = (method, path, opts) => call(CAT, method, path, opts);
const tx = (method, path, opts) => call(TX, method, path, opts);

const isEnvelope = (r) => r.json && typeof r.json === 'object' && 'data' in r.json && UUID.test(r.json.correlation_id || '');
const isDomainError = (r, code) => r.json && typeof r.json.type === 'string' && UUID.test(r.json.correlation_id || '') && r.json.error && r.json.error.code === code && typeof r.json.error.message === 'string';
const isValidation = (r, field, code) => r.json && r.json.type === 'ValidationError' && UUID.test(r.json.correlation_id || '') && Array.isArray(r.json.error?.[field]) && (code === undefined || r.json.error[field].some((i) => i.code === code));
const brief = (r) => `${r.status} ${r.text.slice(0, 220)}`;
const isCategory = (c) => c && UUID.test(c.category_id) && ['system', 'custom'].includes(c.kind) && (c.code === null || /^[a-z_]{2,32}$/.test(c.code)) && typeof c.name === 'string' && typeof c.color === 'string' && ISO.test(c.created_at) && ISO.test(c.updated_at) && Object.keys(c).length === 7;
const isAssignment = (a) => a && /^txn_[0-9a-f]{32}$/.test(a.transaction_id) && (a.category_id === null || UUID.test(a.category_id)) && (a.assigned_at === null || ISO.test(a.assigned_at)) && (a.assigned_by === null || typeof a.assigned_by === 'string') && Object.keys(a).length === 4;

async function main() {
  // ── 0. preconditions
  current = 'preconditions';
  const feed = await tx('GET', `${APP}/transactions?page_size=5`);
  check('transactions API answers the feed for org A', feed.status === 200 && isEnvelope(feed) && feed.json.data.items.length >= 2, brief(feed));
  if (!(feed.status === 200 && feed.json?.data?.items?.length >= 2)) return report();
  const [t1, t2] = feed.json.data.items.map((t) => t.transaction_id);
  const feedB = await tx('GET', `${APP}/transactions?page_size=1`, { token: tokens.b });
  check('transactions API answers the feed for org B', feedB.status === 200 && feedB.json.data.items.length >= 1, brief(feedB));
  const tB = feedB.json?.data?.items?.[0]?.transaction_id;

  // ── 1. auth and organisation context
  current = 'auth';
  let r = await cat('GET', `${APP}/transaction-categories`, { token: null });
  check('no bearer → 401 unauthorized', r.status === 401 && isDomainError(r, 'unauthorized'), brief(r));
  r = await cat('GET', `${APP}/transaction-categories`, { token: tokens.a.slice(0, -3) + 'abc' });
  check('bad signature → 401 unauthorized', r.status === 401 && isDomainError(r, 'unauthorized'), brief(r));
  r = await cat('GET', `${APP}/transaction-categories`, { token: mint('owner-a', { exp: Date.UTC(2020, 0, 1) / 1000 }) });
  check('expired token → 401 unauthorized', r.status === 401 && isDomainError(r, 'unauthorized'), brief(r));
  r = await cat('GET', `${APP}/transaction-categories`, { token: tokens.a, org: ORG_B });
  check('X-Organization-Id of a foreign organisation → 403 organization_context_forbidden', r.status === 403 && isDomainError(r, 'organization_context_forbidden'), brief(r));
  r = await cat('GET', `${APP}/transaction-categories`, { token: tokens.a, org: 'not-a-uuid' });
  check('malformed X-Organization-Id → 400 validation_error', r.status === 400 && isDomainError(r, 'validation_error'), brief(r));
  r = await cat('GET', `${APP}/transaction-categories`, { token: tokens.both, org: ORG_B });
  check('member of both organisations can act in B by header', r.status === 200 && isEnvelope(r), brief(r));

  // ── 2. system categories
  current = 'system categories';
  r = await cat('GET', `${APP}/transaction-categories`);
  const list = r.json?.data?.items ?? [];
  check('list answers 200 with an envelope', r.status === 200 && isEnvelope(r), brief(r));
  check('every item matches TransactionCategory (7 fields, no extras)', list.length > 0 && list.every(isCategory), JSON.stringify(list[0]));
  const systemCodes = list.filter((c) => c.kind === 'system').map((c) => c.code);
  check('nine system categories, canonical order and codes', JSON.stringify(systemCodes) === JSON.stringify(SYSTEM), JSON.stringify(systemCodes));
  check('system names are the canonical ones', list.filter((c) => c.kind === 'system').map((c) => c.name).join('|') === 'Income|Payroll|Suppliers|Taxes|Fees|Software|Travel|Internal transfer|Other', list.map((c) => c.name).join('|'));
  const rB = await cat('GET', `${APP}/transaction-categories`, { token: tokens.b });
  const idsA = new Set(list.map((c) => c.category_id));
  check('organisation B has its own system category ids', rB.status === 200 && rB.json.data.items.filter((c) => c.kind === 'system').every((c) => !idsA.has(c.category_id)), brief(rB));
  const taxesA = list.find((c) => c.code === 'taxes');
  const payrollA = list.find((c) => c.code === 'payroll');

  // ── 3. create
  current = 'create';
  const stamp = Date.now().toString(36);
  const nameA = `Acceptance ${stamp}`;
  r = await cat('POST', `${APP}/transaction-categories`, { body: { name: `  ${nameA}  `, color: 'purple' } });
  const created = r.json?.data;
  check('create → 201 with the category', r.status === 201 && isEnvelope(r) && isCategory(created), brief(r));
  check('name is stored trimmed', created?.name === nameA, created?.name);
  check('created category is custom with code null', created?.kind === 'custom' && created?.code === null, JSON.stringify(created));
  if (created?.category_id) cleanup.push(created.category_id);
  r = await cat('POST', `${APP}/transaction-categories`, { body: { name: nameA.toUpperCase(), color: 'blue' } });
  check('duplicate name (different case) → 409 transaction_category_name_taken with data.category_id', r.status === 409 && isDomainError(r, 'transaction_category_name_taken') && r.json.error.data?.category_id === created?.category_id, brief(r));
  r = await cat('POST', `${APP}/transaction-categories`, { body: { name: 'taxes', color: 'blue' } });
  check('name of a system category → 409 transaction_category_name_taken', r.status === 409 && isDomainError(r, 'transaction_category_name_taken'), brief(r));
  r = await cat('POST', `${APP}/transaction-categories`, { body: { name: '   ', color: 'blue' } });
  check('blank name → 422 name:blank', r.status === 422 && isValidation(r, 'name', 'blank'), brief(r));
  r = await cat('POST', `${APP}/transaction-categories`, { body: { name: 'x'.repeat(41), color: 'blue' } });
  check('41-char name → 422 name:too_long', r.status === 422 && isValidation(r, 'name', 'too_long'), brief(r));
  r = await cat('POST', `${APP}/transaction-categories`, { body: { name: `Colour ${stamp}`, color: 'magenta' } });
  check('unknown color → 422 color:invalid_choice', r.status === 422 && isValidation(r, 'color', 'invalid_choice'), brief(r));
  r = await cat('POST', `${APP}/transaction-categories`, { body: { color: 'blue' } });
  check('missing name → 422 name:required', r.status === 422 && isValidation(r, 'name', 'required'), brief(r));
  r = await cat('POST', `${APP}/transaction-categories`, { body: { name: `Extra ${stamp}`, color: 'blue', kind: 'system' } });
  check('unknown body field → 422 on that field', r.status === 422 && isValidation(r, 'kind'), brief(r));
  r = await cat('POST', `${APP}/transaction-categories`, { body: { name: `Unicode ${stamp} Zürich`, color: 'teal' } });
  check('unicode name is accepted', r.status === 201, brief(r));
  if (r.json?.data?.category_id) cleanup.push(r.json.data.category_id);
  r = await cat('POST', `${APP}/transaction-categories`, { body: { name: `unicode ${stamp} ZÜRICH`, color: 'teal' } });
  check('unicode case-insensitive duplicate → 409', r.status === 409 && isDomainError(r, 'transaction_category_name_taken'), brief(r));
  r = await cat('GET', `${APP}/transaction-categories`);
  const after = r.json?.data?.items ?? [];
  const customNames = after.filter((c) => c.kind === 'custom').map((c) => c.name);
  check('custom categories are listed after system ones, sorted by name', after.findIndex((c) => c.kind === 'custom') >= 9 && JSON.stringify(customNames) === JSON.stringify([...customNames].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' }))), JSON.stringify(customNames));
  const listB = await cat('GET', `${APP}/transaction-categories`, { token: tokens.b });
  check('organisation B does not see A\'s custom category', listB.status === 200 && !listB.json.data.items.some((c) => c.category_id === created?.category_id), brief(listB));

  // ── 4. update
  current = 'update';
  const renamed = `Renamed ${stamp}`;
  r = await cat('PATCH', `${APP}/transaction-categories/${created?.category_id}`, { body: { name: renamed } });
  check('rename → 200 with new name, color untouched', r.status === 200 && r.json?.data?.name === renamed && r.json.data.color === 'purple', brief(r));
  check('updated_at moved forward or equal', r.json?.data && r.json.data.updated_at >= created.updated_at, `${created?.updated_at} → ${r.json?.data?.updated_at}`);
  r = await cat('PATCH', `${APP}/transaction-categories/${created?.category_id}`, { body: { name: renamed, color: 'red' } });
  check('keeping own name while recolouring is allowed', r.status === 200 && r.json?.data?.color === 'red', brief(r));
  r = await cat('PATCH', `${APP}/transaction-categories/${created?.category_id}`, { body: {} });
  check('empty patch → 422 non_field_errors:empty', r.status === 422 && isValidation(r, 'non_field_errors', 'empty'), brief(r));
  r = await cat('PATCH', `${APP}/transaction-categories/${created?.category_id}`, { body: { name: 'Taxes' } });
  check('rename onto a system name → 409 transaction_category_name_taken', r.status === 409 && isDomainError(r, 'transaction_category_name_taken'), brief(r));
  r = await cat('PATCH', `${APP}/transaction-categories/${taxesA?.category_id}`, { body: { name: 'Tax' } });
  check('patch system category → 409 system_category_immutable', r.status === 409 && isDomainError(r, 'system_category_immutable'), brief(r));
  r = await cat('PATCH', `${APP}/transaction-categories/${crypto.randomUUID()}`, { body: { name: 'Ghost' } });
  check('patch unknown id → 404 transaction_category_not_found', r.status === 404 && isDomainError(r, 'transaction_category_not_found'), brief(r));
  r = await cat('PATCH', `${APP}/transaction-categories/${created?.category_id}`, { token: tokens.b, body: { name: 'Hijack' } });
  check('patch from another organisation → 404 (no existence leak)', r.status === 404 && isDomainError(r, 'transaction_category_not_found'), brief(r));
  r = await cat('PATCH', `${APP}/transaction-categories/not-a-uuid`, { body: { name: 'X' } });
  check('malformed category_id → 422 category_id:invalid_format', r.status === 422 && isValidation(r, 'category_id', 'invalid_format'), brief(r));

  // ── 5. assign
  current = 'assign';
  r = await cat('PUT', `${APP}/transactions/${t1}/category`, { body: { category_id: created?.category_id } });
  const a1 = r.json?.data;
  check('assign custom category → 200 with assignment', r.status === 200 && isEnvelope(r) && isAssignment(a1) && a1.category_id === created?.category_id, brief(r));
  check('assigned_by is the bearer subject', a1?.assigned_by === SUBJECTS['owner-a'].sub, a1?.assigned_by);
  check('assigned_at is set', a1 && ISO.test(a1.assigned_at || ''), a1?.assigned_at);
  r = await cat('PUT', `${APP}/transactions/${t1}/category`, { body: { category_id: created?.category_id } });
  check('same body again → 200, assigned_at unchanged (idempotent)', r.status === 200 && r.json?.data?.assigned_at === a1?.assigned_at, brief(r));
  r = await cat('PUT', `${APP}/transactions/${t1}/category`, { token: tokens.both, body: { category_id: payrollA?.category_id } });
  check('re-assign by another member → assigned_by changes', r.status === 200 && r.json?.data?.category_id === payrollA?.category_id && r.json.data.assigned_by === SUBJECTS.advisor.sub, brief(r));
  r = await cat('PUT', `${APP}/transactions/${t2}/category`, { body: { category_id: taxesA?.category_id } });
  check('assign a system category → 200', r.status === 200 && r.json?.data?.category_id === taxesA?.category_id, brief(r));
  r = await cat('PUT', `${APP}/transactions/txn_${'0'.repeat(32)}/category`, { body: { category_id: taxesA?.category_id } });
  check('unknown transaction → 404 transaction_not_found', r.status === 404 && isDomainError(r, 'transaction_not_found'), brief(r));
  if (tB) {
    r = await cat('PUT', `${APP}/transactions/${tB}/category`, { body: { category_id: taxesA?.category_id } });
    check('transaction of organisation B, acting in A → 404 transaction_not_found', r.status === 404 && isDomainError(r, 'transaction_not_found'), brief(r));
  }
  const taxesB = listB.json?.data?.items?.find((c) => c.code === 'taxes');
  r = await cat('PUT', `${APP}/transactions/${t1}/category`, { body: { category_id: taxesB?.category_id } });
  check('category of organisation B, acting in A → 404 transaction_category_not_found', r.status === 404 && isDomainError(r, 'transaction_category_not_found'), brief(r));
  r = await cat('PUT', `${APP}/transactions/${t1}/category`, { body: {} });
  check('body without category_id → 422 category_id:required', r.status === 422 && isValidation(r, 'category_id', 'required'), brief(r));
  r = await cat('PUT', `${APP}/transactions/${t1}/category`, { body: { category_id: 'nope' } });
  check('malformed category_id → 422 category_id:invalid_format', r.status === 422 && isValidation(r, 'category_id', 'invalid_format'), brief(r));
  r = await cat('PUT', `${APP}/transactions/bad-id/category`, { body: { category_id: null } });
  check('malformed transaction_id → 422 transaction_id:invalid_format', r.status === 422 && isValidation(r, 'transaction_id', 'invalid_format'), brief(r));

  // ── 6. lookup
  current = 'lookup';
  const unknownId = `txn_${'f'.repeat(32)}`;
  r = await cat('GET', `${APP}/transaction-category-assignments?transaction_id=${t2}&transaction_id=${t1}&transaction_id=${unknownId}&transaction_id=${t1}`);
  const items = r.json?.data?.items ?? [];
  check('lookup → 200 with one item per distinct id, in first-requested order', r.status === 200 && isEnvelope(r) && items.map((i) => i.transaction_id).join(',') === [t2, t1, unknownId].join(','), brief(r));
  check('every item matches TransactionCategoryAssignment', items.length === 3 && items.every(isAssignment), JSON.stringify(items));
  check('assigned ids carry their category, unknown id reads as unassigned', items[0]?.category_id === taxesA?.category_id && items[1]?.category_id === payrollA?.category_id && items[2]?.category_id === null && items[2]?.assigned_at === null && items[2]?.assigned_by === null, JSON.stringify(items));
  r = await cat('GET', `${APP}/transaction-category-assignments?transaction_id=${t1}`, { token: tokens.b });
  check('organisation B reads A\'s assignment as unassigned', r.status === 200 && r.json?.data?.items?.[0]?.category_id === null, brief(r));
  r = await cat('GET', `${APP}/transaction-category-assignments`);
  check('no ids → 422 transaction_id:required', r.status === 422 && isValidation(r, 'transaction_id', 'required'), brief(r));
  r = await cat('GET', `${APP}/transaction-category-assignments?${Array.from({ length: 101 }, (_, i) => `transaction_id=txn_${i.toString(16).padStart(32, '0')}`).join('&')}`);
  check('101 ids → 422 transaction_id:too_many_items', r.status === 422 && isValidation(r, 'transaction_id', 'too_many_items'), brief(r));
  r = await cat('GET', `${APP}/transaction-category-assignments?${Array.from({ length: 100 }, (_, i) => `transaction_id=txn_${i.toString(16).padStart(32, '0')}`).join('&')}`);
  check('100 ids → 200 with 100 items', r.status === 200 && r.json?.data?.items?.length === 100, brief(r));
  r = await cat('GET', `${APP}/transaction-category-assignments?transaction_id=${t1}&transaction_id=oops`);
  check('malformed id in the batch → 422 transaction_id:invalid_format', r.status === 422 && isValidation(r, 'transaction_id', 'invalid_format'), brief(r));

  // ── 7. clear and delete
  current = 'clear and delete';
  r = await cat('PUT', `${APP}/transactions/${t2}/category`, { body: { category_id: null } });
  check('category_id null → 200 with cleared assignment', r.status === 200 && isAssignment(r.json?.data) && r.json.data.category_id === null && r.json.data.assigned_at === null && r.json.data.assigned_by === null, brief(r));
  r = await cat('PUT', `${APP}/transactions/${t1}/category`, { body: { category_id: created?.category_id } });
  check('re-assign the custom category before deleting it', r.status === 200 && r.json?.data?.category_id === created?.category_id, brief(r));
  r = await cat('DELETE', `${APP}/transaction-categories/${created?.category_id}`);
  check('delete custom category → 204 with empty body', r.status === 204 && r.text === '', brief(r));
  r = await cat('GET', `${APP}/transaction-category-assignments?transaction_id=${t1}`);
  check('transaction that carried the deleted category reads as unassigned', r.status === 200 && r.json?.data?.items?.[0]?.category_id === null, brief(r));
  r = await cat('GET', `${APP}/transaction-categories`);
  check('deleted category is gone from the list', r.status === 200 && !r.json.data.items.some((c) => c.category_id === created?.category_id), brief(r));
  r = await cat('DELETE', `${APP}/transaction-categories/${created?.category_id}`);
  check('deleting it again → 404 transaction_category_not_found', r.status === 404 && isDomainError(r, 'transaction_category_not_found'), brief(r));
  r = await cat('DELETE', `${APP}/transaction-categories/${taxesA?.category_id}`);
  check('delete system category → 409 system_category_immutable', r.status === 409 && isDomainError(r, 'system_category_immutable'), brief(r));
  r = await cat('POST', `${APP}/transaction-categories`, { body: { name: renamed, color: 'blue' } });
  check('the deleted name can be reused', r.status === 201, brief(r));
  if (r.json?.data?.category_id) cleanup.push(r.json.data.category_id);

  // ── 8. limit
  current = 'limit';
  const before = (await cat('GET', `${APP}/transaction-categories`)).json.data.items.filter((c) => c.kind === 'custom').length;
  const toCreate = 50 - before;
  const made = [];
  for (let i = 0; i < toCreate; i++) {
    const c = await cat('POST', `${APP}/transaction-categories`, { body: { name: `Limit ${stamp} ${i}`, color: 'slate' } });
    if (c.status === 201) { made.push(c.json.data.category_id); cleanup.push(c.json.data.category_id); } else { check(`filling up to 50 custom categories (#${before + i + 1})`, false, brief(c)); break; }
  }
  check('50 custom categories can exist', made.length === toCreate, `created ${made.length} of ${toCreate}`);
  r = await cat('POST', `${APP}/transaction-categories`, { body: { name: `Limit ${stamp} overflow`, color: 'slate' } });
  check('51st custom category → 409 transaction_category_limit_reached with data.limit 50', r.status === 409 && isDomainError(r, 'transaction_category_limit_reached') && r.json.error.data?.limit === 50, brief(r));

  await report();
}

async function report() {
  current = 'cleanup';
  await cat('PUT', `${APP}/transactions/${(await tx('GET', `${APP}/transactions?page_size=1`)).json?.data?.items?.[0]?.transaction_id}/category`, { body: { category_id: null } }).catch(() => {});
  for (const id of cleanup) await cat('DELETE', `${APP}/transaction-categories/${id}`).catch(() => {});
  const failed = results.filter((r) => !r.ok);
  let group = null;
  for (const r of results) {
    if (r.group !== group) { group = r.group; console.log(`\n${group}`); }
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `\n        ${r.detail}`}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${CAT} (transactions from ${TX})`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('run crashed:', e); process.exit(2); });
