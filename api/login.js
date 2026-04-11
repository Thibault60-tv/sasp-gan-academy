const { parseJson, signToken } = require("./_auth");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Méthode non autorisée." });

  try {
    const body = await parseJson(req);
    const adminUser = process.env.ADMIN_USERNAME;
    const adminPass = process.env.ADMIN_PASSWORD;
    const secret = process.env.ADMIN_TOKEN_SECRET;

    if (!adminUser || !adminPass || !secret) {
      return res.status(500).json({ ok: false, error: "Variables serveur manquantes." });
    }

    if (body.username !== adminUser || body.password !== adminPass) {
      return res.status(401).json({ ok: false, error: "Identifiants incorrects." });
    }

    const token = signToken({ role: "admin", user: adminUser, expiresAt: Date.now() + 1000 * 60 * 60 * 8 }, secret);
    res.setHeader("Set-Cookie", `gan_admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(400).json({ ok: false, error: "Requête invalide." });
  }
};
