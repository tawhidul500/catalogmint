# CatalogMint: GitHub, Neon ও Vercel-এ প্রকাশ করার নিয়ম

এটি Next.js সংস্করণ। দর্শনার্থীদের লগইন লাগবে না। GitHub-এ কোড থাকবে, Vercel-এ ওয়েবসাইট চলবে এবং Neon-এ ক্যাটালগের ব্যাকআপ রাখা যাবে।

## ১. GitHub-এ ফাইল আপলোড

1. `CatalogMint-Vercel-Neon.zip` আনজিপ করুন।
2. [GitHub](https://github.com/new)-এ `catalogmint` নামে repository তৈরি করুন। Private রাখলেও সাইট public করা যাবে।
3. **Add file → Upload files** চাপুন। খালি repository হলে **uploading an existing file** লিংক পাবেন।
4. আনজিপ করা `catalogmint-vercel` ফোল্ডারের **ভেতরের ফাইল ও ফোল্ডারগুলো** আপলোড করুন।
5. **Commit changes** চাপুন।

Repository-র প্রথম পাতায় `package.json`, `package-lock.json`, `app`, `lib`, `components`, `public`, `database` থাকবে। পুরো ZIP আপলোড করলে Vercel সেটি অ্যাপ হিসেবে build করতে পারবে না। `.gitignore` ও নমুনা `.env.example` রাখুন; আসল database password GitHub-এ লিখবেন না।

## ২. Neon ডাটাবেস তৈরি

1. [Neon Console](https://console.neon.tech)-এ গিয়ে **New Project** থেকে `catalogmint` তৈরি করুন।
2. আপনার production branch ও database বেছে নিন।
3. **Postgres database → SQL Editor** বা **SQL Editor** খুলুন।
4. ZIP-এর `database/schema.sql` ফাইল খুলে পুরো লেখা কপি করুন।
5. SQL Editor-এ পেস্ট করে **Run** চাপুন। এতে প্রয়োজনীয় table তৈরি হবে।
6. **Connect** চাপুন। একই branch/database-এর connection string কপি করুন। Pooled connection দেওয়া থাকলে সেটি ব্যবহার করুন।

এটির ধরন হবে:

```text
postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

এটি উদাহরণ। Neon থেকে পাওয়া সম্পূর্ণ আসল string ব্যবহার করবেন, সঙ্গে থাকা query parameters-সহ।

## ৩. Vercel-এর সঙ্গে GitHub যুক্ত করুন

1. [Vercel](https://vercel.com)-এ সাইন ইন করুন।
2. **Add New → Project** চাপুন।
3. GitHub যুক্ত করে `catalogmint` repository-র পাশে **Import** চাপুন।
4. নিচের সেটিংস দিন:

| সেটিং | মান |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | `package.json` থাকা ফোল্ডার; সাধারণত `./` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Next.js-এর default রাখুন |
| Node.js Version | `24.x` |

## ৪. Neon connection দিন এবং Deploy করুন

Vercel-এর **Environment Variables** অংশে দিন:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Neon থেকে কপি করা সম্পূর্ণ connection string |

**Production** পরিবেশ নির্বাচন করুন। Preview-তেও ডাটাবেস চাইলে সেই পরিবেশের জন্য variable যোগ করুন; পরীক্ষার তথ্য আলাদা রাখতে Neon-এর আলাদা branch ব্যবহার করা যায়। Value-তে শুধু connection string দেবেন, `DATABASE_URL=` বা বাইরে উদ্ধৃতি চিহ্ন দেবেন না।

নামটি ঠিক `DATABASE_URL` হবে। `NEXT_PUBLIC_DATABASE_URL` ব্যবহার করবেন না, কারণ এই তথ্য শুধু সার্ভারের জন্য।

এবার **Deploy** চাপুন। Build শেষ হলে Vercel আপনার production URL দেখাবে। পরে environment variable বদলালে **Deployments → Redeploy** করতে হবে।

## ৫. লগইন ছাড়া public করুন

অ্যাপের ভেতরে লগইন নেই। Vercel-এর hosting protection আলাদাভাবে নিয়ন্ত্রণ করতে হবে:

1. Project থেকে **Security → Deployment Protection** খুলুন। কিছু dashboard-এ এটি **Settings**-এ থাকে।
2. সব deployment link public করতে **Vercel Authentication** বন্ধ করে **Save** করুন। Preview private রেখে শুধু production public করতে চাইলে production domain বাদ থাকে এমন protection scope বেছে নিন।
3. Project-এর **Domains** অংশ থেকে production URL কপি করুন।
4. Incognito window-তে সেই URL খুলুন। Vercel login ছাড়াই CatalogMint দেখা উচিত।

GitHub, Neon ও Vercel পরিচালনার জন্য আপনার নিজের account লাগবে। সাইটের দর্শনার্থীদের account লাগবে না।

## ৬. সাইট ও ডাটাবেস পরীক্ষা

1. দোকানের homepage link দিয়ে **Fetch products** চাপুন।
2. আমদানি শেষ হতে দিন অথবা **Pause import** করুন।
3. **Import history → Save to cloud** চাপুন।
4. Cloud backups তালিকা থেকে ক্যাটালগটি আবার খুলুন।
5. **Export catalog** থেকে PDF, Excel, CSV, Word ও Text পরীক্ষা করুন।

Neon-এর SQL Editor-এ এই query চালালে সংরক্ষিত ক্যাটালগ দেখতে পাবেন:

```sql
SELECT website, product_count, updated_at
FROM catalogmint_catalogs
ORDER BY updated_at DESC
LIMIT 10;
```

## তথ্য কীভাবে থাকবে

- ব্রাউজারের ইতিহাস স্বয়ংক্রিয়ভাবে সংরক্ষিত হয়।
- Neon-এ রাখতে **Save to cloud** চাপতে হবে। সম্পাদনার পর আবার চাপলে ব্যাকআপ হালনাগাদ হবে।
- নাম, কোড, পরিমাণ, ছবির মূল URL ও import progress Neon-এ থাকে। ছবির ফাইল Neon-এ আপলোড হয় না।
- PDF, Excel ও Word-এ ডাউনলোডযোগ্য ছবি যুক্ত হয়। CSV ও Text-এ ছবির লিংক থাকে।
- প্রত্যেক ব্রাউজারের আলাদা anonymous cookie আছে। তাই অন্য ডিভাইসে একই ব্যাকআপ দেখা যাবে না। কুকি মুছে ফেললে পুরোনো cloud backup-এ প্রবেশ হারাবেন। গুরুত্বপূর্ণ ক্যাটালগ export করে রাখুন।
- Cloud backup খুললে সেই দোকানের বর্তমান local catalog বদলে যায়।
- শুধু public পণ্য পড়া যায়। লগইন, bot protection বা গোপন catalog থাকলে সব পণ্য পাওয়া যাবে না।

## সাধারণ সমস্যার সমাধান

| সমস্যা | করণীয় |
| --- | --- |
| Next.js পাওয়া যাচ্ছে না | Root Directory-তে `package.json` আছে কি না দেখুন। |
| Cloud backups unavailable | Production-এ `DATABASE_URL` যোগ করে Redeploy করুন। |
| Cloud backups could not be reached | একই Neon branch/database-এ `database/schema.sql` চালিয়েছেন কি না দেখুন। |
| অন্য ব্রাউজারে ইতিহাস নেই | এটি স্বাভাবিক; প্রতিটি ব্রাউজারের ইতিহাস আলাদা। |
| পণ্য কম এসেছে | দোকানটি সীমিত তথ্য প্রকাশ করছে বা automated access আটকে দিচ্ছে কি না দেখুন। |
| অনুবাদ হচ্ছে না | MyMemory quota বা service সমস্যা হতে পারে। নাম হাতে সম্পাদনা করা যায়। |

GitHub-এর `main` branch-এ কোড পরিবর্তন করে push করলে Vercel নতুন deployment তৈরি করবে। এই ZIP-এ প্রয়োজনীয় কোড, SQL ও পরীক্ষা রয়েছে; আপনার account-এ চূড়ান্ত deployment ও live Neon connection উপরের ধাপগুলো দিয়ে সম্পন্ন করতে হবে। বিস্তারিত প্রযুক্তিগত তথ্য ও official documentation link `README.md`-তে রয়েছে।
