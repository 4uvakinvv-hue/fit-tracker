import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoachHandler, responseText } from '../supabase/functions/forma-coach/handler.js';

const id = '11111111-1111-1111-1111-111111111111';
const baseEnv = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'public', OPENAI_API_KEY: 'server-secret', COACH_MODEL: 'test-model', COACH_ALLOWED_USER_IDS: id, COACH_ALLOWED_ORIGINS: 'https://forma.test' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const request = (body = { message: 'Разбери тренировку', context: '42 года', consent: true }, headers = {}) => new Request('https://edge.test', { method: 'POST', headers: { Authorization: 'Bearer user-token', Origin: 'https://forma.test', ...headers }, body: JSON.stringify(body) });
function fixture(overrides = {}, failure = -1) {
  const calls = [];
  let count = 0;
  const handler = createCoachHandler({ env: key => ({ ...baseEnv, ...overrides })[key], fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return json({ id, email: 'private@example.test' });
    if (url.includes('/rest/v1/sessions')) return json([{ date: '2026-10-12', type: 'gym', base_rows: [{ sets: 2, reps: 10, weight: 20 }], route_points: ['private GPS'] }]);
    if (count++ === failure) return json({ error: 'secret error' }, 500);
    return json({ id: `response-${count}`, status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: ['Задача специалисту', 'Заключение', 'Проверенный ответ'][count - 1] }] }] });
  } });
  return { handler, calls };
}

test('real orchestration boundaries: chief → specialist → chief; only authenticated history and no writes', async () => {
  const { handler, calls } = fixture();
  const result = await handler(request({ message: 'Вопрос', context: 'Профиль', consent: true, user_id: 'another-user' }));
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.answer, 'Проверенный ответ');
  assert.deepEqual(body.trace.map(x => x.agent), ['chief-routing', 'gym-v1.1', 'chief-review-v1.0']);
  assert.equal(body.planSaved, false); assert.equal(body.sourcesCheckedLive, false);
  assert.match(calls[1].url, new RegExp(`user_id=eq.${id}`));
  assert.equal(calls[1].options.headers.Authorization, 'Bearer user-token');
  const ai = calls.filter(x => x.url.includes('api.openai.com'));
  assert.equal(ai.length, 3);
  ai.forEach(call => {
    const payload = JSON.parse(call.options.body);
    assert.equal(payload.store, false);
    assert.ok(!payload.input.includes('private@example.test'));
    assert.ok(!payload.input.includes('private GPS'));
    assert.ok(!payload.input.includes('another-user'));
    assert.ok(!payload.input.includes('server-secret'));
  });
  assert.ok(JSON.parse(ai[1].options.body).input.includes('Задача специалисту'));
  assert.ok(JSON.parse(ai[2].options.body).input.includes('Заключение'));
});
test('unauthenticated caller triggers no fetch', async () => {
  const { handler, calls } = fixture();
  const req = request(); req.headers.delete('Authorization');
  assert.equal((await handler(req)).status, 401); assert.equal(calls.length, 0);
});
test('server checks token rather than trusting client identity', async () => {
  let calls = 0;
  const handler = createCoachHandler({ env: key => baseEnv[key], fetchImpl: async () => { calls++; return json({}, 401); } });
  assert.equal((await handler(request())).status, 401); assert.equal(calls, 1);
});
test('pilot access fails closed', async () => {
  const { handler, calls } = fixture({ COACH_ALLOWED_USER_IDS: '' });
  assert.equal((await handler(request())).status, 403); assert.equal(calls.length, 1);
});
test('missing provider secret gives honest disconnected state', async () => {
  const { handler, calls } = fixture({ OPENAI_API_KEY: '' });
  assert.equal((await handler(request())).status, 503); assert.equal(calls.length, 1);
});
test('no history leaves no fabricated conclusion', async () => {
  let calls = 0;
  const handler = createCoachHandler({ env: key => baseEnv[key], fetchImpl: async url => { calls++; return url.includes('/auth/') ? json({ id }) : json({}, 403); } });
  assert.equal((await handler(request())).status, 502); assert.equal(calls, 2);
});
test('consent and input constraints are enforced before history or AI', async () => {
  for (const body of [{ message: 'Hi' }, { message: '', consent: true }, { message: 'x'.repeat(3001), consent: true }, { message: 'Hi', context: {}, consent: true }]) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request(body))).status, 400); assert.equal(calls.length, 1);
  }
});
test('unapproved origin rejected before auth', async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(request(undefined, { Origin: 'https://other.test' }))).status, 403); assert.equal(calls.length, 0);
});
test('specialist failure stops final review; provider error is not leaked', async () => {
  const { handler, calls } = fixture({}, 1);
  const result = await handler(request());
  assert.equal(result.status, 502);
  assert.equal(calls.filter(x => x.url.includes('api.openai.com')).length, 2);
  assert.ok(!(await result.text()).includes('secret error'));
});
test('incomplete and refused model responses never count as checked answers', () => {
  assert.throws(() => responseText({ status: 'incomplete', output: [] }));
  assert.throws(() => responseText({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }));
});
test('duplicate requests are throttled within a warm instance', async () => {
  const { handler } = fixture();
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request())).status, 429);
});
