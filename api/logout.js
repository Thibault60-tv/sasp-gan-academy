module.exports = async (req, res) => {
  res.setHeader("Set-Cookie", "gan_admin_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");
  res.status(200).json({ ok: true });
};
