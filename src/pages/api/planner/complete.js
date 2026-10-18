// POST /api/planner/complete
//
// Marks one planned set as done in the `Planner` tab (or leaves it untouched
// when `repeatable` is set, so the Planner works as a reusable template).
//
// This route deliberately does NOT write to the log. Every log write goes
// through the log sync outbox (use-log-sheet-sync.js), which owns row
// placement, retries and column mapping; the plan page queues the completed
// set there and then calls this route only to update the Planner row.
//
// Body: { ssid, rowIndex, exercise, repeatable? }. `exercise` is checked
// against the row first so a Planner edited meanwhile is never mis-marked.

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/pages/api/auth/[...nextauth]";
import {
  PLANNER_TAB,
  STATUS_DONE,
  readPlannerRows,
} from "@/lib/planner/planner-sheet";
import { columnLetter } from "@/lib/sheet/sheet-row-ops";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.accessToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { ssid, rowIndex, exercise, repeatable } = req.body ?? {};
  if (!ssid || !Number.isInteger(rowIndex) || rowIndex < 2 || !exercise) {
    return res
      .status(400)
      .json({ error: "Missing required fields: ssid, rowIndex, exercise" });
  }

  if (repeatable === true) return res.status(200).json({ updated: false });

  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
  };

  try {
    const planner = await readPlannerRows({ ssid, headers });
    if (!planner.ok) {
      return res
        .status(planner.status)
        .json({ error: "Could not read the Planner tab." });
    }
    const row = planner.items.find((item) => item.rowIndex === rowIndex);
    if (!row || row.exercise !== exercise) {
      return res.status(409).json({
        error: "The Planner changed. Reload it and try again.",
        code: "PRECONDITION_FAILED",
      });
    }
    const statusColumn = planner.columnOf.status;
    if (statusColumn === undefined) {
      return res
        .status(409)
        .json({ error: "The Planner tab has no Status column." });
    }

    const range = `${PLANNER_TAB}!${columnLetter(statusColumn)}${rowIndex}`;
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${ssid}/values/${range}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ values: [[STATUS_DONE]] }),
      },
    );
    if (!updateRes.ok) {
      return res
        .status(updateRes.status)
        .json({ error: "Could not update the Planner." });
    }
    return res.status(200).json({ updated: true });
  } catch (error) {
    console.error("[planner] complete failed", error);
    return res.status(500).json({ error: "Could not update the Planner." });
  }
}
