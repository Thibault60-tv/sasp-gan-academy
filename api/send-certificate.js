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

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map(v => v.trim())
      .filter(Boolean)
      .map(v => {
        const i = v.indexOf("=");
        return [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
      })
  );
}

function verifyToken(token, secret) {
  if (!token || !token.includes(".")) return null;
  const [encoded, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  if (sig !== expected) return null;
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (!payload.expiresAt || Date.now() > payload.expiresAt) return null;
  return payload;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Méthode non autorisée." });
    return;
  }

  try {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    const tokenSecret = process.env.ADMIN_TOKEN_SECRET;

    if (!webhookUrl || !tokenSecret) {
      res.status(500).json({ ok: false, error: "Variables serveur manquantes." });
      return;
    }

    const cookies = parseCookies(req.headers.cookie || "");
    const token = cookies.gan_admin_token;
    const payload = verifyToken(token, tokenSecret);

    if (!payload || payload.role !== "admin") {
      res.status(401).json({ ok: false, error: "Accès refusé." });
      return;
    }

    const body = await parseJson(req);
    const { name, date, signature } = body;

    const discordRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "Certificat SASP GAN généré",
          color: 15844367,
          description: "Un certificat d'académie a été préparé depuis l'interface sécurisée ELITE MASTER.",
          fields: [
            { name: "Nom RP", value: name || "Non renseigné", inline: true },
            { name: "Date", value: date || "Non renseignée", inline: true },
            { name: "Signature", value: signature || "Non renseignée", inline: true }
          ],
          footer: { text: "SASP GAN Academy • Certificate Dispatch" },
          timestamp: new Date().toISOString()
        }]
      })
    });

    if (!discordRes.ok) {
      res.status(502).json({ ok: false, error: "Échec d'envoi Discord." });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: "Requête invalide." });
  }
};
