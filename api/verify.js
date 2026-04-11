const { supabaseRequest } = require("./_auth");

module.exports = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ valid: false });

    const dbRes = await supabaseRequest(`certificates?id=eq.${encodeURIComponent(id)}&select=id,name,date,signature,created_at`, {
      method: "GET",
      headers: { Prefer: "" }
    });

    const text = await dbRes.text();
    if (!dbRes.ok) return res.status(500).json({ valid: false, error: text });

    const rows = JSON.parse(text);
    if (!rows.length) return res.status(200).json({ valid: false });

    const cert = rows[0];
    return res.status(200).json({
      valid: true,
      id: cert.id,
      name: cert.name,
      date: cert.date,
      signature: cert.signature,
      createdAt: cert.created_at
    });
  } catch (err) {
    return res.status(500).json({ valid: false, error: err.message || "Erreur serveur." });
  }
};
