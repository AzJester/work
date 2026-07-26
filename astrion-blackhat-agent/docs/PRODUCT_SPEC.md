# Product Requirements and Design Decisions

## Objective

Provide the useful workflow of the Astrion Black Hat Agent prototype as a public,
fully working site that visitors can use without creating an account or signing in.

## Primary user journey

Portfolio → opportunity framing → evidence collection → competitor hypotheses →
playbook selection → Black Hat assessment → owned actions → portable output.

## Functional requirements

- anonymous entry with no sign-in redirect
- multiple isolated pursuits
- complete browser-side CRUD for working records
- synthetic starter workspace
- structured assessment outputs
- local persistence and portable backup
- static-host compatibility
- responsive and keyboard-accessible native controls

## Decisions

### Browser-local persistence

Selected to remove identity, backend, cost, secret, and availability dependencies.
The tradeoff is that work is not automatically synchronized between people or devices.

### Deterministic assessment generation

Selected so all features work on GitHub Pages without exposing an API key. The output
is reproducible and bounded by recorded data, but it is not an LLM-generated analysis.

### Synthetic defaults

Starter records demonstrate the workflow without representing real pursuit data.

## Out of scope for this public edition

- multi-user collaboration
- server-side files or document parsing
- access-controlled operational pursuit data
- automatic external research
- hidden or embedded model credentials
- claims that the generated assessment is authoritative intelligence
