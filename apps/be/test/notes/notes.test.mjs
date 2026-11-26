import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { loadDatabaseConfig } from '../../dist/config/env.js';
import { runMigrations } from '../../dist/db/migrate.js';
import { createPgPool } from '../../dist/db/postgres.js';
import { NotesRepository } from '../../dist/notes/notes.repository.js';
import {
  NotesService,
  ResourceNotFoundError,
} from '../../dist/notes/notes.service.js';

const config = loadDatabaseConfig();

async function createAccount(pool) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO accounts (id, email, password_hash, role, activated_at)
     VALUES ($1, $2, 'hash', 'USER', NOW())`,
    [id, `note-user-${id}@example.com`],
  );
  return id;
}

test('AC-04, AC-06, AC-07, AC-16, AC-18: owned notes CRUD, isolation, and pagination', async () => {
  const pool = createPgPool(config.databaseUrl);

  try {
    await runMigrations(pool);
    const ownerA = await createAccount(pool);
    const ownerB = await createAccount(pool);

    const service = new NotesService(new NotesRepository(pool));

    const created = await service.createNote(ownerA, {
      title: 'Meeting summary',
      body: 'Initial body',
      startsAt: new Date('2026-11-26T10:00:00+07:00'),
    });
    assert.equal(created.title, 'Meeting summary');

    const updated = await service.updateNote(ownerA, created.id, {
      title: 'Meeting summary v2',
    });
    assert.equal(updated.title, 'Meeting summary v2');
    assert.equal(updated.body, 'Initial body');

    // Cross-owner read/update/delete rejected with ResourceNotFoundError
    await assert.rejects(
      service.getNote(ownerB, created.id),
      ResourceNotFoundError,
    );
    await assert.rejects(
      service.updateNote(ownerB, created.id, { title: 'Hijack' }),
      ResourceNotFoundError,
    );
    await assert.rejects(
      service.deleteNote(ownerB, created.id),
      ResourceNotFoundError,
    );

    const listDefault = await service.listNotes(ownerA);
    assert.equal(listDefault.pageSize, 10);
    assert.equal(listDefault.totalItems, 1);

    await service.deleteNote(ownerA, created.id);
    await assert.rejects(
      service.getNote(ownerA, created.id),
      ResourceNotFoundError,
    );

    // Archived note appears in archive, can be restored, and expires after 30 days
    const archived = await service.listArchivedNotes(ownerA);
    assert.equal(archived.totalItems, 1);
    assert.equal(archived.items[0].id, created.id);

    const restored = await service.restoreNote(ownerA, created.id);
    assert.equal(restored.id, created.id);
    assert.equal(restored.deletedAt, null);
    assert.equal((await service.listNotes(ownerA)).totalItems, 1);

    // Soft-delete 31 days ago is auto-purged when listing archive
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await service.deleteNote(ownerA, created.id, thirtyOneDaysAgo);
    const afterPurge = await service.listArchivedNotes(ownerA);
    assert.equal(afterPurge.totalItems, 0);
  } finally {
    await pool.end();
  }
});
