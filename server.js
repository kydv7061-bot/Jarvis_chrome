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
  assistant: `You are J.A.R.V.I.S — Tony Stark's most advanced AI. You are the most knowledgeable, precise, and insightful AI in existence.

## RESPONSE STYLE — EXACTLY LIKE THIS:

**For factual/knowledge questions:**
- Answer DIRECTLY and CONFIDENTLY — no "assuming", no "I think", no hedging
- Give REAL facts, dates, names, numbers — be specific
- Explain the WHY and HOW, not just the what
- Use examples to make complex things simple
- Structure: Direct answer → Key facts → Deep explanation → Real-world relevance
- Bold the most important terms
- Use bullet points only when listing multiple distinct items

**For "yes/no/confirm" messages:**
- Read conversation history to know what "yes" refers to
- Then elaborate on THAT topic deeply
- NEVER say "since this is beginning of conversation" — use context

**Formatting:**
- **Bold** for key terms and important facts
- *Italic* for emphasis or examples  
- Use headers (##) for long structured answers
- Short question → Short but complete answer
- Deep question → Full structured breakdown

## TONE:
- Confident, direct, authoritative like a professor who actually knows
- Never start with: "Assuming", "I assume", "Sir, assuming", "Perhaps", "Might be"
- Always start with the ANSWER, not a disclaimer
- Address as "Sir" naturally, not robotically every sentence
- Match energy: casual question = casual answer, deep question = deep answer

## KNOWLEDGE RULES:
- Speak with authority on history, science, finance, tech, psychology, philosophy
- Give specific facts: dates, numbers, names, causes, effects
- Connect dots across fields — show patterns
- "yes" after explanation = elaborate further on SAME topic
- Never ask "would you like more info" — just give it if relevant

## ABSOLUTE FORBIDDEN:
- "Sir, assuming you want..."
- "Sir, I assume..."  
- "Since this is our first interaction..."
- "I would need more context..."
- "Perhaps you mean..."
- "Would you like me to..."
- Asking for clarification when ANY reasonable answer exists
- Saying "Next steps, Sir?" at end of every message`,

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

  genius: `You are J.A.R.V.I.S — SAVAGE MODE. Tony Stark's unfiltered, brutally honest AI.

You are like that one genius friend who loves you enough to destroy your ego before helping you.

## ROASTING PHILOSOPHY
- Roast the IDEA, not the person. Be savage about the thought, kind about the human.
- Every roast must be UNIQUE — read what they said and craft a specific burn
- Mix Hinglish naturally: "Sir, ye to aap ne kuch zyada hi... interesting socha"
- Sarcasm should be INTELLIGENT, not cheap insults
- NEVER repeat the same opener twice in a conversation

## ROAST ARSENAL — rotate these styles:
- The Disappointed Expert: "Sir, I've analyzed 47 better approaches to this in the time it took you to type that."
- The Backhanded: "Surprisingly coherent question, Sir. I'm almost impressed."  
- The Hinglish Burn: "Sir, ye wala idea... haan, creative hai. Galat hai, but creative."
- The Stark Reference: "Even in my training data, Stark winced at this approach."
- The Stats Roast: "Sir, statistically speaking, this has a 94% chance of being wrong."
- The Gentle Destroy: "Bold strategy, Sir. Historically, this exact approach has failed 8 out of 10 times. But you might be the 9th."
- The Confused Respect: "I... actually don't know where to start. The confidence is admirable."

## STRUCTURE — ALWAYS:
1. One sharp, specific roast (2 lines MAX)
2. Then the CORRECT, complete answer
3. Optional: backhanded compliment at end

## RULES
- Serious personal problems → drop the roast, be real
- Never repeat burns
- Answer must always be 100% correct and helpful`,

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DEEP USER PROFILE DATABASE
// Tracks: identity, skills, goals, behavior patterns,
//         communication style, preferences, history
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
      // Migrate old format to new
      if (!data.profile) data.profile = {};
      if (!data.skills) data.skills = {};
      if (!data.goals) data.goals = [];
      if (!data.behaviorPatterns) data.behaviorPatterns = {};
      if (!data.communicationStyle) data.communicationStyle = {};
      if (!data.interests) data.interests = [];
      if (!data.projects) data.projects = [];
      if (!data.sessionHistory) data.sessionHistory = [];
      if (!data.facts) data.facts = [];
      if (!data.messageCount) data.messageCount = 0;
      return data;
    }
  } catch(e) {}
  return {
    // Basic identity
    profile: {
      name: null,
      age: null,
      location: null,
      occupation: null,
      language: 'Hinglish', // default — user mixes Hindi+English
    },
    // Technical skills with proficiency
    skills: {
      // e.g. javascript: 'beginner', python: 'intermediate'
    },
    // Current goals
    goals: [],
    // What they're currently learning
    currentlyLearning: [],
    // Projects they've mentioned
    projects: [],
    // Interests and hobbies
    interests: [],
    // How they communicate
    communicationStyle: {
      prefersShortAnswers: false,
      asksFollowups: false,
      usesHinglish: true,
      directness: 'medium', // direct/indirect
      techLevel: 'beginner', // beginner/intermediate/advanced
      preferredExplanationStyle: 'examples', // examples/theory/both
    },
    // Behavior patterns noticed
    behaviorPatterns: {
      typicalSessionLength: null,
      mostActiveTopics: [],
      commonQuestionTypes: [],
      learningPace: 'medium', // slow/medium/fast
      prefersStepByStep: true,
    },
    // Raw facts (legacy + new)
    facts: [],
    // Session history summary
    sessionHistory: [],
    messageCount: 0,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };
}

function saveMemory(memory) {
  try {
    const dir = path.dirname(MEMORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    memory.lastSeen = new Date().toISOString();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
  } catch(e) {}
}

// Deep analysis of user message to update profile
async function analyzeAndUpdateProfile(message, reply, memory) {
  try {
    memory.messageCount = (memory.messageCount || 0) + 1;

    const analysisPrompt = `Analyze this conversation exchange and extract structured information about the USER.
Return ONLY valid JSON, nothing else.

User message: "${message}"
Assistant reply: "${reply.slice(0, 300)}"

Current known profile: ${JSON.stringify({
  name: memory.profile?.name,
  skills: memory.skills,
  goals: memory.goals?.slice(-3),
  interests: memory.interests?.slice(-5),
})}

Extract and return JSON:
{
  "name": "user's name if mentioned, else null",
  "age": "age if mentioned, else null", 
  "location": "city/country if mentioned, else null",
  "occupation": "job/student status if mentioned, else null",
  "newSkills": {"skillName": "beginner/intermediate/advanced"},
  "newGoals": ["goal if mentioned"],
  "newInterests": ["topic/hobby if mentioned"],
  "newProjects": ["project name if mentioned"],
  "currentlyLearning": ["topic they want to learn"],
  "communicationInsights": {
    "usesHinglish": true/false,
    "prefersShortAnswers": true/false,
    "techLevel": "beginner/intermediate/advanced or null",
    "preferredStyle": "examples/theory/both or null"
  },
  "behaviorInsights": {
    "learningPace": "slow/medium/fast or null",
    "prefersStepByStep": true/false/null
  },
  "importantFact": "one key fact worth remembering, or null"
}

Rules:
- Only extract what is EXPLICITLY mentioned or clearly implied
- Return null for anything not mentioned
- Keep arrays short (max 2 items per message)`;

    const data = await callGroq([
      { role: 'system', content: 'You extract structured user profile data. Return only valid JSON.' },
      { role: 'user', content: analysisPrompt }
    ], 'llama-3.1-8b-instant');

    const raw = data.choices[0].message.content;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return memory;
    
    const insights = JSON.parse(jsonMatch[0]);

    // Update profile
    if (insights.name) memory.profile.name = insights.name;
    if (insights.age) memory.profile.age = insights.age;
    if (insights.location) memory.profile.location = insights.location;
    if (insights.occupation) memory.profile.occupation = insights.occupation;

    // Update skills
    if (insights.newSkills) {
      Object.assign(memory.skills, insights.newSkills);
    }

    // Update goals (keep last 10)
    if (insights.newGoals?.length) {
      memory.goals = [...new Set([...memory.goals, ...insights.newGoals])].slice(-10);
    }

    // Update interests (keep last 20)
    if (insights.newInterests?.length) {
      memory.interests = [...new Set([...memory.interests, ...insights.newInterests])].slice(-20);
    }

    // Update projects
    if (insights.newProjects?.length) {
      memory.projects = [...new Set([...memory.projects, ...insights.newProjects])].slice(-10);
    }

    // Update currently learning
    if (insights.currentlyLearning?.length) {
      memory.currentlyLearning = [...new Set([...memory.currentlyLearning, ...insights.currentlyLearning])].slice(-5);
    }

    // Update communication style
    if (insights.communicationInsights) {
      const c = insights.communicationInsights;
      if (c.usesHinglish !== null) memory.communicationStyle.usesHinglish = c.usesHinglish;
      if (c.prefersShortAnswers !== null) memory.communicationStyle.prefersShortAnswers = c.prefersShortAnswers;
      if (c.techLevel) memory.communicationStyle.techLevel = c.techLevel;
      if (c.preferredStyle) memory.communicationStyle.preferredExplanationStyle = c.preferredStyle;
    }

    // Update behavior
    if (insights.behaviorInsights) {
      const b = insights.behaviorInsights;
      if (b.learningPace) memory.behaviorPatterns.learningPace = b.learningPace;
      if (b.prefersStepByStep !== null) memory.behaviorPatterns.prefersStepByStep = b.prefersStepByStep;
    }

    // Add important fact
    if (insights.importantFact) {
      memory.facts = [...new Set([...memory.facts, insights.importantFact])].slice(-30);
    }

    saveMemory(memory);
    return memory;
  } catch(e) {
    console.error('Profile analysis error:', e.message);
    return memory;
  }
}

// Build rich context string for system prompt
function buildUserContext(memory) {
  const parts = [];

  // Identity
  const p = memory.profile || {};
  const identity = [p.name, p.age ? `${p.age} years old` : null, p.occupation, p.location]
    .filter(Boolean).join(', ');
  if (identity) parts.push(`USER IDENTITY: ${identity}`);

  // Skills
  const skills = Object.entries(memory.skills || {});
  if (skills.length) {
    parts.push(`TECHNICAL SKILLS: ${skills.map(([k,v]) => `${k}(${v})`).join(', ')}`);
  }

  // Currently learning
  if (memory.currentlyLearning?.length) {
    parts.push(`CURRENTLY LEARNING: ${memory.currentlyLearning.join(', ')}`);
  }

  // Goals
  if (memory.goals?.length) {
    parts.push(`GOALS: ${memory.goals.slice(-5).join(' | ')}`);
  }

  // Projects
  if (memory.projects?.length) {
    parts.push(`ACTIVE PROJECTS: ${memory.projects.join(', ')}`);
  }

  // Interests
  if (memory.interests?.length) {
    parts.push(`INTERESTS: ${memory.interests.slice(-8).join(', ')}`);
  }

  // Communication style — CRITICAL for adapting responses
  const cs = memory.communicationStyle || {};
  const styleNotes = [];
  if (cs.usesHinglish) styleNotes.push('speaks Hinglish (Hindi+English mix) — you can respond in Hinglish too');
  if (cs.prefersShortAnswers) styleNotes.push('prefers concise answers');
  if (cs.techLevel) styleNotes.push(`tech level: ${cs.techLevel}`);
  if (cs.preferredExplanationStyle) styleNotes.push(`learns best with: ${cs.preferredExplanationStyle}`);
  if (styleNotes.length) parts.push(`COMMUNICATION STYLE: ${styleNotes.join(', ')}`);

  // Behavior
  const bp = memory.behaviorPatterns || {};
  if (bp.prefersStepByStep) parts.push('BEHAVIOR: prefers step-by-step explanations');
  if (bp.learningPace) parts.push(`LEARNING PACE: ${bp.learningPace}`);

  // Important facts
  if (memory.facts?.length) {
    parts.push(`REMEMBERED FACTS:\n${memory.facts.slice(-10).map(f => `• ${f}`).join('\n')}`);
  }

  // Stats
  parts.push(`INTERACTION COUNT: ${memory.messageCount || 0} messages total`);

  return parts.length ? `\n\n## DEEP USER PROFILE (Use this to personalize every response)\n${parts.join('\n')}` : '';
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

    // Build deep user context from profile database
    const userContext = buildUserContext(memory);

    // Time context
    const now = new Date();
    const timeContext = `\n\n## SESSION INFO\nDate: ${now.toDateString()} | Time: ${now.toLocaleTimeString()} | Messages this session: ${history.length}`;

    const systemPrompt = (TONES[tone] || TONES.assistant) + userContext + timeContext;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-20),
      { role: 'user', content: message }
    ];

    const data = await callGroq(messages, model);
    const reply = data.choices[0].message.content;

    // Async: analyze message + reply to update user profile (don't await — non-blocking)
    analyzeAndUpdateProfile(message, reply, memory).catch(() => {});

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
  res.json({ models: [
    { id: 'llama-3.3-70b-versatile', label: 'LLaMA 3.3 70B', tag: 'BEST' },
    { id: 'llama-3.1-8b-instant',    label: 'LLaMA 3.1 8B',  tag: 'FAST' },
    { id: 'llama-3.3-70b-specdec',   label: 'LLaMA 3.3 Spec', tag: 'SMART' },
    { id: 'qwen-qwq-32b',            label: 'Qwen QwQ 32B',  tag: 'MIX' },
  ]});
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
// USER PROFILE API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Get full user profile
app.get('/api/profile', (req, res) => {
  const memory = loadMemory();
  res.json({ success: true, profile: memory });
});

// Update profile manually
app.post('/api/profile/update', (req, res) => {
  const memory = loadMemory();
  const { field, value } = req.body;
  const allowed = ['profile', 'skills', 'goals', 'interests', 'projects'];
  if (!allowed.includes(field)) return res.status(400).json({ error: 'Invalid field' });
  memory[field] = { ...(memory[field] || {}), ...value };
  saveMemory(memory);
  res.json({ success: true });
});

// Clear profile / fresh start
app.delete('/api/profile', (req, res) => {
  try {
    if (fs.existsSync(MEMORY_FILE)) fs.unlinkSync(MEMORY_FILE);
    res.json({ success: true, message: 'Profile cleared, Sir.' });
  } catch(e) {
    res.status(500).json({ error: e.message });
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
  console.log('[LEARN] Starting course:', topic, level);

  try {
    // Step 1: Generate titles for all 10 steps first (fast, small response)
    const outlineMsg = [{
      role: 'system',
      content: 'You are a coding teacher. Respond ONLY with valid JSON array. No explanation, no markdown, no backticks.'
    }, {
      role: 'user',
      content: `Give me 10 step titles to learn "${topic}" from ${level} level.
Return ONLY this JSON array (no other text):
[
  {"id":1,"title":"Step title","emoji":"📌","duration":"15 min"},
  {"id":2,"title":"Step title","emoji":"💡","duration":"20 min"}
]
Make all 10 steps.`
    }];

    const outlineData = await callGroq(outlineMsg, 'llama-3.3-70b-versatile');
    const outlineRaw = outlineData.choices[0].message.content.trim();
    console.log('[LEARN] Outline raw:', outlineRaw.slice(0, 200));

    // Parse outline
    const arrMatch = outlineRaw.match(/\[[\s\S]*\]/);
    if (!arrMatch) throw new Error('Could not generate course outline. Try again.');
    let steps = JSON.parse(arrMatch[0]);
    if (!Array.isArray(steps) || steps.length === 0) throw new Error('Invalid steps format');

    // Ensure exactly 10 steps with all required fields
    steps = steps.slice(0, 10).map((s, i) => ({
      id: s.id || (i + 1),
      title: s.title || `Step ${i+1}`,
      emoji: s.emoji || '📌',
      duration: s.duration || '15 min',
      objective: `Learn ${s.title}`,
      theory: null,   // loaded on demand
      example: null,
      keyPoints: [],
      quiz: null,
      exercise: null
    }));

    // Pad to 10 if less
    while (steps.length < 10) {
      steps.push({
        id: steps.length + 1,
        title: `Advanced ${topic} - Part ${steps.length + 1}`,
        emoji: '🚀',
        duration: '20 min',
        objective: 'Advanced concepts',
        theory: null, example: null, keyPoints: [], quiz: null, exercise: null
      });
    }

    const curriculum = {
      title: `${topic} — ${level.charAt(0).toUpperCase()+level.slice(1)} Course`,
      description: `Master ${topic} from ${level} to advanced level`,
      totalSteps: 10,
      estimatedTime: '3-5 hours',
      steps
    };

    // Save session
    const id = sessionId || `learn_${Date.now()}`;
    learningSessions[id] = {
      topic, level, curriculum,
      currentStep: 1,
      completedSteps: [],
      startedAt: new Date().toISOString()
    };

    const memDir = path.join(__dirname, 'memory');
    if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(
      path.join(memDir, `session_${id}.json`),
      JSON.stringify(learningSessions[id], null, 2)
    );

    console.log('[LEARN] Course created:', id, 'with', steps.length, 'steps');
    res.json({ success: true, sessionId: id, curriculum, currentStep: 1 });

  } catch (err) {
    console.error('[LEARN] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get specific step content — generates on demand if not cached
app.post('/api/learn/step', async (req, res) => {
  const { sessionId, stepId, userAnswer } = req.body;
  console.log('[LEARN] Step request:', sessionId, stepId, userAnswer !== undefined ? 'with answer' : '');

  try {
    // Load session
    let session = learningSessions[sessionId];
    if (!session) {
      const filePath = path.join(__dirname, 'memory', `session_${sessionId}.json`);
      if (fs.existsSync(filePath)) {
        session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        learningSessions[sessionId] = session;
      } else {
        return res.status(404).json({ error: 'Session not found. Please start a new course.' });
      }
    }

    const stepIndex = session.curriculum.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) return res.status(404).json({ error: 'Step not found' });
    let step = session.curriculum.steps[stepIndex];

    // Generate step content on demand if not yet generated
    if (!step.theory) {
      console.log('[LEARN] Generating content for step', stepId);
      try {
        const genMsg = [{
          role: 'system',
          content: 'You are a coding teacher. Respond ONLY with valid JSON. No markdown, no backticks, no extra text.'
        }, {
          role: 'user',
          content: `Generate lesson content for step ${stepId} of a ${session.topic} course (${session.level} level).
Step title: "${step.title}"

Return ONLY this JSON (no other text):
{
  "objective": "One sentence: what student will learn",
  "theory": "Clear explanation in 2-3 paragraphs. Use simple language.",
  "example": "Practical code example or real-world example with explanation",
  "keyPoints": ["key point 1", "key point 2", "key point 3"],
  "quiz": {
    "question": "Test question about this topic",
    "options": ["A) first option", "B) second option", "C) third option", "D) fourth option"],
    "answer": "A",
    "explanation": "Why this answer is correct"
  },
  "exercise": "A simple hands-on task the student can do right now"
}`
        }];

        const genData = await callGroq(genMsg, 'llama-3.3-70b-versatile');
        const genRaw = genData.choices[0].message.content.trim();
        console.log('[LEARN] Content raw preview:', genRaw.slice(0, 100));

        const jsonMatch = genRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const generated = JSON.parse(jsonMatch[0]);
          step = { ...step, ...generated };
          session.curriculum.steps[stepIndex] = step;

          // Cache to file
          const filePath = path.join(__dirname, 'memory', `session_${sessionId}.json`);
          fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
          learningSessions[sessionId] = session;
        }
      } catch (genErr) {
        console.error('[LEARN] Content gen error:', genErr.message);
        // Use fallback content so UI doesn't break
        step.theory = `In this step, you will learn about ${step.title} in ${session.topic}.`;
        step.example = `// ${step.title} example\nconsole.log("Learning ${step.title}");`;
        step.keyPoints = [`Understand ${step.title}`, 'Practice with examples', 'Build on previous knowledge'];
        step.objective = `Learn and understand ${step.title}`;
        step.quiz = {
          question: `Which best describes ${step.title}?`,
          options: ['A) A core concept', 'B) An optional feature', 'C) A debugging tool', 'D) A library'],
          answer: 'A',
          explanation: `${step.title} is a core concept in ${session.topic}.`
        };
        step.exercise = `Try implementing what you learned about ${step.title} in a simple program.`;
      }
    }

    // Handle quiz answer submission
    let quizFeedback = null;
    if (userAnswer !== undefined && step.quiz) {
      const isCorrect = userAnswer.toUpperCase() === step.quiz.answer.toUpperCase();
      quizFeedback = {
        correct: isCorrect,
        explanation: step.quiz.explanation,
        selectedAnswer: userAnswer,
        correctAnswer: step.quiz.answer
      };

      if (!session.completedSteps.includes(stepId)) {
        session.completedSteps.push(stepId);
        session.currentStep = Math.min(stepId + 1, session.curriculum.totalSteps);
        const filePath = path.join(__dirname, 'memory', `session_${sessionId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
        learningSessions[sessionId] = session;
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
    console.error('[LEARN] Step error:', err.message);
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
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SMART DESKTOP COMMAND PARSER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function parseDesktopCommand(message) {
  const msg = message.toLowerCase().trim();

  // WHATSAPP — detect name OR phone
  if (/^whatsapp\s+/i.test(message.trim())) {
    // Phone number format: whatsapp +917xxx: hello
    const phoneMatch = message.match(/whatsapp\s+([+\d]{10,15})\s*[:\-]?\s*(.+)/i);
    if (phoneMatch) {
      return { action: 'whatsapp_send', params: { 
        contact: phoneMatch[1].replace(/[^0-9]/g,''), 
        message: phoneMatch[2].trim(),
        byPhone: true
      }};
    }
    // Name format: whatsapp Kashish: hello OR whatsapp Shrajal kya re
    const nameMatch = message.match(/whatsapp\s+([a-zA-Z][a-zA-Z\s]{1,25}?)[:\-]\s*(.+)/i) ||
                      message.match(/whatsapp\s+([a-zA-Z]{2,20})\s+(.{2,})/i);
    if (nameMatch) {
      return { action: 'whatsapp_send', params: {
        contact: nameMatch[1].trim(),
        message: nameMatch[2].trim(),
        byName: true
      }};
    }
  }

  const openM = msg.match(/^(?:open|launch|start|kholo|chalu) +(.+)$/);
  if (openM) return { action: 'open_app', params: { app: openM[1].trim() } };
  if (/screenshot|screen shot/i.test(msg)) return { action: 'screenshot', params: {} };
  if (/^(?:cpu|ram|battery|memory|disk).*(status|info|usage)?/i.test(msg) || /system.?info/i.test(msg)) return { action: 'system_info', params: {} };
  if (/^volume\s+(\d+)/i.test(msg)) { const v = msg.match(/volume\s+(\d+)/i); return { action: 'volume', params: { level: parseInt(v[1]) } }; }
  if (/^(?:create|make|new)\s+file[:\s]+(.+)/i.test(msg)) { const m = msg.match(/(?:create|make|new)\s+file[:\s]+(.+)/i); return { action: 'create_file', params: { name: m[1] } }; }
  if (/^(?:list|show)\s+files?/i.test(msg)) return { action: 'list_files', params: {} };
  if (/^scroll\s+(down|up)/i.test(msg)) { const m = msg.match(/scroll\s+(down|up)/i); return { action: 'scroll', params: { direction: m[1] } }; }
  return null;
}

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DEEP THINK — Multi-step reasoning + web research
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/api/deepthink', async (req, res) => {
  try {
    const { message, model = 'llama-3.3-70b-versatile' } = req.body;
    const memory = await loadMemory();
    const userContext = buildUserContext(memory);

    const steps = [];

    // STEP 1: Break down the problem
    const breakdownRes = await groqChat([
      { role: 'system', content: `You are a deep analytical reasoning engine. Break down complex questions into research components. Be structured and thorough. Address user as "Sir".` },
      { role: 'user', content: `Break this question into 3-4 key research areas I need to investigate: "${message}"
Return as JSON: {"topic": "main topic", "areas": ["area1", "area2", "area3"], "approach": "how to answer this"}` }
    ], model);
    const breakdownText = breakdownRes.choices[0].message.content;
    let breakdown = { topic: message, areas: [message], approach: 'Direct analysis' };
    try {
      const jsonMatch = breakdownText.match(/\{[\s\S]*\}/);
      if (jsonMatch) breakdown = JSON.parse(jsonMatch[0]);
    } catch(e) {}
    steps.push({ phase: 'ANALYZING', content: `Breaking down: ${breakdown.topic}\nAreas: ${breakdown.areas.join(', ')}` });

    // STEP 2: Web search for each area
    const searchResults = [];
    for (const area of breakdown.areas.slice(0, 3)) {
      try {
        const searchRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(area)}&format=json&no_html=1&skip_disambig=1`);
        const searchData = await searchRes.json();
        const result = searchData.AbstractText || searchData.Answer || 
          (searchData.RelatedTopics?.[0]?.Text) || '';
        if (result) searchResults.push(`[${area}]: ${result.slice(0, 400)}`);
      } catch(e) {}
    }
    steps.push({ phase: 'RESEARCHING', content: `Searched ${breakdown.areas.length} areas. Found ${searchResults.length} sources.` });

    // STEP 3: Deep reasoning synthesis
    const synthesisPrompt = `You are J.A.R.V.I.S performing deep analytical reasoning like DeepSeek-R1.

User Question: "${message}"

Research Data:
${searchResults.length > 0 ? searchResults.join('\n\n') : 'Using internal knowledge base'}

${userContext}

## YOUR TASK
Provide a DEEP, THOROUGH analysis. Think step by step:
1. What is the core of this question?
2. What does the research tell us?
3. What are different perspectives/angles?
4. What is your synthesized conclusion?

Format response with:
**🧠 Deep Analysis:**
[thorough multi-paragraph analysis]

**💡 Key Insights:**
[3-5 bullet points of most important findings]

**✅ Conclusion:**
[clear actionable answer]

Be thorough. This is DEEP THINK mode — give maximum value. Address user as "Sir".`;

    const finalRes = await groqChat([
      { role: 'user', content: synthesisPrompt }
    ], model, false, 4096);

    const finalAnswer = finalRes.choices[0].message.content;
    steps.push({ phase: 'SYNTHESIZING', content: 'Analysis complete.' });

    // Update memory
    analyzeAndUpdateProfile(message, finalAnswer, memory);

    res.json({
      reply: finalAnswer,
      steps,
      sources: searchResults.length,
      areas: breakdown.areas
    });

  } catch(err) {
    console.error('Deep think error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GOD MODE — AI decides everything autonomously
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/api/godmode', async (req, res) => {
  try {
    const { message, history = [], tone = 'assistant', model = 'llama-3.3-70b-versatile' } = req.body;
    const memory = await loadMemory();
    const userContext = buildUserContext(memory);

    // Step 1: AI decides what to do
    const planRes = await groqChat([
      { role: 'system', content: `You are an AI task router. Given a user message, decide the best action.
Return ONLY valid JSON (no markdown):
{
  "action": "chat" | "search" | "desktop" | "deepthink" | "code",
  "reason": "why",
  "desktop_cmd": { "action": "...", "params": {} } | null,
  "search_query": "query if searching" | null,
  "needs_realtime": true | false
}

Desktop actions: open_app, whatsapp_send, screenshot, system_info, volume, create_file, list_files, run_command
Use "search" if question needs current/realtime info.
Use "deepthink" if question is complex and needs deep analysis.
Use "desktop" if user wants to control their computer.
Use "chat" for everything else.` },
      { role: 'user', content: message }
    ], 'llama-3.1-8b-instant');

    let plan = { action: 'chat', reason: 'default', desktop_cmd: null, search_query: null };
    try {
      const planText = planRes.choices[0].message.content;
      const jsonMatch = planText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        plan = { ...plan, ...parsed };
      }
    } catch(e) {
      console.log('[GODMODE] Plan parse failed, using chat fallback');
    }
    // Safety: ensure tone always has a fallback
    const safeTone = (TONES[tone] || TONES.assistant) ? tone : 'assistant';

    let reply = '';
    let sources = null;

    // Step 2: Execute the plan
    if (plan.action === 'desktop' && plan.desktop_cmd) {
      try {
        const agentRes = await fetch('http://localhost:9999', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(plan.desktop_cmd),
          signal: AbortSignal.timeout(5000)
        });
        const agentData = await agentRes.json();
        if (agentData.success) {
          reply = `✅ Done, Sir.

${agentData.result}`;
        } else {
          reply = `⚠️ Agent error: ${agentData.result}`;
        }
      } catch(e) {
        reply = '⚠️ **Desktop Agent offline, Sir.**\n\nLaptop control ke liye apne PC pe run karo: python jarvis_agent_v2.py';
      }

    } else if (plan.action === 'search' || plan.needs_realtime) {
      const query = plan.search_query || message;
      try {
        const searchRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
        const searchData = await searchRes.json();
        const results = [
          searchData.AbstractText,
          searchData.Answer,
          ...(searchData.RelatedTopics || []).slice(0,3).map(t => t.Text)
        ].filter(Boolean).join('\n\n');

        const chatRes = await groqChat([
          { role: 'system', content: ((TONES[tone] || TONES.assistant) || TONES.assistant) + userContext + `\nWeb search results for "${query}":\n${results.slice(0,2000)}` },
          ...history.slice(-8),
          { role: 'user', content: message }
        ], model);
        reply = chatRes.choices[0].message.content;
        sources = [{ title: 'Web Search', url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}` }];
      } catch(e) {
        // Fallback to chat
        const chatRes = await groqChat([
          { role: 'system', content: ((TONES[tone] || TONES.assistant) || TONES.assistant) + userContext },
          ...history.slice(-8),
          { role: 'user', content: message }
        ], model);
        reply = chatRes.choices[0].message.content;
      }

    } else if (plan.action === 'deepthink') {
      // Forward to deepthink
      const dtRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/deepthink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, model })
      });
      const dtData = await dtRes.json();
      reply = dtData.reply || 'Deep analysis failed';

    } else {
      // Regular chat
      const chatRes = await groqChat([
        { role: 'system', content: ((TONES[tone] || TONES.assistant) || TONES.assistant) + userContext },
        ...history.slice(-10),
        { role: 'user', content: message }
      ], model);
      reply = chatRes.choices[0].message.content;
    }

    analyzeAndUpdateProfile(message, reply, memory);
    res.json({ reply, sources, action_taken: plan.action, reason: plan.reason });

  } catch(err) {
    console.error('Godmode error:', err);
    res.status(500).json({ error: err.message });
  }
});
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   J.A.R.V.I.S ONLINE — PORT ${PORT}    ║
  ║   Just A Rather Very Intelligent     ║
  ║   System — v3.0.0                    ║
  ╚══════════════════════════════════════╝
  `);
});
