# J.A.R.V.I.S — Mark III Intelligence System
### Just A Rather Very Intelligent System — Node.js + Groq AI

---

## 🚀 RAILWAY DEPLOYMENT — STEP BY STEP

### Step 1: Get Your Groq API Key (FREE)
1. Go to https://console.groq.com
2. Sign up (free, no credit card needed)
3. Click "API Keys" → "Create API Key"
4. Copy the key (starts with `gsk_`)

---

### Step 2: Upload to GitHub
```bash
# Initialize git repo
cd jarvis
git init
git add .
git commit -m "JARVIS Mark III — Initial Deploy"

# Create GitHub repo at github.com/new
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/jarvis-ai.git
git push -u origin main
```

---

### Step 3: Deploy on Railway
1. Go to https://railway.app
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `jarvis-ai` repository
4. Railway will auto-detect Node.js and deploy!

---

### Step 4: Add Environment Variables
In Railway dashboard:
1. Click your project → **"Variables"** tab
2. Add this variable:
   ```
   GROQ_API_KEY = gsk_your_key_here
   ```
3. Click **"Deploy"** — JARVIS goes live!

---

### Step 5: Get Your URL
Railway gives you a URL like:
`https://jarvis-ai-production.up.railway.app`

**That's it! JARVIS is live! 🎉**

---

## 🎯 FEATURES

| Feature | Description |
|---------|-------------|
| 💬 **Chat** | Talk to JARVIS powered by LLaMA3-70B |
| 🌐 **Web Search** | Real-time internet search + AI synthesis |
| 📎 **File Analysis** | Upload PDF, DOCX, TXT, CSV for analysis |
| 👁️ **Vision** | Upload images for AI analysis |
| 🎤 **Voice Input** | Speak your commands |
| ⚡ **Streaming** | Real-time token streaming |
| 🧠 **Memory** | Persistent long-term memory |
| 💻 **Code Mode** | Code analysis and explanation |
| 🎭 **6 Personalities** | Assistant, Coder, Creative, Brutal, Mission, Friday |
| 🤖 **4 AI Models** | LLaMA 3 70B, 8B, Mixtral, Gemma |

---

## 📁 PROJECT STRUCTURE

```
jarvis/
├── server.js          # Express backend — all API routes
├── package.json       # Dependencies
├── railway.json       # Railway config
├── .env.example       # Environment variables template
├── .gitignore
├── public/
│   └── index.html     # Full JARVIS UI
├── uploads/           # Temp file uploads (auto-created)
└── memory/            # Persistent memory (auto-created)
    └── jarvis_memory.json
```

---

## 🔧 LOCAL DEVELOPMENT

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env and add: GROQ_API_KEY=gsk_your_key

# Start server
npm start
# Open http://localhost:3000
```

---

## 🌐 API ENDPOINTS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server status |
| POST | `/api/chat` | Chat with JARVIS |
| POST | `/api/chat/stream` | Streaming chat |
| POST | `/api/search` | Web search |
| POST | `/api/upload` | File analysis |
| POST | `/api/vision` | Image analysis |
| GET | `/api/memory` | Get memories |
| POST | `/api/memory` | Add memory |
| DELETE | `/api/memory` | Clear memory |

---

## 🔮 FUTURE UPGRADES

- [ ] Google/Bing search integration (better results)
- [ ] Text-to-speech (JARVIS speaks back)
- [ ] Image generation (DALL-E / Stable Diffusion)
- [ ] Calendar integration
- [ ] Email integration
- [ ] Custom wake word detection
- [ ] Mobile app (React Native)
- [ ] Database for chat history (PostgreSQL on Railway)

---

*"Sometimes you gotta run before you can walk."* — Tony Stark
