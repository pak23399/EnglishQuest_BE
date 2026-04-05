require("dotenv").config();
const app = require("./app");

const PORT = Number(process.env.PORT || 3001);

app.listen(PORT, () => {
  console.log(`✅ EnglishQuest API (JS) listening on http://localhost:${PORT}`);
});
