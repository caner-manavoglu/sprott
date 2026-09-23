import { installTestSchema } from './database.ts';
import { execute, query } from '../server/prisma/sql.ts';
import { PrismaService } from '../server/prisma/prisma.service.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createServer, request as httpRequest } from 'node:http';

test('MCP E2E: own tasks only, strict tools, workflow, stale writes, permissions and revocation', async () => {
  const db = new Pool({connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL});
  const schema = `sprott_mcp_${randomUUID().replaceAll('-', '')}`;
  await db.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL!);
  url.searchParams.set('options', `-c search_path=${schema}`);
  url.searchParams.set('schema', schema);
  await installTestSchema(db, schema);
  process.env.DATABASE_URL = url.toString();
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_EMAIL = 'admin@mcp.test'; process.env.ADMIN_PASSWORD = 'Admin-test-123456';
  process.env.USER_EMAIL = 'user@mcp.test'; process.env.USER_PASSWORD = 'User-test-123456';
  const {createApp} = await import('../server/main.ts');
  const {WorkspaceService: Store} = await import('../server/workspace/workspace.service.ts');
  const app = await createApp();
  const client = new Client({name: 'e2e', version: '1'});
  const second = new Client({name: 'second-pc', version: '1'});
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(), store = app.get(Store);
    async function request(path: string, token = '', body?: unknown, method = 'POST') {
      return fetch(`${base}/api/${path}`, {method, headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`}, body: body === undefined ? undefined : JSON.stringify(body)});
    }
    const session = await (await request('login', '', {email: process.env.USER_EMAIL, password: process.env.USER_PASSWORD})).json();
    await execute(store.prisma, `UPDATE users SET permissions='{"task.view":true,"task.update":true}' WHERE id=2`);
    const key = await (await request('mcp/token', session.token, {name: 'İş PC'})).json();
    assert.ok(key.token);
    assert.deepEqual(await (await request('mcp/token', session.token, undefined, 'GET')).json(), {active: 1});
    assert.equal((await request('mcp/token', key.token, undefined, 'GET')).status, 401);
    const task = async (name: string, owner: number | null) => (await query(store.prisma, 'INSERT INTO tasks(title,description,"columnId","createdBy","assigneeId") VALUES($1,$1,1,1,$2) RETURNING id', [name, owner]))[0].id;
    const own = await task('Own task', 2), other = await task('Private task', 1), unassigned = await task('Unassigned', null);
    await execute(store.prisma, 'INSERT INTO workflow_transitions VALUES(1,1,2),(1,2,3)');
    const endpoint = new URL(`${base}/api/mcp/http`);
    await client.connect(new StreamableHTTPClientTransport(endpoint, {requestInit: {headers: {Authorization: `Bearer ${key.token}`}}}));
    const secondKey = await (await request('mcp/token', session.token, {name: 'Ev PC'})).json();
    await second.connect(new StreamableHTTPClientTransport(endpoint, {requestInit: {headers: {Authorization: `Bearer ${secondKey.token}`}}}));
    const connections = await (await request('mcp/connections', session.token, undefined, 'GET')).json();
    assert.deepEqual(connections.map((c: {name: string}) => c.name), ['Ev PC','İş PC']);
    assert.ok(connections.every((c: {lastUsedAt: string}) => c.lastUsedAt));
    // TLS sonlandıran ters vekil gibi: dış alan adını Host başlığında korur.
    const savedOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = 'https://sprott.dev';
    let forwardedHost = 'sprott.dev';
    const proxy = createServer((incoming, outgoing) => {
      const upstream = httpRequest(`${base}${incoming.url}`, {method: incoming.method, headers: {...incoming.headers, host: forwardedHost, 'x-forwarded-proto': 'https'}}, response => {
        outgoing.writeHead(response.statusCode!, response.headers); response.pipe(outgoing);
      });
      upstream.on('error', () => {outgoing.writeHead(502); outgoing.end();});
      incoming.pipe(upstream);
    });
    await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
    const proxyUrl = new URL(`http://127.0.0.1:${(proxy.address() as {port: number}).port}/api/mcp/http`);
    const domainClient = new Client({name: 'sprott-domain-check', version: '1'});
    try {
      await domainClient.connect(new StreamableHTTPClientTransport(proxyUrl, {requestInit: {headers: {Authorization: `Bearer ${key.token}`, Origin: 'https://sprott.dev'}}}));
      assert.equal((await domainClient.listTools()).tools.length, 4);
      assert.equal(!!(await domainClient.callTool({name:'list_my_tasks',arguments:{}})).isError, false);
      const headers = {'Content-Type':'application/json', Accept:'application/json, text/event-stream', Authorization:`Bearer ${key.token}`};
      const payload = JSON.stringify({jsonrpc:'2.0',id:77,method:'tools/list',params:{}});
      assert.equal((await fetch(proxyUrl,{method:'POST',headers,body:payload})).status,200);
      assert.equal((await fetch(proxyUrl,{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:payload})).status,403);
      forwardedHost = 'evil.example';
      assert.equal((await fetch(proxyUrl,{method:'POST',headers,body:payload})).status,403);
    } finally {
      await domainClient.close(); proxy.closeAllConnections(); await new Promise<void>(resolve => proxy.close(() => resolve()));
      if (savedOrigin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = savedOrigin;
    }
    assert.doesNotMatch(JSON.stringify(connections), new RegExp(key.token));
    const admin = await (await request('login', '', {email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, role: 'admin'})).json();
    assert.deepEqual(await (await request('mcp/connections', admin.token, undefined, 'GET')).json(), []);
    assert.equal((await request(`mcp/connections/${key.id}`, admin.token, undefined, 'DELETE')).status, 404);
    assert.equal((await fetch(endpoint, {method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}'})).status, 401);
    assert.equal((await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${key.token}`,Origin:'https://evil.example'},body:'{}'})).status,403);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(t => t.name).sort(), ['get_task','get_task_transitions','list_my_tasks','transition_task']);
    async function call(name: string, args: Record<string, unknown> = {}, error = false) {
      const result = await client.callTool({name, arguments: args});
      assert.equal(!!result.isError, error, JSON.stringify(result));
      return result;
    }
    const listed = await call('list_my_tasks');
    assert.equal(!!(await second.callTool({name:'list_my_tasks', arguments:{}})).isError, false);
    await request(`mcp/connections/${secondKey.id}`, session.token, undefined, 'DELETE');
    await assert.rejects(second.listTools());
    await client.listTools();
    assert.equal((await fetch(endpoint)).status, 405);
    assert.match(JSON.stringify(listed), /Own task/); assert.doesNotMatch(JSON.stringify(listed), /Private task|Unassigned/);
    assert.match(JSON.stringify(listed), /projectName/);
    await call('get_task', {taskId: own});
    for (const taskId of [other, unassigned, 99999]) await call('get_task', {taskId}, true);
    await call('add_task_comment', {taskId: own, body: 'No'}, true);
    await call('transition_task', {taskId: own, columnId: 2, expectedColumnId: 1, description: 'No'}, true);
    await call('transition_task', {taskId: other, columnId: 2, expectedColumnId: 1}, true);
    await call('transition_task', {taskId: own, columnId: 3, expectedColumnId: 1}, true);
    await call('get_task_transitions', {taskId: own});
    // İki açık oturum, MCP ve REST değişikliklerini sayfa yenilemeden alır.
    assert.equal((await request('live', '', undefined, 'GET')).status, 401);
    const liveAbort = new AbortController();
    try {
      const streams = await Promise.all([session.token, admin.token].map(async token => {
        const response = await fetch(`${base}/api/live`, {headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.any([liveAbort.signal, AbortSignal.timeout(10000)])});
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type')!, /text\/event-stream/);
        return response.body!.getReader();
      }));
      const receive = async () => {
        for (const stream of streams) {
          const {value, done} = await stream.read();
          assert.equal(done, false);
          assert.equal(new TextDecoder().decode(value), 'data: changed\n\n');
        }
      };
      await receive(); // Yeniden bağlantıda da ilk veri tazelenir.
      await call('transition_task', {taskId: own, columnId: 2, expectedColumnId: 1});
      await receive();
      assert.equal((await request(`tasks/${other}`, admin.token, {columnId: 2}, 'PATCH')).status, 200);
      await receive();
    } finally {liveAbort.abort();}
    assert.equal((await query(store.prisma, 'SELECT "columnId" FROM tasks WHERE id=$1',[own]))[0].columnId, 2);
    assert.equal((await query(store.prisma, 'SELECT count(*)::int AS count FROM activity_log WHERE "taskId"=$1',[own]))[0].count, 1);
    await call('transition_task', {taskId: own, columnId: 3, expectedColumnId: 1}, true);
    await execute(store.prisma, 'UPDATE projects SET "completedAt"=now() WHERE id=1');
    await call('transition_task', {taskId: own, columnId: 3, expectedColumnId: 2}, true);
    await execute(store.prisma, 'UPDATE projects SET "completedAt"=NULL WHERE id=1');
    await call('transition_task', {taskId: own, columnId: 3, expectedColumnId: 2});
    assert.equal((await query(store.prisma, 'SELECT "columnId" FROM tasks WHERE id=$1',[own]))[0].columnId, 3);
    await execute(store.prisma, 'UPDATE tasks SET "columnId"=2 WHERE id=$1', [own]);
    await execute(store.prisma, `UPDATE users SET permissions='{"task.view":true}' WHERE id=2`);
    await call('transition_task', {taskId: own, columnId: 3, expectedColumnId: 2}, true);
    await execute(store.prisma, `UPDATE users SET role='admin' WHERE id=2`);
    await call('get_task', {taskId: other}, true);
    await call('transition_task', {taskId: own, columnId: 1, expectedColumnId: 2}, true);
    assert.equal((await request(`tasks/${own}/comments`, key.token, {body: 'No'})).status, 401);
    await execute(store.prisma, 'UPDATE tasks SET "assigneeId"=1 WHERE id=$1', [own]);
    await call('get_task', {taskId: own}, true);
    await execute(store.prisma, 'UPDATE mcp_tokens SET expires=0 WHERE id=$1', [key.id]);
    await assert.rejects(client.listTools());
    const expiredList = await (await request('mcp/connections', session.token, undefined, 'GET')).json();
    assert.equal(expiredList[0].expires, 0);
    await request('mcp/token', session.token, undefined, 'DELETE');
    assert.deepEqual(await (await request('mcp/token', session.token, undefined, 'GET')).json(), {active: 0});
    await assert.rejects(client.listTools());
  } finally {
    await client.close(); await second.close(); await app.close();
    await db.query(`DROP SCHEMA ${schema} CASCADE`); await db.end();
  }
});
