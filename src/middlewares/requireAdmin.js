module.exports = function requireAdmin(req, res, next) {
 if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  let role = req.user.role;

  // ✅ normalize role
  if (Array.isArray(role)) {
    role = role.map((x) => Number(x));
    if (!role.includes(1)) {
      return res.status(403).json({ message: "Require role admin" });
    }
    return next();
  }

  if (Number(role) !== 1) {
    return res.status(403).json({ message: "Require role admin" });
  }

  next();
};
