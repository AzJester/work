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
