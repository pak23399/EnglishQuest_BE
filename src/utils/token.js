const jwt = require("jsonwebtoken");

function signAccessToken(payload) {
  const exp = process.env.ACCESS_TOKEN_EXPIRES_IN || "15m";
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: exp });
}

function signRefreshToken(payload) {
  const exp = process.env.REFRESH_TOKEN_EXPIRES_IN || "30d";
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: exp });
}

module.exports = { signAccessToken, signRefreshToken };