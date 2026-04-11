const { requireAdmin, supabaseRequest } = require("./_auth");
module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const query = "action_logs?select=id,action,details,created_at&order=created_at.desc&limit=50";
    const dbRes = await supabaseRequest(query, { method: "GET", headers: { Prefer: "" } });
    const text = await dbRes.text();
    if (!dbRes.ok) return res.status(500).json({ ok: false, error: text });

    const rows = JSON.parse(text);
    const items = rows.map(r => ({
      id: r.id,
      action: r.action,
      details: r.details,
      createdAt: r.created_at
    }));
    res.status(200).json({ ok: true, items });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || "Requête invalide." });
  }
};
