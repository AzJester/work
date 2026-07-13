# Astrion GeoPresence implementation plan

Status: prototype implemented for GitHub Pages

Updated: July 13, 2026

Product owner: Astrion internal

Approval scope: Astrion internal data stewardship only; no government approval is required

## 1. Product outcome

Astrion GeoPresence will provide a reusable internal location-intelligence experience for headquarters, regional headquarters, major hubs, contract sites, future sites, privacy-safe workforce concentration, and reusable operating regions.

The product has two connected experiences:

1. A viewer for search, filtering, U.S.-to-state drilldown, selection details, synchronized tabular access, saved views, and export.
2. A data workspace for drafting, validating, internally publishing, archiving, and auditing locations and reusable regions.

The GitHub Pages implementation in this directory is a high-fidelity frontend prototype. It uses synthetic data and does not claim to be the production data system, identity boundary, or geospatial database.

## 2. Scope decision

This is an Astrion-owned internal application. It has no government approval, government release, or external accreditation dependency.

The draft/submitted/approved/published workflow is retained only as an internal data-quality, privacy, and change-management control. “Approval” in this plan always means an Astrion data steward’s internal publishing decision.

Any future decision to place classified, customer-controlled, export-controlled, or other specially regulated data in the system would be a separate scope change. It is not a prerequisite for the current application.

## 3. Corrections applied to the source application plan

### 3.1 Separate operational status from publishing workflow

The source plan’s illustrative SQL uses `status` for `planned`, `active`, `inactive`, and `archived`, while its governance workflow requires `draft`, `submitted`, `approved`, `published`, and `retired`.

These are different dimensions and must not share one field:

- `operational_status`: planned, active, inactive, archived
- `workflow_status`: draft, submitted, approved, published, retired

Only records with a publishable workflow state may appear in standard viewer responses.

### 3.2 Use one complete visibility vocabulary

The SQL constraint in the source plan omits two visibility values used elsewhere in the document. The authoritative vocabulary is:

- `public_internal`
- `business_internal`
- `restricted`
- `executive_only`
- `aggregated_only`
- `hidden_archived`

Visibility enforcement belongs on the server. The frontend may hide controls and records for usability, but it is never the security boundary.

### 3.3 Make geometry authoritative

The source SQL stores latitude, longitude, and `geom` without defining which representation is authoritative or how they remain synchronized.

Production should either:

- store `geom geometry(Point,4326)` as the source of truth and expose longitude/latitude as generated or computed values; or
- enforce bidirectional consistency with a database constraint and controlled write path.

For ordinary map rendering and spatial joins, `geometry(Point,4326)` is the default recommendation. Use `geography` deliberately for distance calculations where spheroidal behavior is needed.

### 3.4 Add the metadata the plan says is mandatory

The illustrative `location` table does not include all fields required by the narrative and Definition of Done. Production records need, at minimum:

- source system/type and source reference
- business owner and data steward
- confidence and data-quality state
- effective dates and version
- workflow status and publishing timestamps
- visibility policy
- immutable audit events

### 3.5 Define privacy rules as policy, not examples

Buckets such as `1–5`, `6–25`, `26–100`, and `100+` are examples, not an approved privacy policy. Before workforce data is connected, Astrion HR/privacy/security owners must define:

- minimum publishable population
- suppression and complementary-suppression rules
- geographic generalization behavior
- permitted audience by workforce measure
- refresh cadence, retention, and audit rules

The application must never ingest employee home addresses or individual employee points.

### 3.6 Make accessibility testable

The production acceptance target should explicitly name WCAG 2.2 AA and include keyboard, screen-reader, non-text contrast, focus visibility, target size, reflow/zoom, reduced motion, and map/table equivalence tests.

The current prototype provides keyboard-operable map elements, a synchronized table, an `aria-live` text summary, reduced-motion handling, and responsive layouts as an initial baseline.

### 3.7 Update Azure Maps version and pricing assumptions

If Azure Maps is selected, use Web SDK v3 and the Gen2 pricing tier. Gen1 pricing retires September 15, 2026, and should not be used for a new deployment.

### 3.8 Treat Highcharts licensing as a Phase 0 gate

Highcharts requires a commercial license for internal business use, including prototypes and internal presentations. Do not make it a hard production dependency until Astrion confirms the applicable Internal, SaaS, or OEM license scope.

The GitHub Pages prototype uses no Highcharts code and therefore keeps the interaction model testable without creating a production library commitment.

### 3.9 Define API safety and concurrency

The production API needs more than CRUD routes. Add:

- server-side authorization on every query and export
- cursor pagination and bounded spatial queries
- optimistic concurrency (`ETag`/row version)
- idempotency keys for imports and workflow transitions
- explicit state-transition rules
- audit correlation IDs
- rate, payload-size, file-type, and decompression limits
- malware scanning and geometry-complexity limits for imports

### 3.10 Improve the roadmap

Accessibility, security, observability, backup/restore, and performance are not a final “hardening” phase. Their acceptance criteria start in discovery and are exercised in every delivery phase.

## 4. Implemented prototype

`index.html` currently provides:

- synthetic demonstration data only
- national tile map and state drilldown
- keyboard-operable state and location selection
- Astrion color tokens and responsive presentation
- viewer, executive, restricted viewer, editor, data steward, and admin role previews
- complete visibility taxonomy
- independent operational and workflow states
- filters, search, saved-view presets, text summary, synchronized table, print, and CSV export
- privacy-safe workforce buckets
- internal draft, submit, approve, publish, and archive workflow simulation
- reusable region library and audit activity
- local-only prototype persistence under `astrion_geopresence_demo_v1`

## 5. Recommended production architecture

### Experience

- React and TypeScript; use Next.js only if its routing/rendering/runtime model is beneficial under Astrion standards
- Highcharts Maps for executive visualization only after license confirmation
- Azure Maps Web SDK v3, OpenLayers, or Leaflet for the editing canvas after a focused architecture spike
- accessible data grid/table as an equivalent representation of every active map state

### API and workers

- ASP.NET Core or NestJS, selected by team operational standards
- REST/JSON for business resources; GeoJSON/TopoJSON/vector tiles for map delivery
- asynchronous worker for imports, geometry validation, simplification, deduplication, and scheduled refreshes

### Data

- Azure Database for PostgreSQL Flexible Server
- PostGIS allowlisted and enabled through infrastructure as code
- immutable audit events and versioned reusable regions
- server-side row/claim authorization and coordinate generalization

### Platform

- Microsoft Entra ID app roles
- App Service or Container Apps
- Key Vault and managed identity
- private networking where required by Astrion policy
- Application Insights and Azure Monitor
- infrastructure and database migrations under CI/CD

## 6. Production data model minimum

Core entities:

- `location_type`
- `location`
- `contract_site`
- `region` and `region_version`
- `location_region`
- `employee_presence_aggregate`
- `map_view`
- `workflow_event`
- `audit_event`
- `import_job` and `import_row_result`

Important rules:

- geometry is authoritative and spatially indexed
- workflow transitions occur through controlled service operations
- published versions are immutable; corrections create new versions
- restricted geometry is generalized before leaving the API
- exports are filtered through the same authorization policy as map queries
- audit history is append-only

## 7. Delivery phases

### Phase 0 — decisions and data readiness (2–3 weeks)

- confirm internal audience and data classification
- name product owner and data stewards
- inventory location, contract, and aggregate workforce sources
- approve workforce suppression policy
- confirm Highcharts license scope or select an alternative
- select editing SDK and Azure hosting pattern
- define WCAG 2.2 AA and security acceptance criteria

Exit: signed product charter, data contracts, privacy policy, architecture decisions, and prioritized MVP backlog.

### Phase 1 — technical prototype (3–4 weeks)

- replace synthetic map data with a scrubbed representative dataset
- validate U.S.-to-state geometry payloads
- spike chosen executive and editing libraries
- validate Entra role claims and server-side filtering
- test keyboard/map/table equivalence with representative users

Exit: architecture and user interaction decisions are proven with measurable results.

### Phase 2 — governed location MVP (8–12 weeks)

- location types and location CRUD
- internal workflow and immutable audit events
- U.S./state drilldown, filters, details, table, saved views, and export
- CSV import preview and validation
- Entra authentication and authorization tests
- observability, backup/restore rehearsal, accessibility, and performance gates

Exit: authorized Astrion users can maintain and view internally published locations safely.

### Phase 3 — reusable regions (6–8 weeks)

- versioned polygon/multipolygon library
- GeoJSON/KML/Shapefile import pipeline
- draw/edit/validate workflow
- parent/child hierarchy, overlaps, source metadata, and reuse links

Exit: approved Astrion regions can be reused consistently across views and records.

### Phase 4 — workforce and contract layers (6–10 weeks)

- approved aggregate workforce feed
- enforced suppression/generalization
- contract metadata and audience policy
- executive dashboards and scheduled refreshes

Exit: planners can use governed aggregate data without exposing individuals or unauthorized contract details.

### Phase 5 — production launch (4–6 weeks)

- load and resilience validation
- incident response and operational runbooks
- final accessibility and security verification
- disaster recovery rehearsal
- support ownership, user training, and launch communications

Exit: production readiness review passes under Astrion’s internal release process.

## 8. Acceptance criteria

- Viewer can navigate national and state views by mouse and keyboard.
- Every map result has equivalent table and text output.
- API authorization prevents unauthorized records or coordinates from reaching the client.
- Operational status and workflow status are independently enforced.
- Employee presence is aggregate-only and follows the approved suppression policy.
- Editor can create and submit a draft; data steward can internally approve and publish it.
- All material changes create immutable audit events.
- Imports validate metadata, file safety, duplicates, coordinate order, and geometry complexity.
- UI uses approved Astrion tokens and meets WCAG 2.2 AA acceptance tests.
- Performance budgets exist for initial payload, drilldown, filtering, and export.
- No government approval or government release step exists in the application workflow.

## 9. Current plan risks

- data ownership and freshness remain undecided
- workforce suppression thresholds remain undecided
- Highcharts license coverage is unconfirmed
- editing SDK is unselected
- source systems and data contracts are unconfirmed
- production hosting topology is unselected

These are Phase 0 decisions, not blockers for the frontend prototype.

## 10. Primary references to recheck before production

- [Azure Maps Web SDK v3 migration guide](https://learn.microsoft.com/en-us/azure/azure-maps/web-sdk-migration-guide)
- [Azure Maps Web SDK release notes](https://learn.microsoft.com/en-us/azure/azure-maps/release-notes-map-control)
- [Azure Maps pricing tier management](https://learn.microsoft.com/en-us/azure/azure-maps/how-to-manage-pricing-tier)
- [Azure Database for PostgreSQL extension allowlisting](https://learn.microsoft.com/en-us/azure/postgresql/extensions/how-to-allow-extensions)
- [Azure PostgreSQL supported extensions](https://learn.microsoft.com/en-us/azure/postgresql/extensions/concepts-extensions-by-engine)
- [Highcharts licensing](https://shop.highcharts.com/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
