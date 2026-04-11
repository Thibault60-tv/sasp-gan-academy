const { parseJson, signToken } = require("./_auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Méthode non autorisée." });

  try {
    const body = await parseJson(req);
    if (
      body.username !== process.env.ADMIN_USERNAME ||
      body.password !== process.env.ADMIN_PASSWORD
    ) {
      return res.status(401).json({ ok: false, error: "Identifiants incorrects." });
    }

    const token = signToken(
      { role: "admin", expiresAt: Date.now() + 1000 * 60 * 60 * 8 },
      process.env.ADMIN_TOKEN_SECRET
    );

    res.setHeader("Set-Cookie", `gan_admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(400).json({ ok: false, error: "Requête invalide." });
  }
};
