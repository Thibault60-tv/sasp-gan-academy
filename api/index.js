const crypto = require("crypto");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => data += chunk);
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (err) { reject(err); }
    });
  });
}
function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map(v => v.trim()).filter(Boolean).map(v => {
      const i = v.indexOf("=");
      return [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
    })
  );
}
function signToken(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
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
function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
function getRole(payload) { return (payload && payload.role) || "admin"; }
function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.");
  return { url: url.replace(/\/+$/, ""), key };
}
async function supabaseRequest(path, options = {}) {
  const { url, key } = getSupabaseConfig();
  return fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });
}
async function fetchRows(path) {
  const res = await supabaseRequest(path, { method: "GET", headers: { Prefer: "" } });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return JSON.parse(text);
}
async function insertLog(action, details) {
  await supabaseRequest("action_logs", {
    method: "POST",
    body: JSON.stringify([{ action, details, created_at: new Date().toISOString() }])
  });
}
function requireSession(req, res) {
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!secret) { json(res, 500, { ok: false, error: "ADMIN_TOKEN_SECRET manquant." }); return null; }
  const token = parseCookies(req.headers.cookie || "").gan_admin_token;
  const payload = verifyToken(token, secret);
  if (!payload) { json(res, 401, { ok: false, error: "Accès refusé." }); return null; }
  return payload;
}
function requireRole(req, res, allowedRoles) {
  const payload = requireSession(req, res);
  if (!payload) return null;
  const role = getRole(payload);
  if (!allowedRoles.includes(role)) { json(res, 403, { ok: false, error: "Permissions insuffisantes." }); return null; }
  return payload;
}
function certWebhookUrl() { return process.env.DISCORD_WEBHOOK_CERT || process.env.DISCORD_WEBHOOK_URL || ""; }
function applicationWebhookUrl() { return process.env.DISCORD_WEBHOOK_APPLICATION || ""; }
async function sendDiscordWebhook(url, payload) {
  if (!url) return { skipped: true };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Webhook Discord en erreur (${response.status}) ${text}`);
  }
  return { ok: true };
}

async function getNextMatricule() {
  const rows = await fetchRows("agents?select=matricule&order=created_at.desc&limit=500");
  let maxSeq = 0;
  for (const row of rows) {
    const val = row.matricule || "";
    const m = val.match(/^SASP-GAN-(\d{3,4})$/);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return `SASP-GAN-${String(maxSeq + 1).padStart(3, "0")}`;
}

async function getNextCertificateNumber() {
  const year = new Date().getFullYear();
  const rows = await fetchRows(`certificates?select=certificate_number&certificate_number=like.GAN-${year}-*&order=created_at.desc&limit=300`);
  let maxSeq = 0;
  for (const row of rows) {
    const val = row.certificate_number || "";
    const m = val.match(new RegExp(`^GAN-${year}-(\\d{4})$`));
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return `GAN-${year}-${String(maxSeq + 1).padStart(4, "0")}`;
}
function gradeFromCount(count) {
  if (count >= 12) return "Captain";
  if (count >= 9) return "Lieutenant";
  if (count >= 6) return "Sergeant";
  if (count >= 4) return "Senior Officer";
  if (count >= 2) return "Officer";
  return "Cadet";
}

async function ensureGradeHistory(agentId, fromGrade, toGrade, reason) {
  const createdAt = new Date().toISOString();
  await supabaseRequest("grade_history", {
    method: "POST",
    body: JSON.stringify([{
      agent_id: agentId,
      from_grade: fromGrade || null,
      to_grade: toGrade || null,
      reason: reason || "Promotion automatique",
      created_at: createdAt
    }])
  });
}

function mentionFromCount(count) {
  if (count >= 12) return "Élément d'élite";
  if (count >= 6) return "Excellence";
  if (count >= 3) return "Honneur";
  return "Validation standard";
}

async function routeLogin(req, res) {
  const body = await parseJson(req);
  if (body.username === process.env.ADMIN_USERNAME && body.password === process.env.ADMIN_PASSWORD) {
    const token = signToken({ role: "admin", username: body.username, expiresAt: Date.now() + 1000 * 60 * 60 * 8 }, process.env.ADMIN_TOKEN_SECRET);
    res.setHeader("Set-Cookie", `gan_admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
    return json(res, 200, { ok: true });
  }
  const rows = await fetchRows(`admin_accounts?select=id,username,role,password&username=eq.${encodeURIComponent(body.username)}&limit=1`);
  if (!rows.length || (rows[0].password || "") !== (body.password || "")) return json(res, 401, { ok: false, error: "Identifiants incorrects." });
  const user = rows[0];
  const token = signToken({ role: user.role || "accueil", username: user.username, expiresAt: Date.now() + 1000 * 60 * 60 * 8 }, process.env.ADMIN_TOKEN_SECRET);
  res.setHeader("Set-Cookie", `gan_admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
  return json(res, 200, { ok: true });
}
async function routeLogout(req, res) {
  res.setHeader("Set-Cookie", "gan_admin_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");
  return json(res, 200, { ok: true });
}
async function routeSession(req, res) {
  const payload = requireSession(req, res); if (!payload) return;
  return json(res, 200, { ok: true, username: payload.username || "admin", role: getRole(payload) });
}
async function routeSubmitApplication(req, res) {
  const body = await parseJson(req);
  const { candidateName, candidateAge, candidateDiscord, candidateMotivation } = body;
  if (!candidateName || !candidateDiscord || !candidateMotivation) return json(res, 400, { ok: false, error: "Champs obligatoires manquants." });
  const createdAt = new Date().toISOString();
  const appRes = await supabaseRequest("applications", {
    method: "POST",
    body: JSON.stringify([{ candidate_name: candidateName, candidate_age: candidateAge || null, candidate_discord: candidateDiscord, candidate_motivation: candidateMotivation, status: "en_attente", staff_note: null, created_at: createdAt }])
  });
  const appText = await appRes.text();
  if (!appRes.ok) return json(res, 500, { ok: false, error: appText });
  try {
    await sendDiscordWebhook(applicationWebhookUrl(), {
      embeds: [{
        title: "Nouvelle candidature SASP GAN",
        color: 5763719,
        fields: [
          { name: "Nom RP", value: candidateName || "N/A", inline: true },
          { name: "Âge RP", value: candidateAge || "Non renseigné", inline: true },
          { name: "Discord", value: candidateDiscord || "N/A", inline: true },
          { name: "Motivation", value: (candidateMotivation || "N/A").slice(0, 1000) }
        ],
        footer: { text: "SASP GAN Academy • Recrutement" },
        timestamp: createdAt
      }]
    });
  } catch (err) {
    await insertLog("Erreur webhook candidature", err.message || "Erreur inconnue");
  }
  await insertLog("Nouvelle candidature", candidateName);
  return json(res, 200, { ok: true });
}
async function routeApplications(req, res) {
  const payload = requireRole(req, res, ["admin", "accueil"]); if (!payload) return;
  const rows = await fetchRows("applications?select=id,candidate_name,candidate_age,candidate_discord,candidate_motivation,status,staff_note,created_at&order=created_at.desc&limit=100");
  return json(res, 200, { ok: true, items: rows.map(r => ({
    id: r.id, candidateName: r.candidate_name, candidateAge: r.candidate_age, candidateDiscord: r.candidate_discord,
    candidateMotivation: r.candidate_motivation, status: r.status || "en_attente", staffNote: r.staff_note || "", createdAt: r.created_at
  }))});
}
async function routeUpdateApplication(req, res) {
  const payload = requireRole(req, res, ["admin", "accueil"]); if (!payload) return;
  const body = await parseJson(req);
  if (!body.id) return json(res, 400, { ok: false, error: "ID manquant." });
  const patch = {};
  if (body.status) patch.status = body.status;
  if (typeof body.staffNote === "string") patch.staff_note = body.staffNote;
  const dbRes = await supabaseRequest(`applications?id=eq.${encodeURIComponent(body.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  const text = await dbRes.text();
  if (!dbRes.ok) return json(res, 500, { ok: false, error: text });
  await insertLog("Candidature mise à jour", `${body.id} • ${body.status || "note modifiée"}`);
  return json(res, 200, { ok: true });
}
async function routeLogs(req, res) {
  const payload = requireRole(req, res, ["admin"]); if (!payload) return;
  const rows = await fetchRows("action_logs?select=id,action,details,created_at&order=created_at.desc&limit=50");
  return json(res, 200, { ok: true, items: rows.map(r => ({ id: r.id, action: r.action, details: r.details, createdAt: r.created_at }))});
}
async function routeAdmins(req, res) {
  const payload = requireRole(req, res, ["admin"]); if (!payload) return;
  if (req.method === "GET") {
    const rows = await fetchRows("admin_accounts?select=id,username,role,created_at&order=created_at.desc&limit=100");
    return json(res, 200, { ok: true, items: rows.map(r => ({ id: r.id, username: r.username, role: r.role, createdAt: r.created_at }))});
  }
  const body = await parseJson(req);
  if (!body.username) return json(res, 400, { ok: false, error: "Username manquant." });
  const password = body.password || "ChangeMe123!";
  const role = body.role || "accueil";
  const createdAt = new Date().toISOString();
  const dbRes = await supabaseRequest("admin_accounts", { method: "POST", body: JSON.stringify([{ username: body.username, password, role, created_at: createdAt }]) });
  const text = await dbRes.text();
  if (!dbRes.ok) return json(res, 500, { ok: false, error: text });
  await insertLog("Compte créé", `${body.username} • ${role}`);
  return json(res, 200, { ok: true, defaultPassword: password });
}
async function routeAgents(req, res) {
  const payload = requireRole(req, res, ["admin", "formateur"]); if (!payload) return;
  const agents = await fetchRows("agents?select=id,name,grade,matricule,division,status,created_at&order=created_at.desc&limit=100");
  const certs = await fetchRows("certificates?select=agent_id");
  const counts = {};
  for (const cert of certs) { if (!cert.agent_id) continue; counts[cert.agent_id] = (counts[cert.agent_id] || 0) + 1; }
  return json(res, 200, { ok: true, items: agents.map(a => ({
    id: a.id, name: a.name, grade: a.grade, matricule: a.matricule, division: a.division, status: a.status, createdAt: a.created_at, certCount: counts[a.id] || 0
  }))});
}
async function routeAgentDetails(req, res) {
  const payload = requireRole(req, res, ["admin", "formateur"]);
  if (!payload) return;
  const id = new URL(req.url, "https://dummy").searchParams.get("id");
  if (!id) return json(res, 400, { ok: false, error: "ID manquant." });

  const agents = await fetchRows(`agents?select=id,name,grade,matricule,division,status,created_at&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!agents.length) return json(res, 404, { ok: false, error: "Agent introuvable." });

  const certs = await fetchRows(`certificates?select=id,name,date,signature,comment,mention,created_at,certificate_number,agent_id&agent_id=eq.${encodeURIComponent(id)}&order=created_at.desc`);
  let promotions = [];
  try {
    promotions = await fetchRows(`grade_history?select=id,from_grade,to_grade,reason,created_at,agent_id&agent_id=eq.${encodeURIComponent(id)}&order=created_at.desc`);
  } catch (e) {
    promotions = [];
  }

  return json(res, 200, {
    ok: true,
    agent: {
      id: agents[0].id,
      name: agents[0].name,
      grade: agents[0].grade,
      matricule: agents[0].matricule,
      division: agents[0].division,
      status: agents[0].status,
      createdAt: agents[0].created_at,
      certCount: certs.length
    },
    promotions: promotions.map(p => ({
      id: p.id,
      fromGrade: p.from_grade || "",
      toGrade: p.to_grade || "",
      reason: p.reason || "",
      createdAt: p.created_at
    })),
    certificates: certs.map(c => ({
      id: c.id,
      name: c.name,
      date: c.date,
      signature: c.signature,
      comment: c.comment || "",
      mention: c.mention || "",
      certificateNumber: c.certificate_number || "",
      createdAt: c.created_at
    }))
  });
}
async function routeCertificateDetails(req, res) {
  const payload = requireRole(req, res, ["admin", "formateur"]); if (!payload) return;
  const id = new URL(req.url, "https://dummy").searchParams.get("id");
  if (!id) return json(res, 400, { ok: false, error: "ID manquant." });
  const rows = await fetchRows(`certificates?select=id,name,date,signature,comment,mention,created_at,certificate_number&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!rows.length) return json(res, 404, { ok: false, error: "Certificat introuvable." });
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const verifyUrl = `${proto}://${host}/verify.html?id=${rows[0].id}`;
  return json(res, 200, { ok: true, certificate: {
    id: rows[0].id, name: rows[0].name, date: rows[0].date, signature: rows[0].signature, comment: rows[0].comment || "",
    comment: rows[0].comment || "", mention: rows[0].mention || "", certificateNumber: rows[0].certificate_number || "",
    verifyUrl, createdAt: rows[0].created_at
  }});
}
async function routeSearch(req, res) {
  const payload = requireRole(req, res, ["admin", "formateur"]); if (!payload) return;
  const q = (new URL(req.url, "https://dummy").searchParams.get("q") || "").trim();
  if (q.length < 2) return json(res, 200, { ok: true, items: [] });
  const agents = await fetchRows(`agents?select=id,name,grade&name=ilike.*${encodeURIComponent(q)}*&limit=5`);
  const certs = await fetchRows(`certificates?select=id,name,certificate_number&or=(name.ilike.*${encodeURIComponent(q)}*,certificate_number.ilike.*${encodeURIComponent(q)}*)&limit=5`);
  const items = [
    ...agents.map(a => ({ type: "agent", id: a.id, name: a.name, grade: a.grade })),
    ...certs.map(c => ({ type: "certificate", id: c.id, name: c.name, certificateNumber: c.certificate_number || "" }))
  ];
  return json(res, 200, { ok: true, items });
}
async function routeUpdateAgentGrade(req, res) {
  const payload = requireRole(req, res, ["admin"]); if (!payload) return;
  const body = await parseJson(req);
  if (!body.agentId || !body.grade) return json(res, 400, { ok: false, error: "Données manquantes." });
  const existing = await fetchRows(`agents?select=id,grade,name&id=eq.${encodeURIComponent(body.agentId)}&limit=1`);
  const previousGrade = existing.length ? (existing[0].grade || "Cadet") : "Cadet";
  const dbRes = await supabaseRequest(`agents?id=eq.${encodeURIComponent(body.agentId)}`, { method: "PATCH", body: JSON.stringify({ grade: body.grade }) });
  const text = await dbRes.text();
  if (!dbRes.ok) return json(res, 500, { ok: false, error: text });
  await ensureGradeHistory(body.agentId, previousGrade, body.grade, "Modification manuelle staff");
  await insertLog("Grade mis à jour", `${body.agentId} • ${previousGrade} -> ${body.grade}`);
  return json(res, 200, { ok: true });
}
async function routeCreateCertificate(req, res) {
  const payload = requireRole(req, res, ["admin", "formateur"]); if (!payload) return;
  const body = await parseJson(req);
  const { name, date, signature, comment } = body;
  if (!name) return json(res, 400, { ok: false, error: "Nom manquant." });

  const createdAt = new Date().toISOString();
  let agentRows = await fetchRows(`agents?select=id,name,grade,matricule,division,status,created_at&name=eq.${encodeURIComponent(name)}&limit=1`);
  let agentId = null;
  let existingCount = 0;

  if (agentRows.length) {
    agentId = agentRows[0].id;
    const priorCerts = await fetchRows(`certificates?select=id&agent_id=eq.${encodeURIComponent(agentId)}`);
    existingCount = priorCerts.length;
  } else {
    const newMatricule = await getNextMatricule();
    const newAgentRes = await supabaseRequest("agents", {
      method: "POST",
      body: JSON.stringify([{ name, grade: "Cadet", matricule: newMatricule, division: "GAN", status: "Actif", created_at: createdAt }])
    });
    const newAgentText = await newAgentRes.text();
    if (!newAgentRes.ok) return json(res, 500, { ok: false, error: newAgentText });
    agentId = JSON.parse(newAgentText)[0].id;
    existingCount = 0;
  }

  const nextCount = existingCount + 1;
  const autoGrade = gradeFromCount(nextCount);
  const mention = mentionFromCount(nextCount);
  const certificateNumber = await getNextCertificateNumber();

  const previousGrade = agentRows.length ? (agentRows[0].grade || "Cadet") : "Cadet";
  const gradeUpdateRes = await supabaseRequest(`agents?id=eq.${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    body: JSON.stringify({ grade: autoGrade })
  });
  const gradeUpdateText = await gradeUpdateRes.text();
  if (!gradeUpdateRes.ok) return json(res, 500, { ok: false, error: gradeUpdateText });

  if (previousGrade !== autoGrade) {
    await ensureGradeHistory(agentId, previousGrade, autoGrade, `Promotion automatique après ${nextCount} certificat(s)`);
    await insertLog("Promotion automatique", `${name} • ${previousGrade} -> ${autoGrade}`);
  }

  const dbRes = await supabaseRequest("certificates", {
    method: "POST",
    body: JSON.stringify([{
      agent_id: agentId,
      name,
      date: date || null,
      signature: signature || null,
      comment: comment || null,
      mention,
      certificate_number: certificateNumber,
      created_at: createdAt
    }])
  });
  const dbText = await dbRes.text();
  if (!dbRes.ok) return json(res, 500, { ok: false, error: dbText });
  const cert = JSON.parse(dbText)[0];

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const verifyUrl = `${proto}://${host}/verify.html?id=${cert.id}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl);

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks = [];
  doc.on("data", chunk => chunks.push(chunk));
  const pdfReady = new Promise(resolve => doc.on("end", resolve));

  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0b0b0d");
  doc.fillColor("#fbbf24").fontSize(12).text("SASP GAN Academy", 40, 35, { align: "left" });
  doc.strokeColor("#fbbf24").lineWidth(1).roundedRect(30, 25, 535, 792, 16).stroke();
  doc.fillColor("#ffffff").fontSize(28).text("Certificat Officiel de Qualification", 40, 100, { align: "center" });
  doc.fillColor("#9ca3af").fontSize(12).text("Division Gangs & Stupéfiants • Document Officiel", 40, 140, { align: "center" });
  doc.fillColor("#9ca3af").fontSize(11).text(`Référence : ${certificateNumber}`, 40, 160, { align: "center" });
  doc.fillColor("#fcd34d").fontSize(14).text(`Mention RP : ${mention}`, 40, 182, { align: "center" });
  doc.roundedRect(65, 220, 465, 230, 18).strokeColor("#33343a").lineWidth(1).stroke();
  doc.fillColor("#d1d5db").fontSize(16).text("Ce document certifie que", 40, 245, { align: "center" });
  doc.fillColor("#fbbf24").fontSize(34).text(name, 40, 282, { align: "center" });
  doc.fillColor("#d1d5db").fontSize(14).text(`Grade automatique obtenu : ${autoGrade}`, 95, 330, { width: 405, align: "center" });
  doc.fillColor("#d1d5db").fontSize(14).text("a satisfait les exigences de la SASP GAN Academy et est reconnu apte aux opérations réglementées de l'unité.", 95, 358, { width: 405, align: "center" });
  doc.moveTo(90, 420).lineTo(500, 420).strokeColor("#33343a").stroke();
  doc.fillColor("#e5e7eb").fontSize(13).text(`Date : ${date || "Non renseignée"}`, 95, 438);
  doc.text(`Signature : ${signature || "Non renseignée"}`, 360, 438, { width: 140, align: "right" });

  if (comment) {
    doc.roundedRect(85, 470, 420, 55, 12).strokeColor("#33343a").lineWidth(1).stroke();
    doc.fillColor("#9ca3af").fontSize(11).text("Commentaire", 105, 482);
    doc.fillColor("#ffffff").fontSize(12).text(comment, 105, 500, { width: 380, align: "center" });
  }

  doc.image(Buffer.from(qrDataUrl.split(",")[1], "base64"), 225, 560, { fit: [140, 140] });
  doc.fillColor("#9ca3af").fontSize(10).text("Scanner pour vérifier l'authenticité", 40, 715, { align: "center" });
  doc.fillColor("#9ca3af").fontSize(9).text(verifyUrl, 70, 735, { width: 460, align: "center" });
  doc.end();
  await pdfReady;

  const pdfUrl = `data:application/pdf;base64,${Buffer.concat(chunks).toString("base64")}`;

  try {
    await sendDiscordWebhook(certWebhookUrl(), {
      embeds: [{
        title: "Certificat SASP GAN généré",
        color: 15844367,
        description: "Certificat PDF premium généré depuis le panel staff.",
        fields: [
          { name: "Référence", value: certificateNumber || "N/A", inline: true },
          { name: "Nom RP", value: name || "N/A", inline: true },
          { name: "Mention RP", value: mention || "Validation standard", inline: true },
          { name: "Grade auto", value: autoGrade || "Cadet", inline: true },
          { name: "Date", value: date || "Non renseignée", inline: true },
          { name: "Signature", value: signature || "Non renseignée", inline: true },
          ...(comment ? [{ name: "Commentaire", value: comment }] : []),
          { name: "Vérification", value: verifyUrl }
        ],
        footer: { text: `SASP GAN Academy • ${getRole(payload)}` },
        timestamp: createdAt
      }]
    });
  } catch (err) {
    await insertLog("Erreur webhook certificat", err.message || "Erreur inconnue");
  }

  await insertLog("Certificat PDF envoyé", `${certificateNumber} • ${name} • ${mention} • ${autoGrade}`);
  return json(res, 200, { ok: true, verifyUrl, pdfUrl, certificateNumber, autoGrade, mention });
}
async function routeVerify(req, res) {
  const id = new URL(req.url, "https://dummy").searchParams.get("id");
  if (!id) return json(res, 400, { valid: false });
  const rows = await fetchRows(`certificates?select=id,name,date,signature,comment,mention,created_at,certificate_number&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!rows.length) return json(res, 200, { valid: false });
  return json(res, 200, {
    valid: true,
    id: rows[0].id,
    name: rows[0].name,
    date: rows[0].date,
    signature: rows[0].signature,
    comment: rows[0].comment || "",
    mention: rows[0].mention || "",
    certificateNumber: rows[0].certificate_number || "",
    createdAt: rows[0].created_at
  });
}
async function routeDashboard(req, res) {
  const payload = requireRole(req, res, ["admin", "formateur", "accueil"]); if (!payload) return;
  const certs = await fetchRows("certificates?select=id,name,certificate_number,mention,created_at&order=created_at.desc&limit=20");
  const promotions = await fetchRows("grade_history?select=id,from_grade,to_grade,reason,created_at&order=created_at.desc&limit=10");
  const today = new Date().toISOString().slice(0, 10);
  const todayCertificates = certs.filter(c => (c.created_at || "").slice(0, 10) === today).length;
  return json(res, 200, {
    ok: true,
    todayCertificates,
    latestCertificates: certs.slice(0, 5).map(c => ({
      id: c.id,
      name: c.name,
      mention: c.mention || "",
      certificateNumber: c.certificate_number || "",
      createdAt: c.created_at
    })),
    latestPromotions: promotions.slice(0, 5).map(p => ({
      id: p.id,
      fromGrade: p.from_grade,
      toGrade: p.to_grade,
      reason: p.reason,
      createdAt: p.created_at
    }))
  });
}

async function routeUpdateAgentFull(req, res) {
  const payload = requireRole(req, res, ["admin"]);
  if (!payload) return;
  const body = await parseJson(req);

  if (!body.id) return json(res, 400, { ok: false, error: "ID manquant." });

  const current = await fetchRows(`agents?select=id,name,matricule,grade,division,status&id=eq.${encodeURIComponent(body.id)}&limit=1`);
  if (!current.length) return json(res, 404, { ok: false, error: "Agent introuvable." });

  const before = current[0];
  const patch = {
    name: body.name || before.name,
    matricule: body.matricule || before.matricule,
    grade: body.grade || before.grade,
    division: body.division || before.division,
    status: body.status || before.status
  };

  const dbRes = await supabaseRequest(`agents?id=eq.${encodeURIComponent(body.id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
  const text = await dbRes.text();
  if (!dbRes.ok) return json(res, 500, { ok: false, error: text });

  if ((before.grade || "") !== (patch.grade || "")) {
    await ensureGradeHistory(body.id, before.grade, patch.grade, body.reason || "Modification manuelle staff");
  }

  await insertLog(
    "Agent modifié",
    `${before.name} • ${before.grade}/${before.division}/${before.status} -> ${patch.grade}/${patch.division}/${patch.status}`
  );

  return json(res, 200, { ok: true });
}


async function routeAcceptApplicationCreateAgent(req, res) {
  const payload = requireRole(req, res, ["admin", "accueil"]);
  if (!payload) return;
  const body = await parseJson(req);
  if (!body.id) return json(res, 400, { ok: false, error: "ID manquant." });

  const rows = await fetchRows(`applications?select=id,candidate_name,candidate_age,candidate_discord,candidate_motivation,status,staff_note&id=eq.${encodeURIComponent(body.id)}&limit=1`);
  if (!rows.length) return json(res, 404, { ok: false, error: "Candidature introuvable." });

  const app = rows[0];
  const createdAt = new Date().toISOString();
  let agents = await fetchRows(`agents?select=id,name,grade,matricule,division,status,created_at&name=eq.${encodeURIComponent(app.candidate_name)}&limit=1`);
  let agentId = null;
  let matricule = null;
  const grade = "Cadet";

  if (agents.length) {
    agentId = agents[0].id;
    matricule = agents[0].matricule || "";
    const updateExistingRes = await supabaseRequest(`agents?id=eq.${encodeURIComponent(agentId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        grade,
        division: agents[0].division || "GAN",
        status: "En formation"
      })
    });
    const updateExistingText = await updateExistingRes.text();
    if (!updateExistingRes.ok) return json(res, 500, { ok: false, error: updateExistingText });
  } else {
    const matriculeValue = await getNextMatricule();
    matricule = matriculeValue;
    const createRes = await supabaseRequest("agents", {
      method: "POST",
      body: JSON.stringify([{
        name: app.candidate_name,
        grade,
        matricule: matriculeValue,
        division: "GAN",
        status: "En formation",
        created_at: createdAt
      }])
    });
    const text = await createRes.text();
    if (!createRes.ok) return json(res, 500, { ok: false, error: text });
    agentId = JSON.parse(text)[0].id;
    await insertLog("Agent créé depuis candidature", `${app.candidate_name} • ${matriculeValue}`);
  }

  const certNumber = await getNextCertificateNumber();
  const todayFr = new Date().toLocaleDateString("fr-FR");

  const certRes = await supabaseRequest("certificates", {
    method: "POST",
    body: JSON.stringify([{
      name: app.candidate_name,
      date: todayFr,
      signature: "SASP Command",
      agent_id: agentId,
      certificate_number: certNumber,
      mention: "Recrutement",
      comment: "Certificat automatique recrutement",
      created_at: createdAt
    }])
  });
  const certText = await certRes.text();
  if (!certRes.ok) return json(res, 500, { ok: false, error: certText });
  const certificate = JSON.parse(certText)[0];

  const updateRes = await supabaseRequest(`applications?id=eq.${encodeURIComponent(body.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "acceptee",
      staff_note: body.staffNote || app.staff_note || "Accepté + agent créé"
    })
  });
  const updateText = await updateRes.text();
  if (!updateRes.ok) return json(res, 500, { ok: false, error: updateText });

  try {
    const mention = app.candidate_discord && String(app.candidate_discord).match(/\d{5,}/)
      ? `<@${String(app.candidate_discord).replace(/[^\d]/g, '')}>`
      : null;

    await sendDiscordWebhook(applicationWebhookUrl(), {
      content: mention || undefined,
      embeds: [{
        title: "Recrutement accepté",
        color: 5763719,
        fields: [
          { name: "Nom RP", value: app.candidate_name || "N/A", inline: true },
          { name: "Grade", value: grade, inline: true },
          { name: "Matricule", value: matricule || "N/A", inline: true },
          { name: "Certificat", value: certNumber || "N/A", inline: true },
          { name: "Statut", value: "Agent créé", inline: true },
          { name: "Note staff", value: body.staffNote || "Candidature acceptée" }
        ],
        footer: { text: `SASP GAN Academy • ${getRole(payload)}` },
        timestamp: createdAt
      }]
    });
  } catch (err) {
    await insertLog("Erreur webhook recrutement", err.message || "Erreur inconnue");
  }

  await insertLog("Recrutement complet", `${app.candidate_name} • ${grade} • ${matricule} • ${certNumber}`);
  return json(res, 200, { ok: true, agentId, certificateId: certificate.id, certNumber, matricule, grade });
}

async function routeRejectApplication(req, res) {
  const payload = requireRole(req, res, ["admin", "accueil"]);
  if (!payload) return;
  const body = await parseJson(req);
  if (!body.id) return json(res, 400, { ok: false, error: "ID manquant." });

  const rows = await fetchRows(`applications?select=id,candidate_name,candidate_discord,staff_note&id=eq.${encodeURIComponent(body.id)}&limit=1`);
  if (!rows.length) return json(res, 404, { ok: false, error: "Candidature introuvable." });
  const app = rows[0];
  const createdAt = new Date().toISOString();

  const updateRes = await supabaseRequest(`applications?id=eq.${encodeURIComponent(body.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "refusee",
      staff_note: body.staffNote || app.staff_note || "Candidature refusée"
    })
  });
  const updateText = await updateRes.text();
  if (!updateRes.ok) return json(res, 500, { ok: false, error: updateText });

  try {
    await sendDiscordWebhook(applicationWebhookUrl(), {
      embeds: [{
        title: "Candidature refusée",
        color: 15548997,
        fields: [
          { name: "Nom RP", value: app.candidate_name || "N/A", inline: true },
          { name: "Discord", value: app.candidate_discord || "N/A", inline: true },
          { name: "Statut", value: "Refusée", inline: true },
          { name: "Motif", value: body.staffNote || "Candidature refusée" }
        ],
        footer: { text: `SASP GAN Academy • ${getRole(payload)}` },
        timestamp: createdAt
      }]
    });
  } catch (err) {
    await insertLog("Erreur webhook recrutement", err.message || "Erreur inconnue");
  }

  await insertLog("Candidature refusée", `${app.candidate_name}`);
  return json(res, 200, { ok: true });
}


module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, "https://dummy");
    const action = url.searchParams.get("action");
    if (!action) return json(res, 400, { ok: false, error: "Action manquante." });

    if (action === "login") return routeLogin(req, res);
    if (action === "logout") return routeLogout(req, res);
    if (action === "session") return routeSession(req, res);
    if (action === "submit_application") return routeSubmitApplication(req, res);
    if (action === "applications") return routeApplications(req, res);
    if (action === "update_application") return routeUpdateApplication(req, res);
    if (action === "accept_application_create_agent") return routeAcceptApplicationCreateAgent(req, res);
    if (action === "reject_application") return routeRejectApplication(req, res);
    if (action === "logs") return routeLogs(req, res);
    if (action === "admins") return routeAdmins(req, res);
    if (action === "agents") return routeAgents(req, res);
    if (action === "agent_details") return routeAgentDetails(req, res);
    if (action === "certificate_details") return routeCertificateDetails(req, res);
    if (action === "search") return routeSearch(req, res);
    if (action === "update_agent_grade") return routeUpdateAgentGrade(req, res);
    if (action === "update_agent_full") return routeUpdateAgentFull(req, res);
    if (action === "create_certificate") return routeCreateCertificate(req, res);
    if (action === "verify") return routeVerify(req, res);
    if (action === "dashboard") return routeDashboard(req, res);

    return json(res, 404, { ok: false, error: "Action inconnue." });
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message || "Erreur serveur." });
  }
// ADD THIS TO YOUR API (index.js)

// Simple in-memory roles (replace with DB later)
const staffUsers = [
  { username: "admin", password: "admin123", role: "admin" },
  { username: "formateur", password: "form123", role: "formateur" },
  { username: "accueil", password: "acc123", role: "accueil" }
];

async function routeLogin(req, res){
  const { username, password } = await readBody(req);
  const user = staffUsers.find(u => u.username === username && u.password === password);
  if(!user) return json(res, 401, { ok:false, error:"Invalid credentials" });

  setSession(res, { role:user.role, username:user.username });
  return json(res, 200, { ok:true, role:user.role });
}

async function routeSession(req,res){
  const s = getSession(req);
  if(!s) return json(res, 200, { ok:false });
  return json(res, 200, { ok:true, role:s.role, username:s.username });
}

// Add in router:
// case "login": return routeLogin(req,res);
// case "session": return routeSession(req,res);

};
