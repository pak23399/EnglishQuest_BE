const router = require("express").Router();
const bcrypt = require("bcrypt");
const prisma = require("../prisma");
const { signAccessToken, signRefreshToken } = require("../utils/tokens");
const jwt = require("jsonwebtoken");
const { mapRoleFromAccountType } = require("../constants/role.map");
// Helpers: fetch roles for user
async function getRoleNames(userId) {
  const links = await prisma.users_role.findMany({
    where: { user_id: userId },
    include: { roles: true },
  });
  return links.map((x) => x.roles?.name).filter(Boolean);
}

/**
 * POST /api/v1/auth/SignUp
 */
router.post("/signup", async (req, res) => {
  try {
    const { username, email, password, full_name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const exists = await prisma.users.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (exists) return res.status(409).json({ message: "Email already exists" });

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.users.create({
      data: {
        id: crypto.randomUUID(),
        email,
        username: username || null,
        full_name: full_name || null,

        // ✅ 4 field bắt buộc
        account_type: 1,      // bạn đã check: 1 = user
        account_status: 1,    // thường 1 = active/normal (bạn có thể confirm trong DB)
        is_active: true,

        // ✅ đúng tên cột trong schema
        password: hashed,

        // ✅ giống C# (created_date)
        created_date: new Date(),

        // Optional: set default JSON như C# (không bắt buộc vì Json?)
        achievements: [],
        settings: {},
        streak_data: {},
      },
      select: { id: true, email: true, username: true, full_name: true, account_type: true },
    });

    // ✅ gán role "User" nếu bảng roles có (giống logic bạn thấy trước đó)
    const role = await prisma.roles.findFirst({
      where: { key: 1 },
    });

    if (role) {
      await prisma.users_role.create({
        data: { user_id: user.id, role_id: role.id },
      }).catch(() => { });
    }

    return res.status(201).json({ message: "Signup success", user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/v1/auth/Login
 */
router.post("/login", async (req, res) => {
  try {
    const { email, username, userName, password } = req.body;
    const login = email || username || userName;

    if (!login || !password) {
      return res.status(400).json({ message: "Missing username/email or password" });
    }

    const user = await prisma.users.findFirst({
      where: {
        OR: [
          { email: { equals: login, mode: "insensitive" } },
          { username: { equals: login, mode: "insensitive" } },
        ],
      },
    });

    if (!user || !user.is_active) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 🔑 JWT PAYLOAD GIỐNG FE / C#
    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: mapRoleFromAccountType(user.account_type),
      currentPlan: user.current_plan ?? 0,
      avatarUrl: user.avatar ?? null,
    };

    const access_token = jwt.sign(
      payload,
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: "1h" }
    );

    // Nếu FE chưa dùng refresh_token thì tạm trả null
    const refresh_token = jwt.sign(
      { sub: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      access_token,
      refresh_token,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});


/**
 * POST /api/v1/auth/Refresh-Token
 */
router.post("/Refresh-Token", async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ message: "Missing refreshToken" });

  // Check token in DB (optional)
  const rec = await prisma.refresh_token.findFirst({ where: { token: refreshToken, revoked: false } }).catch(() => null);
  if (!rec) return res.status(401).json({ message: "Refresh token invalid" });

  // Verify signature
  const jwt = require("jsonwebtoken");
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const roles = await getRoleNames(payload.userId);

    const newAccess = signAccessToken({ userId: payload.userId, email: payload.email, roles });
    const newRefresh = signRefreshToken({ userId: payload.userId, email: payload.email });

    // rotate
    await prisma.refresh_token.update({
      where: { id: rec.id },
      data: { revoked: true },
    }).catch(() => { });
    await prisma.refresh_token.create({
      data: { user_id: payload.userId, token: newRefresh, revoked: false },
    }).catch(() => { });

    return res.json({ accessToken: newAccess, refreshToken: newRefresh });
  } catch (e) {
    return res.status(401).json({ message: "Refresh token invalid/expired" });
  }
});

/**
 * POST /api/v1/auth/Logout
 */
router.post("/Logout", async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ message: "Missing refreshToken" });

  await prisma.refresh_token.updateMany({
    where: { token: refreshToken },
    data: { revoked: true },
  }).catch(() => { });
  return res.json({ ok: true });
});

/**
 * POST /api/v1/auth/change-password
 */
router.post("/change-password", async (req, res) => {
  const { email, oldPassword, newPassword } = req.body || {};
  if (!email || !oldPassword || !newPassword) return res.status(400).json({ message: "Missing fields" });

  const user = await prisma.users.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ message: "User not found" });

  const ok = await bcrypt.compare(oldPassword, user.password_hash);
  if (!ok) return res.status(401).json({ message: "Old password incorrect" });

  const password_hash = await bcrypt.hash(newPassword, 10);
  await prisma.users.update({ where: { id: user.id }, data: { password_hash } });

  return res.json({ ok: true });
});

module.exports = router;
