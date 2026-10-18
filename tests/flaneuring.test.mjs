import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app=await readFile('src/App.jsx','utf8');
const store=await readFile('native/android/FlaneuringStore.java','utf8');
const service=await readFile('native/android/FlaneuringService.java','utf8');
const workflow=await readFile('.github/workflows/android.yml','utf8');

test('flaneuring is a first-class outdoor activity with 6 km/h walking split',()=>{
  assert.match(app,/id:\s*'flaneuring'/);
  assert.match(app,/label:\s*'Фланирование'/);
  assert.match(app,/const transport=observed>6/);
  assert.match(app,/walkingDistance/);
  assert.match(app,/elevationGain/);
});

test('native tracker auto-finishes after two hours at last real movement',()=>{
  assert.match(store,/AUTO_STOP_MS=2L\*60L\*60L\*1000L/);
  assert.match(store,/long ended=autoEnded\?lastMove:System\.currentTimeMillis\(\)/);
  assert.match(store,/point\.optLong\("t",0\)<=ended/);
  assert.match(service,/shouldAutoStop/);
  assert.match(service,/handler\.postDelayed\(this,5\*60\*1000L\)/);
});

test('flaneuring result is persisted offline and Android service is packaged',()=>{
  assert.match(store,/putString\(COMPLETED,result\.toString\(\)\)/);
  assert.match(app,/syncPendingFlaneuring/);
  assert.match(workflow,/FlaneuringService\.java/);
  assert.match(workflow,/foregroundServiceType="location"/);
});
