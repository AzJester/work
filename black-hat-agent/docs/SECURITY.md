# Security and Data Handling

## Privacy boundary

The application makes no application-level network requests and has no telemetry,
authentication, cookies, third-party scripts, hosted model, or API integration.
Entered content, report versions, and snapshots are stored in the browser origin's
`localStorage`.

Optional evidence attachments are encoded into the same browser storage and limited
to 300 KB per file. They are not uploaded by the application, but they are included
in workspace JSON exports and can materially increase storage and export size.

GitHub Pages still serves the static files and may retain normal web-server access
logs. The site itself does not transmit workspace records to GitHub. Opening a source
URL that a user entered is a separate browser navigation and is outside the
application's local-only boundary.

## Classification and device access

The bundled records are synthetic demonstrations. A public GitHub Pages application
must not be treated as an approved system for classified, export-controlled,
proprietary, source-selection-sensitive, personally identifiable, or otherwise
controlled information.

Browser-local storage reduces transmission but is not encryption, access control, or
an enterprise security boundary. Anyone with access to the browser profile, device,
developer tools, downloaded files, or local backups may be able to read the data.
Do not use a shared or untrusted browser profile for sensitive work.

## Input and rendering safety

- User-entered content is treated as data and escaped before HTML rendering.
- Imported files are parsed as JSON; imported strings are not executed as code.
- Import uses validate-before-replace behavior and rejects malformed JSON,
  unsupported workspace shapes, invalid collection types, and broken required
  references.
- A rejected import leaves the active workspace unchanged.
- Report citations refer to local evidence records and do not fetch their sources.
- Report generation uses local templates and deterministic logic only.
- Destructive operations use confirmation and/or create recoverable snapshots.

These controls reduce accidental corruption and injection risk. They do not make an
untrusted imported file authoritative or its factual contents safe to use.

## Exports and recovery

JSON workspace exports may contain all entered pursuit data, including participants,
notes, sources, score rationales, actions, reports, and version history. Markdown,
Word-compatible `.doc`, and print-to-PDF reports may contain selected portions of
the same information. Store and share these files according to the sensitivity of
their contents.

Snapshots are local convenience copies. They are stored under the same browser
origin as the working workspace and are removed if site data is cleared. Export a
workspace JSON file for durable backup. Confirm the destination before downloading
or sharing any report.

## Evidence and scoring caveats

A citation only links a report statement to an entered evidence record. It does not
authenticate the source or establish that the claim is true, complete, current, or
approved for use. Competitor scores, totals, and rankings are human-entered judgments
and deterministic calculations, not verified intelligence or model conclusions.

## No AI or API secret

This edition does not call a model and does not need an API key. Do not add a secret
to `app.js`, the HTML, repository settings exposed to client code, or any other
GitHub Pages asset. All published static files and browser requests should be treated
as public.

If a future version calls a model or shared database, it will require a separate
approved server-side boundary with authentication, authorization, tenant isolation,
audit logging, retention controls, rate limiting, abuse protection, secret
management, content classification, and data-use review.
