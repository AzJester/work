# Vendored document parser

Solution Architect Workbench uses Mozilla PDF.js to extract text from user-selected
PDF files locally in the browser. The application dynamically imports the parser only
when a PDF is selected; files and extracted text are not sent to a CDN.

- Component: Mozilla PDF.js (`pdfjs-dist`)
- Version: `6.3.289`
- Source: `https://github.com/mozilla/pdf.js`
- License: Apache-2.0; see `PDFJS-LICENSE.txt`

Run `npm run build:vendor` after installing dependencies to reproduce the checked-in
runtime files. The parser and worker versions must remain identical.
