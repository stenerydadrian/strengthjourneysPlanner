// GET /api/planner?ssid=<spreadsheetId>
//
// Returns the planned sets from the `Planner` tab of the lifter's sheet,
// creating the tab (with headers) the first time. The tab is separate from
// the log so planned sets never count as lifts; see lib/planner/planner-sheet.js.

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { ensurePlannerTab, readPlannerRows } from "@/lib/planner/planner-sheet";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.accessToken) {
    return res.status(401).json({ error: "You must be logged in." });
  }

  const { ssid } = req.query;
  if (!ssid || ssid === "null") {
    return res.status(400).json({ error: "Missing ssid parameter" });
  }

  const headers = { Authorization: `Bearer ${session.accessToken}` };

  try {
    const ensured = await ensurePlannerTab({ ssid, headers });
    if (!ensured.ok) {
      return res
        .status(ensured.status)
        .json({ error: "Could not open the Planner tab." });
    }
    const planner = await readPlannerRows({ ssid, headers });
    if (!planner.ok) {
      return res
        .status(planner.status)
        .json({ error: "Could not read the Planner tab." });
    }
    return res.status(200).json({ items: planner.items });
  } catch (error) {
    console.error("[planner] read failed", error);
    return res.status(500).json({ error: "Could not read the Planner tab." });
  }
}
