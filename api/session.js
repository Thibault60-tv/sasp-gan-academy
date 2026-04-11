const { requireAdmin } = require("./_auth");

module.exports = async (req, res) => {
  const payload = requireAdmin(req, res);
  if (!payload) return;
  return res.status(200).json({
    ok: true,
    username: payload.username || "admin",
    role: payload.role || "admin"
  });
};
