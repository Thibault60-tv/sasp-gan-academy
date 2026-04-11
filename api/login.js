const { parseJson, signToken, supabaseRequest } = require("./_auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Méthode non autorisée." });

  try {
    const body = await parseJson(req);

    if (
      body.username === process.env.ADMIN_USERNAME &&
      body.password === process.env.ADMIN_PASSWORD
    ) {
      const token = signToken(
        { role: "admin", username: body.username, expiresAt: Date.now() + 1000 * 60 * 60 * 8 },
        process.env.ADMIN_TOKEN_SECRET
      );
      res.setHeader("Set-Cookie", `gan_admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
      return res.status(200).json({ ok: true });
    }

    const dbRes = await supabaseRequest(
      `admin_accounts?select=id,username,role,password&username=eq.${encodeURIComponent(body.username)}&limit=1`,
      { method: "GET", headers: { Prefer: "" } }
    );
    const text = await dbRes.text();
    if (!dbRes.ok) return res.status(500).json({ ok: false, error: text });
    const rows = JSON.parse(text);

    if (!rows.length) return res.status(401).json({ ok: false, error: "Identifiants incorrects." });
    const user = rows[0];
    if ((user.password || "") !== (body.password || "")) {
      return res.status(401).json({ ok: false, error: "Identifiants incorrects." });
    }

    const token = signToken(
      { role: user.role || "accueil", username: user.username, expiresAt: Date.now() + 1000 * 60 * 60 * 8 },
      process.env.ADMIN_TOKEN_SECRET
    );

    res.setHeader("Set-Cookie", `gan_admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || "Requête invalide." });
  }
};
