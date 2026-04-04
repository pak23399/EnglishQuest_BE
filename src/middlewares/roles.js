module.exports = function requireRole(roleName) {
  const wanted = String(roleName || "").toLowerCase();

  return function (req, res, next) {
    const roles = (req.user && req.user.roles) ? req.user.roles : [];
    const ok = roles.some((r) => String(r).toLowerCase() === wanted);
    if (!ok) return res.status(403).json({ message: "Forbidden" });
    return next();
  };
};
