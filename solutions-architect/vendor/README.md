# Vendored document and export libraries

Solution Architect Workbench uses Mozilla PDF.js to extract text from user-selected
PDF files locally in the browser. The application dynamically imports the parser only
when a PDF is selected; files and extracted text are not sent to a CDN.

- Component: Mozilla PDF.js (`pdfjs-dist`)
- Version: `6.3.289`
- Source: `https://github.com/mozilla/pdf.js`
- License: Apache-2.0; see `PDFJS-LICENSE.txt`

The workbench also uses the browser build of PDF-LIB to create a native, paginated
decision-package PDF without sending solution data to a service or relying on the
browser print header and footer.

- Component: PDF-LIB (`pdf-lib`)
- Version: `1.17.1`
- Source: `https://github.com/Hopding/pdf-lib`
- License: MIT; see `PDF-LIB-LICENSE.txt`

Run `npm run build:vendor` after installing dependencies to reproduce the checked-in
PDF.js runtime files. The parser and worker versions must remain identical. PDF-LIB is
pinned separately because it is used only by the Solution Architect export surface.
