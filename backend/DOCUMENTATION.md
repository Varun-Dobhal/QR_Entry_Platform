# QR Event Backend - Prisma Architecture

## Overview
This backend runs on **PostgreSQL** using the **Prisma ORM**.
It handles QR generation, sending emails, and processing scans for event attendees with strong transaction safety.

## Entities
1. **User**: Represents the application volunteers and admins.
   - Roles: `ADMIN`, `ENTRY_VOLUNTEER`, `FOOD_VOLUNTEER`
2. **Attendee**: Represents an individual ticketed for the event.
   - Core states: `entryStatus` (boolean), `foodStatus` (boolean)
   - OTP usages are logged separately but flags like `entryOtpUsed` and `foodOtpUsed` exist on the Attendee model to aid read performance.
3. **ScanLog**: An immutable ledger tracking every attempted scan, the volunteer who scanned it, whether it was allowed or denied, and why.
4. **OtpLog**: An immutable ledger of requested one-time-passwords. Each OTP is single-use, tracks attempts, and automatically expires.

## Flow
1. **Importing**: An Admin uploads an Excel file. The system generates unique UUID tokens and creates records in PostgreSQL via Prisma `createMany(skipDuplicates)`.
2. **Distribution**: QR codes are zipped and sent back to the admin, or emailed to attendees securely.
3. **Scanning Checkpoints**:
   - **Entry**: An `ENTRY_VOLUNTEER` scans a token. The system checks `entryStatus`. If `false`, it sets `entryStatus = true` atomically via a transaction and creates a ScanLog.
   - **Food**: A `FOOD_VOLUNTEER` scans a token. The system checks `entryStatus == true` and `foodStatus == false`. If valid, it sets `foodStatus = true` atomically via a transaction and creates a ScanLog.
4. **OTP Fallback**: If a QR fails, an OTP can be triggered. The system creates an `OtpLog` and sends an email. Upon verification, the `OtpLog` is marked `used = true` atomically, and the corresponding checkpoint is cleared.

## Security
- **Role Enforcement**: Routes enforce `ADMIN`, `ENTRY_VOLUNTEER`, or `FOOD_VOLUNTEER` rigorously.
- **Race Condition Prevention**: Scans and OTP verification use `prisma.$transaction()` to ensure that double-scanning exactly at the same time will result in exactly 1 success and 1 rejection.
