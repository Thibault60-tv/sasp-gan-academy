const { requireRole, supabaseRequest } = require("./_auth");

module.exports = async (req, res) => {
  const payload = requireRole(req, res, ["admin", "formateur"]);
  if (!payload) return;
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ ok: false, error: "ID manquant." });

    const agentRes = await supabaseRequest(`agents?select=id,name,grade,created_at&id=eq.${encodeURIComponent(id)}&limit=1`, {
      method: "GET",
      headers: { Prefer: "" }
    });
    const agentText = await agentRes.text();
    if (!agentRes.ok) return res.status(500).json({ ok: false, error: agentText });
    const agents = JSON.parse(agentText);
    if (!agents.length) return res.status(404).json({ ok: false, error: "Agent introuvable." });

    const certRes = await supabaseRequest(`certificates?select=id,name,date,signature,created_at,agent_id&agent_id=eq.${encodeURIComponent(id)}&order=created_at.desc`, {
      method: "GET",
      headers: { Prefer: "" }
    });
    const certText = await certRes.text();
    if (!certRes.ok) return res.status(500).json({ ok: false, error: certText });
    const certs = JSON.parse(certText);

    return res.status(200).json({
      ok: true,
      agent: {
        id: agents[0].id,
        name: agents[0].name,
        grade: agents[0].grade,
        createdAt: agents[0].created_at,
        certCount: certs.length
      },
      certificates: certs.map(c => ({
        id: c.id,
        name: c.name,
        date: c.date,
        signature: c.signature,
        createdAt: c.created_at
      }))
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Erreur serveur." });
  }
};
