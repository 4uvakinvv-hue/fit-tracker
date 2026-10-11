import { useState } from 'react';
import { supabase } from './supabase.js';

export default function CoachPanel() {
  const [message, setMessage] = useState('');
  const [context, setContext] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [historyCount, setHistoryCount] = useState(null);

  async function ask(event) {
    event.preventDefault();
    if (pending || !message.trim() || !consent) return;
    setPending(true); setError(''); setAnswer(''); setHistoryCount(null);
    try {
      const { data, error: requestError } = await supabase.functions.invoke('forma-coach', {
        body: { message: message.trim(), context: context.trim(), consent: true },
      });
      if (requestError) {
        let detail;
        try { detail = await requestError.context?.json(); } catch { /* no JSON response */ }
        throw new Error(detail?.error || 'Тренер недоступен. Попробуй позже.');
      }
      if (!data?.answer) throw new Error(data?.error || 'Тренер не вернул ответ.');
      setAnswer(data.answer); setHistoryCount(data.historyCount);
    } catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  }

  return <section className="glass-card" style={{ marginTop: 20, padding: 18 }}>
    <h2>Тренер Forma</h2>
    <p className="soft-text">Задай вопрос по залу. Тренер учтёт последние тренировки из Forma.</p>
    <form onSubmit={ask} style={{ display: 'grid', gap: 12 }}>
      <label>Цель, опыт, ограничения и самочувствие
        <textarea value={context} onChange={event => setContext(event.target.value)} maxLength={4000} rows={5}
          placeholder="Например: возвращаюсь после перерыва, занимаюсь 2–3 раза в неделю…"
          style={{ width: '100%', minHeight: 120 }} disabled={pending}/>
      </label>
      <label>Твой вопрос
        <textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={3000} rows={4}
          placeholder="Разбери последнюю тренировку и предложи следующую нагрузку"
          style={{ width: '100%', minHeight: 100 }} required disabled={pending}/>
      </label>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={pending}/>
        <span>Разрешаю передать мой вопрос, указанные сведения и до 30 последних подтверждённых тренировок в OpenAI для подготовки ответа.</span>
      </label>
      <button className="gradient-button" disabled={pending || !consent || !message.trim()}>
        {pending ? 'Тренер готовит и проверяет ответ…' : 'Спросить тренера'}
      </button>
    </form>
    {error && <p className="error-line" role="alert">{error}</p>}
    {answer && <div aria-live="polite" style={{ marginTop: 16 }}>
      <p className="soft-text">Учтено занятий: {historyCount}. Программа автоматически не изменена.</p>
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{answer}</div>
    </div>}
  </section>;
}
