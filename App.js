import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
} from 'react-native';

const TABS = ['Сегодня', 'Тренировки', 'Питание', 'Прогресс', 'Профиль'];

function Card({ children }) {
  return <View style={styles.card}>{children}</View>;
}

function Button({ title, onPress, secondary = false }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, secondary && styles.buttonSecondary]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>
        {title}
      </Text>
    </Pressable>
  );
}

export default function App() {
  const [tab, setTab] = useState('Сегодня');

  const [workouts, setWorkouts] = useState([]);
  const [exerciseName, setExerciseName] = useState('');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [weight, setWeight] = useState('');

  const [meals, setMeals] = useState([]);
  const [food, setFood] = useState('');
  const [calories, setCalories] = useState('');

  const totalCalories = useMemo(
    () => meals.reduce((sum, meal) => sum + meal.calories, 0),
    [meals]
  );

  function addExercise() {
    if (!exerciseName.trim()) return;

    setWorkouts((current) => [
      ...current,
      {
        id: String(Date.now()),
        name: exerciseName.trim(),
        sets: Number(sets) || 0,
        reps: Number(reps) || 0,
        weight: Number(weight) || 0,
      },
    ]);

    setExerciseName('');
    setWeight('');
  }

  function addMeal() {
    if (!food.trim()) return;

    setMeals((current) => [
      ...current,
      {
        id: String(Date.now()),
        name: food.trim(),
        calories: Number(calories) || 0,
      },
    ]);

    setFood('');
    setCalories('');
  }

  function TodayScreen() {
    return (
      <>
        <Text style={styles.title}>Fit Tracker</Text>
        <Text style={styles.subtitle}>Сегодня</Text>

        <Card>
          <Text style={styles.cardTitle}>Тренировка</Text>
          <Text style={styles.muted}>
            {workouts.length
              ? `Упражнений сегодня: ${workouts.length}`
              : 'Сегодня тренировки ещё не было'}
          </Text>
          <Button title="Добавить тренировку" onPress={() => setTab('Тренировки')} />
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Питание</Text>
          <Text style={styles.bigNumber}>{totalCalories} ккал</Text>
          <Text style={styles.muted}>Приёмов пищи: {meals.length}</Text>
          <Button title="Добавить еду" onPress={() => setTab('Питание')} />
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Вес</Text>
          <Text style={styles.bigNumber}>96 кг</Text>
          <Text style={styles.muted}>Историю веса добавим следующим этапом</Text>
        </Card>
      </>
    );
  }

  function WorkoutScreen() {
    return (
      <>
        <Text style={styles.screenTitle}>Тренировка</Text>

        <Card>
          <Text style={styles.cardTitle}>Добавить упражнение</Text>
          <TextInput
            value={exerciseName}
            onChangeText={setExerciseName}
            placeholder="Например: жим лёжа"
            style={styles.input}
          />

          <View style={styles.row}>
            <TextInput
              value={sets}
              onChangeText={setSets}
              placeholder="Подходы"
              keyboardType="numeric"
              style={[styles.input, styles.smallInput]}
            />
            <TextInput
              value={reps}
              onChangeText={setReps}
              placeholder="Повторы"
              keyboardType="numeric"
              style={[styles.input, styles.smallInput]}
            />
            <TextInput
              value={weight}
              onChangeText={setWeight}
              placeholder="Вес"
              keyboardType="numeric"
              style={[styles.input, styles.smallInput]}
            />
          </View>

          <Button title="Добавить" onPress={addExercise} />
        </Card>

        {workouts.map((item, index) => (
          <Card key={item.id}>
            <Text style={styles.itemIndex}>Упражнение {index + 1}</Text>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.muted}>
              {item.sets} × {item.reps} · {item.weight} кг
            </Text>
          </Card>
        ))}

        {!workouts.length && (
          <Text style={styles.empty}>Добавь первое упражнение выше.</Text>
        )}
      </>
    );
  }

  function NutritionScreen() {
    return (
      <>
        <Text style={styles.screenTitle}>Питание</Text>

        <Card>
          <Text style={styles.cardTitle}>Добавить еду</Text>
          <TextInput
            value={food}
            onChangeText={setFood}
            placeholder="Что съел?"
            style={styles.input}
          />
          <TextInput
            value={calories}
            onChangeText={setCalories}
            placeholder="Ккал"
            keyboardType="numeric"
            style={styles.input}
          />
          <Button title="Добавить" onPress={addMeal} />
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Итого сегодня</Text>
          <Text style={styles.bigNumber}>{totalCalories} ккал</Text>
        </Card>

        {meals.map((meal) => (
          <Card key={meal.id}>
            <Text style={styles.cardTitle}>{meal.name}</Text>
            <Text style={styles.muted}>{meal.calories} ккал</Text>
          </Card>
        ))}
      </>
    );
  }

  function ProgressScreen() {
    return (
      <>
        <Text style={styles.screenTitle}>Прогресс</Text>
        <Card>
          <Text style={styles.cardTitle}>Вес</Text>
          <Text style={styles.bigNumber}>96 кг</Text>
          <Text style={styles.muted}>
            Здесь появится график веса и история замеров.
          </Text>
        </Card>
        <Card>
          <Text style={styles.cardTitle}>Тренировки</Text>
          <Text style={styles.bigNumber}>{workouts.length}</Text>
          <Text style={styles.muted}>упражнений добавлено в текущей сессии</Text>
        </Card>
      </>
    );
  }

  function ProfileScreen() {
    return (
      <>
        <Text style={styles.screenTitle}>Профиль</Text>
        <Card>
          <Text style={styles.cardTitle}>Пользователь</Text>
          <Text style={styles.profileLine}>Имя: Василий</Text>
          <Text style={styles.profileLine}>Текущий вес: 96 кг</Text>
          <Text style={styles.profileLine}>Цель: настроим позже</Text>
        </Card>
        <Text style={styles.muted}>
          Следующий большой этап — аккаунты и отдельные данные для каждого пользователя.
        </Text>
      </>
    );
  }

  function renderScreen() {
    if (tab === 'Тренировки') return <WorkoutScreen />;
    if (tab === 'Питание') return <NutritionScreen />;
    if (tab === 'Прогресс') return <ProgressScreen />;
    if (tab === 'Профиль') return <ProfileScreen />;
    return <TodayScreen />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.app}>
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {renderScreen()}
        </ScrollView>

        <View style={styles.tabBar}>
          {TABS.map((item) => {
            const active = item === tab;
            return (
              <Pressable
                key={item}
                onPress={() => setTab(item)}
                style={styles.tab}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f4f4f4',
  },
  app: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#111111',
  },
  subtitle: {
    fontSize: 22,
    marginTop: 4,
    marginBottom: 24,
    color: '#111111',
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 22,
    color: '#111111',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 20,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 8,
  },
  bigNumber: {
    fontSize: 30,
    fontWeight: '900',
    color: '#111111',
    marginBottom: 4,
  },
  muted: {
    fontSize: 16,
    lineHeight: 22,
    color: '#666666',
  },
  button: {
    marginTop: 16,
    backgroundColor: '#111111',
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonSecondary: {
    backgroundColor: '#eeeeee',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
  buttonTextSecondary: {
    color: '#111111',
  },
  input: {
    backgroundColor: '#f3f3f3',
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 50,
    fontSize: 16,
    color: '#111111',
    marginTop: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  smallInput: {
    flex: 1,
  },
  itemIndex: {
    color: '#888888',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  empty: {
    textAlign: 'center',
    color: '#777777',
    marginTop: 16,
  },
  profileLine: {
    fontSize: 17,
    color: '#222222',
    marginTop: 6,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
    minHeight: 70,
    paddingBottom: 10,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  tabText: {
    fontSize: 11,
    color: '#888888',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#111111',
    fontWeight: '900',
  },
});
