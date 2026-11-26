# Phase 2 — Authentication and support

**Status: Phase 2 baseline.** [REQUIREMENTS.md](../REQUIREMENTS.md) records the confirmed behavior. The user approved the expiry values and Gmail delivery policy below. Provider integration and operational settings require validation.

## Account activation

1. Register with email and password. New accounts have role `USER` and remain pending activation. Store a password hash in PostgreSQL. The proposed algorithm is Argon2id. See [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
2. Email a link using an opaque, single-use activation token. Keep the token verifier and account binding in Redis with a TTL of 30 minutes. The link opens an activation screen that confirms activation through a write request. Treat a repeated confirmation for an already activated account as a safe outcome.
3. When a link expires, let the user request another using the registered email. Rate-limit registration, activation, resend and sign-in. Use a generic resend acknowledgment. Only pending accounts receive another link. Replace the previous token and retry failed email delivery without allowing password sign-in before activation.
4. Sign-in checks credentials, activation and account lock before creating a session. PostgreSQL owns the account status and role. Do not log passwords, tokens or full activation URLs.

## Redis session lifecycle

| Operation | Proposed behavior |
| --- | --- |
| Sign in | Create one hash keyed by `sessionId` with exactly the agreed fields `accessToken`, `refreshToken`, `accessTokenExpAt`, `refreshTokenExpAt` and `userInfo`. Use opaque tokens. Protect the token fields using one-way verifiers. Limit `userInfo` to account ID and a session generation number. |
| Authenticate | Match the access token verifier and expiry, then check the account's current status, role and generation in PostgreSQL. Access tokens expire after 15 minutes or at the session deadline, whichever comes first. Failed session or account checks deny access. |
| Refresh | Check refresh expiry and account state. Atomically replace both tokens and store their expiry values, retaining the original seven-day session deadline. Expire the whole hash at that deadline. Concurrent refresh requests must have at most one successful rotation. See [Redis transactions](https://redis.io/docs/latest/develop/using-commands/transactions/). |
| Logout | Remove the current session hash and clear the browser credentials. |
| Lock and unlock | On lock, change account state and increment its session generation in the same PostgreSQL transaction. This invalidates existing sessions even if Redis cleanup is delayed. Unlocking allows a new sign-in. Previously invalidated sessions stay invalid. |

For the browser, propose a same-origin route to NestJS with HttpOnly, Secure cookies and CSRF protection for state-changing requests. Confirm routing and cookie settings with the deployment design.

## Email delivery

Use Gmail SMTP with TLS for activation, unlock verification and support notifications. Make an initial delivery attempt promptly. Record failures as pending jobs in PostgreSQL and retry them. If a pending activation email is retried after its link expires, issue a fresh link for the still-pending account and supersede the old one before sending. Stop activation delivery once the account is active. Select and test retry timing, limits and the triggering mechanism during implementation planning and staging.

## Support and evidence

- Signed-in users submit account-support requests or bug reports. A locked user begins the unlock flow on the login screen and verifies control of the registered email using a separate, short-lived verification link. The resulting permission is limited to submitting an unlock request for that account. It grants no normal session. Rate-limit the unauthenticated request flow and upload attempts.
- Require request text and one evidence image. NestJS authorizes a short-lived upload intent bound to the account or unlock proof and assigns a unique Cloudinary public ID with overwrite disabled. The browser uploads directly to Cloudinary as an authenticated image, then submits the intent ID with the request text. Use a signed upload configuration restricted to supported images and enforce the 10 MB limit. Before accepting the request, NestJS reads trusted asset metadata from Cloudinary and checks the assigned ID, delivery type, actual format, size and intent ownership. Accept PNG, JPG/JPEG and WebP as the baseline.
- Persist the verified Cloudinary HTTPS URL and asset identifiers with the request. Consume the intent in the same database transaction so it can be attached only once. The evidence route checks the request owner's or ADMIN's permission and returns a short-lived viewing URL for the frontend to load directly from Cloudinary. The database stores the stable URL without viewer credentials. Unrelated users cannot request a viewing link. Clean up rejected or abandoned uploads and reconcile assets left after a failed database write. See [Cloudinary signed uploads](https://cloudinary.com/documentation/client_side_uploading) and [time-limited delivery](https://cloudinary.com/documentation/image_upload_api_reference#private_download_url).
- Propose submitted, in review and resolved states. When ADMIN approves an unlock request, update the request and unlock the account in one PostgreSQL transaction. For an approval or support reply, record the email notification in the same transaction and send it afterward with retries. An email failure leaves the decision recorded and the notification pending.
- Log request ID, actor ID, action, outcome and time for administrative decisions. Keep evidence, private notes, credentials and provider secrets out of logs and notification emails.

## Verification scenarios

| Scenario | Expected result |
| --- | --- |
| Activate using an expired link, resend, then use the new link | Only the new valid link activates the pending account. A duplicate confirmation is safe. |
| Sign in before and after activation | Denied while pending. Valid credentials after activation create the agreed session hash. |
| Refresh the same session concurrently | At most one rotation succeeds. The replaced token cannot refresh again. |
| Lock while two sessions exist, then unlock | Both old sessions remain invalid and a new sign-in succeeds after unlock with valid credentials. |
| Submit an unlock request | Verified control of the registered email permits submitting text and evidence while locked. Normal access remains denied. |
| Test image limits and storage failure | A supported image at the approved boundary can be submitted. Missing, unsupported and larger files are rejected. Storage failure does not leave a submitted request without evidence. |
| Read another user's evidence or notes | An unrelated user cannot read evidence. ADMIN can open support evidence and cannot read private notes or tasks. |
| Retry an approval or notification | The recorded account decision remains consistent. A retry does not apply the decision a second time. |
| Retry an activation email after link expiry | A fresh link is issued for the pending account. The expired link stays invalid. |
