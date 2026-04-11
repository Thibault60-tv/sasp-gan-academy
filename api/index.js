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
async function getNextCertificateNumber() {
  const year = new Date().getFullYear();
  const rows = await fetchRows(`certificates?select=certificate_number&certificate_number=like.GAN-${year}-*&order=created_at.desc&limit=200`);
  let maxSeq = 0;
  for (const row of rows) {
    const val = row.certificate_number || "";
    const m = val.match(new RegExp(`^GAN-${year}-(\\d{4})$`));
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return `GAN-${year}-${String(maxSeq + 1).padStart(4, "0")}`;
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
  await insertLog("Nouvelle candidature", candidateName);
  return json(res, 200, { ok: true });
}
async function routeApplications(req, res) {
  const payload = requireRole(req, res, ["admin", "accueil"]); if (!payload) return;
  const rows = await fetchRows("applications?select=id,candidate_name,candidate_age,candidate_discord,candidate_motivation,status,staff_note,created_at&order=created_at.desc&limit=100");
  return json(res, 200, { ok: true, items: rows.map(r => ({ id: r.id, candidateName: r.candidate_name, candidateAge: r.candidate_age, candidateDiscord: r.candidate_discord, candidateMotivation: r.candidate_motivation, status: r.status || "en_attente", staffNote: r.staff_note || "", createdAt: r.created_at }))});
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
  const agents = await fetchRows("agents?select=id,name,grade,created_at&order=created_at.desc&limit=100");
  const certs = await fetchRows("certificates?select=agent_id");
  const counts = {};
  for (const cert of certs) { if (!cert.agent_id) continue; counts[cert.agent_id] = (counts[cert.agent_id] || 0) + 1; }
  return json(res, 200, { ok: true, items: agents.map(a => ({ id: a.id, name: a.name, grade: a.grade, createdAt: a.created_at, certCount: counts[a.id] || 0 }))});
}
async function routeAgentDetails(req, res) {
  const payload = requireRole(req, res, ["admin", "formateur"]); if (!payload) return;
  const id = new URL(req.url, "https://dummy").searchParams.get("id");
  if (!id) return json(res, 400, { ok: false, error: "ID manquant." });
  const agents = await fetchRows(`agents?select=id,name,grade,created_at&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!agents.length) return json(res, 404, { ok: false, error: "Agent introuvable." });
  const certs = await fetchRows(`certificates?select=id,name,date,signature,created_at,certificate_number,agent_id&agent_id=eq.${encodeURIComponent(id)}&order=created_at.desc`);
  return json(res, 200, { ok: true, agent: { id: agents[0].id, name: agents[0].name, grade: agents[0].grade, createdAt: agents[0].created_at, certCount: certs.length }, certificates: certs.map(c => ({ id: c.id, name: c.name, date: c.date, signature: c.signature, certificateNumber: c.certificate_number || "", createdAt: c.created_at }))});
}
async function routeCertificateDetails(req, res) {
  const payload = requireRole(req, res, ["admin", "formateur"]); if (!payload) return;
  const id = new URL(req.url, "https://dummy").searchParams.get("id");
  if (!id) return json(res, 400, { ok: false, error: "ID manquant." });
  const rows = await fetchRows(`certificates?select=id,name,date,signature,created_at,certificate_number&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!rows.length) return json(res, 404, { ok: false, error: "Certificat introuvable." });
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const verifyUrl = `${proto}://${host}/verify.html?id=${rows[0].id}`;
  return json(res, 200, { ok: true, certificate: { id: rows[0].id, name: rows[0].name, date: rows[0].date, signature: rows[0].signature, certificateNumber: rows[0].certificate_number || "", verifyUrl, createdAt: rows[0].created_at }});
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
  const dbRes = await supabaseRequest(`agents?id=eq.${encodeURIComponent(body.agentId)}`, { method: "PATCH", body: JSON.stringify({ grade: body.grade }) });
  const text = await dbRes.text();
  if (!dbRes.ok) return json(res, 500, { ok: false, error: text });
  await insertLog("Grade mis à jour", `${body.agentId} • ${body.grade}`);
  return json(res, 200, { ok: true });
}
async function routeCreateCertificate(req, res) {
  const payload = requireRole(req, res, ["admin", "formateur"]); if (!payload) return;
  const body = await parseJson(req);
  const { name, date, signature } = body;
  if (!name) return json(res, 400, { ok: false, error: "Nom manquant." });
  const createdAt = new Date().toISOString();
  let agentRows = await fetchRows(`agents?select=id,name,grade,created_at&name=eq.${encodeURIComponent(name)}&limit=1`);
  let agentId = null;
  if (agentRows.length) agentId = agentRows[0].id;
  else {
    const newAgentRes = await supabaseRequest("agents", { method: "POST", body: JSON.stringify([{ name, grade: "Cadet", created_at: createdAt }]) });
    const newAgentText = await newAgentRes.text();
    if (!newAgentRes.ok) return json(res, 500, { ok: false, error: newAgentText });
    agentId = JSON.parse(newAgentText)[0].id;
  }
  const certificateNumber = await getNextCertificateNumber();
  const dbRes = await supabaseRequest("certificates", { method: "POST", body: JSON.stringify([{ agent_id: agentId, name, date: date || null, signature: signature || null, certificate_number: certificateNumber, created_at: createdAt }]) });
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
  doc.fillColor("#ffffff").fontSize(28).text("Certificat Officiel de Qualification", 40, 110, { align: "center" });
  doc.fillColor("#9ca3af").fontSize(12).text("Division Gangs & Stupéfiants • Document Officiel", 40, 150, { align: "center" });
  doc.fillColor("#9ca3af").fontSize(11).text(`Référence : ${certificateNumber}`, 40, 170, { align: "center" });
  doc.roundedRect(65, 210, 465, 250, 18).strokeColor("#33343a").lineWidth(1).stroke();
  doc.fillColor("#d1d5db").fontSize(16).text("Ce document certifie que", 40, 245, { align: "center" });
  doc.fillColor("#fbbf24").fontSize(34).text(name, 40, 285, { align: "center" });
  doc.fillColor("#d1d5db").fontSize(15).text("a satisfait les exigences de la SASP GAN Academy et est reconnu apte aux opérations réglementées de l'unité.", 95, 345, { width: 405, align: "center" });
  doc.moveTo(90, 425).lineTo(500, 425).strokeColor("#33343a").stroke();
  doc.fillColor("#e5e7eb").fontSize(13).text(`Date : ${date || "Non renseignée"}`, 95, 442);
  doc.text(`Signature : ${signature || "Non renseignée"}`, 360, 442, { width: 140, align: "right" });
  doc.image(Buffer.from(qrDataUrl.split(",")[1], "base64"), 225, 520, { fit: [140, 140] });
  doc.fillColor("#9ca3af").fontSize(10).text("Scanner pour vérifier l'authenticité", 40, 675, { align: "center" });
  doc.fillColor("#9ca3af").fontSize(9).text(verifyUrl, 70, 695, { width: 460, align: "center" });
  doc.end();
  await pdfReady;
  const pdfUrl = `data:application/pdf;base64,${Buffer.concat(chunks).toString("base64")}`;
  await insertLog("Certificat PDF envoyé", `${certificateNumber} • ${name} • ${getRole(payload)}`);
  return json(res, 200, { ok: true, verifyUrl, pdfUrl, certificateNumber });
}
async function routeVerify(req, res) {
  const id = new URL(req.url, "https://dummy").searchParams.get("id");
  if (!id) return json(res, 400, { valid: false });
  const rows = await fetchRows(`certificates?select=id,name,date,signature,created_at,certificate_number&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!rows.length) return json(res, 200, { valid: false });
  return json(res, 200, { valid: true, id: rows[0].id, name: rows[0].name, date: rows[0].date, signature: rows[0].signature, certificateNumber: rows[0].certificate_number || "", createdAt: rows[0].created_at });
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
    if (action === "logs") return routeLogs(req, res);
    if (action === "admins") return routeAdmins(req, res);
    if (action === "agents") return routeAgents(req, res);
    if (action === "agent_details") return routeAgentDetails(req, res);
    if (action === "certificate_details") return routeCertificateDetails(req, res);
    if (action === "search") return routeSearch(req, res);
    if (action === "update_agent_grade") return routeUpdateAgentGrade(req, res);
    if (action === "create_certificate") return routeCreateCertificate(req, res);
    if (action === "verify") return routeVerify(req, res);
    return json(res, 404, { ok: false, error: "Action inconnue." });
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message || "Erreur serveur." });
  }
};
