# Security and Data Handling

## Approved use

The public GitHub Pages application is intended for synthetic, public, or otherwise
approved unclassified, non-CUI work. It is not approved by its existence for:

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

### Downloads

JSON backups, Markdown, HTML, SVG, and PNG are written through the browser download
flow. **Print / PDF** opens a separate HTML view and requests the browser print
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
- Use synthetic data for demonstrations and testing.
- Inspect browser developer tools for unexpected external requests after dependency
  or CSP changes.
- Review the complete AI payload every time; do not rely on the action label.
- Export a dated JSON backup before an important review, large import, or browser
  maintenance.
- Inspect decision packages and diagrams for residual restricted information before
  sharing.
- Revoke an account or allowlist row when AI access is no longer required.
- Treat unexpected network traffic, content-bearing logs, cross-solution records, or
  a successful invalid import as a release-blocking security defect.
