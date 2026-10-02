import { useEffect, useMemo, useRef, useState } from 'react';

const ACTIVITY_TYPES = [
  { id: 'gym', label: 'Тренажёрка', icon: '🏋︎', accent: 'violet' },
  { id: 'walk', label: 'Прогулка', icon: '🚶', accent: 'green' },
  { id: 'bike', label: 'Велосипед', icon: '◉', accent: 'amber' },
  { id: 'workout', label: 'Воркаут', icon: '⌗', accent: 'coral' },
];

const uid = () => crypto.randomUUID?.() ?? String(Date.now() + Math.random());

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function daysBetween(aKey, bKey) {
  const a = dateFromKey(aKey);
  const b = dateFromKey(bKey);
  return Math.round((b - a) / 86400000);
}

function useStoredState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function activityMeta(type) {
  return ACTIVITY_TYPES.find((item) => item.id === type);
}

function calculatePoints(activities) {
  const completed = Object.entries(activities)
    .filter(([, item]) => item?.status === 'completed')
    .map(([date]) => date)
    .sort();

  let points = 0;

  completed.forEach((date, index) => {
    points += 10;
    if (index === 0) return;

    const gap = daysBetween(completed[index - 1], date);

    if (gap === 1) points += 15;
    else if (gap === 2) points += 10;
    else if (gap === 3) points += 5;
    else if (gap >= 7) points += 20;
    else if (gap >= 4) points += 2;
  });

  return points;
}

function scoreHint(activities) {
  const completed = Object.entries(activities)
    .filter(([, item]) => item?.status === 'completed')
    .map(([date]) => date)
    .sort();

  if (!completed.length) return 'Первая тренировка — уже сильный шаг';

  const gapFromLast = daysBetween(completed.at(-1), localDateKey());

  if (gapFromLast >= 7) return 'Возвращение после паузы даст большой бонус';
  if (gapFromLast <= 1) return 'Серия держится. Это очень хорошо';
  if (gapFromLast === 2) return 'Идеальный ритм: тренировка через день';
  return 'Норма — примерно одна тренировка через день';
}

function Onboarding({ onSave }) {
  const [name, setName] = useState('');

  function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim() });
  }

  return (
    <main className="onboarding dark-screen">
      <div className="logo-lockup">
        <span className="logo-mark"><i /><i /></span>
        <span>Форма</span>
      </div>
      <p className="onboarding-kicker">Тренировки. Питание. Прогресс.</p>
      <h1>Начнём с движения.</h1>
      <p className="soft-text">Главная задача — сделать тренировку простым следующим действием.</p>

      <form className="glass-card onboarding-form" onSubmit={submit}>
        <label className="dark-field">
          <span>Как тебя зовут</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />
        </label>
        <button className="gradient-button" type="submit">Начать</button>
      </form>
    </main>
  );
}

export default function App() {
  const [profile, setProfile] = useStoredState('forma.profile', null);
  const [activities, setActivities] = useStoredState('forma.activities', {});
  const [proposals, setProposals] = useStoredState('forma.activityProposals', []);
  const [screen, setScreen] = useState('home');
  const [selectedDateKey, setSelectedDateKey] = useState(localDateKey());

  if (!profile) {
    return <Onboarding onSave={setProfile} />;
  }

  const common = {
    profile,
    activities,
    setActivities,
    proposals,
    setProposals,
    selectedDateKey,
    setSelectedDateKey,
  };

  return (
    <div className="app-shell-dark">
      {screen === 'home' && <Home {...common} onOpenWorkout={() => setScreen('choose-workout')} />}
      {screen === 'choose-workout' && <WorkoutPicker {...common} onBack={() => setScreen('home')} />}
      {screen === 'history' && <History activities={activities} onBack={() => setScreen('home')} />}

      {screen !== 'choose-workout' && (
        <nav className="bottom-nav">
          <button className={screen === 'home' ? 'active' : ''} onClick={() => setScreen('home')}>
            <span className="nav-icon home-icon">⌂</span>
            Главная
          </button>
          <button className={screen === 'history' ? 'active' : ''} onClick={() => setScreen('history')}>
            <span className="nav-icon">▥</span>
            История
          </button>
        </nav>
      )}
    </div>
  );
}

function Home({
  profile,
  activities,
  setActivities,
  proposals,
  setProposals,
  selectedDateKey,
  setSelectedDateKey,
  onOpenWorkout,
}) {
  const selectedDate = dateFromKey(selectedDateKey);
  const selectedActivity = activities[selectedDateKey] || null;
  const points = useMemo(() => calculatePoints(activities), [activities]);
  const touchStart = useRef(null);
  const wheelLock = useRef(false);

  const dates = Array.from({ length: 11 }, (_, index) => addDays(selectedDate, index - 5));

  function shiftDate(amount) {
    setSelectedDateKey(localDateKey(addDays(selectedDate, amount)));
  }

  function handleWheel(event) {
    if (wheelLock.current || Math.abs(event.deltaY) < 8) return;
    wheelLock.current = true;
    shiftDate(event.deltaY > 0 ? 1 : -1);
    setTimeout(() => {
      wheelLock.current = false;
    }, 130);
  }

  function handleTouchStart(event) {
    touchStart.current = event.touches[0]?.clientY ?? null;
  }

  function handleTouchEnd(event) {
    if (touchStart.current == null) return;
    const end = event.changedTouches[0]?.clientY ?? touchStart.current;
    const delta = touchStart.current - end;
    touchStart.current = null;

    if (Math.abs(delta) < 24) return;
    const steps = Math.min(3, Math.max(1, Math.round(Math.abs(delta) / 52)));
    shiftDate(delta > 0 ? steps : -steps);
  }

  function setActivityType(type) {
    if (!type) {
      setActivities((current) => {
        const copy = { ...current };
        delete copy[selectedDateKey];
        return copy;
      });
      return;
    }

    const isPast = selectedDateKey < localDateKey();
    setActivities((current) => ({
      ...current,
      [selectedDateKey]: {
        type,
        status: current[selectedDateKey]?.status || (isPast ? 'completed' : 'planned'),
        updatedAt: Date.now(),
      },
    }));
  }

  function setStatus(status) {
    if (!selectedActivity) return;
    setActivities((current) => ({
      ...current,
      [selectedDateKey]: {
        ...current[selectedDateKey],
        status,
        updatedAt: Date.now(),
      },
    }));
  }

  return (
    <main className="main-screen">
      <header className="topbar">
        <div>
          <div className="logo-lockup compact">
            <span className="logo-mark"><i /><i /></span>
            <span>Форма</span>
          </div>
          <p className="brand-subtitle">Тренировки. Питание. Прогресс.</p>
        </div>

        <div className="score-wrap">
          <div className="score-card"><span>★</span><strong>Баллы: {points}</strong></div>
          <small>{scoreHint(activities)}</small>
        </div>
      </header>

      <section
        className="date-wheel"
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="wheel-fade wheel-fade-top" />
        <div className="wheel-fade wheel-fade-bottom" />

        {dates.map((date) => {
          const key = localDateKey(date);
          const item = activities[key];
          const meta = item ? activityMeta(item.type) : null;
          const selected = key === selectedDateKey;
          const today = key === localDateKey();

          return (
            <button
              key={key}
              className={`date-row ${selected ? 'selected' : ''}`}
              onClick={() => setSelectedDateKey(key)}
            >
              <span className="weekday">{new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(date)}</span>
              <span className="date-label">
                {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date)}
                {today && <em>сегодня</em>}
              </span>
              <span className={`activity-label ${meta ? meta.accent : ''}`}>
                {meta ? <><b>{meta.icon}</b>{meta.label}</> : <span className="empty-dash">—</span>}
              </span>
              <span className={`status-dot ${item?.status || ''}`}>
                {item?.status === 'completed' ? '✓' : ''}
              </span>
            </button>
          );
        })}
      </section>

      <section className="glass-card editor-card">
        <p className="section-label">Активность · {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(selectedDate)}</p>

        <div className="select-wrap">
          <span className={`select-icon ${activityMeta(selectedActivity?.type)?.accent || ''}`}>
            {activityMeta(selectedActivity?.type)?.icon || '＋'}
          </span>
          <select value={selectedActivity?.type || ''} onChange={(e) => setActivityType(e.target.value)}>
            <option value="">Выбрать активность</option>
            {ACTIVITY_TYPES.map((type) => (
              <option key={type.id} value={type.id}>{type.label}</option>
            ))}
          </select>
          <span className="select-chevron">⌄</span>
        </div>

        {selectedActivity && (
          <div className="status-switch">
            <button
              className={selectedActivity.status === 'planned' ? 'active' : ''}
              onClick={() => setStatus('planned')}
            >
              Запланировано
            </button>
            <button
              className={selectedActivity.status === 'completed' ? 'active completed' : ''}
              onClick={() => setStatus('completed')}
            >
              Выполнено
            </button>
          </div>
        )}

        <ProposalBox proposals={proposals} setProposals={setProposals} />
      </section>

      <button className="gradient-button workout-cta" onClick={onOpenWorkout}>
        <span>🏋︎</span>
        Перейти к тренировке
        <b>›</b>
      </button>

      <p className="helper-text">
        Выбранная тренировка автоматически запишется на {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(selectedDate)}.
      </p>
    </main>
  );
}

function ProposalBox({ proposals, setProposals }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [sent, setSent] = useState(false);

  function submit() {
    if (!value.trim()) return;
    setProposals([
      ...proposals,
      { id: uid(), title: value.trim(), status: 'pending', createdAt: Date.now() },
    ]);
    setValue('');
    setSent(true);
  }

  if (!open) {
    return (
      <button className="proposal-box" onClick={() => setOpen(true)}>
        <span className="proposal-plus">＋</span>
        <span>
          <strong>Предложить свой вид активности</strong>
          <small>Отправим на рассмотрение администратору</small>
        </span>
      </button>
    );
  }

  return (
    <div className="proposal-form">
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSent(false);
        }}
        placeholder="Например: плавание"
      />
      <button onClick={submit}>Отправить</button>
      {sent && <small>Сохранено в очередь на согласование</small>}
    </div>
  );
}

function WorkoutPicker({ activities, setActivities, selectedDateKey, onBack }) {
  const selectedDate = dateFromKey(selectedDateKey);

  function choose(type) {
    const isPast = selectedDateKey < localDateKey();

    setActivities((current) => ({
      ...current,
      [selectedDateKey]: {
        type,
        status: isPast ? 'completed' : 'planned',
        updatedAt: Date.now(),
      },
    }));

    onBack();
  }

  return (
    <main className="picker-screen">
      <button className="back-button" onClick={onBack}>‹ Назад</button>
      <p className="eyebrow-dark">
        {new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(selectedDate)}
      </p>
      <h1>Выбери тренировку</h1>
      <p className="picker-copy">
        После выбора активность сразу появится в календаре. Если на эту дату уже что-то было записано — выбор обновится.
      </p>

      <div className="activity-grid">
        {ACTIVITY_TYPES.map((type) => (
          <button key={type.id} className={`activity-choice ${type.accent}`} onClick={() => choose(type.id)}>
            <span>{type.icon}</span>
            <strong>{type.label}</strong>
            {type.id === 'walk' && <small>от 20 000 шагов</small>}
          </button>
        ))}
      </div>
    </main>
  );
}

function History({ activities, onBack }) {
  const rows = Object.entries(activities)
    .sort(([a], [b]) => b.localeCompare(a));

  return (
    <main className="history-screen">
      <header className="history-header">
        <div>
          <p className="eyebrow-dark">Активности</p>
          <h1>История</h1>
        </div>
      </header>

      <div className="history-placeholder">
        <strong>Историю распишем следующим этапом.</strong>
        <p>Пока здесь просто видны уже записанные активности, чтобы вкладка не была пустой.</p>
      </div>

      <div className="history-list">
        {rows.length === 0 && <p className="empty-history">Пока тренировок нет.</p>}
        {rows.map(([date, item]) => {
          const meta = activityMeta(item.type);
          return (
            <article key={date} className="history-row">
              <span className={`history-icon ${meta?.accent || ''}`}>{meta?.icon}</span>
              <div>
                <strong>{meta?.label}</strong>
                <small>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateFromKey(date))}</small>
              </div>
              <em className={item.status}>{item.status === 'completed' ? 'Готово' : 'План'}</em>
            </article>
          );
        })}
      </div>

      <button className="history-back" onClick={onBack}>На главную</button>
    </main>
  );
}
