const { parseJson } = require("./_auth");

let applications = globalThis.__ganApplications || [];
let logs = globalThis.__ganLogs || [];
globalThis.__ganApplications = applications;
globalThis.__ganLogs = logs;

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

    const item = { candidateName, candidateAge, candidateDiscord, candidateMotivation, createdAt: new Date().toISOString() };
    applications.unshift(item);
    logs.unshift({ action: "Nouvelle candidature", details: candidateName, createdAt: new Date().toISOString() });

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
          footer: { text: "SASP GAN Academy • ELITE MASTER" },
          timestamp: new Date().toISOString()
        }]
      })
    });

    if (!discordRes.ok) return res.status(502).json({ ok: false, error: "Échec d'envoi Discord." });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(400).json({ ok: false, error: "Requête invalide." });
  }
};
