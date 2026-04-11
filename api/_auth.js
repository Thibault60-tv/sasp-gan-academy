const crypto = require("crypto");

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

function requireAdmin(req, res) {
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!secret) {
    res.status(500).json({ ok: false, error: "ADMIN_TOKEN_SECRET manquant." });
    return null;
  }
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.gan_admin_token;
  const payload = verifyToken(token, secret);
  if (!payload || payload.role !== "admin") {
    res.status(401).json({ ok: false, error: "Accès refusé." });
    return null;
  }
  return payload;
}

module.exports = { parseJson, parseCookies, signToken, verifyToken, requireAdmin };
