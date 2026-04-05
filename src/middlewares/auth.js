const jwt = require("jsonwebtoken");

function getTokenFromHeader(req) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  return null;
}

module.exports = function auth(req, res, next) {
  try {
    // console.log("AUTH HEADER:", req.headers.authorization);
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({ message: "Missing token" });

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // ✅ normalize user id
    const userId = decoded.id || decoded.sub;
    if (!userId) return res.status(401).json({ message: "Invalid token payload" });

    req.user = {
      id: userId,
      email: decoded.email,
      username: decoded.username,
      role: decoded.role,
      account_type: decoded.account_type,
    };

    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};
