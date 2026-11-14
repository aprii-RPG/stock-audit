import pool from "../lib/db.js";
import { requireUser, logAction } from "../lib/auth.js";

const PENDING_STATUSES = new Set(["not_started", "awaiting_approval", "recount"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let client;
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!["admin", "back office", "auditor"].includes(String(user.role).trim().toLowerCase())) {
      return res.status(403).json({ error: "Not allowed to submit this audit." });
    }

    const { auditId } = req.body || {};
    if (typeof auditId !== "string" || !auditId.trim()) {
      return res.status(400).json({ error: "auditId is required." });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const auditResult = await client.query(
      `SELECT id, name, status, completed_at FROM audits WHERE id = $1 FOR UPDATE`,
      [auditId]
    );
    const audit = auditResult.rows[0];
    if (!audit) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Audit not found." });
    }

    if (String(user.role).trim().toLowerCase() === "auditor") {
      const assignment = await client.query(
        `SELECT 1 FROM audit_assignments
          WHERE audit_id = $1 AND user_id = $2 AND assign_role = 'auditor'`,
        [auditId, user.id]
      );
      if (!assignment.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "You are not assigned to this audit." });
      }
    }

    if (audit.status === "completed" && audit.completed_at) {
      await client.query("COMMIT");
      return res.status(200).json({
        success: true,
        message: "Audit was already submitted.",
        completedAt: new Date(audit.completed_at).toISOString(),
      });
    }

    const itemsResult = await client.query(
      `SELECT id, status FROM audit_items WHERE audit_id = $1 FOR UPDATE`,
      [auditId]
    );
    const pendingCount = itemsResult.rows.filter((item) => PENDING_STATUSES.has(item.status)).length;
    if (pendingCount > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `Cannot submit audit: ${pendingCount} product(s) are still pending review or recount.`,
      });
    }

    const updateResult = await client.query(
      `UPDATE audits
          SET status = 'completed', completed_at = now()
        WHERE id = $1
        RETURNING completed_at`,
      [auditId]
    );
    const completedAt = new Date(updateResult.rows[0].completed_at).toISOString();

    await logAction(client, user, {
      action: "AUDIT_CLOSED",
      details: `Audit ${audit.name} submitted and finalized by ${user.name}.`,
      auditId,
      auditName: audit.name,
    });

    await client.query("COMMIT");
    return res.status(200).json({
      success: true,
      message: "Audit successfully submitted.",
      completedAt,
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("submit-audit error", error);
    return res.status(500).json({ error: "Could not submit this audit." });
  } finally {
    client?.release();
  }
}
