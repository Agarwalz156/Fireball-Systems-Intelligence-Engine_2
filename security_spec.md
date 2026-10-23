# Fireball Security Specification & Threat Model

## 1. Data Invariants
- **Machine Ownership Invariant:** A Machine resource must always have `ownerId == request.auth.uid`. A user can only read, update, or list machines they own.
- **Relational Integrity Invariant:** Telemetry samples, anomalies, investigations, and experiments belong strictly to a machine. Read and write access to any subcollection document requires verifying that the parent machine's `ownerId == request.auth.uid`.
- **System Isolation Invariant:** Telemetry samples are immutable once created. They cannot be altered by malicious clients to rewrite history.
- **Identity Invariant:** Users can only view and mutate their own UserProfile (`request.auth.uid == userId`).
- **Input Bounds Invariant:** IDs must adhere to standard length (<= 128 chars) and regex `^[a-zA-Z0-9_\-]+$`. Strings must have explicit length bounds to prevent resource exhaustion attacks.

## 2. The "Dirty Dozen" Payloads (Attacks Prevented by Security Rules)
1. **Machine Stealing:** Attempt to create or update `/machines/{machineId}` with `ownerId` set to another user's UID.
2. **Subcollection Orphan Injection:** Attempt to create a telemetry sample under a machine belonging to another user.
3. **Telemetry Tampering:** Attempt to update or edit an existing `/machines/{machineId}/telemetry/{telemetryId}` document.
4. **ID Poisoning Attack:** Attempt to write a document using an oversized 1KB or malicious character sequence ID.
5. **Shadow Field Injection:** Attempt to inject unallowed properties (`isAdmin: true`, `backdoor: true`) into machine or user documents.
6. **Investigation Hijacking:** User A attempting to delete or alter User B's diagnostic investigation.
7. **Unauthenticated Read of Host Telemetry:** Reading another machine's kernel load, PSI, and process telemetry without auth.
8. **Negative / NaN Metrics Injection:** Writing malformed non-number metrics to corrupt statistical baselines.
9. **Experiment Outcome Override:** Unauthorized user attempting to mark an experiment as 'supported' or altering notes.
10. **Machine Enrollment Token Theft:** Reading other users' enrollment tokens across machines.
11. **Client Delegation List Scraping:** Querying the global `/machines` collection without filtering by `ownerId == request.auth.uid`.
12. **PII Profile Harvest:** Attempting to read another user's private `/users/{userId}` document.

## 3. Defense Implementation
- Global default-deny rule at root `match /{document=**} { allow read, write: if false; }`
- Standalone validation functions `isValidId()`, `isValidMachine()`, `isValidTelemetry()`, `isValidAnomaly()`, `isValidInvestigation()`, `isValidExperiment()`.
- Relational lookup `get(/databases/$(database)/documents/machines/$(machineId)).data.ownerId == request.auth.uid` guarding all machine subcollections.
- Strict `allow list` checking `resource.data.ownerId == request.auth.uid` for machine listings.
