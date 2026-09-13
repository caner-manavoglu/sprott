import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardStats } from '../web/src/pages/dashboard-page.tsx';

test('dashboard statistics use the last project column as completed', () => {
  const summary = [{id: 1, name: 'Web', columns: [
    {id: 1, name: 'Yapılacak', taskCount: 3, tasks: []},
    {id: 2, name: 'Devam ediyor', taskCount: 2, tasks: []},
    {id: 3, name: 'Tamamlandı', taskCount: 5, tasks: []},
  ]}];
  assert.deepEqual(dashboardStats(summary, [{id: 1} as never]), {total: 10, completed: 5, inProgress: 2, overdue: 1, completion: 50});
});
