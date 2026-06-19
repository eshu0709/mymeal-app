# MyMeal — AI Food Advisor

A beautiful, AI-powered meal analysis tool that helps you make healthier food choices — without giving up the foods you love.

## What It Does

1. **You describe your meal** (e.g. "cheeseburger, fries, and a cola")
2. **AI analyzes it** and tells you what nutritional problems exist
3. **You get 3–4 specific additions** to make it healthier and more balanced

## Tech Stack

- Pure HTML + CSS + JavaScript (no frontend framework)
- Vercel serverless function as a secure API proxy
- OpenAI GPT-4o for meal analysis

---

## Deployment (Vercel + GitHub)

The API key is stored securely in Vercel — never in the code.

### 1. Push this repo to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/mymeal-app.git
git push -u origin main
```

### 2. Create a free Vercel account

Go to [vercel.com](https://vercel.com) and sign up with your GitHub account.

### 3. Import the GitHub repo into Vercel

- Click **"Add New Project"**
- Select your `mymeal-app` repository
- Leave all settings as default — Vercel will auto-detect the project
- Click **Deploy**

### 4. Add your OpenAI API key as an environment variable

- In your Vercel project dashboard, go to **Settings → Environment Variables**
- Add a new variable:
  - **Name:** `OPENAI_API_KEY`
  - **Value:** your OpenAI API key (`sk-proj-...`)
  - **Environment:** Production, Preview, Development (select all)
- Click **Save**

### 5. Redeploy

- Go to **Deployments** tab → click the three dots on the latest deployment → **Redeploy**
- Your site is now live at `https://your-project.vercel.app`

---

## Project Structure

```
mymeal-app/
├── api/
│   └── analyze.js      ← Vercel serverless function (calls OpenAI securely)
├── images/             ← Logo and food photos
├── intro.html          ← Landing / home page
├── index.html          ← Meal analyzer page
├── feedback.html       ← Feedback page
├── shared.css          ← Shared styles (reference copy)
├── vercel.json         ← Vercel routing config
└── README.md
```

## Local Development

```bash
# Install Vercel CLI
npm i -g vercel

# Create a .env.local file with your key
echo "OPENAI_API_KEY=sk-proj-..." > .env.local

# Run locally (serves both the HTML and the /api function)
vercel dev
```

Then open [http://localhost:3000](http://localhost:3000).
