# Lost & Found API

REST API for reporting lost/found items, searching and filtering reports, viewing details, updating one's own reports, and marking a report as recovered.

## Stack
Node.js, Express, PostgreSQL, JWT, bcryptjs, Jest and Supertest.

## Setup on Ubuntu
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a PostgreSQL user and database. Choose a password and use the same password in `.env`:
   ```bash
   sudo -u postgres psql
   ```
   Then:
   ```sql
   CREATE USER lost_found_app WITH PASSWORD 'CHOOSE_A_PASSWORD';
   CREATE DATABASE lost_found OWNER lost_found_app;
   \q
   ```
3. Configure environment:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set `DATABASE_URL`. Generate a JWT secret:
   ```bash
   openssl rand -hex 32
   ```
4. Create tables and indexes:
   ```bash
   npm run db:migrate
   ```
5. Start:
   ```bash
   npm run dev
   ```
6. Check:
   ```bash
   curl http://localhost:3000/health
   ```

## Endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | No | Create account |
| POST | `/api/auth/login` | No | Login and receive JWT |
| POST | `/api/items` | Yes | Create a lost/found report |
| GET | `/api/items` | No | Search/filter reports |
| GET | `/api/items/:id` | No | View report details |
| PATCH | `/api/items/:id` | Yes | Update your own report |
| PATCH | `/api/items/:id/recovered` | Yes | Mark your own report recovered |
| GET | `/health` | No | Health check |

Required item fields: `type` (`lost` or `found`), `title`, `description`, `category`, `location`.
Optional field: `eventDate` in `YYYY-MM-DD` format.

Example filter:
`GET /api/items?type=lost&category=phone&location=Algiers&status=open&q=samsung&limit=20&offset=0`

## Example create report
First sign up and log in using `/api/auth/signup` and `/api/auth/login`, then copy the `accessToken` and run:
```bash
curl -X POST http://localhost:3000/api/items \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -d '{"type":"lost","title":"Black wallet","description":"Small black wallet","category":"wallet","location":"ESI campus","eventDate":"2026-10-20"}'
```

## Tests
Tests truncate the tables, so **use a separate test database only**, never your development database.

Create a separate user and database:
```bash
sudo -u postgres psql
```
```sql
CREATE USER lost_found_test WITH PASSWORD 'CHOOSE_TEST_PASSWORD';
CREATE DATABASE lost_found_test OWNER lost_found_test;
\q
```
Then:
```bash
TEST_DATABASE_URL='postgres://lost_found_test:CHOOSE_TEST_PASSWORD@localhost:5432/lost_found_test' npm test
```
If the user/database already exists, do not create them again.

## Security
- Passwords are hashed with bcrypt.
- Protected routes require a valid Bearer JWT.
- Users can only edit or recover their own reports.
- SQL statements use parameterized values.
- `.env` and `node_modules` are excluded from Git.
