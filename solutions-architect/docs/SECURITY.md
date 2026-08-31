# Security and Data Handling

## Approved use

The public GitHub Pages application is intended for synthetic, public, or otherwise
approved unclassified, non-CUI work. That boundary applies to typed workspace
content, Quick Capture, pasted hot buttons, opened local files, image captions,
extracted excerpts, meeting transcripts or summaries, participant names, exports,
and AI payloads. It is not approved by its existence for:

- classified information;
- Controlled Unclassified Information;
- export-controlled technical data;
- proprietary, competition-sensitive, or customer-restricted information;
- credentials, secrets, private keys, or production tokens;
- information whose contract, policy, or handling guide requires another system.

The user's organization remains responsible for deciding whether the device,
browser, network path, storage, AI provider, downloaded files, and recipients are
authorized for the information involved. Review current contract clauses and the
organization’s security guidance rather than treating this document as legal or
compliance approval.

[DFARS 204.7302](https://www.acquisition.gov/dfars/204.7302-policy.) requires
contractors and subcontractors to provide adequate security on covered contractor
information systems and identifies related NIST SP 800-171 assessment obligations
where applicable. This public site does not establish those safeguards, satisfy a
contract clause, or authorize CUI use.

## Where data goes

### Ordinary workspace use

Mission, customer hot-button, requirement, assessment, architecture, risk, proposal, and transition data
is stored in the current browser's `localStorage`. It is not synchronized to a cloud
project database or encrypted separately by the application. Recovery snapshots use
the same browser storage and share its loss, access, and capacity risks.

Pasted customer hot buttons are processed locally and become ordinary workspace
records. Their source, confidence, and validation fields are user assertions, not
independent verification. Pasting text does not make it approved for this
application; inspect and sanitize source notes before ingestion, and do not paste
restricted meeting notes.

Quick Capture proposals are stored in a separate per-solution localStorage envelope,
not in the authoritative workspace. This separation provides a review gate; it does
not provide stronger confidentiality. Capture inboxes share the same device, browser
profile, storage-loss, extension, malware, and local-user risks as the workspace. They
are not included in workspace snapshots or JSON workspace backups.

Selected company mission segments are ordinary solution facts. They appear in the
decision package and, when in scope, the exact reviewed AI payload. A segment label
does not authorize any otherwise restricted supporting detail.

### Meeting transcripts and summaries

Meeting intake holds the complete pasted text only in JavaScript memory and the open
dialog. The user can stage at most 20 selected excerpts of 6,000 characters each.
After staging or canceling, the app clears the complete text and removes the dialog.
Only selected excerpts, title, type, date, participants, mission segments, and source
locators can enter the separate Review inbox and later the workspace.

This reduces accidental over-retention; it is not a confidentiality control. While
the dialog is open, the full text is still present on the device and may be exposed
to browser extensions, malware, screen capture, clipboard tools, or another local
user. The workflow does not accept or retain audio/video recordings, call AI, or
upload meeting content. A meeting statement remains unverified evidence until the
responsible user validates its accuracy, authority, provenance, and allowed use.

The app disables spellcheck, autocomplete, autocorrect, and autocapitalization on
meeting and excerpt text areas. That does not control browser extensions,
operating-system input methods, translation tools, screen readers, or an
administrator-enabled enhanced spellcheck service. Configure the browser and device
according to organizational policy before opening permitted source content.

### Local source files

**Open local files** reads supported sources inside the current browser. Supported
formats are TXT, Markdown, CSV, JSON, PDF, DOCX, PPTX, XLS, XLSX, ODS, PNG, JPEG, and
WebP. Unlisted legacy Word/PowerPoint formats, macro-enabled Office formats, SVG,
HTML, arbitrary ZIP archives, and unlisted formats are rejected.

Original file bytes, ArrayBuffers, and image preview URLs are transient. Application
code does not write them to localStorage, workspace or inbox exports, recovery
snapshots, decision packages, the service-worker cache, application logs, AI
requests, Supabase, or another network destination. Browser/OS services and
extensions remain part of the endpoint risk described above. Only bounded source
metadata and excerpts explicitly chosen by the user can enter the Review inbox; a
second explicit review is required before they become workspace records.

Images receive a local preview and require a manual caption or transcription. The app
does not perform OCR. A scanned PDF may likewise yield no text. Extraction is not
validation: it does not establish that a source is complete, current, authoritative,
accurate, correctly attributed, or approved for this application. Preserve an
authorized original in the organization's approved record system.

Source intake is limited to 8 MB per file, 10 files and 25 MB per session, 2,000 ZIP
entries, 20 MB per expanded ZIP entry, 50 MB expanded ZIP content, 200 PDF pages,
200,000 extracted text characters, and 20 seconds per extraction. These limits reduce
resource-exhaustion risk but do not make malicious or restricted content safe.

### Downloads

Workspace JSON backups, separate capture-inbox JSON reference downloads, Markdown,
HTML, SVG, and PNG are written through the browser download flow. V1 does not import
an inbox JSON download. **Print / Save PDF** opens a separate HTML view and requests the browser print
dialog; a PDF exists only if the user creates one with the browser or operating-system
print workflow. Once created or downloaded, those files are outside the app's control and must be protected, retained,
transmitted, and destroyed according to the information they contain.

### Optional AI

Only the exact payload displayed in the AI review dialog is sent. Transmission
requires an approved Supabase sign-in and three explicit data acknowledgments. The
payload goes to the exact `solution-assist` Edge Function and then to the configured
model provider.

Do not assume that stage scoping makes restricted data safe. The user must inspect
the actual JSON. Authentication controls who may call the function; it does not
change the classification or handling requirements of the payload.

## Security controls

- A restrictive content security policy limits scripts and styles to repository
  assets and network access to the exact Supabase origin.
- There are no CDN scripts, browser-exposed model credentials, arbitrary HTML
  templates, or cloud project-storage calls.
- Workspace validation bounds fields and identifiers and rejects duplicate IDs,
  dangling references, invalid scores, malformed diagrams, and cross-solution links.
- Capture-inbox validation binds every proposal and provenance record to one solution,
  bounds excerpts and lists, rejects unsupported fields and dangling dependencies,
  and requires explicit atomic materialization into a validated workspace.
- Source intake uses an allowlist, strict UTF-8/JSON parsing, isolated worker
  processing, bounded PDF extraction, and ZIP preflight that rejects encryption,
  ZIP64/unsupported structures, path traversal, excessive entry counts, oversized
  entries, and excessive expansion.
- Original binary bytes are excluded from persistence and network paths. Blob URLs
  and workers are released or terminated after extraction, cancellation, or timeout.
- The complete import is validated before replacement and a recovery point is created
  before the final browser-storage write; write failures remain visible.
- Rendered and exported user content is escaped; source URLs are restricted to HTTP
  and HTTPS.
- Missing assessment information remains unknown instead of being converted into a
  misleading value.
- AI payloads are action- and stage-bounded, previewed before sending, and treat all
  workspace text as untrusted data rather than model instructions.
- The Edge Function must verify the caller, fail closed without an allowlist, enforce
  exact origins, cap body/text/list sizes, consume a database-backed per-user quota,
  bound upstream time, and validate structured output.
- The client rejects AI citations that do not identify records in the active
  solution. Accepted responses remain separate draft records.
- Backend operational logging must contain request IDs, status, timing, quota, and
  error categories only—not workspace facts, prompts, credentials, or model output.

## Threats and expected behavior

### Malicious import

A malformed or hostile JSON file must be rejected before any workspace replacement.
The app does not execute imported content. An invalid reference or record in one part
of the file blocks the full import.

### Malicious local source

An allowed extension is not proof that a file is safe. Intake rechecks format and
structure, enforces count/size/expansion/time limits, and processes complex formats in
a terminable worker where possible. The product does not execute document macros,
scripts, formulas, embedded HTML, or links. A rejected or failed source creates no
workspace record and its bytes must not persist.

A preview is still untrusted content. Render excerpts as text, never markup; never
follow embedded links automatically; and require user review before materialization.

### Cross-solution capture disclosure

Each inbox storage key and every inbox record includes the active solution ID.
Validation rejects another solution's provenance, proposal, target reference, or
preallocated ID. Switching solutions loads that solution's separate Review queue.
Materialization must never infer the destination from untrusted file metadata.

### Prompt injection in workspace text

Workspace values are data, never trusted model instructions. The server system
prompt and structured-output contract must instruct the model to ignore commands
embedded in supplied facts. The user still reviews both payload and response.

### Cross-solution disclosure

The payload builder selects records by the active `solutionId`, and validation rejects
cross-solution relationships. Tests must include hostile metadata and record IDs that
attempt to route or cite another solution.

### Storage loss or exhaustion

Private browsing, site-data clearing, browser policies, quota exhaustion, or device
loss can remove the working copy and snapshots. Save failures must remain visible.
Downloaded JSON—not local snapshots—is the durable backup.

### Compromised browser or device

The app cannot protect data from malware, browser extensions, local administrators,
screen capture, clipboard monitoring, or another user with access to the profile.
Use an appropriately managed endpoint and browser profile.

## Operational checklist

- Confirm the allowed data category before starting or importing a workspace.
- Confirm the data category before Quick Capture or opening every local file. File
  locality does not authorize restricted content.
- Use synthetic data for demonstrations and testing.
- Inspect browser developer tools for unexpected external requests after dependency
  or CSP changes.
- Verify supported-format intake generates no content-bearing network request, leaves
  no original binary in localStorage or service-worker cache, and requires Review
  before creating a workspace record.
- Compare every persisted excerpt or image caption to the authorized original and
  verify provenance, accuracy, authority, and classification.
- Review the complete AI payload every time; do not rely on the action label.
- Export a dated JSON backup before an important review, large import, or browser
  maintenance.
- Inspect decision packages and diagrams for residual restricted information before
  sharing.
- Revoke an account or allowlist row when AI access is no longer required.
- Treat unexpected network traffic, content-bearing logs, cross-solution records, or
  a successful invalid import as a release-blocking security defect.
