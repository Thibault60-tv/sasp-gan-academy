const { requireAdmin, supabaseRequest } = require("./_auth");

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const agentsRes = await supabaseRequest(
      "agents?select=id,name,grade,created_at&order=created_at.desc&limit=100",
      { method: "GET", headers: { Prefer: "" } }
    );
    const agentsText = await agentsRes.text();
    if (!agentsRes.ok) return res.status(500).json({ ok: false, error: agentsText });
    const agents = JSON.parse(agentsText);

    const certsRes = await supabaseRequest(
      "certificates?select=agent_id",
      { method: "GET", headers: { Prefer: "" } }
    );
    const certsText = await certsRes.text();
    if (!certsRes.ok) return res.status(500).json({ ok: false, error: certsText });
    const certs = JSON.parse(certsText);

    const counts = {};
    for (const cert of certs) {
      if (!cert.agent_id) continue;
      counts[cert.agent_id] = (counts[cert.agent_id] || 0) + 1;
    }

    const items = agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      grade: agent.grade,
      createdAt: agent.created_at,
      certCount: counts[agent.id] || 0
    }));

    return res.status(200).json({ ok: true, items });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Erreur serveur." });
  }
};
