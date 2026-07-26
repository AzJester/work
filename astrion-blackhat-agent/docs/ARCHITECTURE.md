# Architecture

## Runtime

The site is a static application:

```text
GitHub Pages
  └─ index.html
      ├─ styles.css
      └─ app.js
          ├─ view renderer
          ├─ event delegation
          ├─ local assessment generator
          └─ localStorage persistence
```

There is no backend, authentication provider, database, build step, or network API.
This makes the GitHub Pages deployment anonymous and operational without secrets.

## Data model

The single workspace document contains:

- `pursuits`
- `evidence`
- `competitors`
- `actions`
- `playbooks`
- `runs`
- the active pursuit identifier

Child records reference a pursuit through `pursuitId`. The JSON export is the portable
representation of the entire workspace.

## Assessment behavior

The generator is deterministic and source-bounded. It combines:

1. opportunity framing,
2. evidence records and confidence labels,
3. competitor hypotheses,
4. detected readiness gaps,
5. registered actions, and
6. a standard verification guardrail.

This avoids hidden API dependencies and ensures the public site remains usable when
offline after its static assets have loaded.

## Browser support

The app targets current Chrome, Edge, Firefox, and Safari. It uses standard DOM APIs,
`localStorage`, `Blob`, `FileReader`, and `crypto.randomUUID` with a fallback ID
generator.
