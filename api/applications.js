const { requireAdmin } = require("./_auth");
let applications = globalThis.__ganApplications || [];
globalThis.__ganApplications = applications;

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.status(200).json({ ok: true, items: applications.slice(0, 50) });
};
