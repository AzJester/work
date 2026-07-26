# Security and Data Handling

## Privacy boundary

The application makes no application-level network requests and has no telemetry,
authentication, cookies, or third-party scripts. Entered content is stored in the
browser origin's `localStorage`.

GitHub Pages still serves the static files and may retain normal web-server access
logs. The site itself does not transmit workspace records to GitHub.

## Classification

The bundled records are synthetic demonstrations. A public GitHub Pages application
must not be treated as an approved system for classified, export-controlled,
proprietary, source-selection-sensitive, or otherwise controlled information.

Browser-local storage reduces transmission but is not an enterprise security control.
Anyone with access to the browser profile may be able to inspect its contents.

## Input and output safety

- rendered user content is HTML-escaped;
- imported files are parsed as JSON and must contain a pursuits array;
- there is no dynamic code execution from imported content;
- downloaded assessments are plain Markdown;
- destructive reset requires browser confirmation.

## Future hosted-AI integration

If a future version calls a model or shared database, add server-side authentication,
authorization, tenant isolation, audit logging, retention controls, secret management,
content classification, and an approved deployment boundary. Never put an API secret
in this static application.
