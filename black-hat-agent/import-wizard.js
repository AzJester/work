import { escapeHtml as esc } from "./engine.js";
import {
  IMPORT_LIMITS,
  IMPORT_TARGETS,
  buildImportPlan,
  buildTableFromMatrix,
  parseCsv,
  suggestColumnMapping
} from "./import-engine.js";

export const MAX_IMPORT_FILE_BYTES = 5_000_000;
export const WORKBOOK_PARSE_TIMEOUT_MS = 20_000;
const MAX_HEADER_ROW = 100;
const ACCEPTED_FILE_PATTERN = /\.(xlsx|xls|csv)$/i;
const MODE_LABELS = Object.freeze({
  append: "Append new records; skip matches",
  upsert: "Add new records and update matches",
  replace: "Replace this record type in the active pursuit"
});

export function openLocalImportWizard({
  trigger,
  getWorkspace,
  activePursuit,
  idFactory,
  validator,
  onApply,
  onSuccess
}) {
  if (typeof getWorkspace !== "function" || typeof onApply !== "function") {
    throw new TypeError("The import wizard requires workspace and apply callbacks.");
  }

  document.querySelector("#localImportWizard")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "localImportWizard";
  dialog.className = "import-dialog";
  dialog.setAttribute("aria-labelledby", "importWizardTitle");
  document.body.append(dialog);

  const state = {
    step: 1,
    busy: false,
    fileToken: 0,
    fileName: "",
    fileSize: 0,
    sourceType: "",
    csvText: "",
    workbook: null,
    worker: null,
    workerCancel: null,
    sheetName: "",
    target: "criteria",
    mode: "append",
    headerRow: 1,
    headers: [],
    rows: [],
    duplicateHeaders: [],
    mapping: {},
    plan: null,
    replaceConfirmed: false,
    error: "",
    formulaCount: 0,
    linkCount: 0
  };

  const close = () => {
    state.fileToken += 1;
    state.workerCancel?.();
    state.worker = null;
    state.workerCancel = null;
    if (dialog.open) dialog.close();
    dialog.remove();
    trigger?.focus?.();
  };

  const render = () => {
    dialog.innerHTML = `<div class="modal import-wizard">
      <header class="wizard-header">
        <div>
          <p class="eyebrow">LOCAL DATA IMPORT</p>
          <h2 id="importWizardTitle">Excel and CSV import wizard</h2>
          <p>Nothing is uploaded. Changes are applied only after the final review.</p>
        </div>
        <button class="close" type="button" aria-label="Close import wizard" data-wizard-close>×</button>
      </header>
      ${stepsMarkup(state.step)}
      <div class="wizard-body">${stepMarkup(state, activePursuit)}</div>
      <div class="wizard-status" role="status" aria-live="polite">${esc(
        state.busy ? "Reading the selected file locally…" : state.error
      )}</div>
    </div>`;
    focusStep(dialog, state);
  };

  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    close();
  });

  dialog.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-wizard-close")) {
      close();
      return;
    }
    if (button.hasAttribute("data-wizard-template")) {
      downloadImportTemplate();
      return;
    }
    if (button.hasAttribute("data-wizard-change-file")) {
      state.fileToken += 1;
      state.workerCancel?.();
      Object.assign(state, {
        step: 1,
        fileName: "",
        fileSize: 0,
        sourceType: "",
        csvText: "",
        workbook: null,
        worker: null,
        workerCancel: null,
        sheetName: "",
        headers: [],
        rows: [],
        mapping: {},
        plan: null,
        error: ""
      });
      render();
      return;
    }
    if (button.dataset.wizardBack) {
      state.step = Number(button.dataset.wizardBack);
      state.error = "";
      render();
      return;
    }
    if (button.hasAttribute("data-wizard-apply")) {
      if (!state.plan?.valid || !state.plan.nextWorkspace) return;
      if (state.mode === "replace" && !state.replaceConfirmed) {
        state.error = "Confirm the scoped replacement before applying the import.";
        render();
        return;
      }
      state.busy = true;
      state.error = "";
      render();
      try {
        const details = {
          target: state.target,
          label: IMPORT_TARGETS[state.target].label,
          fileName: state.fileName,
          sheetName: state.sheetName,
          mode: state.mode,
          summary: state.plan.summary
        };
        await onApply(state.plan.nextWorkspace, details);
        close();
        onSuccess?.(details);
      } catch (error) {
        state.busy = false;
        state.error = error?.message || "The import could not be saved.";
        render();
      }
    }
  });

  dialog.addEventListener("change", async event => {
    if (event.target.id === "tabularImportFile" && event.target.files?.[0]) {
      await loadWorkbook(event.target.files[0], state, render);
      return;
    }
    if (event.target.id === "importTarget") {
      const form = event.target.form;
      state.sheetName = String(form.elements.sheetName.value || state.sheetName);
      state.headerRow = Number(form.elements.headerRow.value || state.headerRow);
      state.mode = String(form.elements.mode.value || state.mode);
      state.target = event.target.value;
      const target = IMPORT_TARGETS[state.target];
      const modes =
        target.modes ||
        (target.replaceAllowed ? ["append", "upsert", "replace"] : ["append", "upsert"]);
      state.mode = modes.includes(state.mode) ? state.mode : modes[0];
      render();
      return;
    }
    if (event.target.name === "confirmReplace") {
      state.replaceConfirmed = event.target.checked;
      state.error = "";
      render();
    }
  });

  dialog.addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    if (form.dataset.wizardForm === "configure") {
      const values = new FormData(form);
      state.sheetName = String(values.get("sheetName") || "");
      state.headerRow = Number(values.get("headerRow") || 1);
      state.target = String(values.get("target") || "criteria");
      state.mode = String(values.get("mode") || "append");
      try {
        prepareTable(state);
        state.mapping = suggestColumnMapping(state.target, state.headers).mapping;
        state.plan = null;
        state.replaceConfirmed = false;
        state.error = "";
        state.step = 3;
      } catch (error) {
        state.error = error?.message || "The selected worksheet could not be prepared.";
      }
      render();
      return;
    }
    if (form.dataset.wizardForm === "mapping") {
      const values = new FormData(form);
      const mapping = {};
      for (const definition of IMPORT_TARGETS[state.target].fields) {
        const selected = values.get(`map__${definition.key}`);
        if (selected !== null && selected !== "") mapping[definition.key] = Number(selected);
      }
      state.mapping = mapping;
      state.plan = buildImportPlan({
        workspace: getWorkspace(),
        target: state.target,
        headers: state.headers,
        rows: state.rows,
        mapping,
        pursuitId: activePursuit?.id || "",
        mode: state.mode,
        rowNumberOffset: state.headerRow,
        idFactory,
        validator
      });
      state.error = "";
      state.step = 4;
      render();
    }
  });

  render();
  dialog.showModal();
  dialog.querySelector("#tabularImportFile")?.focus();
}

export function downloadImportTemplate() {
  const XLSX = spreadsheetLibrary();
  const workbook = XLSX.utils.book_new();
  for (const target of Object.values(IMPORT_TARGETS)) {
    const headers = target.fields.map(item => item.label);
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    worksheet["!cols"] = headers.map(header => ({
      wch: Math.max(14, Math.min(32, header.length + 3))
    }));
    worksheet["!autofilter"] = { ref: `A1:${columnName(headers.length - 1)}1` };
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      target.key === "criteria"
        ? "Criteria"
        : target.key === "competitorScores"
          ? "Scores"
          : target.label.slice(0, 31)
    );
  }
  const instructions = XLSX.utils.aoa_to_sheet([
    ["Black Hat Agent local import template"],
    ["Use one data sheet at a time through Data Import."],
    ["Keep the first row as column headers, or select a different header row in the wizard."],
    ["Required fields must contain a value on every imported row."],
    ["References use existing criterion names, evidence citations/titles, and competitor names."],
    ["Files are parsed locally. Do not include controlled or classified information."],
    ["Macros, formula code, and external workbook links are never executed."]
  ]);
  instructions["!cols"] = [{ wch: 105 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");
  XLSX.writeFile(workbook, "black-hat-agent-import-template.xlsx", {
    bookType: "xlsx",
    compression: true
  });
}

async function loadWorkbook(file, state, render) {
  const token = ++state.fileToken;
  state.busy = true;
  state.error = "";
  render();
  try {
    if (!ACCEPTED_FILE_PATTERN.test(file.name)) {
      throw new Error("Choose an .xlsx, .xls, or .csv file.");
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw new Error(
        `The file exceeds the ${formatBytes(MAX_IMPORT_FILE_BYTES)} local import limit.`
      );
    }
    const bytes = await file.arrayBuffer();
    const isCsv = /\.csv$/i.test(file.name);
    let csvText = "";
    let workbook;
    if (isCsv) {
      csvText = decodeCsv(bytes);
      workbook = {
        SheetNames: ["CSV"],
        Sheets: { CSV: {} },
        Workbook: { Sheets: [{ name: "CSV", Hidden: 0 }] }
      };
    } else {
      workbook = await parseWorkbookInWorker(bytes, state);
    }
    if (token !== state.fileToken) return;
    if (!workbook.SheetNames?.length) throw new Error("The file contains no readable worksheets.");
    const firstSheet = workbook.SheetNames.find(
      name => sheetVisibility(workbook, name) === "Visible"
    );
    if (!firstSheet) {
      throw new Error("The file contains no visible worksheets. Unhide a worksheet and try again.");
    }
    Object.assign(state, {
      busy: false,
      fileName: file.name,
      fileSize: file.size,
      sourceType: isCsv ? "csv" : "excel",
      csvText,
      workbook,
      sheetName: firstSheet,
      step: 2,
      error: "",
      mapping: {},
      plan: null
    });
  } catch (error) {
    if (token !== state.fileToken) return;
    Object.assign(state, {
      busy: false,
      sourceType: "",
      csvText: "",
      workbook: null,
      fileName: "",
      fileSize: 0,
      error: error?.message || "The file could not be read."
    });
  }
  render();
}

function parseWorkbookInWorker(bytes, state) {
  if (typeof Worker !== "function") {
    throw new Error("This browser does not support the isolated workbook parser.");
  }
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("./spreadsheet-worker.js", import.meta.url));
    } catch {
      reject(new Error("The isolated workbook parser could not be started."));
      return;
    }

    let settled = false;
    let timeoutId;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      worker.terminate();
      if (state.worker === worker) state.worker = null;
      if (state.workerCancel === cancel) state.workerCancel = null;
      callback(value);
    };
    const cancel = () => finish(reject, new DOMException("Workbook parsing was canceled.", "AbortError"));

    state.worker = worker;
    state.workerCancel = cancel;
    timeoutId = setTimeout(
      () =>
        finish(
          reject,
          new Error(
            `Workbook parsing exceeded ${Math.round(
              WORKBOOK_PARSE_TIMEOUT_MS / 1_000
            )} seconds and was stopped.`
          )
        ),
      WORKBOOK_PARSE_TIMEOUT_MS
    );
    worker.addEventListener("message", event => {
      if (event.data?.ok && event.data.workbook) {
        finish(resolve, event.data.workbook);
      } else {
        finish(
          reject,
          new Error(event.data?.error || "The workbook could not be parsed safely.")
        );
      }
    });
    worker.addEventListener("error", event => {
      event.preventDefault();
      finish(reject, new Error("The isolated workbook parser failed to load."));
    });
    try {
      worker.postMessage(
        {
          bytes,
          maxRows: IMPORT_LIMITS.maxRows,
          maxHeaderRows: MAX_HEADER_ROW
        },
        [bytes]
      );
    } catch {
      finish(reject, new Error("The workbook could not be sent to the isolated parser."));
    }
  });
}

function decodeCsv(bytes) {
  const raw = new Uint8Array(bytes);
  if (
    raw.length >= 2 &&
    ((raw[0] === 0xff && raw[1] === 0xfe) || (raw[0] === 0xfe && raw[1] === 0xff))
  ) {
    throw new Error("UTF-16 CSV files are not supported. Save the file as UTF-8 CSV and try again.");
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new Error("The CSV is not valid UTF-8. Save the file as UTF-8 CSV and try again.");
  }
  if (text.includes("\u0000")) {
    throw new Error("The CSV contains null bytes and cannot be imported safely.");
  }
  return text;
}

function prepareTable(state) {
  if (!state.workbook || !state.sheetName) throw new Error("Choose a readable worksheet.");
  if (!Number.isInteger(state.headerRow) || state.headerRow < 1 || state.headerRow > MAX_HEADER_ROW) {
    throw new Error(`Header row must be between 1 and ${MAX_HEADER_ROW}.`);
  }
  if (state.sourceType === "csv") {
    const table = parseCsv(state.csvText, { headerRow: state.headerRow - 1 });
    ensureTableHasData(table);
    Object.assign(state, {
      headers: table.headers,
      rows: table.rows,
      duplicateHeaders: table.duplicateHeaders,
      formulaCount: 0,
      linkCount: 0
    });
    return;
  }
  const XLSX = spreadsheetLibrary();
  if (sheetVisibility(state.workbook, state.sheetName) !== "Visible") {
    throw new Error("Hidden and very hidden worksheets cannot be imported. Unhide the worksheet first.");
  }
  const worksheet = state.workbook.Sheets[state.sheetName];
  if (!worksheet) throw new Error("The selected worksheet is not available.");
  enforceWorksheetDimensions(XLSX, worksheet, state.headerRow);
  const reference = worksheet["!ref"];
  if (!reference) throw new Error("The selected worksheet is empty.");
  const usedRange = XLSX.utils.decode_range(reference);
  const headerIndex = state.headerRow - 1;
  if (headerIndex < usedRange.s.r || headerIndex > usedRange.e.r) {
    throw new Error(
      `Header row ${state.headerRow} is outside the worksheet's used range (rows ${
        usedRange.s.r + 1
      }–${usedRange.e.r + 1}).`
    );
  }
  rejectHiddenSpreadsheetContent(worksheet, {
    s: { r: headerIndex, c: usedRange.s.c },
    e: { r: usedRange.e.r, c: usedRange.e.c }
  });
  const extractionRange = {
    s: { r: headerIndex, c: usedRange.s.c },
    e: { r: usedRange.e.r, c: usedRange.e.c }
  };
  const matrix = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
    dateNF: "yyyy-mm-dd",
    range: extractionRange
  });
  const table = buildTableFromMatrix(matrix, { headerRow: 0 });
  ensureTableHasData(table);
  const selectedCells = createCellPredicate(XLSX, extractionRange);
  const formulaCount = countCells(
    worksheet,
    cell => Boolean(cell?.f),
    selectedCells
  );
  const linkCount = countCells(
    worksheet,
    cell => Boolean(cell?.l),
    selectedCells
  );
  Object.assign(state, {
    headers: table.headers,
    rows: table.rows,
    duplicateHeaders: table.duplicateHeaders,
    formulaCount,
    linkCount
  });
}

function ensureTableHasData(table) {
  if (!table.headers.some(Boolean)) throw new Error("The selected header row is empty.");
  if (!table.rows.some(row => row.some(value => String(value ?? "").trim()))) {
    throw new Error("The selected worksheet contains no data rows.");
  }
}

function enforceWorksheetDimensions(XLSX, worksheet, headerRow) {
  const reference = worksheet["!fullref"] || worksheet["!ref"];
  if (!reference) return;
  const range = XLSX.utils.decode_range(reference);
  const columns = range.e.c - range.s.c + 1;
  const dataRows = Math.max(0, range.e.r - Math.max(range.s.r, headerRow - 1));
  if (columns > IMPORT_LIMITS.maxColumns) {
    throw new Error(
      `The worksheet has ${columns.toLocaleString()} columns; the limit is ${IMPORT_LIMITS.maxColumns.toLocaleString()}.`
    );
  }
  if (dataRows > IMPORT_LIMITS.maxRows) {
    throw new Error(
      `The worksheet has more than ${IMPORT_LIMITS.maxRows.toLocaleString()} data rows.`
    );
  }
}

function rejectHiddenSpreadsheetContent(worksheet, range) {
  const hiddenRow = (worksheet["!rows"] || []).findIndex(
    (metadata, index) => index >= range.s.r && index <= range.e.r && Boolean(metadata?.hidden)
  );
  if (hiddenRow >= 0) {
    throw new Error(
      `The selected range contains hidden row ${hiddenRow + 1}. Unhide all imported rows and try again.`
    );
  }
  const hiddenColumn = (worksheet["!cols"] || []).findIndex(
    (metadata, index) => index >= range.s.c && index <= range.e.c && Boolean(metadata?.hidden)
  );
  if (hiddenColumn >= 0) {
    throw new Error(
      `The selected range contains hidden column ${columnName(
        hiddenColumn
      )}. Unhide all imported columns and try again.`
    );
  }
}

function createCellPredicate(XLSX, range) {
  return address => {
    const position = XLSX.utils.decode_cell(address);
    return (
      position.r >= range.s.r &&
      position.r <= range.e.r &&
      position.c >= range.s.c &&
      position.c <= range.e.c
    );
  };
}

function stepsMarkup(activeStep) {
  return `<ol class="wizard-steps" aria-label="Import progress">
    ${["Choose file", "Configure", "Map columns", "Review"]
      .map((label, index) => {
        const step = index + 1;
        const stateClass = step === activeStep ? "active" : step < activeStep ? "complete" : "";
        return `<li class="${stateClass}" ${step === activeStep ? 'aria-current="step"' : ""}>${step}. ${label}</li>`;
      })
      .join("")}
  </ol>`;
}

function stepMarkup(state, activePursuit) {
  if (state.step === 1) return chooseFileMarkup(state);
  if (state.step === 2) return configureMarkup(state, activePursuit);
  if (state.step === 3) return mappingMarkup(state);
  return reviewMarkup(state);
}

function chooseFileMarkup(state) {
  return `<section aria-labelledby="chooseFileHeading">
    <div class="file-drop">
      <div>
        <strong id="chooseFileHeading">Choose an Excel or CSV file</strong>
        <p>The workbook stays on this device. Only mapped values are saved after review.</p>
        <input id="tabularImportFile" type="file" accept=".xlsx,.xls,.csv" ${
          state.busy ? "disabled" : ""
        } aria-describedby="importFileHelp">
        <small id="importFileHelp">.xlsx, .xls, or .csv · maximum ${formatBytes(
          MAX_IMPORT_FILE_BYTES
        )} · ${IMPORT_LIMITS.maxRows.toLocaleString()} data rows</small>
        <button class="btn small" type="button" data-wizard-template>Download workbook template</button>
      </div>
    </div>
    <div class="wizard-footer">
      <span>Canceling leaves the workspace unchanged.</span>
      <div class="row"><button class="btn" type="button" data-wizard-close>Cancel</button></div>
    </div>
  </section>`;
}

function configureMarkup(state, activePursuit) {
  const targetOptions = Object.values(IMPORT_TARGETS)
    .map(
      target =>
        `<option value="${target.key}" ${target.key === state.target ? "selected" : ""}>${esc(
          target.label
        )}</option>`
    )
    .join("");
  const sheetOptions = state.workbook.SheetNames.map(name => {
    const visibility = sheetVisibility(state.workbook, name);
    const isVisible = visibility === "Visible";
    return `<option value="${esc(name)}" ${
      name === state.sheetName ? "selected" : ""
    } ${isVisible ? "" : "disabled"}>${esc(name)}${
      isVisible ? "" : ` (${esc(visibility.toLowerCase())} — unavailable)`
    }</option>`;
  }).join("");
  return `<section aria-labelledby="configureImportHeading">
    ${fileSummary(state)}
    <form data-wizard-form="configure">
      <h3 id="configureImportHeading">Configure the import</h3>
      <div class="wizard-grid">
        <div class="field"><label for="importSheet">Worksheet</label><select id="importSheet" name="sheetName">${sheetOptions}</select></div>
        <div class="field"><label for="importHeaderRow">Header row</label><input id="importHeaderRow" name="headerRow" type="number" min="1" max="${MAX_HEADER_ROW}" value="${state.headerRow}" required></div>
        <div class="field"><label for="importTarget">Destination</label><select id="importTarget" name="target">${targetOptions}</select></div>
        <div class="field"><label for="importMode">Import mode</label><select id="importMode" name="mode">${modeOptions(
          state.target,
          state.mode
        )}</select></div>
        <p class="note full">Scope: ${
          state.target === "pursuits"
            ? "the pursuit portfolio"
            : `the active pursuit, <strong>${esc(activePursuit?.name || "none selected")}</strong>`
        }. You can change the destination before continuing.</p>
      </div>
      <div class="wizard-footer">
        <button class="btn" type="button" data-wizard-change-file>Choose another file</button>
        <div class="row"><button class="btn" type="button" data-wizard-close>Cancel</button><button class="btn primary" type="submit">Map columns</button></div>
      </div>
    </form>
  </section>`;
}

function mappingMarkup(state) {
  const target = IMPORT_TARGETS[state.target];
  const warnings = [
    state.duplicateHeaders.length
      ? `Duplicate headers detected: ${state.duplicateHeaders.join(", ")}. Map by column position carefully.`
      : "",
    state.formulaCount
      ? `${state.formulaCount} formula cell(s) detected. Formula code is not evaluated; only cached displayed values are available.`
      : "",
    state.linkCount
      ? `${state.linkCount} workbook link(s) detected. Links are treated as text and are never opened automatically.`
      : ""
  ].filter(Boolean);
  return `<section aria-labelledby="mappingHeading">
    ${fileSummary(state)}
    <form data-wizard-form="mapping">
      <div class="report-heading">
        <div><h3 id="mappingHeading">Map columns to ${esc(target.label.toLowerCase())}</h3><p>${esc(
          target.description
        )}</p></div>
        <span class="pill">${state.rows.length.toLocaleString()} ROWS</span>
      </div>
      ${
        warnings.length
          ? `<div class="diagnostic-list">${warnings
              .map(message => `<div class="diagnostic"><strong>Review</strong>${esc(message)}</div>`)
              .join("")}</div>`
          : ""
      }
      <div class="table-wrap mapping-table"><table>
        <thead><tr><th>Black Hat Agent field</th><th>Type</th><th>Spreadsheet column</th></tr></thead>
        <tbody>${target.fields
          .map(
            definition => `<tr>
              <td><strong>${esc(definition.label)}</strong>${
                definition.required ? ` <span class="required-mark" aria-label="required">*</span>` : ""
              }</td>
              <td>${esc(fieldTypeLabel(definition))}</td>
              <td><select name="map__${esc(definition.key)}" aria-label="Map ${esc(
                definition.label
              )}">
                <option value="">Do not import</option>
                ${state.headers
                  .map(
                    (header, index) =>
                      `<option value="${index}" ${
                        state.mapping[definition.key] === index ? "selected" : ""
                      }>${columnName(index)} — ${esc(header || "(blank header)")}</option>`
                  )
                  .join("")}
              </select></td>
            </tr>`
          )
          .join("")}</tbody>
      </table></div>
      <p class="form-help"><span class="required-mark">*</span> Required field. Automatic suggestions are based on recognized header names.</p>
      <div class="wizard-footer">
        <button class="btn" type="button" data-wizard-back="2">Back</button>
        <div class="row"><button class="btn" type="button" data-wizard-close>Cancel</button><button class="btn primary" type="submit">Validate and review</button></div>
      </div>
    </form>
  </section>`;
}

function reviewMarkup(state) {
  const plan = state.plan;
  const summary = plan?.summary || {
    totalRows: state.rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 1
  };
  const diagnostics = plan?.diagnostics || [];
  const errorCount = diagnostics.filter(item => item.severity === "error").length;
  const target = IMPORT_TARGETS[state.target];
  return `<section aria-labelledby="reviewHeading">
    ${fileSummary(state)}
    <div class="report-heading">
      <div><h3 id="reviewHeading">Review the import plan</h3><p>${
        plan?.valid
          ? "Validation passed. Applying this plan creates one recovery point and saves the changes atomically."
          : "Nothing has changed. Correct the mapping or source workbook, then validate again."
      }</p></div>
      <span class="tag ${plan?.valid ? "good" : "danger"}">${
        plan?.valid ? "READY" : `${errorCount} ERROR${errorCount === 1 ? "" : "S"}`
      }</span>
    </div>
    <div class="import-summary">
      ${summaryTile("ROWS", summary.processedRows ?? summary.totalRows ?? 0)}
      ${summaryTile("CREATE", summary.created ?? 0)}
      ${summaryTile("UPDATE", summary.updated ?? 0)}
      ${summaryTile("SKIP", summary.skipped ?? 0)}
    </div>
    ${
      diagnostics.length
        ? `<div class="diagnostic-list" aria-label="Import diagnostics">${diagnostics
            .slice(0, 50)
            .map(
              item => `<div class="diagnostic ${item.severity === "error" ? "error" : ""}">
                <strong>${item.severity === "error" ? "Error" : "Warning"}${
                  item.row ? ` · row ${item.row}` : ""
                }</strong>${esc(item.message)}
              </div>`
            )
            .join("")}${
              diagnostics.length > 50
                ? `<div class="diagnostic">${diagnostics.length - 50} more diagnostic(s) are not shown.</div>`
                : ""
            }</div>`
        : `<p class="note">No validation errors or warnings were found.</p>`
    }
    ${previewMarkup(plan?.preview || [], summary.processedRows ?? summary.totalRows ?? 0)}
    ${
      state.mode === "replace" && plan?.valid
        ? `<label class="confirm-replace"><input type="checkbox" name="confirmReplace" ${
            state.replaceConfirmed ? "checked" : ""
          }><span><strong>Confirm scoped replacement</strong><br>This will remove ${esc(
            target.label.toLowerCase()
          )} currently stored for the active pursuit before importing the reviewed rows. Other pursuits are not changed.</span></label>`
        : ""
    }
    <div class="wizard-footer">
      <button class="btn" type="button" data-wizard-back="3">Back to mapping</button>
      <div class="row"><button class="btn" type="button" data-wizard-close>Cancel</button><button class="btn primary" type="button" data-wizard-apply ${
        !plan?.valid || (state.mode === "replace" && !state.replaceConfirmed) || state.busy
          ? "disabled"
          : ""
      }>Apply import</button></div>
    </div>
  </section>`;
}

function previewMarkup(preview, processedRows) {
  if (!preview.length) return "";
  return `<div>
    <h3>Planned changes</h3>
    ${
      processedRows > preview.length
        ? `<p class="form-help">Showing the first ${preview.length.toLocaleString()} of ${Number(
            processedRows
          ).toLocaleString()} nonblank rows. Every row was validated before this plan was marked ready.</p>`
        : ""
    }
    <div class="preview-table"><table>
      <thead><tr><th>Row</th><th>Operation</th><th>Record</th><th>Details</th></tr></thead>
      <tbody>${preview
        .map(
          item => `<tr>
            <td>${esc(item.rowNumber)}</td>
            <td><span class="tag ${
              item.operation === "skip" ? "" : item.operation === "create" ? "good" : ""
            }">${esc(item.operation)}</span></td>
            <td><span class="cell-clip" title="${esc(item.identity)}">${esc(item.identity)}</span></td>
            <td>${esc(previewDetails(item))}</td>
          </tr>`
        )
        .join("")}</tbody>
    </table></div>
  </div>`;
}

function previewDetails(item) {
  if (item.score !== undefined) return `Score ${item.score}/5`;
  if (!item.record) return item.id || "Existing record";
  const fields = Object.entries(item.record)
    .filter(([key, value]) => !["id", "pursuitId", "attachmentData"].includes(key) && value !== "")
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`);
  return fields.join(" · ");
}

function fileSummary(state) {
  return `<div class="file-summary">
    <div><strong>${esc(state.fileName)}</strong><small>${formatBytes(state.fileSize)} · parsed locally · original file not retained</small></div>
    <button class="btn small" type="button" data-wizard-change-file>Change file</button>
  </div>`;
}

function modeOptions(targetKey, selectedMode) {
  const target = IMPORT_TARGETS[targetKey];
  const modes =
    target.modes ||
    (target.replaceAllowed ? ["append", "upsert", "replace"] : ["append", "upsert"]);
  const selected = modes.includes(selectedMode) ? selectedMode : modes[0];
  return modes
    .map(
      mode =>
        `<option value="${mode}" ${mode === selected ? "selected" : ""}>${esc(
          MODE_LABELS[mode]
        )}</option>`
    )
    .join("");
}

function summaryTile(label, value) {
  return `<div><span>${esc(label)}</span><strong>${Number(value || 0).toLocaleString()}</strong></div>`;
}

function fieldTypeLabel(definition) {
  if (definition.type === "references") return "Names or citations, separated by ;";
  if (definition.type === "enum") return definition.options.join(" / ");
  if (definition.type === "boolean") return "Yes / No";
  if (definition.type === "date") return "Date";
  if (definition.type === "number") return "Number";
  if (definition.type === "url") return "HTTP(S) URL";
  return "Text";
}

function sheetVisibility(workbook, name) {
  const index = workbook.SheetNames.indexOf(name);
  const hidden = Number(workbook.Workbook?.Sheets?.[index]?.Hidden || 0);
  return hidden === 2 ? "Very hidden" : hidden === 1 ? "Hidden" : "Visible";
}

function countCells(worksheet, predicate, addressPredicate = () => true) {
  return Object.entries(worksheet).reduce(
    (count, [address, cell]) =>
      address.startsWith("!") || !addressPredicate(address) || !predicate(cell)
        ? count
        : count + 1,
    0
  );
}

function columnName(index) {
  let number = Number(index) + 1;
  let result = "";
  while (number > 0) {
    number -= 1;
    result = String.fromCharCode(65 + (number % 26)) + result;
    number = Math.floor(number / 26);
  }
  return result || "A";
}

function formatBytes(bytes) {
  if (bytes < 1_000) return `${bytes} bytes`;
  if (bytes < 1_000_000) return `${Math.ceil(bytes / 1_000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function spreadsheetLibrary() {
  const XLSX = globalThis.XLSX;
  if (!XLSX?.read || !XLSX?.utils || !XLSX?.writeFile) {
    throw new Error("The local spreadsheet parser did not load. Refresh the page and try again.");
  }
  return XLSX;
}

function focusStep(dialog, state) {
  requestAnimationFrame(() => {
    if (!dialog.open || state.busy) return;
    const selector = {
      1: "#tabularImportFile",
      2: "#importSheet",
      3: ".mapping-table select",
      4: "[data-wizard-apply]:not([disabled]), [data-wizard-back]"
    }[state.step];
    dialog.querySelector(selector)?.focus();
  });
}
