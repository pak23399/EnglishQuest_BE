const jwt = require("jsonwebtoken");

module.exports = function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const userId = decoded.id || decoded.sub;
    if (userId) {
      req.user = {
        id: userId,
        email: decoded.email,
        username: decoded.username,
        role: decoded.role,
        account_type: decoded.account_type,
      };
    }
  } catch (_) {
  }
  return next();
};
