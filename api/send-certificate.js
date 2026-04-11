const { parseJson, requireAdmin, supabaseRequest } = require("./_auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Méthode non autorisée." });
  if (!requireAdmin(req, res)) return;

  try {
    const body = await parseJson(req);
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return res.status(500).json({ ok: false, error: "Webhook manquant." });

    const createdAt = new Date().toISOString();
    const { name, date, signature } = body;

    const discordRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "Certificat SASP GAN généré",
          color: 15844367,
          description: "Certificat transmis depuis le panel admin.",
          fields: [
            { name: "Nom RP", value: name || "Non renseigné", inline: true },
            { name: "Date", value: date || "Non renseignée", inline: true },
            { name: "Signature", value: signature || "Non renseignée", inline: true }
          ],
          footer: { text: "SASP GAN Academy • Certificate Dispatch" },
          timestamp: createdAt
        }]
      })
    });

    if (!discordRes.ok) return res.status(502).json({ ok: false, error: "Échec d'envoi Discord." });

    await supabaseRequest("action_logs", {
      method: "POST",
      body: JSON.stringify([{
        action: "Certificat envoyé",
        details: `${name || "Sans nom"} • ${date || "Sans date"}`,
        created_at: createdAt
      }])
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || "Requête invalide." });
  }
};
