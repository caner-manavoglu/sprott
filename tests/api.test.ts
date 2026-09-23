import { installTestSchema } from './database.ts';
import { sql } from '../server/prisma/sql.ts';
import { PrismaService } from '../server/prisma/prisma.service.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

test('login, role boundaries, task permissions, columns, moves and persistence', async () => {
  const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  assert.ok(connectionString, 'Test için PostgreSQL DATABASE_URL gerekli.');
  const database = new Pool({connectionString});
  const schema = `sprott_test_${randomUUID().replaceAll('-', '')}`;
  await database.query(`CREATE SCHEMA ${schema}`);
  const testUrl = new URL(connectionString);
  testUrl.searchParams.set('options', `-c search_path=${schema}`);
  testUrl.searchParams.set('schema', schema);
  await installTestSchema(database, schema);
  process.env.DATABASE_URL = testUrl.toString();
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_EMAIL = 'admin@test.local';
  process.env.USER_EMAIL = 'user@test.local';
  process.env.ADMIN_PASSWORD = 'Admin-test-123456';
  process.env.USER_PASSWORD = 'Personel-test-123456';
  const { createApp } = await import('../server/main.ts');
  const { WorkspaceService: Store } = await import('../server/workspace/workspace.service.ts');
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  async function request(path: string, method = 'GET', body?: unknown, token = '') {
    const headers: Record<string, string> = {'content-type':'application/json'};
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${url}/api/${path}`, {method, headers, body:body ? JSON.stringify(body):undefined});
    return {status:response.status, data:await response.json()};
  }
  try {
    assert.equal((await request('projects/1/board')).status, 401);
    assert.equal((await request('login','POST',{email:'admin@test.local',password:process.env.ADMIN_PASSWORD,role:'user'})).status,401);
    assert.equal((await request('login','POST',{email:'admin@test.local',password:'wrong',role:'admin'})).status,401);
    const administrator = await request('login','POST',{email:'admin@test.local',password:process.env.ADMIN_PASSWORD,role:'admin'});
    const personnel = await request('login','POST',{email:'user@test.local',password:process.env.USER_PASSWORD,role:'user'});
    assert.equal(administrator.status,201); assert.equal(personnel.status,201);
    const a = administrator.data.token, u = personnel.data.token;
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(administrator.data.role, 'admin');
    // Tokensiz ve sahte token’lı istekler reddedilmeli.
    assert.equal((await request('me')).status, 401);
    assert.equal((await request('me','GET',undefined,'sahte-token')).status, 401);
    assert.equal((await request('permissions','GET',undefined,u)).status,403);
    assert.equal((await request('columns','POST',{name:'Forbidden',projectId:1},u)).status,403);
    assert.equal((await request('columns/order','PATCH',{columnIds:[3,1,2]},u)).status,403);
    for (const columnIds of [[1,1,2],[1,2],[1,2,999],['1',2,3]]) {
      assert.equal((await request('columns/order','PATCH',{columnIds},a)).status,400);
    }
    const sorted = await request('columns/order','PATCH',{columnIds:[3,1,2]},a);
    assert.equal(sorted.status,200);
    assert.deepEqual(sorted.data.columns.map((column: {id:number})=>column.id),[3,1,2]);
    assert.deepEqual((await request('projects/1/board','GET',undefined,a)).data.columns.map((column: {id:number})=>column.id),[3,1,2]);
    await app.get(Store).initialize();
    assert.deepEqual((await request('projects/1/board','GET',undefined,a)).data.columns.map((column: {id:number})=>column.id),[3,1,2]);
    const task = {title:'İlk task',description:'Açıklama',columnId:1};
    assert.equal((await request('tasks','POST',task,u)).status,403);
    assert.equal((await request('tasks','POST',{...task,title:' '},a)).status,400);
    const created = await request('tasks','POST',task,a);
    assert.equal(created.status,201); const taskId = created.data.tasks[0].id;
    assert.equal((await request('permissions/2','PATCH',{permissions:{'task.create':'evet'}},a)).status,400);
    assert.equal((await request('permissions/2','PATCH',{permissions:{'task.explode':true}},a)).status,400);
    assert.equal((await request('permissions/1','PATCH',{permissions:{'task.create':true}},a)).status,400);
    assert.equal((await request('permissions/2','PATCH',{permissions:{'task.create':true}},u)).status,403);
    const granted = await request('permissions/2','PATCH',{permissions:{'task.view':true,'task.create':true,'task.update':true}},a);
    assert.equal(granted.status,200);
    assert.deepEqual(granted.data[1].permissions,{'task.view':true,'task.create':true,'task.update':true});
    const definitions = await request('permissions/definitions','GET',undefined,a);
    const { PERMISSIONS } = await import('../server/common/fields.ts');
    assert.deepEqual(definitions.data.map((item: {key: string}) => item.key),[...PERMISSIONS]);
    assert.equal((await request('permissions/definitions','GET',undefined,u)).status,403);
    const own = await request('tasks','POST',task,u);
    assert.equal(own.status,201);
    const personnelTaskId = own.data.tasks[0].id;
    // task.delete verilmediği sürece silme reddedilir.
    assert.equal((await request(`tasks/${personnelTaskId}`,'DELETE',undefined,u)).status,403);
    assert.equal((await request(`tasks/${personnelTaskId}`,'DELETE',undefined,a)).status,200);
    await request('permissions/2','PATCH',{permissions:{}},a);
    assert.equal((await request('tasks','POST',task,u)).status,403);
    // task.view kapalıyken pano task’ları gizlenir, sütunlar görünmeye devam eder.
    const hidden = await request('projects/1/board','GET',undefined,u);
    assert.equal(hidden.status,200);
    assert.deepEqual(hidden.data.tasks,[]);
    assert.ok(hidden.data.columns.length);
    await request('permissions/2','PATCH',{permissions:{'task.view':true,'task.update':true}},a);
    const columns = await request('columns','POST',{name:'İnceleme',projectId:1},a);
    const columnId = columns.data.columns.at(-1).id;
    assert.equal((await request(`columns/${columnId}`,'PATCH',{name:'Kontrol'},a)).status,200);
    assert.equal((await request(`tasks/${taskId}`,'PATCH',{columnId},u)).status,403);
    await request(`tasks/${taskId}`,'PATCH',{assigneeId: 2},a);
    assert.equal((await request(`tasks/${taskId}`,'PATCH',{columnId},u)).status,200);
    assert.equal((await request(`tasks/${taskId}`,'PATCH',{columnId:999},u)).status,404);
    assert.equal((await request(`columns/${columnId}`,'DELETE',undefined,a)).status,400);
    assert.equal((await request(`tasks/${taskId}`,'PATCH',{columnId:2},u)).status,403);
    await request(`tasks/${taskId}`,'PATCH',{columnId:2},a);
    assert.equal((await request(`columns/${columnId}`,'DELETE',undefined,a)).status,200);
    // Çerez artık kabul edilmiyor: ambient credential ile istek atılamaz.
    const cookieOnly = await fetch(`${url}/api/tasks`,{method:'POST',headers:{cookie:`session=${a}`,'content-type':'application/json'},body:JSON.stringify(task)});
    assert.equal(cookieOnly.status,401);
    const reopened = new Store(new PrismaService());
    assert.equal((await reopened.board(1)).tasks.length,1); await reopened.prisma.$disconnect();
    assert.equal((await request('logout','POST',undefined,u)).status,201);
    assert.equal((await request('projects/1/board','GET',undefined,u)).status,401);
    const document = await request('docs-json');
    assert.equal(document.status, 200);
    assert.equal(document.data.info.title, 'Sprott REST API');
    assert.ok(['/api/login','/api/logout','/api/me','/api/columns','/api/columns/order','/api/columns/{id}','/api/tasks','/api/tasks/{id}','/api/permissions','/api/permissions/definitions','/api/permissions/{id}','/api/users','/api/users/{id}','/api/groups','/api/groups/members','/api/groups/{id}','/api/projects','/api/projects/{id}','/api/projects/{id}/members','/api/projects/{id}/members/{userId}','/api/projects/{id}/board','/api/dashboard'].every(path => path in document.data.paths));
    assert.ok(document.data.paths['/api/tasks/{id}'].patch.requestBody);
    assert.ok(document.data.paths['/api/tasks/{id}'].delete);
    assert.deepEqual(document.data.paths['/api/tasks'].post.requestBody.content['application/json'].schema.required, ['title','description','columnId']);
    assert.equal(document.data.components.securitySchemes.bearer.scheme, 'bearer');
    assert.ok(document.data.paths['/api/projects/{id}/board'].get.security.some((item: {bearer?: unknown}) => item.bearer));
    assert.ok(document.data.paths['/api/login'].post.responses['201'].content['application/json'].schema.properties.token);
    assert.equal((await fetch(`${url}/api/docs/`)).status,200);
    // Two parallel deletions cannot remove the last column.
    await sql(app.get(PrismaService), 'DELETE FROM tasks');
    await request('columns/3','DELETE',undefined,a);
    const deletes = await Promise.all([request('columns/1','DELETE',undefined,a),request('columns/2','DELETE',undefined,a)]);
    assert.deepEqual(deletes.map(result => result.status).sort(),[200,400]);
    assert.equal((await request('projects/1/board','GET',undefined,a)).data.columns.length,1);
  } finally {
    await app.close();
    await database.query(`DROP SCHEMA ${schema} CASCADE`);
    await database.end();
  }
});
