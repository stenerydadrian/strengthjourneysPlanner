/**
 * Server-side helpers for the `Planner` tab of a lifter's Google Sheet.
 *
 * The Planner tab holds workouts that have not happened yet. It is a separate
 * tab on purpose: /api/sheet/read only ever reads the first tab, so planned
 * sets can never reach parseData() and skew e1RM, PRs, tonnage or volume.
 * Never read this tab from the historical pipeline, and never add the Planner
 * to a range that the log reads.
 */

export const PLANNER_TAB = "Planner";
export const PLANNER_HEADERS = [
  "Day",
  "Exercise",
  "TargetReps",
  "TargetWeight",
  "SetOrder",
  "TargetRPE",
  "Notes",
  "Status",
];
export const STATUS_PENDING = "Pending";
export const STATUS_DONE = "Done";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

/** Creates the tab and its header row when the sheet has no Planner yet. */
export async function ensurePlannerTab({ ssid, headers }) {
  const metaRes = await fetch(
    `${SHEETS_BASE}/${ssid}?fields=sheets.properties(title)`,
    { headers },
  );
  if (!metaRes.ok) return { ok: false, status: metaRes.status };
  const meta = await metaRes.json();
  const exists = (meta.sheets ?? []).some(
    (sheet) => sheet.properties?.title === PLANNER_TAB,
  );
  if (exists) return { ok: true, created: false };

  const addRes = await fetch(`${SHEETS_BASE}/${ssid}:batchUpdate`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: PLANNER_TAB } } }],
    }),
  });
  // A parallel request may have created it a moment ago.
  if (!addRes.ok && addRes.status !== 400) {
    return { ok: false, status: addRes.status };
  }

  const headerRes = await fetch(
    `${SHEETS_BASE}/${ssid}/values/${PLANNER_TAB}!A1:H1?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [PLANNER_HEADERS] }),
    },
  );
  if (!headerRes.ok) return { ok: false, status: headerRes.status };
  return { ok: true, created: true };
}

/**
 * Reads the Planner into row objects. Columns are found by heading, in any
 * order; `rowIndex` is the 1-based sheet row, used to address a later update.
 */
export async function readPlannerRows({ ssid, headers }) {
  const res = await fetch(`${SHEETS_BASE}/${ssid}/values/${PLANNER_TAB}!A:Z`, {
    headers,
  });
  if (!res.ok) return { ok: false, status: res.status };
  const { values = [] } = await res.json();
  const [headRow = [], ...body] = values;
  const columnOf = {};
  headRow.forEach((name, index) => {
    columnOf[String(name).trim().toLowerCase()] = index;
  });
  const cell = (row, name) => row[columnOf[name.toLowerCase()]] ?? "";

  const items = [];
  body.forEach((row, i) => {
    const exercise = String(cell(row, "Exercise")).trim();
    if (!exercise) return;
    items.push({
      rowIndex: i + 2,
      day: String(cell(row, "Day")).trim() || "Planned workout",
      exercise,
      targetReps: toNumber(cell(row, "TargetReps")),
      targetWeight: toNumber(cell(row, "TargetWeight")),
      setOrder: toNumber(cell(row, "SetOrder")) ?? i + 1,
      targetRpe: toNumber(cell(row, "TargetRPE")),
      notes: String(cell(row, "Notes")),
      status: String(cell(row, "Status")).trim() || STATUS_PENDING,
    });
  });
  return { ok: true, items, columnOf, headRow };
}

function toNumber(value) {
  const parsed = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
