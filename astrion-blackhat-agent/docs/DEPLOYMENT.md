# Deployment and Operations

## GitHub Pages

The repository's existing Pages workflow publishes static content from the default
branch. This section requires no workflow change and is available beneath:

`/work/astrion-blackhat-agent/`

## Validation

Before release:

1. run `node --check astrion-blackhat-agent/app.js`;
2. serve the repository through a local HTTP server;
3. create and edit a pursuit;
4. add evidence, a competitor, and an action;
5. generate and download an assessment;
6. export, reset, and import the workspace;
7. verify desktop and narrow mobile layouts.

## Rollback

The app has no schema migration or server state. Roll back the Git commit to restore a
previous application version. User browser data is independent of deployment and can
be restored from an exported JSON workspace.

## Cache behavior

GitHub Pages may briefly cache changed static assets. File names are intentionally
stable for simple maintenance. If aggressive cache invalidation becomes necessary,
add query-version parameters to the stylesheet and script references.
