# Working agreements

## Push, merge and deploy without asking

Standing instruction from the repository owner, given 2026-11-12: always push, merge and deploy without asking first.

What that means here:

- Push finished work, open the pull request, and merge it to `main` in the same turn. Do not leave it waiting for a go-ahead.
- Merging to `main` starts the "Deploy to GitHub Pages" workflow, which is the deploy. Watch that run and report whether it succeeded.
- Verify before merging: run the tests that cover the change and load the page. A failing check is a reason to fix it first.
- Report after the fact what was merged and deployed, including anything worth a second look.

Interpretation, not stated by the owner: this covers work the session was asked to do. It does not extend to deleting data, rewriting history on branches other people use, or merging other people's pull requests.

## Titles and subtitles take no closing period

Standing instruction from the repository owner, given 2026-11-20 while reviewing the Astrion agentic AI page: titles and subtitles do not have a period at the end.

Interpretation, not stated by the owner:

- It covers headings, display lines, and the one-line subtitle under a section title, on pages and in documents built here.
- A title made of two sentences is rewritten as one phrase or set as two lines, so no period is left in the middle.
- Body copy, such as an item description of one or more sentences, keeps its periods.
- On `mission-intelligence/` the rule is enforced by the "titles and subtitles carry no closing period" test in `tests/mission-intelligence.test.mjs`.

## The Astrion slogan

Standing instruction from the repository owner, given 2026-11-20: the slogan is "Defend this world. Build the next." The older line "Astrion EDGE: Engineering Delivered, Guaranteed Excellence" is not used.

Interpretation, not stated by the owner:

- Set as a title or subtitle, the slogan follows the no-closing-period rule above: two lines, "Defend this world" and "Build the next", with no periods.
- `astrion-film/` sets a trademark sign after "next". `mission-intelligence/` and `LDAWIF/astrion-division-landing.html` do the same.
- `mission-intelligence/` was changed first. `LDAWIF/astrion-division-landing.html` still carried the older line and was changed later the same day, at the owner's request. `tests/astrion-division-landing.test.mjs` keeps it from returning there. No page carries the older line now.

## Astrion pages follow astrion.us

Standing instruction from the repository owner, given 2026-11-20: astrion.us is the company website, and the agentic AI page has to match its slogans. The page stays about agentic AI.

What a review of astrion.us found that day, and what `mission-intelligence/` uses as a result:

- Two trademarked lines: "Defend this world. Build the next." and "Missions are won at the seams".
- Calls to action: "Build The Mission" and "Contact Us".
- The six domains: Orbital, Atmosphere, Terrain, Maritime, Subsea, Cyber.
- Company figures: 6,000+ employees, about 5,500 engineers, operators and professionals embedded with mission teams, about $1.2B in FY26 revenue, and more than 38,000 nautical miles of autonomous operations at sea.
- The company's wording for human control: "operators retain execution authority".

Lines that astrion.us does not carry, and that were removed: "We are the bridge between innovation and operational reality", "Innovation fuels it. Engineering proves it. Astrion makes it mission-ready.", "field-ready", "mission-informed", "Field-proven", "about 150 programs", "36 states plus the Netherlands" and "71% cleared workforce".

Interpretation, not stated by the owner:

- astrion.us ends its headlines with periods. Pages here still follow the no-closing-period rule above, because the owner repeated it the same day.
- Figures and lines on astrion.us change. Read the site again before reusing any of them.
- `tests/mission-intelligence.test.mjs` holds these choices in the test "the brand lines, calls to action and figures are the ones astrion.us carries".

## Deploys run the browser specs a change can affect

Goal set by the repository owner on 2026-11-20: small, single-page changes reach the live site faster, without weakening the safety gate for shared code. For that work the owner also said not to skip, disable or quarantine tests, and to keep the `production-smoke` job as it is.

How the deploy works since that day. A session built this to meet the goal, and the owner did not dictate the details:

- `npm run test:browser:select` lists the browser specs that cover the work on a branch and prints the command that runs them. Those are the specs to run before merging.
- The deploy makes the same choice for each push, and its summary page says which specs ran and why. A change to a shared file (`assets/`, `scripts/`, `package.json`, the workflows, `apps.html` and others) runs every spec.
- A new page, folder or spec needs a rule in the map at the top of `scripts/select-browser-tests.mjs`. `tests/browser-test-selection.test.mjs` fails until it has one.
- The "Full browser suite" workflow runs every spec each night. After it fails, the next deploy runs every spec and names that failure as the reason. Fix or report the failing spec as part of the work in hand.
- README.md, "How it's deployed", has the full rules.

## The Astrion scroll sites share one engine

`mission-intelligence/` and `mission-engineering/` are the same kind of site. The repository owner asked on 2026-11-20 for the second to be "exactly the same type of site" as the first: same globe, same actions, same scrolling, Astrion brand.

How that is kept true. A session built this, and the owner did not dictate the details:

- Both folders ship the same `app.js`. Their `styles.css` files differ only in the block marked `page:fit` at the end, which holds the fallback sizes for that page's fitted headlines.
- `tests/astrion-scroll-engine.test.mjs` fails when the two copies drift apart. Change the engine in one folder, copy it to the other, and keep each page's own `page:fit` block.
- The script finds its sections by class (`.statement`, `.loop`, `.agents`, `.domains`, `.rule`, `.proof`, `.contact`), so each page names its own chapter ids.
- When a fitted headline's words change, measure the new sizes and update that page's `page:fit` block. The browser tests fail without script if the fallback sizes no longer fit.

## The Twin white paper site leaves out leadership-only details

`mission-engineering/` presents the Twin white paper of October 2026. The paper was prepared for Astrion leadership, and the site is on a public address.

Interpretation, not stated by the owner: the site says what the paper says about the idea, the design and the current state, and leaves out what was written for leadership only. That is cost and the day rate, staffing and hardware asks, the schedule, named internal programs, named competitors, the author's name, and the internal wiki pointer. The test "the white paper's leadership-only details are not published" in `tests/mission-engineering.test.mjs` holds that line. Add any of them only when the owner asks for it by name.

## The Mission Engineering page names Astrion alone

Standing instruction from the repository owner, given 2026-11-20 while building out `mission-engineering/`: do not use any other company names, the page is only for Astrion, and do not say "concept".

Interpretation, not stated by the owner:

- No company other than Astrion is named on the page, on its credits page or in its README section. Notes on other companies stay out of the repository, tests and commit messages included.
- The word "concept" is not used on the page or the credits page. The chapter "Where Twin stands" still tells apart what is built today and what comes next, in plain words.
- The reference scenes in "The real world" are cut from footage that two United States government agencies release for reuse, and both ask to be credited. They are named only on `mission-engineering/credits.html`, which the page links to as "Footage credits".
- The page's words now come from three places: the white paper, astrion.us, and the owner's direction on mission data given the same day. The leadership-only details above stay out, data rights among them.
- The test "the page names Astrion alone and never calls the work a concept" in `tests/mission-engineering.test.mjs` holds these lines.

## When the deploy job fails after its tests pass

Seen on 2026-11-20, in deploy run 44766481574. A session worked this out, and the owner did not dictate it:

- The `deploy` job uploads the site and publishes it in back-to-back steps. Now and then the publish step asks GitHub for the upload a moment too soon, is told there is none, and fails with "No artifacts named github-pages were found". The tests have passed by then and nothing is wrong with the change.
- Re-running the failed job does not help. The first upload stays attached to the run, the re-run adds a second, and the publish step then fails with "Multiple artifacts named github-pages". Every later re-run of that run fails the same way.
- What works is a new run, which the next push to `main` starts. Starting the workflow by hand also gives a new run, but a manual run always redeploys the Supabase backend, so ask the owner before doing that.
- An edit to `.github/workflows/pages.yml` redeploys the backend as well. Weigh that before changing the workflow to make this failure go away.
