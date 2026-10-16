import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app=await readFile('src/App.jsx','utf8');
const supabase=await readFile('src/supabase.js','utf8');

test('login screen exposes email password recovery',()=>{
  assert.match(app,/Забыли пароль\?/);
  assert.match(app,/resetPasswordForEmail\(/);
  assert.match(app,/AUTH_RECOVERY_REDIRECT_URL/);
});

test('recovery link is detected and can update password',()=>{
  assert.match(app,/PASSWORD_RECOVERY/);
  assert.match(app,/updateUser\(\{password\}\)/);
  assert.match(app,/Сохранить новый пароль/);
  assert.match(app,/Пароль изменён/);
});

test('Supabase client parses auth callback URLs',()=>{
  assert.match(supabase,/detectSessionInUrl:\s*true/);
});
