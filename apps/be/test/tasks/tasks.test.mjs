import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { loadDatabaseConfig } from '../../dist/config/env.js';
import { runMigrations } from '../../dist/db/migrate.js';
import { createPgPool } from '../../dist/db/postgres.js';
import { InvalidPaginationError } from '../../dist/lists/pagination.js';
import { NotesRepository } from '../../dist/notes/notes.repository.js';
import { ResourceNotFoundError } from '../../dist/notes/notes.service.js';
import { InvalidTaskSlotError } from '../../dist/tasks/task-status.js';
import { TasksRepository } from '../../dist/tasks/tasks.repository.js';
import { TasksService } from '../../dist/tasks/tasks.service.js';

const config = loadDatabaseConfig();

async function createAccount(pool) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO accounts (id, email, password_hash, role, activated_at)
     VALUES ($1, $2, 'hash', 'USER', NOW())`,
    [id, `task-user-${id}@example.com`],
  );
  return id;
}

test('AC-01, AC-02, AC-04, AC-10, AC-11, AC-16, AC-18: tasks status, Vietnam midnight, overlap, links, and pagination', async () => {
  const pool = createPgPool(config.databaseUrl);

  try {
    await runMigrations(pool);
    const ownerA = await createAccount(pool);
    const ownerB = await createAccount(pool);

    const notesRepo = new NotesRepository(pool);
    const tasksRepo = new TasksRepository(pool);
    const service = new TasksService(tasksRepo, notesRepo);

    // 1. Cross-day / overnight slot rejected (AC-10)
    await assert.rejects(
      service.createTask(ownerA, {
        title: 'Overnight',
        scheduledDate: '2026-11-26',
        startTime: '23:00',
        endTime: '01:00',
      }),
      InvalidTaskSlotError,
    );

    // 2. Overlapping standalone tasks on the same date are allowed (AC-10)
    const beforeStart = new Date('2026-11-26T08:00:00+07:00');
    const task1 = await service.createTask(
      ownerA,
      {
        title: 'Morning Focus',
        scheduledDate: '2026-11-26',
        startTime: '09:00',
        endTime: '10:30',
      },
      beforeStart,
    );
    assert.equal(task1.displayStatus, 'NOT_STARTED');
    assert.equal(task1.lateDays, 0);

    const task2 = await service.createTask(
      ownerA,
      {
        title: 'Overlapping Sync',
        scheduledDate: '2026-11-26',
        startTime: '09:30',
        endTime: '11:00',
      },
      new Date('2026-11-26T09:45:00+07:00'),
    );
    assert.equal(task2.displayStatus, 'TODO');

    // 3. Early completion shows DONE with 0 lateDays; saving DONE again retains completedAt; reopening clears it (AC-01)
    const earlyDone = await service.setProgress(
      ownerA,
      task1.id,
      'DONE',
      beforeStart,
    );
    assert.equal(earlyDone.displayStatus, 'DONE');
    assert.equal(earlyDone.lateDays, 0);
    assert.ok(earlyDone.completedAt !== null);

    const repeatDone = await service.setProgress(
      ownerA,
      task1.id,
      'DONE',
      new Date('2026-11-27T10:00:00+07:00'),
    );
    assert.equal(
      repeatDone.completedAt.getTime(),
      earlyDone.completedAt.getTime(),
    );

    const reopened = await service.setProgress(
      ownerA,
      task1.id,
      'TODO',
      new Date('2026-11-26T10:00:00+07:00'),
    );
    assert.equal(reopened.completedAt, null);
    assert.equal(reopened.displayStatus, 'TODO');

    // 4. Vietnam midnight boundary & late completion (AC-02)
    const justBeforeMidnight = await service.getTask(
      ownerA,
      task2.id,
      new Date('2026-11-26T23:59:59+07:00'),
    );
    assert.equal(justBeforeMidnight.displayStatus, 'TODO');
    assert.equal(justBeforeMidnight.lateDays, 0);

    const atMidnight = await service.getTask(
      ownerA,
      task2.id,
      new Date('2026-11-27T00:00:00+07:00'),
    );
    assert.equal(atMidnight.displayStatus, 'OVERDUE');
    assert.equal(atMidnight.lateDays, 1);

    const lateDone = await service.setProgress(
      ownerA,
      task2.id,
      'DONE',
      new Date('2026-11-27T15:00:00+07:00'),
    );
    assert.equal(lateDone.displayStatus, 'DONE');
    assert.equal(lateDone.lateDays, 1);

    // 5. Ownership & note link cleanup (AC-04, AC-11)
    const noteA = await notesRepo.create(ownerA, {
      title: 'Note A',
      body: 'Owned note',
      startsAt: new Date('2026-11-26T08:00:00+07:00'),
    });
    const noteB = await notesRepo.create(ownerB, {
      title: 'Note B',
      body: 'Other owner note',
      startsAt: new Date('2026-11-26T08:00:00+07:00'),
    });

    await assert.rejects(
      service.linkNote(ownerA, task1.id, noteB.id),
      ResourceNotFoundError,
    );
    await assert.rejects(
      service.getTask(ownerB, task1.id),
      ResourceNotFoundError,
    );

    await service.linkNote(ownerA, task1.id, noteA.id);
    const linkedList = await service.listTaskNotes(ownerA, task1.id);
    assert.equal(linkedList.totalItems, 1);
    assert.equal(linkedList.items[0].id, noteA.id);

    // Deleting task preserves noteA
    await service.deleteTask(ownerA, task1.id);
    const preservedNote = await notesRepo.findOwnedById(ownerA, noteA.id);
    assert.ok(preservedNote !== null);

    // 6. Pagination defaults (10) and allowed sizes (AC-16, AC-18)
    for (let i = 0; i < 11; i += 1) {
      await service.createTask(ownerA, {
        title: `Batch ${i}`,
        scheduledDate: '2026-11-28',
        startTime: '08:00',
        endTime: '09:00',
      });
    }

    const defaultPage = await service.listTasks(ownerA);
    assert.equal(defaultPage.page, 1);
    assert.equal(defaultPage.pageSize, 10);
    assert.equal(defaultPage.items.length, 10);
    assert.equal(defaultPage.totalItems, 12);

    const page20 = await service.listTasks(ownerA, 1, 20);
    assert.equal(page20.pageSize, 20);
    assert.equal(page20.items.length, 12);

    await assert.rejects(
      service.listTasks(ownerA, 1, 15),
      InvalidPaginationError,
    );
  } finally {
    await pool.end();
  }
});
