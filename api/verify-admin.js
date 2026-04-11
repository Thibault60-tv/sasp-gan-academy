const crypto = require("crypto");

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => data += chunk);
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

function signToken(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Méthode non autorisée." });
    return;
  }

  try {
    const body = await parseJson(req);
    const expectedPassword = process.env.CERTIFICATE_PASSWORD;
    const tokenSecret = process.env.ADMIN_TOKEN_SECRET;

    if (!expectedPassword || !tokenSecret) {
      res.status(500).json({ ok: false, error: "Variables serveur manquantes." });
      return;
    }

    if (!body.password || body.password !== expectedPassword) {
      res.status(401).json({ ok: false, error: "Mot de passe incorrect." });
      return;
    }

    const expiresAt = Date.now() + 1000 * 60 * 30;
    const token = signToken({ role: "admin", expiresAt }, tokenSecret);

    res.setHeader(
      "Set-Cookie",
      `gan_admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1800`
    );
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: "Requête invalide." });
  }
};
