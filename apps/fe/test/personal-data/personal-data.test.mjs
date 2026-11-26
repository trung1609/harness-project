import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function loadTsModule(relPath, mocks = {}) {
  const source = await readFile(join(ROOT_DIR, relPath), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  const customRequire = (id) => {
    if (id in mocks) return mocks[id];
    throw new Error(`Unexpected import ${id} in ${relPath}`);
  };
  const fn = new Function('require', 'module', 'exports', transpiled.outputText);
  fn(customRequire, mod, mod.exports);
  return mod.exports;
}

test('AC-01–03, AC-05–11, AC-16, AC-18: timetable week, status labels, series actions, pagination, and note links', async () => {
  const clientMod = await loadTsModule('src/lib/api/client.ts');
  const notesApiMod = await loadTsModule('src/features/notes/notes-api.ts', {
    '../../lib/api/client': clientMod,
  });
  const tasksApiMod = await loadTsModule('src/features/tasks/tasks-api.ts', {
    '../../lib/api/client': clientMod,
  });
  const helpersMod = await loadTsModule(
    'src/features/tasks/workspace-helpers.ts',
  );

  // 1. Vietnam week Monday calculation & shift across month boundary
  assert.equal(
    helpersMod.currentVietnamMonday(new Date('2026-12-31T23:00:00+07:00')),
    '2026-12-28',
  );
  assert.equal(helpersMod.shiftDate('2026-12-28', 7), '2027-01-04');
  assert.equal(helpersMod.formatDisplayDate('2026-11-23'), '23/11/2026');

  // 2. Status labels (early/late completion, overdue, before start)
  assert.equal(helpersMod.formatTaskStatusLabel('NOT_STARTED', 0), 'Chưa tới giờ');
  assert.equal(helpersMod.formatTaskStatusLabel('DONE', 0), 'Hoàn thành');
  assert.equal(
    helpersMod.formatTaskStatusLabel('DONE', 1),
    'Hoàn thành (trễ 1 ngày)',
  );
  assert.equal(helpersMod.formatTaskStatusLabel('OVERDUE', 2), 'Quá hạn 2 ngày');

  // 3. Filtering empty & populated lists
  const sampleTasks = [
    { id: '1', displayStatus: 'DONE', lateDays: 0 },
    { id: '2', displayStatus: 'OVERDUE', lateDays: 1 },
  ];
  assert.equal(helpersMod.filterTasksByStatus(sampleTasks, 'ALL').length, 2);
  assert.equal(helpersMod.filterTasksByStatus(sampleTasks, 'OVERDUE').length, 1);
  assert.equal(helpersMod.filterTasksByStatus(sampleTasks, 'IN_PROGRESS').length, 0);

  // 4. API client calls for timetable, series EXCEPT_DISPLAYED_WEEK, pagination, and note links
  const calls = [];
  const jsonRes = (status, data) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => data,
  });

  const mockFetch = async (url, init) => {
    calls.push({ url, method: init?.method, body: init?.body });
    if (url.includes('/timetable/weeks')) {
      return jsonRes(200, {
        weekStart: '2026-12-28',
        weekEnd: '2027-01-03',
        dates: ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'],
        tasks: [],
      });
    }
    if (url.includes('/deletions')) {
      return jsonRes(200, { deletedCount: 3 });
    }
    if (url.includes('/notes')) {
      return jsonRes(200, { items: [], page: 1, pageSize: 20, totalItems: 0 });
    }
    return jsonRes(204, null);
  };

  const tasksApi = tasksApiMod.createTasksApiClient({
    fetchImpl: mockFetch,
    cookieSource: 'csrf_token=csrf-xyz',
  });
  const notesApi = notesApiMod.createNotesApiClient({
    fetchImpl: mockFetch,
    cookieSource: 'csrf_token=csrf-xyz',
  });

  const week = await tasksApi.getTimetableWeek('2026-12-28');
  assert.equal(week.weekEnd, '2027-01-03');

  const del = await tasksApi.deleteSeriesOccurrences('series-1', {
    scope: 'EXCEPT_DISPLAYED_WEEK',
    weekStart: '2026-12-28',
  });
  assert.equal(del.deletedCount, 3);

  const notesPage = await notesApi.listNotes(1, 20);
  assert.equal(notesPage.pageSize, 20);

  await tasksApi.linkNote('task-1', 'note-1');
  const linkCall = calls.find((c) => c.url.endsWith('/tasks/task-1/notes/note-1'));
  assert.equal(linkCall.method, 'PUT');
});
