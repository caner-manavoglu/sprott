import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { actionMessage, type ToastMessage } from '../web/src/lib/toast.ts';
import { api } from '../web/src/api.ts';

test('toast: action-specific messages and silent background requests', async () => {
  for (const path of ['projects', 'tasks/1', 'notifications', 'dashboard', 'mcp/connections']) assert.equal(actionMessage(path, 'GET'), null);
  assert.equal(actionMessage('notifications/1/read', 'PATCH'), null);
  assert.equal(actionMessage('tasks/1', 'PATCH', {columnId: 3}), 'Task statüsü güncellendi.');
  assert.equal(actionMessage('tasks/1', 'PATCH', {title: 'Yeni', columnId: 3}), 'Task güncellendi.');
  assert.equal(actionMessage('tasks/1/comments/2/attachments/3', 'DELETE'), 'Dosya silindi.');
  assert.equal(actionMessage('projects/1/workflow', 'DELETE'), 'Akış kuralları kaldırıldı.');
  assert.equal(actionMessage('projects/1/members/2', 'DELETE'), 'Üye projeden çıkarıldı.');
  assert.equal(actionMessage('projects/1/completion', 'PATCH', {completed: false}), 'Proje yeniden açıldı.');
  assert.equal(actionMessage('pull-requests/1/state?view=mine', 'PATCH', {state: 'merged'}), 'PR birleştirildi.');
  assert.equal(actionMessage('mcp/connections/1', 'DELETE'), 'MCP bağlantısı iptal edildi.');
  const previousWindow = globalThis.window;
  const previousAdapter = axios.defaults.adapter;
  globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
  const messages: ToastMessage[] = [];
  window.addEventListener('sprott-toast', event => messages.push((event as CustomEvent<ToastMessage>).detail));
  axios.defaults.adapter = async config => ({data: {}, status: 200, statusText: 'OK', headers: {}, config});
  try {
    await api('tasks', 'POST', {title: 'Test'});
    await api('dashboard');
    assert.deepEqual(messages, [{message: 'Task oluşturuldu.', kind: 'success'}]);
    axios.defaults.adapter = async () => {throw new Error('Offline');};
    await assert.rejects(api('tasks/1', 'DELETE'));
    assert.equal(messages.length, 1, 'Başarısız işlem başarı bildirimi üretmemeli');
  } finally {globalThis.window = previousWindow; axios.defaults.adapter = previousAdapter;}
});
