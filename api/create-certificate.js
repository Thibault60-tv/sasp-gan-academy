const { parseJson, requireRole, supabaseRequest } = require("./_auth");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Méthode non autorisée." });
  const payload = requireRole(req, res, ["admin", "formateur"]);
  if (!payload) return;

  try {
    const body = await parseJson(req);
    const { name, date, signature } = body;
    const createdAt = new Date().toISOString();
    if (!name) return res.status(400).json({ ok: false, error: "Nom manquant." });

    let agentId = null;
    const findAgentRes = await supabaseRequest(
      `agents?select=id,name,grade,created_at&name=eq.${encodeURIComponent(name)}&limit=1`,
      { method: "GET", headers: { Prefer: "" } }
    );
    const findAgentText = await findAgentRes.text();
    if (!findAgentRes.ok) return res.status(500).json({ ok: false, error: findAgentText });
    const foundAgents = JSON.parse(findAgentText);

    if (foundAgents.length) {
      agentId = foundAgents[0].id;
    } else {
      const newAgentRes = await supabaseRequest("agents", {
        method: "POST",
        body: JSON.stringify([{ name, grade: "Cadet", created_at: createdAt }])
      });
      const newAgentText = await newAgentRes.text();
      if (!newAgentRes.ok) return res.status(500).json({ ok: false, error: newAgentText });
      const newAgents = JSON.parse(newAgentText);
      agentId = newAgents[0].id;
    }

    const dbRes = await supabaseRequest("certificates", {
      method: "POST",
      body: JSON.stringify([{ agent_id: agentId, name, date: date || null, signature: signature || null, created_at: createdAt }])
    });
    const dbText = await dbRes.text();
    if (!dbRes.ok) return res.status(500).json({ ok: false, error: dbText });
    const rows = JSON.parse(dbText);
    const cert = rows[0];

    const host = req.headers["x-forwarded-proto"] && req.headers["x-forwarded-host"]
      ? `${req.headers["x-forwarded-proto"]}://${req.headers["x-forwarded-host"]}`
      : `https://${req.headers.host}`;

    const verifyUrl = `${host}/verify.html?id=${cert.id}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    const pdfReady = new Promise(resolve => doc.on("end", resolve));

    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0b0b0d");
    doc.fillColor("#fbbf24").fontSize(12).text("SASP GAN Academy", 40, 35, { align: "left" });
    doc.strokeColor("#fbbf24").lineWidth(1).roundedRect(30, 25, 535, 792, 16).stroke();
    doc.fillColor("#ffffff").fontSize(28).text("Certificat Officiel de Qualification", 40, 110, { align: "center" });
    doc.fillColor("#9ca3af").fontSize(12).text("Division Gangs & Stupéfiants • Document Officiel", 40, 150, { align: "center" });
    doc.roundedRect(65, 200, 465, 260, 18).strokeColor("#33343a").lineWidth(1).stroke();
    doc.fillColor("#d1d5db").fontSize(16).text("Ce document certifie que", 40, 235, { align: "center" });
    doc.fillColor("#fbbf24").fontSize(34).text(name, 40, 275, { align: "center" });
    doc.fillColor("#d1d5db").fontSize(15).text("a satisfait les exigences de la SASP GAN Academy et est reconnu apte aux opérations réglementées de l'unité.", 95, 335, { width: 405, align: "center" });
    doc.moveTo(90, 420).lineTo(500, 420).strokeColor("#33343a").stroke();
    doc.fillColor("#e5e7eb").fontSize(13).text(`Date : ${date || "Non renseignée"}`, 95, 438);
    doc.text(`Signature : ${signature || "Non renseignée"}`, 360, 438, { width: 140, align: "right" });

    const qrBase64 = qrDataUrl.split(",")[1];
    const qrBuffer = Buffer.from(qrBase64, "base64");
    doc.image(qrBuffer, 225, 520, { fit: [140, 140] });
    doc.fillColor("#9ca3af").fontSize(10).text("Scanner pour vérifier l'authenticité", 40, 675, { align: "center" });
    doc.fillColor("#9ca3af").fontSize(9).text(verifyUrl, 70, 695, { width: 460, align: "center" });
    doc.end();
    await pdfReady;

    const pdfBuffer = Buffer.concat(chunks);
    const pdfUrl = `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;

    if (process.env.DISCORD_WEBHOOK_URL) {
      await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "Certificat SASP GAN généré",
            color: 15844367,
            description: "Certificat PDF visuel généré depuis le panel admin.",
            fields: [
              { name: "Nom RP", value: name, inline: true },
              { name: "Date", value: date || "Non renseignée", inline: true },
              { name: "Signature", value: signature || "Non renseignée", inline: true },
              { name: "Vérification", value: verifyUrl }
            ],
            footer: { text: `SASP GAN Academy • ${payload.role}` },
            timestamp: createdAt
          }]
        })
      });
    }

    await supabaseRequest("action_logs", {
      method: "POST",
      body: JSON.stringify([{ action: "Certificat PDF envoyé", details: `${name} • ${date || "Sans date"} • ${payload.role}`, created_at: createdAt }])
    });

    return res.status(200).json({ ok: true, verifyUrl, pdfUrl });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Erreur serveur." });
  }
};
