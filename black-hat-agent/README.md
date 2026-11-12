# Black Hat Agent (moved)

Black Hat Agent lives in its own repository,
[AzJester/Black_Hat_Agent](https://github.com/AzJester/Black_Hat_Agent), and is
published at <https://azjester.github.io/Black_Hat_Agent/>.

This folder keeps two things:

- `index.html` forwards the old address, `azjester.github.io/work/black-hat-agent/`,
  to the current build. Both addresses are on the same origin and the app keeps its
  workspace in browser storage under one key, so work saved through the old address
  opens in the current build.
- `vendor/` holds the SheetJS library. The Solution Architect Workbench loads it from
  this path, so it stays here.

The copy that used to live here was retired because it shared that storage key with
the current build but could not read the newer schema. Opening it after using the
current build showed an empty workspace, and saving there would have replaced the
newer work.
