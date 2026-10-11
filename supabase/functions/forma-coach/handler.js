import { chiefInstructions, gymInstructions } from './prompts.js';

const commonHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  Vary: 'Origin',
};
const pick = (object, keys) => Object.fromEntries(keys.filter(key => object?.[key] !== undefined).map(key => [key, object[key]]));
const sessionFields = ['date', 'type', 'distance', 'duration', 'gym_group', 'base_rows', 'extra_rows'];

export function responseText(payload) {
  if (payload.status !== 'completed') throw new Error('incomplete_response');
  const text = (payload.output || []).filter(item => item.type === 'message')
    .flatMap(item => item.content || []).filter(item => item.type === 'output_text')
    .map(item => item.text).join('\n').trim();
  if (!text) throw new Error('empty_response');
  return text;
}

export function createCoachHandler({ env, fetchImpl = fetch, now = Date.now }) {
  // Pilot protection per warm instance. Global limits must be enforced before public rollout.
  const active = new Set();
  const lastRequest = new Map();
  return async function handle(req) {
    const origin = req.headers.get('Origin');
    const allowedOrigins = (env('COACH_ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
    const headers = { ...commonHeaders, ...(origin && allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}) };
    const reply = (status, value) => new Response(JSON.stringify(value), { status, headers });
    if (origin && !allowedOrigins.includes(origin)) return reply(403, { error: 'Этот адрес приложения не подключён к тренеру.' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return reply(405, { error: 'Используй POST.' });
    const auth = req.headers.get('Authorization') || '';
    if (!/^Bearer \S+$/i.test(auth)) return reply(401, { error: 'Войди в Forma.' });
    const url = env('SUPABASE_URL');
    const publicKey = env('COACH_SUPABASE_PUBLISHABLE_KEY') || env('SUPABASE_ANON_KEY');
    if (!url || !publicKey) return reply(503, { error: 'Тренер ещё не настроен.' });
    let userId;
    let locked = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 110000);
    try {
      const dbHeaders = { apikey: publicKey, Authorization: auth };
      const authResult = await fetchImpl(`${url}/auth/v1/user`, { headers: dbHeaders, signal: controller.signal });
      if (!authResult.ok) return reply(401, { error: 'Сессия истекла. Войди заново.' });
      const user = await authResult.json();
      userId = user.id;
      if (!/^[0-9a-f-]{36}$/i.test(userId || '')) return reply(401, { error: 'Не удалось проверить пользователя.' });
      const allowedUsers = (env('COACH_ALLOWED_USER_IDS') || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!allowedUsers.includes(userId)) return reply(403, { error: 'Тренер пока доступен участникам тестирования.' });
      const key = env('OPENAI_API_KEY');
      const model = env('COACH_MODEL');
      if (!key || !model) return reply(503, { error: 'ИИ-тренер ещё не подключён.' });
      const length = Number(req.headers.get('content-length') || 0);
      if (length > 30000) return reply(413, { error: 'Слишком большой запрос.' });
      const raw = await req.text();
      if (raw.length > 12000) return reply(413, { error: 'Слишком большой запрос.' });
      let body;
      try { body = JSON.parse(raw); } catch { return reply(400, { error: 'Некорректный запрос.' }); }
      if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 3000 ||
          (body.context !== undefined && (typeof body.context !== 'string' || body.context.length > 4000))) {
        return reply(400, { error: 'Вопрос — до 3000 символов, профиль — до 4000.' });
      }
      if (body.consent !== true) return reply(400, { error: 'Подтверди передачу данных для ответа ИИ-тренера.' });
      if (active.has(userId) || (lastRequest.has(userId) && now() - lastRequest.get(userId) < 15000)) {
        return reply(429, { error: 'Дождись ответа и повтори немного позже.' });
      }
      active.add(userId); locked = true; lastRequest.set(userId, now());
      const query = `${url}/rest/v1/sessions?select=${sessionFields.join(',')}&user_id=eq.${encodeURIComponent(userId)}&confirmed=eq.true&order=date.desc,created_at.desc&limit=30`;
      const historyResult = await fetchImpl(query, { headers: dbHeaders, signal: controller.signal });
      if (!historyResult.ok) return reply(502, { error: 'Не удалось прочитать историю тренировок. Рекомендация не сформирована.' });
      const rows = await historyResult.json();
      if (!Array.isArray(rows)) throw new Error('invalid_history');
      const context = {
        request: body.message.trim(),
        profileReportedByUser: body.context || 'Не предоставлен',
        recentConfirmedSessions: rows.slice(0, 30).map(row => pick(row, sessionFields)),
        limitations: 'История: не более 30 подтверждённых занятий. Старые записи содержат агрегированные подходы; не выдумывай отдельные сеты и RIR. Дополнительный профиль — слова пользователя. Нет внешнего поиска. План не записывается и не меняется автоматически.',
      };
      const input = JSON.stringify(context);
      if (input.length > 60000) return reply(413, { error: 'История слишком объёмная для текущего режима тренера.' });
      const trace = [];
      async function callAgent(agent, instructions, data, maxTokens) {
        const result = await fetchImpl('https://api.openai.com/v1/responses', {
          method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, instructions, input: data, store: false, max_output_tokens: maxTokens }),
          signal: controller.signal,
        });
        if (!result.ok) throw new Error('provider_error');
        const payload = await result.json();
        const text = responseText(payload);
        if (text.length > 20000) throw new Error('oversized_response');
        trace.push({ agent, responseId: payload.id || null });
        return text;
      }
      const task = await callAgent('chief-routing', chiefInstructions + '\nСейчас только сформулируй задачу силовому специалисту, нужные проверки и недостающие данные. Не отвечай пользователю и не добавляй вымышленные данные.', input, 1200);
      const specialist = await callAgent('gym-v1.1', gymInstructions + '\nСоставь экспертное заключение и проведи внутреннюю проверку. Если задача вне компетенции, обозначь это; других специалистов здесь нет.', JSON.stringify({ context, task }), 3500);
      const answer = await callAgent('chief-review-v1.0', chiefInstructions + '\nПроверь приложенное заключение, его расчёты, ограничения и соответствие запросу. Выдай пользователю короткий итог. При сомнениях запроси уточнение. Другие специалисты не вызывались. Внешняя научная проверка не выполнялась. Не утверждай, что план сохранён.', JSON.stringify({ context, specialistConclusion: specialist }), 3500);
      return reply(200, { answer, trace, historyCount: rows.length, sourcesCheckedLive: false, planSaved: false });
    } catch (error) {
      return reply(error.name === 'AbortError' ? 504 : 502, { error: error.name === 'AbortError' ? 'Ответ занял слишком много времени. Попробуй позже.' : 'Не удалось получить проверенный ответ тренера. Попробуй позже.' });
    } finally {
      clearTimeout(timer);
      if (locked) active.delete(userId);
    }
  };
}
