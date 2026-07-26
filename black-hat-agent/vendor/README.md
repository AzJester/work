# Vendored spreadsheet parser

Black Hat Agent includes the standalone SheetJS Community Edition browser build so
Excel files can be parsed locally without a CDN request. CSV files use the
application's dedicated strict UTF-8 parser.

- Component: SheetJS Community Edition
- Version: 0.20.3
- Source: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
- SHA-256: `CC015130AA8521E7F088F88898EBA949CCDCBFB38DF0BD129B44B7273C3A6F41`
- License: Apache-2.0; see `SHEETJS-LICENSE.txt`

The browser loads this repository-owned file before `app.js`. Updating it requires
updating the version, checksum, license copy, security documentation, and import
regression tests together.
