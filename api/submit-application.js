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

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Méthode non autorisée." });
    return;
  }

  try {
    const body = await parseJson(req);
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
      res.status(500).json({ ok: false, error: "Webhook manquant." });
      return;
    }

    const { candidateName, candidateAge, candidateDiscord, candidateMotivation } = body;

    if (!candidateName || !candidateDiscord || !candidateMotivation) {
      res.status(400).json({ ok: false, error: "Champs obligatoires manquants." });
      return;
    }

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

    if (!discordRes.ok) {
      res.status(502).json({ ok: false, error: "Échec d'envoi Discord." });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: "Requête invalide." });
  }
};
