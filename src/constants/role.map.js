/**
 * Mapping role theo chuẩn FE (Metronic)
 * FE hiểu:
 *  - Admin: ["2","1"]
 *  - User : ["2"]
 */
const ROLE_MAP = {
  ADMIN: ["2", "1"],
  USER: ["2"],
};

/**
 * Map account_type (DB) -> role (JWT)
 * 0 = Admin
 * 1 = User
 */
function mapRoleFromAccountType(accountType) {
  if (accountType === 0) return ROLE_MAP.ADMIN;
  return ROLE_MAP.USER;
}

module.exports = {
  ROLE_MAP,
  mapRoleFromAccountType,
};
