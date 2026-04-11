const { requireRole, supabaseRequest } = require("./_auth");

module.exports = async (req, res) => {
  const payload = requireRole(req, res, ["admin", "accueil"]);
  if (!payload) return;

  try {
    const query = "applications?select=id,candidate_name,candidate_age,candidate_discord,candidate_motivation,created_at&order=created_at.desc&limit=50";
    const dbRes = await supabaseRequest(query, { method: "GET", headers: { Prefer: "" } });
    const text = await dbRes.text();
    if (!dbRes.ok) return res.status(500).json({ ok: false, error: text });

    const rows = JSON.parse(text);
    const items = rows.map(r => ({
      id: r.id,
      candidateName: r.candidate_name,
      candidateAge: r.candidate_age,
      candidateDiscord: r.candidate_discord,
      candidateMotivation: r.candidate_motivation,
      createdAt: r.created_at
    }));
    res.status(200).json({ ok: true, items });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || "Requête invalide." });
  }
};
