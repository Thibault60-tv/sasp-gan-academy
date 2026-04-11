const { requireAdmin, parseJson, supabaseRequest } = require("./_auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Méthode non autorisée." });
  if (!requireAdmin(req, res)) return;

  try {
    const body = await parseJson(req);
    if (!body.agentId || !body.grade) return res.status(400).json({ ok: false, error: "Données manquantes." });

    const dbRes = await supabaseRequest(`agents?id=eq.${encodeURIComponent(body.agentId)}`, {
      method: "PATCH",
      body: JSON.stringify({ grade: body.grade })
    });
    const text = await dbRes.text();
    if (!dbRes.ok) return res.status(500).json({ ok: false, error: text });

    await supabaseRequest("action_logs", {
      method: "POST",
      body: JSON.stringify([{
        action: "Grade mis à jour",
        details: `${body.agentId} • ${body.grade}`,
        created_at: new Date().toISOString()
      }])
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Erreur serveur." });
  }
};
