const { requireAdmin, parseJson, supabaseRequest } = require("./_auth");

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === "GET") {
      const dbRes = await supabaseRequest("admin_accounts?select=id,username,role,created_at&order=created_at.desc&limit=100", {
        method: "GET",
        headers: { Prefer: "" }
      });
      const text = await dbRes.text();
      if (!dbRes.ok) return res.status(500).json({ ok: false, error: text });
      const rows = JSON.parse(text);
      return res.status(200).json({
        ok: true,
        items: rows.map(r => ({
          id: r.id,
          username: r.username,
          role: r.role,
          createdAt: r.created_at
        }))
      });
    }

    if (req.method === "POST") {
      const body = await parseJson(req);
      if (!body.username) return res.status(400).json({ ok: false, error: "Username manquant." });

      const createdAt = new Date().toISOString();
      const dbRes = await supabaseRequest("admin_accounts", {
        method: "POST",
        body: JSON.stringify([{
          username: body.username,
          role: body.role || "admin",
          created_at: createdAt
        }])
      });
      const text = await dbRes.text();
      if (!dbRes.ok) return res.status(500).json({ ok: false, error: text });

      await supabaseRequest("action_logs", {
        method: "POST",
        body: JSON.stringify([{
          action: "Admin créé",
          details: `${body.username} • ${body.role || "admin"}`,
          created_at: createdAt
        }])
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Méthode non autorisée." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Erreur serveur." });
  }
};
