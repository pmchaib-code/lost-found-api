import "dotenv/config";
import { app } from "./app.js";

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  console.error("DATABASE_URL and JWT_SECRET must be set in .env");
  process.exit(1);
}
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Lost & Found API listening on port ${port}`));
