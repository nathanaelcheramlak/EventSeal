System Description
Overview

This system is a web-based QR code generation and verification system intended to be used by multiple organizers. Organizer accounts are created manually by the developer before deployment. The system does not provide user registration or password reset functionality.

The system has four primary capabilities:

Authenticate organizers.
Generate secure QR codes.
Verify generated QR codes.
Maintain an audit log of important actions for transparency.

The backend will be deployed on Render using its free web service tier. The relational database will be hosted on Supabase PostgreSQL.

Users

There is only one user type.

Organizer

An organizer is an authenticated user who has permission to:

Sign in using a pre-created account.
Generate QR codes.
Verify QR codes.
View the complete audit log.

All organizers have identical permissions.

There are no administrator accounts, guest accounts, or role-based permissions.

Authentication

Authentication is required before accessing any protected endpoint.

Each organizer has:

username
password

Accounts are manually inserted into the database by the developer.

The application does not implement:

account registration
password recovery
email verification
multi-factor authentication

Passwords must never be stored as plain text.

Passwords must be stored using a secure password hashing algorithm such as bcrypt or Argon2.

After successful authentication, the backend returns an authentication token that must be included in future requests.

QR Code Generation

An authenticated organizer can generate a QR code.

The organizer submits the information that should be associated with the QR code.

The exact fields stored by the QR code record are implementation-defined and may include information such as:

person's name
phone number

The QR code must not contain this information directly.

Instead, the backend creates a database record.

Example:

QR Record

ID: qr_001
Name: John Doe
Phone: 09171234567
Status: ACTIVE
Created By: Organizer A
Created At: ...
Expires At: ...

The backend then creates a QR token.

The QR token contains only:

unique QR record identifier
expiration timestamp

Example payload before signing:

{
  "id": "qr_001",
  "exp": 1767225600
}

The payload is digitally signed using a server-side secret key.

The signature allows the backend to detect whether the QR token has been modified.

The final signed token is encoded into a QR image.

Only the signed token is embedded inside the QR code.

The QR code does not expose:

name
phone number
organizer information
audit information
QR Verification

Verification begins after a QR code has been scanned.

The client extracts the signed token from the QR image.

The client sends only the token to the backend.

Example request:

{
    "token": "<signed token>"
}

The backend performs verification in the following order.

Step 1

Verify that the digital signature is valid.

If the signature is invalid:

stop processing
record the failed verification
return an error
Step 2

Check whether the token has expired.

If expired:

record the verification attempt
return an expiration error
Step 3

Extract the QR record identifier.

Example:

qr_001
Step 4

Retrieve the matching record from the database.

If no record exists:

record the failed verification
return an error
Step 5

Check the QR status.

Possible statuses include:

ACTIVE
USED
REVOKED
EXPIRED

If the status is not valid for use:

record the verification attempt
return an appropriate response
Step 6

Return the stored information associated with the QR record.

Example:

{
    "valid": true,
    "status": "ACTIVE",
    "data": {
        "name": "John Doe",
        "phone": "09171234567"
    }
}
Step 7

Create an audit log entry describing the verification.

QR Status

Every QR record has a status.

Initially:

ACTIVE

Possible values:

ACTIVE
USED
REVOKED
EXPIRED

The exact conditions that change the status are implementation-defined.

The system specification does not require automatic conversion from ACTIVE to USED after verification. If such behavior is implemented, it must be explicitly documented.

Audit Logging

The application records important actions.

Examples include:

successful login
failed login
QR generation
successful verification
failed verification

Each audit record contains at least:

audit identifier
organizer who performed the action
related QR identifier (if applicable)
action type
result
timestamp

Example:

Audit ID: 124

Organizer:
alice

Action:
QR_GENERATED

QR:
qr_001

Result:
SUCCESS

Timestamp:
2026-07-23 14:21:33 UTC
Audit Log Visibility

All authenticated organizers can view the complete audit log.

This requirement exists to promote transparency among organizers.

Audit records are read-only.

The application does not provide functionality to:

edit audit logs
delete audit logs
Database

The database is PostgreSQL hosted on Supabase.

Suggested tables:

Users
id
username
password_hash
created_at
QR Codes
id
created_by
name
phone
status
created_at
expires_at
Audit Logs
id
organizer_id
qr_code_id
action
result
created_at

The database schema may contain additional columns if required by implementation.

API
POST /login

Authenticates an organizer.

Input:

{
    "username": "...",
    "password": "..."
}

Output:

{
    "token": "..."
}
POST /qr

Creates a QR code.

Authentication required.

Input example:

{
    "name": "John Doe",
    "phone": "09171234567"
}

Output:

{
    "qrId": "qr_001",
    "qrToken": "...",
    "qrImage": "..."
}
POST /qr/verify

Authentication required.

Input:

{
    "token": "..."
}

Output example:

{
    "valid": true,
    "status": "ACTIVE",
    "data": {
        "name": "John Doe",
        "phone": "09171234567"
    }
}
GET /logs

Authentication required.

Returns every audit record visible to organizers.

Security Requirements

The application shall:

use HTTPS
hash passwords using bcrypt or Argon2
never store passwords in plain text
digitally sign QR tokens
reject modified QR tokens
keep the signing secret on the backend only
never expose database credentials to clients

The application shall not rely on obscurity for security.

Non-Functional Requirements

The system shall:

support at least 100 concurrent QR verification requests
complete at least 95% of QR verification requests within 500 milliseconds under a load of 100 concurrent verification requests
provide authenticated access to protected endpoints
maintain audit records for important actions
remain deployable using the free tiers of Render (backend) and Supabase (database)

The initial request after a period of inactivity may experience additional latency because the free Render web service may enter a suspended state. This behavior is a limitation of the deployment platform rather than the application itself.