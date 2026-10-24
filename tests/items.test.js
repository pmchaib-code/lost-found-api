import "dotenv/config";
import request from "supertest";

if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a dedicated test database.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = "test-only-secret-long-enough";

const { app } = await import("../src/app.js");
const { pool } = await import("../src/db.js");

beforeAll(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS items (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('lost','found')), title VARCHAR(120) NOT NULL,
      description TEXT NOT NULL, category VARCHAR(60) NOT NULL, location VARCHAR(160) NOT NULL,
      event_date DATE, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','recovered')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
});
beforeEach(async () => {
  await pool.query("TRUNCATE items, users RESTART IDENTITY CASCADE");
});
afterAll(async () => { await pool.end(); });

async function newUser(email) {
  await request(app).post("/api/auth/signup").send({ email, password: "password123" });
  return (await request(app).post("/api/auth/login").send({ email, password: "password123" })).body.accessToken;
}
const report = {
  type: "lost", title: "Blue backpack", description: "Blue backpack near the library",
  category: "bag", location: "Algiers campus", eventDate: "2026-10-20"
};

test("health endpoint works", async () => {
  const res = await request(app).get("/health");
  expect(res.status).toBe(200);
  expect(res.body.database).toBe("connected");
});
test("signup rejects invalid input", async () => {
  expect((await request(app).post("/api/auth/signup").send({ email: "bad", password: "123" })).status).toBe(400);
});
test("authenticated user can create a lost-item report", async () => {
  const token = await newUser("a@example.com");
  const res = await request(app).post("/api/items").set("Authorization", `Bearer ${token}`).send(report);
  expect(res.status).toBe(201);
  expect(res.body.item.title).toBe(report.title);
});
test("creating an item requires authentication", async () => {
  expect((await request(app).post("/api/items").send(report)).status).toBe(401);
});
test("search and filters return matching reports", async () => {
  const token = await newUser("a@example.com");
  await request(app).post("/api/items").set("Authorization", `Bearer ${token}`).send(report);
  const res = await request(app).get("/api/items?type=lost&category=bag&location=Algiers&q=backpack");
  expect(res.status).toBe(200);
  expect(res.body.items).toHaveLength(1);
});
test("item details can be viewed", async () => {
  const token = await newUser("a@example.com");
  const created = await request(app).post("/api/items").set("Authorization", `Bearer ${token}`).send(report);
  const res = await request(app).get(`/api/items/${created.body.item.id}`);
  expect(res.status).toBe(200);
  expect(res.body.item.title).toBe(report.title);
});
test("owner can update their report", async () => {
  const token = await newUser("a@example.com");
  const created = await request(app).post("/api/items").set("Authorization", `Bearer ${token}`).send(report);
  const res = await request(app).patch(`/api/items/${created.body.item.id}`).set("Authorization", `Bearer ${token}`).send({ title: "Updated backpack" });
  expect(res.status).toBe(200);
  expect(res.body.item.title).toBe("Updated backpack");
});
test("user cannot update another user's report", async () => {
  const tokenA = await newUser("a@example.com"), tokenB = await newUser("b@example.com");
  const created = await request(app).post("/api/items").set("Authorization", `Bearer ${tokenA}`).send(report);
  const res = await request(app).patch(`/api/items/${created.body.item.id}`).set("Authorization", `Bearer ${tokenB}`).send({ title: "Stolen edit" });
  expect(res.status).toBe(403);
});
test("owner can mark their report recovered", async () => {
  const token = await newUser("a@example.com");
  const created = await request(app).post("/api/items").set("Authorization", `Bearer ${token}`).send(report);
  const res = await request(app).patch(`/api/items/${created.body.item.id}/recovered`).set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.item.status).toBe("recovered");
});
test("invalid filter is rejected", async () => {
  expect((await request(app).get("/api/items?type=missing")).status).toBe(400);
});
