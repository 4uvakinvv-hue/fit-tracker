import { useEffect, useState } from 'react';

const TABS = [
  ['today', 'Сегодня'],
  ['workout', 'Тренировки'],
  ['nutrition', 'Питание'],
  ['progress', 'Прогресс'],
  ['profile', 'Профиль'],
];

const todayKey = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID?.() ?? String(Date.now() + Math.random());

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

function NumberInput({ label, value, onChange, placeholder }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function Onboarding({ onSave }) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [calories, setCalories] = useState('2200');

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      weight: Number(weight) || null,
      targetWeight: Number(targetWeight) || null,
      calories: Number(calories) || 2200,
    });
  }

  return (
    <main className="onboarding">
      <div className="brand-mark">С</div>
      <p className="eyebrow">Стройка</p>
      <h1>Собираем тело как проект.</h1>
      <p className="muted">
        Тренировки, питание и прогресс. Данные пока хранятся только на этом устройстве.
      </p>

      <form className="card form-stack" onSubmit={submit}>
        <label className="field">
          <span>Как тебя зовут</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />
        </label>
        <div className="two-cols">
          <NumberInput label="Вес сейчас, кг" value={weight} onChange={setWeight} placeholder="96" />
          <NumberInput label="Цель, кг" value={targetWeight} onChange={setTargetWeight} placeholder="88" />
        </div>
        <NumberInput label="Калории в день" value={calories} onChange={setCalories} placeholder="2200" />
        <button className="primary" type="submit">Начать</button>
      </form>
    </main>
  );
}

export default function App() {
  const [tab, setTab] = useState('today');
  const [profile, setProfile] = useStoredState('stroyka.profile', null);
  const [workouts, setWorkouts] = useStoredState('stroyka.workouts', []);
  const [meals, setMeals] = useStoredState('stroyka.meals', []);
  const [weights, setWeights] = useStoredState('stroyka.weights', []);
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handler = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!profile) {
    return <Onboarding onSave={(data) => {
      setProfile(data);
      if (data.weight) {
        setWeights([{ id: uid(), date: todayKey(), value: data.weight }]);
      }
    }} />;
  }

  const todayMeals = meals.filter((m) => m.date === todayKey());
  const todayWorkouts = workouts.filter((w) => w.date === todayKey());

  const nutrition = todayMeals.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      fat: acc.fat + item.fat,
      carbs: acc.carbs + item.carbs,
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );

  const latestWeight = weights[0]?.value ?? profile.weight ?? '—';

  async function installApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  return (
    <div className="app-shell">
      <div className="content">
        {tab === 'today' && (
          <Today
            profile={profile}
            nutrition={nutrition}
            workouts={todayWorkouts}
            latestWeight={latestWeight}
            onWorkout={() => setTab('workout')}
            onFood={() => setTab('nutrition')}
          />
        )}
        {tab === 'workout' && <Workouts workouts={workouts} setWorkouts={setWorkouts} />}
        {tab === 'nutrition' && <Nutrition meals={meals} setMeals={setMeals} target={profile.calories} />}
        {tab === 'progress' && <Progress weights={weights} setWeights={setWeights} workouts={workouts} />}
        {tab === 'profile' && (
          <Profile
            profile={profile}
            setProfile={setProfile}
            installPrompt={installPrompt}
            installApp={installApp}
          />
        )}
      </div>

      <nav className="tabbar">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            <span className="tab-dot" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function PageHeader({ eyebrow, title, aside }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {aside}
    </header>
  );
}

function Today({ profile, nutrition, workouts, latestWeight, onWorkout, onFood }) {
  const progress = Math.min(100, Math.round((nutrition.calories / profile.calories) * 100) || 0);

  return (
    <>
      <PageHeader eyebrow="Стройка" title={`Привет, ${profile.name}`} />
      <p className="date-line">
        {new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
      </p>

      <section className="hero-card">
        <div>
          <p className="card-label">Калории</p>
          <div className="metric"><strong>{nutrition.calories}</strong><span> / {profile.calories} ккал</span></div>
        </div>
        <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
        <div className="macro-row">
          <span>Б {nutrition.protein} г</span>
          <span>Ж {nutrition.fat} г</span>
          <span>У {nutrition.carbs} г</span>
        </div>
        <button className="primary" onClick={onFood}>Добавить еду</button>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <p className="card-label">Тренировка</p>
            <h2>{workouts.length ? `${workouts.length} упражн.` : 'Ещё не было'}</h2>
          </div>
          <span className="round-number">{workouts.length}</span>
        </div>
        <button className="secondary" onClick={onWorkout}>Открыть тренировку</button>
      </section>

      <section className="card card-inline">
        <div>
          <p className="card-label">Вес</p>
          <div className="metric"><strong>{latestWeight}</strong><span> кг</span></div>
        </div>
        <div className="goal">цель {profile.targetWeight || '—'} кг</div>
      </section>
    </>
  );
}

function Workouts({ workouts, setWorkouts }) {
  const [name, setName] = useState('');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [weight, setWeight] = useState('');

  function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setWorkouts([
      {
        id: uid(),
        date: todayKey(),
        name: name.trim(),
        sets: Number(sets) || 0,
        reps: Number(reps) || 0,
        weight: Number(weight) || 0,
      },
      ...workouts,
    ]);
    setName('');
    setWeight('');
  }

  const today = workouts.filter((w) => w.date === todayKey());

  return (
    <>
      <PageHeader eyebrow="Сегодня" title="Тренировка" />
      <form className="card form-stack" onSubmit={add}>
        <label className="field">
          <span>Упражнение</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Жим лёжа" />
        </label>
        <div className="three-cols">
          <NumberInput label="Подходы" value={sets} onChange={setSets} placeholder="3" />
          <NumberInput label="Повторы" value={reps} onChange={setReps} placeholder="10" />
          <NumberInput label="Вес" value={weight} onChange={setWeight} placeholder="80" />
        </div>
        <button className="primary">Добавить упражнение</button>
      </form>

      <div className="section-title">
        <h2>Сегодня</h2><span>{today.length}</span>
      </div>
      {today.length === 0 && <div className="empty">Пока пусто. Добавь первое упражнение.</div>}
      {today.map((item) => (
        <article className="list-card" key={item.id}>
          <div>
            <strong>{item.name}</strong>
            <p>{item.sets} × {item.reps} · {item.weight} кг</p>
          </div>
          <button className="delete" onClick={() => setWorkouts(workouts.filter((w) => w.id !== item.id))}>×</button>
        </article>
      ))}
    </>
  );
}

function Nutrition({ meals, setMeals, target }) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');

  function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setMeals([
      {
        id: uid(),
        date: todayKey(),
        name: name.trim(),
        calories: Number(calories) || 0,
        protein: Number(protein) || 0,
        fat: Number(fat) || 0,
        carbs: Number(carbs) || 0,
      },
      ...meals,
    ]);
    setName('');
    setCalories('');
    setProtein('');
    setFat('');
    setCarbs('');
  }

  const today = meals.filter((m) => m.date === todayKey());
  const total = today.reduce((sum, m) => sum + m.calories, 0);

  return (
    <>
      <PageHeader eyebrow="Сегодня" title="Питание" aside={<span className="pill">{total}/{target}</span>} />
      <form className="card form-stack" onSubmit={add}>
        <label className="field">
          <span>Что съел</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Омлет, 3 яйца" />
        </label>
        <NumberInput label="Калории" value={calories} onChange={setCalories} placeholder="320" />
        <div className="three-cols">
          <NumberInput label="Белки" value={protein} onChange={setProtein} placeholder="25" />
          <NumberInput label="Жиры" value={fat} onChange={setFat} placeholder="20" />
          <NumberInput label="Углеводы" value={carbs} onChange={setCarbs} placeholder="4" />
        </div>
        <button className="primary">Добавить</button>
      </form>

      {today.map((item) => (
        <article className="list-card" key={item.id}>
          <div>
            <strong>{item.name}</strong>
            <p>{item.calories} ккал · Б {item.protein} · Ж {item.fat} · У {item.carbs}</p>
          </div>
          <button className="delete" onClick={() => setMeals(meals.filter((m) => m.id !== item.id))}>×</button>
        </article>
      ))}
    </>
  );
}

function Progress({ weights, setWeights, workouts }) {
  const [value, setValue] = useState('');

  function add(e) {
    e.preventDefault();
    if (!Number(value)) return;
    setWeights([{ id: uid(), date: todayKey(), value: Number(value) }, ...weights]);
    setValue('');
  }

  return (
    <>
      <PageHeader eyebrow="История" title="Прогресс" />
      <form className="card form-stack" onSubmit={add}>
        <NumberInput label="Вес сегодня, кг" value={value} onChange={setValue} placeholder="95.4" />
        <button className="primary">Записать вес</button>
      </form>

      <section className="stats-grid">
        <div className="mini-card"><span>Тренировок</span><strong>{new Set(workouts.map((w) => w.date)).size}</strong></div>
        <div className="mini-card"><span>Замеров</span><strong>{weights.length}</strong></div>
      </section>

      <div className="section-title"><h2>Вес</h2></div>
      {weights.slice(0, 10).map((item) => (
        <article className="list-card" key={item.id}>
          <div><strong>{item.value} кг</strong><p>{item.date}</p></div>
        </article>
      ))}
    </>
  );
}

function Profile({ profile, setProfile, installPrompt, installApp }) {
  const [draft, setDraft] = useState(profile);

  function save(e) {
    e.preventDefault();
    setProfile({
      ...draft,
      weight: Number(draft.weight) || null,
      targetWeight: Number(draft.targetWeight) || null,
      calories: Number(draft.calories) || 2200,
    });
  }

  return (
    <>
      <PageHeader eyebrow="Настройки" title="Профиль" />
      <form className="card form-stack" onSubmit={save}>
        <label className="field">
          <span>Имя</span>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <div className="two-cols">
          <NumberInput label="Вес, кг" value={draft.weight ?? ''} onChange={(v) => setDraft({ ...draft, weight: v })} />
          <NumberInput label="Цель, кг" value={draft.targetWeight ?? ''} onChange={(v) => setDraft({ ...draft, targetWeight: v })} />
        </div>
        <NumberInput label="Калории в день" value={draft.calories} onChange={(v) => setDraft({ ...draft, calories: v })} />
        <button className="primary">Сохранить</button>
      </form>

      <section className="card">
        <p className="card-label">Приложение</p>
        <h2>Установить на Android</h2>
        <p className="muted">После установки «Стройка» будет открываться отдельным приложением с рабочего стола.</p>
        <button className="secondary" disabled={!installPrompt} onClick={installApp}>
          {installPrompt ? 'Установить приложение' : 'Уже установлено или установка доступна через меню Chrome'}
        </button>
      </section>
    </>
  );
}
