# CatalogMint: GitHub + Neon + Vercel edition

Public, bilingual ecommerce catalog importer built with Next.js. Visitors can use it without an account. Paste a store homepage to discover publicly accessible products, review their source codes, English/Bangla names, weight or size, and original image links. Export PDF, Excel, CSV, Word, or text.

বাংলায় সম্পূর্ণ deployment নির্দেশনা: [DEPLOYMENT-BN.md](DEPLOYMENT-BN.md).

## What runs where

| Service | Purpose |
| --- | --- |
| GitHub | Stores this source code and its changes. A private repository works. |
| Vercel | Hosts the Next.js website and server API routes. |
| Neon | Stores catalog snapshots explicitly saved with **Import history → Save to cloud**. |

Browser history saves automatically in IndexedDB. Neon stores product details, import progress and original image URLs, not copies of the image files. PDF, XLSX and DOCX embed photos when they can be downloaded; CSV and TXT contain image URLs. Missing barcodes remain missing unless the store publishes another code, whose type is shown separately. Machine translations require review.

## Deploy in five steps

### 1. Upload the extracted project to GitHub

1. Unzip `CatalogMint-Vercel-Neon.zip`.
2. Create a GitHub repository, for example `catalogmint`. Private is fine.
3. In the repository, choose **Add file → Upload files** (or **uploading an existing file** for an empty repository).
4. Upload the **contents** of the extracted `catalogmint-vercel` folder, preserving its folders. The repository root should contain `package.json`, `package-lock.json`, `app`, `lib`, `components`, `public`, and `database`.
5. Commit the files to `main`. Include `.gitignore` and the placeholder `.env.example`. Keep real database credentials in Vercel's environment variables.

Alternatively, from the extracted folder, with an empty GitHub repository ready:

```bash
git init
git add .
git commit -m "Add CatalogMint Vercel app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/catalogmint.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

### 2. Create and initialize Neon

1. Open [Neon Console](https://console.neon.tech) and create a project named `catalogmint`.
2. Select its production branch and database.
3. Open **Postgres database → SQL Editor** (or **SQL Editor**, depending on the dashboard layout).
4. Paste the complete contents of `database/schema.sql` and click **Run**. This creates `catalogmint_catalogs` and its history index. It is safe to run again.
5. Click **Connect**, select the same branch/database, and copy its connection string. Use the pooled connection string when offered. Keep the supplied query parameters.

The value looks like this, with your real credentials and host:

```text
postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

### 3. Import into Vercel

1. Open [Vercel](https://vercel.com), choose **Add New → Project**, and connect GitHub.
2. Import the `catalogmint` repository and allow Vercel access to it.
3. Use these settings:

| Setting | Value |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | The directory containing `package.json`, normally `./` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Leave the Next.js default |
| Node.js Version | `24.x` (also declared in `package.json`) |

4. Under **Environment Variables**, add `DATABASE_URL` and paste only the full Neon connection string as its value. Select **Production**. Add **Preview** too if preview deployments should use that database; for separate test data, use a Neon development branch and that branch's connection string instead.
5. Click **Deploy**.

Use the exact name `DATABASE_URL`, with no `NEXT_PUBLIC_` prefix. The code uses the server-only Neon HTTP driver. No Prisma, separate database server, or manually started backend is required.

If you add or change `DATABASE_URL` after deployment, open **Deployments → Redeploy** so the new value is applied.

### 4. Make the site public

The application has no login screen. Hosting access is controlled separately:

1. In your Vercel project, open **Security → Deployment Protection**, or **Settings → Deployment Protection** if shown there.
2. To make all deployment links public, turn **Vercel Authentication** off and save. If you want protected previews, instead choose a scope that excludes your production domain.
3. Share the production domain from the project's **Domains** section. Open it in an incognito window and check that CatalogMint appears without a Vercel login prompt.

### 5. Check the live setup

1. Paste a publicly readable store homepage and click **Fetch products**.
2. Let the import finish or pause it. Check names, codes, quantities and images.
3. Open **Import history → Save to cloud**. Wait for the saved confirmation.
4. Open the backup from the cloud list and confirm its contents.
5. Test the five export formats from the workspace.
6. In Neon SQL Editor, verify that a snapshot was written:

```sql
SELECT website, product_count, updated_at
FROM catalogmint_catalogs
ORDER BY updated_at DESC
LIMIT 10;
```

Updates pushed to GitHub's production branch trigger a new Vercel deployment.

## How anonymous backups work

Each browser receives a random HttpOnly cookie. Only its SHA-256 hash is stored as the snapshot owner in Neon; all reads and writes are scoped to that owner. Another browser or device has a separate history. This is not an account or cross-device sync. Clearing cookies or changing domains removes access to the old cloud snapshots. Keep exports of important catalogs. A restored snapshot replaces the local catalog for that store; it is not merged with newer local edits.

**Save to cloud** stores the current snapshot. After importing more products or editing names, click it again to update the cloud copy. The automatic local copy continues to work when Neon is not configured or is unavailable. The site operator can inspect database contents through their Neon account. An inaccessible browser cookie does not automatically delete the corresponding database rows.

## Run locally

Install Node.js 24. From this project folder:

```bash
npm ci
```

Copy `.env.example` to `.env.local`, set your real `DATABASE_URL`, and run the schema once in Neon. To run without cloud backups, omit `.env.local` entirely.

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). For a production build:

```bash
npm run build
npm start
```

## Validation

```bash
npm test
npm run typecheck
npm run build
```

The tests execute the actual backup route SQL in local PostgreSQL through PGlite, with the Neon HTTP transport replaced. They cover Unicode, barcode leading zeros, snapshot replacement, visitor isolation, invalid/oversized requests, missing configuration and private network destinations. They do not verify your live Neon credentials or Vercel account.

## Limits and troubleshooting

| Symptom | What to check |
| --- | --- |
| Vercel cannot find Next.js | Root Directory must contain this edition's `package.json`. Upload the extracted source folders. |
| Cloud backups are unavailable | Set `DATABASE_URL` for this deployment environment and redeploy. |
| Cloud backups cannot be reached | Run `database/schema.sql` in the same Neon branch/database as the connection string. Check Vercel function logs and Neon availability. |
| Another device has no backups | Expected: anonymous backup access belongs to each browser's cookie. |
| Import returns few or no products | The source may require login, block automated requests, or expose only part of its catalog. Hosting does not remove these restrictions. |
| Translation stops | MyMemory may be unavailable or its quota exhausted. Keep completed translations or edit names manually. |
| An image is unavailable | The source may block the request, remove the image, or exceed the 4 MB image response limit. Other products still export. |
| Large snapshot cannot be saved | Uploads are capped at 4 MB compressed, 40 MB expanded. Keep the local copy and export it. |

Imports run in batches while the tab stays open. The import route declares a 180-second maximum; other routes declare 30 seconds. Use Vercel Fluid compute and a deployment configuration supporting these durations. Resume a paused import from history. The app has no distributed rate limiter or background worker; for high public traffic, configure hosting request limits and monitor Vercel/Neon usage. No paid-plan or unlimited-usage guarantee is included.

The source and image fetcher validates redirects, response sizes and DNS addresses at connection time. It rejects local/private destinations. These controls do not bypass a store's access restrictions.

## Official references

- [GitHub: Upload files](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)
- [Vercel: GitHub deployments](https://vercel.com/docs/git/vercel-for-github)
- [Vercel: Environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables)
- [Vercel: Authentication controls](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)
- [Vercel: Function limits](https://vercel.com/docs/functions/limitations)
- [Neon: Next.js connection](https://neon.com/docs/guides/nextjs)
- [Neon: SQL Editor](https://neon.com/docs/get-started/query-with-neon-sql-editor)

Fonts include their licenses in `public/fonts`. Example product photos remain source retailer/manufacturer imagery; they are sample catalog assets, not a claim of ownership or a general image license.
