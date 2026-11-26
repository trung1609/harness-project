import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { loadDatabaseConfig } from '../../dist/config/env.js';
import { runMigrations } from '../../dist/db/migrate.js';
import { createPgPool } from '../../dist/db/postgres.js';
import {
  SchedulingRepository,
  SeriesConflictError,
} from '../../dist/scheduling/scheduling.repository.js';
import { SchedulingService } from '../../dist/scheduling/scheduling.service.js';

const config = loadDatabaseConfig();

async function createAccount(pool) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO accounts (id, email, password_hash, role, activated_at)
     VALUES ($1, $2, 'hash', 'USER', NOW())`,
    [id, `sched-${id}@example.com`],
  );
  return id;
}

test('AC-03, AC-05, AC-08, AC-09: monthly weekly recurrence, month-end clamp, rollbacks, preserve-week, and concurrency', async () => {
  const pool = createPgPool(config.databaseUrl);

  try {
    await runMigrations(pool);
    const owner = await createAccount(pool);
    const service = new SchedulingService(new SchedulingRepository(pool));

    // 1. Start weekly series on 26 Nov -> only 26 Nov exists
    const novSeries = await service.createWeeklySeries(owner, {
      title: 'Nov Review',
      scheduledDate: '2026-11-26',
      startTime: '18:00',
      endTime: '19:00',
    });
    assert.deepEqual(
      novSeries.occurrences.map((o) => o.scheduledDate),
      ['2026-11-26'],
    );

    // 2. Start weekly series on 7 Dec -> 7, 14, 21, 28 Dec
    const decSeries = await service.createWeeklySeries(owner, {
      title: 'Dec Planning',
      scheduledDate: '2026-12-07',
      startTime: '09:00',
      endTime: '10:00',
    });
    assert.deepEqual(
      decSeries.occurrences.map((o) => o.scheduledDate),
      ['2026-12-07', '2026-12-14', '2026-12-21', '2026-12-28'],
    );

    // 3. Move 28 Dec (Mon) to 2 Jan (+5 days) -> clamps to 31 Dec (Thu)
    const dec28 = decSeries.occurrences[3];
    const movedEnd = await service.editSeries(
      owner,
      decSeries.seriesId,
      dec28.id,
      { scope: 'CURRENT' },
      { scheduledDate: '2027-01-02' },
    );
    assert.equal(movedEnd[0].scheduledDate, '2026-12-31');

    // 4. Reject previous-month shift and preserve all occurrences
    const dec07 = decSeries.occurrences[0];
    await assert.rejects(
      service.editSeries(
        owner,
        decSeries.seriesId,
        dec07.id,
        { scope: 'CURRENT' },
        { scheduledDate: '2026-11-30' },
      ),
      SeriesConflictError,
    );

    // 5. Reject bulk shift that places two occurrences on 31 Dec
    const dec21 = decSeries.occurrences[2];
    await assert.rejects(
      service.editSeries(
        owner,
        decSeries.seriesId,
        dec21.id,
        { scope: 'SELECTED', additionalTaskIds: [dec28.id] },
        { scheduledDate: '2026-12-31' },
      ),
      SeriesConflictError,
    );

    // 6. Timetable week spanning two months (Mon 2026-12-28 .. Sun 2027-01-03)
    const spanWeek = await service.getTimetableWeek(owner, '2026-12-28');
    assert.equal(spanWeek.weekEnd, '2027-01-03');
    assert.equal(spanWeek.tasks.length, 1);
    assert.equal(spanWeek.tasks[0].scheduledDate, '2026-12-31');

    // 7. Concurrent edits serialize cleanly
    const [r1, r2] = await Promise.all([
      service.editSeries(
        owner,
        decSeries.seriesId,
        dec07.id,
        { scope: 'ALL' },
        { title: 'Dec Planning A' },
      ),
      service.editSeries(
        owner,
        decSeries.seriesId,
        dec07.id,
        { scope: 'ALL' },
        { title: 'Dec Planning B' },
      ),
    ]);
    assert.equal(r1.length, 4);
    assert.equal(r2.length, 4);

    // 8. Delete EXCEPT_DISPLAYED_WEEK (2026-12-28..2027-01-03) keeps 2026-12-31 and leaves Nov series untouched
    const delRes = await service.deleteSeriesOccurrences(
      owner,
      decSeries.seriesId,
      {
        scope: 'EXCEPT_DISPLAYED_WEEK',
        weekStart: '2026-12-28',
      },
    );
    assert.equal(delRes.deletedCount, 3);

    const remainingDec = await service.getTimetableWeek(owner, '2026-12-28');
    assert.equal(remainingDec.tasks.length, 1);
    assert.equal(remainingDec.tasks[0].id, dec28.id);

    const novWeek = await service.getTimetableWeek(owner, '2026-11-23');
    assert.equal(novWeek.tasks.length, 1);
    assert.equal(novWeek.tasks[0].seriesId, novSeries.seriesId);
  } finally {
    await pool.end();
  }
});
