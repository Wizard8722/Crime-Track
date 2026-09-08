# Crime Track Environment Setup

Crime Track is a split application for government staff. The public screen only exposes exact NRC searching. The `/admin` screen is protected by an admin username and password.

## Requirements

- Node.js 20 or newer
- PostgreSQL 14 or newer, running locally
- PostgreSQL `psql` command available in PATH

## First computer setup (Windows)

1. Open PowerShell in the project folder.
2. Run `Set-ExecutionPolicy -Scope Process Bypass`.
3. Run `./setup.ps1`.
4. Open `backend/.env` and set a strong `ADMIN_PASSWORD` and `JWT_SECRET`.
5. Run `./start.ps1`.
6. Browse to `http://localhost:5173` for search or `http://localhost:5173/admin` for data entry.

The setup script installs both dependency sets, creates `crime_track` when missing, applies `backend/schema.sql`, and imports `dataset/full_nrc_dataset.csv` into the NRC reference table. It is safe to run again because reference imports use conflict protection.

## PostgreSQL configuration

The default connection is `postgresql://postgres:postgres@localhost:5432/crime_track`. Change `backend/.env` if the local PostgreSQL username, password, host, port, or database is different. PostgreSQL must allow the account to create a database on the first run, or an administrator can create `crime_track` manually and rerun the script.

## Moving to another PC

Copy the whole project folder, including `dataset/full_nrc_dataset.csv`, but do not copy `backend/.env` if it contains a real password. On the new PC, copy `backend/.env.example` to `backend/.env`, set the local PostgreSQL connection and secrets, then run `./setup.ps1` and `./start.ps1`.

## NRC behavior

The three selectors represent state/township code, NRC type (`N`, `E`, or `P`), and the six-digit number. Township options are filtered by state code because Myanmar township fragments can repeat. The API stores each part separately and searches all parts together.

## Production notes

Before production use, put the API behind HTTPS, set a long random `JWT_SECRET`, use a dedicated PostgreSQL role with limited permissions, restrict `FRONTEND_ORIGIN`, and replace the single-admin environment login with your organization’s identity system and audit logging.
