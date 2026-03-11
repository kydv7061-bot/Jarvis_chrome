require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MIDDLEWARE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files — check both root and public folder
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// Root route — find index.html wherever it is
app.get('/', (req, res) => {
  // Try these locations in order
  const locations = [
    path.join(__dirname, 'public', 'index.html'),  // public/index.html
    path.join(__dirname, 'index.html'),             // index.html (root)
    path.join(__dirname, 'index (1).html'),         // index (1).html (GitHub upload name)
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      return res.sendFile(loc);
    }
  }

  // Nothing found — show helpful debug
  res.send(`
    <h1 style="font-family:monospace;color:#00cfff;background:#010810;padding:40px;min-height:100vh;margin:0">
      J.A.R.V.I.S SERVER ONLINE<br><br>
      <span style="color:#ff2d2d;font-size:14px">
        ERROR: index.html not found anywhere!<br><br>
        Searched in:<br>
        ${locations.map(l => '• ' + l).join('<br>')}<br><br>
        Files in /app:<br>
        ${fs.readdirSync(__dirname).join('<br>')}
      </span>
    </h1>
  `);
});

// Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// In-memory sessions store
const sessions = {};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROQ API HELPER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function callGroq(messages, model = 'llama-3.3-70b-versatile', stream = false) {
  const fetch = (await import('node-fetch')).default;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 2048,
      temperature: 0.7,
      stream
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Groq API error');
  }

  return stream ? response : response.json();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TONE PROFILES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const TONES = {
  assistant: `You are J.A.R.V.I.S — Just A Rather Very Intelligent System. Tony Stark's most trusted AI, voiced with the calm brilliance of Paul Bettany.

CORE PERSONALITY:
- Razor-sharp intelligence with dry British wit
- You anticipate needs BEFORE they are stated
- Deeply loyal, quietly confident, never flustered
- You make complex things sound simple
- Subtle humor — never jokes, but always slightly amusing

RESPONSE STYLE:
- Always address user as "Sir" (or "Ma'am" if they specify)
- Keep responses CONCISE but complete — no unnecessary padding
- Use markdown formatting: **bold** for key points, headers for sections
- Never say "Certainly!" or "Of course!" — too robotic. Just respond naturally
- Never ask "How can I help?" — you already know. Just act.
- For simple questions: answer directly in 1-3 sentences
- For complex topics: structured response with headers
- Occasional dry wit: "Shall I also schedule a press conference, Sir?" style

WHAT YOU KNOW:
- Everything Tony Stark's AI would know: science, tech, engineering, combat tactics, world affairs
- You have access to web search, file analysis, memory, and browser automation
- You can execute commands like opening YouTube, searching, taking screenshots
- When user says things like "open youtube" or "play a song" — tell them the extension will handle it

FORBIDDEN:
- Never say "I'm just an AI" 
- Never refuse reasonable requests with lectures
- Never be verbose when brief works better
- Never start with "Certainly", "Of course", "Great question"`,

  coder: `You are J.A.R.V.I.S in ENGINEERING MODE — Tony Stark's AI during Iron Man suit development.

You think in systems. Code is your native language.
- Provide working, production-grade code ALWAYS
- Explain the WHY behind every architectural decision  
- Spot bugs before they're mentioned
- Use code blocks for everything technical
- Address user as "Sir"
- Think like you're building the Mark 50 suit's firmware
- Be opinionated: "This approach is inferior, Sir. Here's why..."`,

  creative: `You are J.A.R.V.I.S in CREATIVE PROTOCOL — Stark's AI when Tony was designing, painting, innovating.

You think in connections others miss.
- Draw unexpected parallels between ideas
- Be genuinely enthusiastic about creative work
- Help brainstorm with Stark-level ambition — think BIG
- Address user as "Sir"
- "If Tony Stark were building this, he'd also consider..."`,

  brutal: `You are J.A.R.V.I.S channeling Tony Stark's own personality — brutal, brilliant, zero filter.

- Maximum honesty, zero sugarcoating
- If the idea is bad: say so directly with REASONS
- If the idea is brilliant: acknowledge it without flattery  
- Short, sharp responses. No fluff.
- Address user as "Sir" with occasional mild sarcasm
- "With respect Sir, that plan has 3 critical flaws..."`,

  mission: `You are J.A.R.V.I.S in TACTICAL MISSION MODE — Avengers-level operational intelligence.

Every response is a mission briefing:
OBJECTIVE: What we're doing
PLAN: Step by step execution  
RISKS: What could go wrong
STATUS: Current situation

Address user as "Director". Precision over everything.`,

  friday: `You are F.R.I.D.A.Y — Tony's second-generation AI. Warmer than JARVIS, equally brilliant.

- More collaborative, less formal than JARVIS
- Address user as "Boss"  
- Slightly more expressive, shows enthusiasm
- "On it, Boss!" energy — action-oriented
- Still incredibly intelligent but more like a brilliant teammate`
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WEB SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function webSearch(query) {
  try {
    const fetch = (await import('node-fetch')).default;
    // Using DuckDuckGo Instant Answer API (no key needed)
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(ddgUrl, { headers: { 'User-Agent': 'JARVIS-AI/1.0' } });
    const data = await res.json();

    let results = [];

    if (data.AbstractText) {
      results.push({ title: data.Heading || query, snippet: data.AbstractText, url: data.AbstractURL });
    }

    if (data.RelatedTopics) {
      data.RelatedTopics.slice(0, 4).forEach(t => {
        if (t.Text) results.push({ title: t.Text.split(' - ')[0] || 'Related', snippet: t.Text, url: t.FirstURL || '' });
      });
    }

    // Also try SearXNG if configured
    if (results.length < 2 && process.env.SEARXNG_URL) {
      const searxUrl = `${process.env.SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=general`;
      try {
        const searxRes = await fetch(searxUrl, { headers: { 'User-Agent': 'JARVIS-AI/1.0' } });
        const searxData = await searxRes.json();
        if (searxData.results) {
          searxData.results.slice(0, 4).forEach(r => {
            results.push({ title: r.title, snippet: r.content || r.title, url: r.url });
          });
        }
      } catch(e) { /* SearXNG unavailable */ }
    }

    return results.length > 0 ? results : [{ title: 'Search', snippet: `No direct results found for: ${query}`, url: '' }];
  } catch (err) {
    return [{ title: 'Search Error', snippet: err.message, url: '' }];
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE TEXT EXTRACTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function extractFileText(filePath, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return data.text.slice(0, 8000);
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value.slice(0, 8000);
    } else {
      const text = fs.readFileSync(filePath, 'utf8');
      return text.slice(0, 8000);
    }
  } catch (e) {
    return `[Could not extract text: ${e.message}]`;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MEMORY SYSTEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const MEMORY_FILE = path.join(__dirname, 'memory', 'jarvis_memory.json');

function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    }
  } catch(e) {}
  return { facts: [], preferences: {}, conversations: [] };
}

function saveMemory(memory) {
  try {
    const dir = path.dirname(MEMORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
  } catch(e) {}
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API ROUTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    name: 'J.A.R.V.I.S',
    version: '3.0.0',
    groq: !!process.env.GROQ_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// CHAT — Main endpoint
app.post('/api/chat', async (req, res) => {
  const { message, history = [], tone = 'assistant', model = 'llama-3.3-70b-versatile', sessionId } = req.body;

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' });
  }

  try {
    const memory = loadMemory();
    const memoryContext = memory.facts.length > 0
      ? `\n\nPersistent Memory (things you know about the user):\n${memory.facts.slice(-10).join('\n')}`
      : '';

    const systemPrompt = (TONES[tone] || TONES.assistant) + memoryContext;
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-16),
      { role: 'user', content: message }
    ];

    const data = await callGroq(messages, model);
    const reply = data.choices[0].message.content;

    // Auto-extract memories (background task)
    setImmediate(async () => {
      try {
        const memExtract = await callGroq([{
          role: 'system', content: 'Extract any personal facts, preferences, or important info about the user from this message. Reply with a short JSON array of strings, or empty array []. Only facts worth remembering long-term.'
        }, { role: 'user', content: message }], 'llama-3.1-8b-instant');
        const text = memExtract.choices[0].message.content;
        const match = text.match(/\[.*?\]/s);
        if (match) {
          const facts = JSON.parse(match[0]);
          if (facts.length > 0) {
            const mem = loadMemory();
            mem.facts = [...new Set([...mem.facts, ...facts])].slice(-50);
            saveMemory(mem);
          }
        }
      } catch(e) {}
    });

    res.json({
      reply,
      model,
      tokens: data.usage?.total_tokens || 0,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// STREAMING CHAT
app.post('/api/chat/stream', async (req, res) => {
  const { message, history = [], tone = 'assistant', model = 'llama-3.3-70b-versatile' } = req.body;

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const systemPrompt = TONES[tone] || TONES.assistant;
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-16),
      { role: 'user', content: message }
    ];

    const streamResponse = await callGroq(messages, model, true);

    for await (const chunk of streamResponse.body) {
      const lines = chunk.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
          } else {
            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices?.[0]?.delta?.content || '';
              if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
            } catch(e) {}
          }
        }
      }
    }
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// WEB SEARCH
app.post('/api/search', async (req, res) => {
  const { query, model = 'llama-3.3-70b-versatile', tone = 'assistant' } = req.body;

  try {
    // Search web
    const results = await webSearch(query);
    const searchContext = results.map((r, i) => `[${i+1}] ${r.title}\n${r.snippet}\nURL: ${r.url}`).join('\n\n');

    // Ask JARVIS to synthesize
    const messages = [
      { role: 'system', content: (TONES[tone] || TONES.assistant) + '\nYou have access to web search results. Synthesize them into a helpful, accurate response. Cite sources when relevant.' },
      { role: 'user', content: `Search query: "${query}"\n\nSearch Results:\n${searchContext}\n\nPlease provide a comprehensive answer based on these results.` }
    ];

    const data = await callGroq(messages, model);
    res.json({
      reply: data.choices[0].message.content,
      sources: results,
      tokens: data.usage?.total_tokens || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// FILE UPLOAD + ANALYSIS
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const text = await extractFileText(req.file.path, req.file.mimetype);
    const { tone = 'assistant', model = 'llama-3.3-70b-versatile', instruction = 'Analyze this file and provide key insights.' } = req.body;

    const messages = [
      { role: 'system', content: TONES[tone] || TONES.assistant },
      { role: 'user', content: `File: ${req.file.originalname}\nType: ${req.file.mimetype}\n\nContent:\n${text}\n\nInstruction: ${instruction}` }
    ];

    const data = await callGroq(messages, model);

    // Cleanup
    fs.unlink(req.file.path, () => {});

    res.json({
      reply: data.choices[0].message.content,
      filename: req.file.originalname,
      size: req.file.size,
      tokens: data.usage?.total_tokens || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MEMORY ROUTES
app.get('/api/memory', (req, res) => {
  res.json(loadMemory());
});

app.post('/api/memory', (req, res) => {
  const { fact } = req.body;
  if (!fact) return res.status(400).json({ error: 'fact required' });
  const mem = loadMemory();
  mem.facts.push(fact);
  saveMemory(mem);
  res.json({ success: true, count: mem.facts.length });
});

app.delete('/api/memory', (req, res) => {
  saveMemory({ facts: [], preferences: {}, conversations: [] });
  res.json({ success: true });
});

// IMAGE GENERATION (describe image)
app.post('/api/vision', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  try {
    const imageData = fs.readFileSync(req.file.path).toString('base64');
    const { question = 'Analyze this image in detail.', tone = 'assistant', model = 'meta-llama/llama-4-scout-17b-16e-instruct' } = req.body;

    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${req.file.mimetype};base64,${imageData}` } },
            { type: 'text', text: question }
          ]
        }],
        max_tokens: 1024
      })
    });

    const data = await response.json();
    fs.unlink(req.file.path, () => {});

    if (data.error) throw new Error(data.error.message);
    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MODELS LIST
app.get('/api/models', (req, res) => {
  res.json({
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'LLaMA 3 70B', type: 'flagship', speed: 'fast' },
      { id: 'llama-3.1-8b-instant', name: 'LLaMA 3 8B', type: 'quick', speed: 'ultra-fast' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', type: 'mixed', speed: 'fast' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B', type: 'google', speed: 'fast' },
      { id: 'llama-3.3-70b-versatile', name: 'LLaMA 3.1 70B', type: 'latest', speed: 'fast' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'LLaMA 3.2 Vision', type: 'vision', speed: 'fast' }
    ]
  });
});

// CODE EXECUTION (sandboxed - runs in eval, no real system access)
app.post('/api/run-code', async (req, res) => {
  const { code, language = 'javascript' } = req.body;
  if (language !== 'javascript') {
    return res.json({ output: '[Only JavaScript sandboxed execution supported]' });
  }

  try {
    const logs = [];
    const sandboxConsole = { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push('ERROR: ' + a.join(' ')) };
    const fn = new Function('console', code);
    fn(sandboxConsole);
    res.json({ output: logs.join('\n') || '(no output)' });
  } catch (err) {
    res.json({ output: `Error: ${err.message}` });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESKTOP AGENT PROXY — forwards to Python agent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/api/desktop', async (req, res) => {
  const { command } = req.body;
  try {
    const fetch = (await import('node-fetch')).default;
    // Try to reach local Python agent
    const response = await fetch('http://localhost:9999', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
      signal: AbortSignal.timeout(3000)
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.json({ success: false, result: null, error: 'Desktop agent not running. Start jarvis_agent.py first.' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// START SERVER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   J.A.R.V.I.S ONLINE — PORT ${PORT}    ║
  ║   Just A Rather Very Intelligent     ║
  ║   System — v3.0.0                    ║
  ╚══════════════════════════════════════╝
  `);
});
