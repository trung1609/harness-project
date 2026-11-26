# Requirements — Phase 1 baseline

## Confirmed product context

Source for this section: user clarification in the Phase 1 conversation, 2026-11-26.

- **CTX-01:** The product is a personal notebook for each user to take notes. It is a personal project that may have a few other real users.
- **CTX-02:** The user does not want an MVP designation; discuss the first release instead. The user said team collaboration is not needed.
- **CTX-03:** The initial project name was Task Management System; whether it should be renamed remains open.
- **CTX-04:** The user selected NestJS backend, PostgreSQL database and Next.js frontend, replacing the original Java/Spring proposal. The motivation includes a lighter deployment and free hosting; actual hosting options and limits remain unverified.

## First-release capabilities confirmed by the user

These requirements and the acceptance scenarios below define the first-release baseline. Source: user clarification in the Phase 1 conversation, 2026-11-26.

- **FR-01:** Anyone can register with an email address. The system sends an activation link to that address. Users must follow the link and successfully activate the account before they can sign in with their email address and password. An expired activation link offers a button to request a new link by email.
- **FR-02:** Users organize their own tasks by day and can create, view, edit and delete them in the weekly timetable. Each task belongs to one calendar day in Vietnam time. Both required, editable slot times must fall on that day, and the task is due that same day. Slots may overlap.
- **FR-03:** Users can create, view, edit and delete their own notes. Notes have a title and text content, a user-editable start date and time, and a separate last-updated time. Users may link multiple notes to a task and reuse a note across multiple tasks. Deleting a linked item removes its links and preserves the other items.
- **FR-04:** The roles are `ADMIN` and `USER`. An administrator manages users and requests but must not view other users' notes or tasks. A user may view only their own notes and tasks.
- **FR-05:** Before a task's scheduled start, show `Chưa đến hạn` if the task is unfinished. From the scheduled start through the deadline date, show its progress. At 00:00 on the day after its deadline in Vietnam time, an unfinished task shows `Quá hạn`. Users can mark a task `Xong` before its scheduled start. A completed task shows `Xong`, with the difference in calendar days between its completion date in Vietnam and its deadline if completed late. The full set of progress transitions remains open.
- **FR-06:** The deadline is the task's scheduled calendar date. Backend and frontend must agree on the current Vietnam time (`Asia/Ho_Chi_Minh`) when evaluating and displaying time-based task status, even if the server uses a different timezone.
- **FR-07:** Weekly recurrence stays within the calendar month of the task's scheduled start date in Vietnam time. To repeat in the following month, the user creates a new task with a start date in that month and enables weekly recurrence. Each occurrence is a separate task, starts at `TODO` and is due on its own scheduled date. Updating one occurrence's progress leaves the others unchanged. FR-09 defines the scope of series edits.
- **FR-08:** ADMIN handles account-support requests, bug reports and account-unlock requests, and can lock or unlock user accounts. A locked user can send an unlock request to ADMIN from the login screen. Request text and an evidence image are required, including for unlock requests. Evidence uploads accept supported image formats only. ADMIN can view the submitted text and evidence. When ADMIN approves a request or responds to a support request, the system emails the user so they can follow the outcome. FR-04 continues to apply to private notes and tasks.
- **FR-09:** Users can edit and delete their own recurring tasks. An edit applies to the occurrence in the current week by default. Users can also apply it to selected additional weeks or to all weeks in the monthly series. When deleting future occurrences, users can select and confirm the target weeks. Bulk deletion supports deleting all occurrences of the series in the month or deleting the month's occurrences while preserving the current week. For these actions, the current week is the week open in the timetable. Progress changes remain specific to one occurrence as defined in FR-07.
- **FR-10:** Search and filtering apply across the first-release data views. Search by name or title where the record has such a field. Filters include scheduled start date and deadline date on applicable views. For daily tasks both refer to the same calendar date under FR-06. Other search fields and filters may vary by screen. All table and list views, including tasks, notes, users and support requests, are paginated. The default is 10 items per page. Users can select 10, 20, 30, 40 or 50 items per page. Search, filtering and pagination must respect the visibility rules in FR-04.

## User-selected technical constraints

- **TC-01 (FR-01):** Store the activation link token verifier in Redis with a 30-minute TTL. An expired token cannot activate the account. See the [activation and resend policy](specs/auth-and-support.md).
- **TC-02 (FR-01):** Store each signed-in session as a Redis hash identified by `sessionId`, with fields `accessToken`, `refreshToken`, `accessTokenExpAt`, `refreshTokenExpAt` and `userInfo`. Access tokens last up to 15 minutes and sessions last up to seven days. See the [session lifecycle](specs/auth-and-support.md).
- **TC-03 (FR-08):** The browser uploads support evidence directly to Cloudinary. After verification, store the Cloudinary image URL in PostgreSQL with the support request so the frontend can display the image to authorized viewers. Accept common image formats, including PNG, JPG/JPEG and WebP, up to 10 MB per image. The complete list of additional formats and retention rules remain open for specification.

## Initial acceptance scenarios

- **AC-01 (FR-05, FR-06):** For an unfinished task due on the 10th, backend and frontend agree that it becomes overdue at 00:00 on the 11th in Vietnam, even if the server uses a different timezone.
- **AC-02 (FR-05):** Marking a task due on the 10th `Xong` on the 11th in Vietnam displays `Trễ 1 ngày`. The owner can also complete a task before its scheduled start date.
- **AC-03 (FR-02, FR-07):** Each weekly occurrence starts at `TODO`. Marking one occurrence `Xong` leaves the others at their existing progress. A task starting on 26 November generates no December occurrences. If the user creates a new recurring task starting on 3 December, it can repeat on 10, 17, 24 and 31 December and stops before January.
- **AC-04 (FR-04, FR-08):** An ADMIN can lock a user account and handle a support request without gaining access to the user's private notes or tasks. A USER viewing notes or the timetable sees only their own data.
- **AC-05 (FR-05, FR-07):** A weekly task starting on 7 December also has occurrences on 14, 21 and 28 December. Each is due on its own scheduled date. Completing the 14 December occurrence on 15 December displays `Trễ 1 ngày` for that occurrence only.
- **AC-06 (FR-03):** After saving a change to a note's start date or time, the owner sees the new value when reopening the note. The last-updated time is tracked separately.
- **AC-07 (FR-02, FR-03):** A user can create a note and a task independently, optionally link them, and reopen the task after changing both times to see the updated slot in the timetable.
- **AC-08 (FR-09):** Confirming deletion for selected future weeks removes only the selected occurrences. Deleting the whole monthly series removes its monthly occurrences. Choosing the bulk option that preserves the current week leaves those occurrences visible.
- **AC-09 (FR-07, FR-09):** When the user opens a week other than today's week, saving an edit without applying it to other weeks updates only the occurrence in the displayed week. Choosing specific additional weeks updates those occurrences too. Choosing all weeks updates the entire monthly series. Each occurrence retains its own progress. The bulk delete option that preserves the current week preserves the displayed week.
- **AC-10 (FR-02, FR-06):** A Monday slot from 19:00 to 21:00 is valid and due on Monday. Creating or editing a task with no end time, an end time on another day, or a deadline on another day is rejected. Two same-day tasks may share part or all of a time slot.
- **AC-11 (FR-03):** A task can link to two notes, and one of those notes can also link to a second task. Deleting the first task removes its links while preserving the notes, the second task and its link.
- **AC-12 (FR-04, FR-08):** A locked user can submit an unlock request from the login screen. ADMIN receives it and can unlock the account without gaining access to the user's notes or tasks.
- **AC-13 (FR-01, TC-01):** Registration sends an activation link to the address entered. Sign-in is denied before activation. Opening an expired link offers a resend button. Requesting a resend sends a new link to the registered address. Opening a valid link activates the account and enables sign-in with the correct email and password.
- **AC-14 (FR-01, TC-02):** A successful sign-in creates a Redis hash for its `sessionId` with the five specified fields.
- **AC-15 (FR-08):** When ADMIN approves an unlock request or responds to a support request, the requester receives a follow-up email.
- **AC-16 (FR-04, FR-10):** A table or list defaults to 10 items per page and offers exactly 10, 20, 30, 40 and 50. Changing the page size displays up to the chosen number of matching items. Searching, filtering or moving between pages exposes only records the user is authorized to see.
- **AC-17 (FR-08, TC-03):** A support or unlock request is rejected if the evidence image is missing, its actual format is unsupported, or it exceeds 10 MB. A valid PNG, JPG/JPEG or WebP of up to 10 MB can be submitted with request text and uploaded to Cloudinary. ADMIN can open it from the request. Access to submitted evidence does not grant access to private notes or tasks.
- **AC-18 (FR-04, FR-10):** In a task list, searching by name and applying a start-date or deadline-date filter shows only matching tasks owned by the signed-in user.

## Phase 2 specification handoff

1. [Data and scheduling](specs/data-and-scheduling.md) specifies daily slots, progress, reopening, weekly recurrence and month-end edits.
2. [Authentication and support](specs/auth-and-support.md) specifies activation, session revocation, support access and Gmail delivery.
3. [API contract](specs/api-contract.md) records list and filter behavior, direct Cloudinary upload and error handling.
4. [Deployment and verification](specs/deployment-and-verification.md) records the approved Vercel topology and provider validation plan. Additional filters and image formats, retention policy, retry settings and latency targets remain implementation planning or verification items. Bring any change to a confirmed requirement back to the user.

## Status

**COMPLETE for Phase 1.** The product purpose, audience, first-release scope and initial acceptance scenarios are recorded. Phase 2 decisions are linked above.
