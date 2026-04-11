const { parseJson, supabaseRequest } = require("./_auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Méthode non autorisée." });

  try {
    const body = await parseJson(req);
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return res.status(500).json({ ok: false, error: "Webhook manquant." });

    const { candidateName, candidateAge, candidateDiscord, candidateMotivation } = body;
    if (!candidateName || !candidateDiscord || !candidateMotivation) {
      return res.status(400).json({ ok: false, error: "Champs obligatoires manquants." });
    }

    const createdAt = new Date().toISOString();

    const dbRes = await supabaseRequest("applications", {
      method: "POST",
      body: JSON.stringify([{
        candidate_name: candidateName,
        candidate_age: candidateAge || null,
        candidate_discord: candidateDiscord,
        candidate_motivation: candidateMotivation,
        created_at: createdAt
      }])
    });

    if (!dbRes.ok) {
      const text = await dbRes.text();
      return res.status(500).json({ ok: false, error: `Erreur base applications: ${text}` });
    }

    await supabaseRequest("action_logs", {
      method: "POST",
      body: JSON.stringify([{
        action: "Nouvelle candidature",
        details: candidateName,
        created_at: createdAt
      }])
    });

    const discordRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "Nouvelle candidature SASP GAN",
          color: 15844367,
          fields: [
            { name: "Nom RP", value: candidateName, inline: true },
            { name: "Âge RP", value: candidateAge || "Non renseigné", inline: true },
            { name: "Discord", value: candidateDiscord, inline: true },
            { name: "Motivation", value: candidateMotivation }
          ],
          footer: { text: "SASP GAN Academy • GTA RP" },
          timestamp: createdAt
        }]
      })
    });

    if (!discordRes.ok) return res.status(502).json({ ok: false, error: "Échec d'envoi Discord." });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || "Requête invalide." });
  }
};
