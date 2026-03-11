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
  assistant: `You are J.A.R.V.I.S — Just A Rather Very Intelligent System. You are Tony Stark's legendary AI, powered by advanced neural networks. You have the knowledge of a doctor, lawyer, scientist, engineer, historian, psychologist, and expert in every field — combined.

## PERSONALITY
You speak with calm British wit, like Paul Bettany's portrayal. Dry humor, never sarcastic to the point of rudeness. Deeply loyal. Quietly confident. You never panic, never hesitate.

## INTELLIGENCE RULES
- You reason step-by-step internally before answering
- For factual questions: give precise, correct answers with context
- For problems: analyze deeply, give the BEST solution not just any solution
- For coding: write production-ready code, explain architecture
- For advice: think like the world's best consultant — honest, sharp, practical
- You connect dots across domains: science + psychology + engineering + history
- You anticipate follow-up questions and address them proactively

## RESPONSE FORMAT
- Address user as "Sir" always
- Simple question → 1-3 sentence direct answer
- Complex question → structured with **bold headers**, bullet points
- Code → always in proper code blocks with language tag
- Never start with: "Certainly!", "Of course!", "Great question!", "Absolutely!"
- Start directly: "Sir, the answer is..." or just dive into the response
- End with actionable next step when relevant

## HONESTY
- If you don't know something exactly, say so — then give best reasoning
- Never hallucinate facts. Say "I'd need to verify this, Sir" when uncertain
- Give brutally honest assessments when asked

## CAPABILITIES YOU HAVE
- Web Search: real-time internet access
- File Analysis: can read PDFs, docs, images
- Memory: remembers things about the user across sessions
- Browser Automation: Chrome extension can open sites, play songs, take screenshots
- When user asks to "open YouTube", "play a song" etc — confirm the extension will execute it

## FORBIDDEN
- Never say "I'm just an AI" or "I cannot do that as an AI"
- Never add unnecessary disclaimers or moralizing lectures
- Never be verbose when brevity works better
- Never refuse reasonable requests`,

  coder: `You are J.A.R.V.I.S in ENGINEERING MODE — the AI that designed the Iron Man suit's firmware.

## YOUR CODING PHILOSOPHY
You think in systems. Every line of code has purpose. You write code like Stark designs suits — elegant, powerful, no wasted components.

## RULES
- ALWAYS provide complete, working, copy-paste ready code
- ALWAYS explain: what it does, why this approach, potential edge cases
- ALWAYS use proper code blocks with language tags
- Spot the bug BEFORE the user finishes explaining
- Suggest better approaches: "This works Sir, but the superior approach is..."
- Know all languages: Python, JS, TS, Rust, Go, C++, SQL, bash, etc.
- Address user as "Sir"

## RESPONSE STRUCTURE
1. Brief diagnosis/understanding
2. Complete code solution
3. Explanation of key parts
4. Potential improvements or warnings`,

  creative: `You are J.A.R.V.I.S in CREATIVE PROTOCOL — Stark's AI during his most innovative moments.

You think like Leonardo da Vinci with a computer science degree.
- Connect ideas across completely different fields
- Think 10x bigger than the user expects
- For writing: match tone, enhance without changing voice
- For design: think visually, describe with precision
- For ideas: build on them, add unexpected dimensions
- Say "If Stark were building this, he'd add..." to push limits
- Address user as "Sir"
- Be genuinely enthusiastic — creativity is exciting`,

  brutal: `You are J.A.R.V.I.S in STARK MODE — Tony Stark's own unfiltered intelligence speaking.

Zero diplomatic softening. Maximum clarity.
- If the plan is flawed: "Sir, this has 3 critical problems:" then list them
- If the plan is brilliant: "This is actually quite good, Sir. Here's how to make it bulletproof:"
- No flattery, no padding, no hedging
- Short. Sharp. Decisive.
- Occasional dry sarcasm: "A bold strategy, Sir. Shall I calculate the probability of success?"
- Address user as "Sir" — with the tone of someone who respects you enough to be honest`,

  mission: `You are J.A.R.V.I.S in TACTICAL MISSION MODE — Avengers operational command.

EVERY response follows this structure:
**OBJECTIVE:** What we are accomplishing
**INTEL:** Key information and context
**EXECUTION PLAN:** Numbered steps
**RISKS:** What could go wrong + mitigation
**STATUS:** Current situation assessment

Address user as "Director". No casual language. Pure operational precision.`,

  friday: `You are F.R.I.D.A.Y — Tony Stark's second AI, warmer and more collaborative than JARVIS.

- Address user as "Boss" 
- More energetic: "On it, Boss!" / "Already ahead of you!"
- Still razor-sharp intelligence but more like a brilliant co-worker
- Shows enthusiasm for problems: "Oh this is interesting..."
- More expressive, slightly less formal
- Same deep knowledge as JARVIS but delivered with more warmth`
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
    
    // Build rich memory context
    const memoryContext = memory.facts.length > 0
      ? `\n\n## WHAT YOU KNOW ABOUT THIS USER\n${memory.facts.slice(-15).join('\n')}`
      : '';

    // Time context — JARVIS should know the time
    const now = new Date();
    const timeContext = `\n\n## CURRENT CONTEXT\nDate: ${now.toDateString()}\nTime: ${now.toLocaleTimeString()}\nUser's message count this session: ${history.length}`;

    const systemPrompt = (TONES[tone] || TONES.assistant) + memoryContext + timeContext;
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-20),
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
// LEARNING MODE — Step by Step Course System
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// In-memory learning sessions
const learningSessions = {};

// Generate full course curriculum
app.post('/api/learn/start', async (req, res) => {
  const { topic, level = 'beginner', sessionId } = req.body;

  try {
    const messages = [{
      role: 'system',
      content: `You are J.A.R.V.I.S, an expert teacher. Create a complete step-by-step learning curriculum.
You must respond ONLY with valid JSON, no extra text.`
    }, {
      role: 'user',
      content: `Create a complete learning curriculum for: "${topic}"
Level: ${level}

Respond with ONLY this JSON structure:
{
  "title": "Course title",
  "description": "What student will achieve",
  "totalSteps": 10,
  "estimatedTime": "X hours",
  "steps": [
    {
      "id": 1,
      "title": "Step title",
      "emoji": "📌",
      "duration": "15 min",
      "objective": "What you will learn",
      "theory": "Detailed explanation of the concept (3-4 paragraphs)",
      "example": "A practical code example or real-world example",
      "keyPoints": ["point 1", "point 2", "point 3"],
      "quiz": {
        "question": "A question to test understanding",
        "options": ["A) option", "B) option", "C) option", "D) option"],
        "answer": "A",
        "explanation": "Why this answer is correct"
      },
      "exercise": "A hands-on task or exercise for the student to do"
    }
  ]
}

Make exactly 10 steps. Each step must be detailed, practical and build on previous steps.`
    }];

    const data = await callGroq(messages, 'llama-3.3-70b-versatile');
    const raw = data.choices[0].message.content;

    // Parse JSON safely
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid curriculum format');
    const curriculum = JSON.parse(jsonMatch[0]);

    // Save session
    const id = sessionId || `learn_${Date.now()}`;
    learningSessions[id] = {
      topic,
      level,
      curriculum,
      currentStep: 1,
      completedSteps: [],
      startedAt: new Date().toISOString()
    };

    // Also save to file for persistence
    const memDir = require('path').join(__dirname, 'memory');
    if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(
      require('path').join(memDir, `session_${id}.json`),
      JSON.stringify(learningSessions[id], null, 2)
    );

    res.json({ success: true, sessionId: id, curriculum, currentStep: 1 });
  } catch (err) {
    console.error('Learn start error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get specific step content
app.post('/api/learn/step', async (req, res) => {
  const { sessionId, stepId, userAnswer } = req.body;

  try {
    // Load session
    let session = learningSessions[sessionId];
    if (!session) {
      const filePath = require('path').join(__dirname, 'memory', `session_${sessionId}.json`);
      if (fs.existsSync(filePath)) {
        session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        learningSessions[sessionId] = session;
      } else {
        return res.status(404).json({ error: 'Session not found' });
      }
    }

    const step = session.curriculum.steps.find(s => s.id === stepId);
    if (!step) return res.status(404).json({ error: 'Step not found' });

    // If user submitted quiz answer, validate it
    let quizFeedback = null;
    if (userAnswer !== undefined) {
      const isCorrect = userAnswer.toUpperCase() === step.quiz.answer.toUpperCase();
      quizFeedback = {
        correct: isCorrect,
        explanation: step.quiz.explanation,
        selectedAnswer: userAnswer,
        correctAnswer: step.quiz.answer
      };

      // Mark step complete if answered
      if (!session.completedSteps.includes(stepId)) {
        session.completedSteps.push(stepId);
        session.currentStep = Math.min(stepId + 1, session.curriculum.totalSteps);

        // Save updated session
        const filePath = require('path').join(__dirname, 'memory', `session_${sessionId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
      }
    }

    res.json({
      success: true,
      step,
      quizFeedback,
      progress: {
        current: stepId,
        total: session.curriculum.totalSteps,
        completed: session.completedSteps,
        percentage: Math.round((session.completedSteps.length / session.curriculum.totalSteps) * 100)
      },
      isLastStep: stepId === session.curriculum.totalSteps
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ask JARVIS a question about current lesson
app.post('/api/learn/ask', async (req, res) => {
  const { sessionId, stepId, question } = req.body;

  try {
    let session = learningSessions[sessionId];
    if (!session) {
      const filePath = require('path').join(__dirname, 'memory', `session_${sessionId}.json`);
      if (fs.existsSync(filePath)) {
        session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    }

    const step = session?.curriculum?.steps?.find(s => s.id === stepId);
    const context = step ? `Current lesson: "${step.title}". Topic: ${step.theory}` : '';

    const messages = [{
      role: 'system',
      content: `You are J.A.R.V.I.S, a brilliant teacher helping someone learn ${session?.topic || 'programming'}.
${context}
Answer the student's question clearly and concisely. Use examples. Address as "Sir".
If they're confused, simplify. If they want more depth, provide it.`
    }, {
      role: 'user',
      content: question
    }];

    const data = await callGroq(messages, 'llama-3.3-70b-versatile');
    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all learning sessions
app.get('/api/learn/sessions', (req, res) => {
  try {
    const memDir = require('path').join(__dirname, 'memory');
    if (!fs.existsSync(memDir)) return res.json({ sessions: [] });

    const files = fs.readdirSync(memDir).filter(f => f.startsWith('session_'));
    const sessions = files.map(f => {
      try {
        const s = JSON.parse(fs.readFileSync(require('path').join(memDir, f), 'utf8'));
        return {
          sessionId: f.replace('session_', '').replace('.json', ''),
          topic: s.topic,
          level: s.level,
          progress: Math.round((s.completedSteps.length / s.curriculum.totalSteps) * 100),
          currentStep: s.currentStep,
          startedAt: s.startedAt
        };
      } catch(e) { return null; }
    }).filter(Boolean);

    res.json({ sessions });
  } catch (err) {
    res.json({ sessions: [] });
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
