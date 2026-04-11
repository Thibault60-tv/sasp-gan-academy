const { requireAdmin } = require("./_auth");
let logs = globalThis.__ganLogs || [];
globalThis.__ganLogs = logs;

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.status(200).json({ ok: true, items: logs.slice(0, 50) });
};
