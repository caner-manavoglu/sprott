import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios, { AxiosError } from 'axios';
import { api, setToken, authToken } from '../web/src/api.ts';

test('Axios sends JSON and bearer token, preserves API errors and expires only protected sessions', async () => {
  const adapter = axios.defaults.adapter;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events: string[] = [];
  Object.defineProperty(globalThis, 'window', {configurable: true, value: {dispatchEvent(event: Event) {events.push(event.type);}}});
  try {
    setToken('test-token');
    axios.defaults.adapter = async config => {
      assert.equal(config.baseURL, '/api/');
      assert.equal(config.url, 'tasks');
      assert.equal(config.method, 'post');
      assert.equal(config.headers.Authorization, 'Bearer test-token');
      assert.deepEqual(JSON.parse(config.data), {title: 'Task', description: 'Detay', columnId: 1});
      return {data: {tasks: []}, status: 201, statusText: 'Created', headers: {}, config};
    };
    assert.deepEqual(await api('tasks', 'POST', {title: 'Task', description: 'Detay', columnId: 1}), {tasks: []});
    for (const [path, status] of [['tasks', 403], ['login', 401], ['me', 401]] as const) {
      axios.defaults.adapter = async config => { throw new AxiosError('Rejected', 'ERR_BAD_REQUEST', config, undefined, {data: {message: 'Erişim reddedildi.'}, status, statusText: '', headers: {}, config}); };
      await assert.rejects(api(path), /Erişim reddedildi/);
      assert.equal(authToken, path === 'me' ? '' : 'test-token');
    }
    assert.deepEqual(events.filter(event => event === 'session-expired'), ['session-expired']);
    axios.defaults.adapter = async () => {throw new AxiosError('Network Error', 'ERR_NETWORK');};
    await assert.rejects(api('board'), /Sunucuya ulaşılamıyor/);
  } finally {
    axios.defaults.adapter = adapter;
    setToken('');
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
