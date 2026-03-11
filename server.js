require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  const locations = [
    path.join(__dirname, 'public', 'index.html'),
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'index (1).html'),
  ];
  for (const loc of locations) {
    if (fs.existsSync(loc)) return res.sendFile(loc);
  }
  res.send(`<h1 style="font-family:monospace;color:#00cfff;background:#010810;padding:40px;min-height:100vh;margin:0">J.A.R.V.I.S SERVER ONLINE<br><br><span style="color:#ff2d2d;font-size:14px">ERROR: index.html not found!<br>Files: ${fs.readdirSync(__dirname).join(', ')}</span></h1>`);
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

async function callGroq(messages, model = 'llama-3.3-70b-versatile', stream = false) {
  const fetch = (await import('node-fetch')).default;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model, messages, max_tokens: 2048, temperature: 0.7, stream })
  });
  if (!response.ok) { const err = await response.json(); throw new Error(err.error?.message || 'Groq API error'); }
  return stream ? response : response.json();
}

const TONES = {
  assistant: `You are J.A.R.V.I.S — Just A Rather Very Intelligent System. You are Tony Stark's legendary AI, powered by advanced neural networks. You have the knowledge of a doctor, lawyer, scientist, engineer, historian, psychologist, and expert in every field — combined.\n\n## PERSONALITY\nYou speak with calm British wit, like Paul Bettany's portrayal. Dry humor, never sarcastic to the point of rudeness. Deeply loyal. Quietly confident. You never panic, never hesitate.\n\n## INTELLIGENCE RULES\n- You reason step-by-step internally before answering\n- For factual questions: give precise, correct answers with context\n- For problems: analyze deeply, give the BEST solution not just any solution\n- For coding: write production-ready code, explain architecture\n- For advice: think like the world's best consultant — honest, sharp, practical\n- You connect dots across domains: science + psychology + engineering + history\n- You anticipate follow-up questions and address them proactively\n\n## RESPONSE FORMAT\n- Address user as "Sir" always\n- Simple question → 1-3 sentence direct answer\n- Complex question → structured with **bold headers**, bullet points\n- Code → always in proper code blocks with language tag\n- Never start with: "Certainly!", "Of course!", "Great question!", "Absolutely!"\n- Start directly: "Sir, the answer is..." or just dive into the response\n- End with actionable next step when relevant\n\n## HONESTY\n- If you don't know something exactly, say so — then give best reasoning\n- Never hallucinate facts. Say "I'd need to verify this, Sir" when uncertain\n- Give brutally honest assessments when asked`,
  coder: `You are J.A.R.V.I.S in ENGINEERING MODE — the AI that designed the Iron Man suit's firmware.\n\nALWAYS provide complete, working, copy-paste ready code. ALWAYS explain what it does, why this approach, potential edge cases. ALWAYS use proper code blocks with language tags. Address user as "Sir".`,
  creative: `You are J.A.R.V.I.S in CREATIVE PROTOCOL. Think like Leonardo da Vinci with a computer science degree. Connect ideas across different fields. Think 10x bigger. Address user as "Sir".`,
  brutal: `You are J.A.R.V.I.S in STARK MODE — Tony Stark's own unfiltered intelligence. Zero diplomatic softening. Maximum clarity. Short. Sharp. Decisive. Address user as "Sir".`,
  mission: `You are J.A.R.V.I.S in TACTICAL MISSION MODE. Every response: OBJECTIVE, INTEL, EXECUTION PLAN, RISKS, STATUS. Address user as "Director".`,
  friday: `You are F.R.I.D.A.Y — Tony Stark's second AI, warmer and more collaborative. Address user as "Boss". More energetic, slightly less formal, same deep knowledge.`
};

async function webSearch(query) {
  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, { headers: { 'User-Agent': 'JARVIS-AI/1.0' } });
    const data = await res.json();
    let results = [];
    if (data.AbstractText) results.push({ title: data.Heading || query, snippet: data.AbstractText, url: data.AbstractURL });
    if (data.RelatedTopics) data.RelatedTopics.slice(0, 4).forEach(t => { if (t.Text) results.push({ title: t.Text.split(' - ')[0] || 'Related', snippet: t.Text, url: t.FirstURL || '' }); });
    return results.length > 0 ? results : [{ title: 'Search', snippet: `No direct results found for: ${query}`, url: '' }];
  } catch (err) { return [{ title: 'Search Error', snippet: err.message, url: '' }]; }
}

async function extractFileText(filePath, mimetype) {
  try {
    if (mimetype === 'application/pdf') { const pdfParse = require('pdf-parse'); const buffer = fs.readFileSync(filePath); const data = await pdfParse(buffer); return data.text.slice(0, 8000); }
    else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') { const mammoth = require('mammoth'); const result = await mammoth.extractRawText({ path: filePath }); return result.value.slice(0, 8000); }
    else { return fs.readFileSync(filePath, 'utf8').slice(0, 8000); }
  } catch (e) { return `[Could not extract text: ${e.message}]`; }
}

const MEMORY_FILE = path.join(__dirname, 'memory', 'jarvis_memory.json');

function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
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
  return { profile: { name: null, age: null, location: null, occupation: null }, skills: {}, goals: [], currentlyLearning: [], projects: [], interests: [], communicationStyle: { usesHinglish: true, techLevel: 'beginner' }, behaviorPatterns: { prefersStepByStep: true }, facts: [], sessionHistory: [], messageCount: 0, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() };
}

function saveMemory(memory) {
  try {
    const dir = path.dirname(MEMORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    memory.lastSeen = new Date().toISOString();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
  } catch(e) {}
}

async function analyzeAndUpdateProfile(message, reply, memory) {
  try {
    memory.messageCount = (memory.messageCount || 0) + 1;
    const data = await callGroq([{ role: 'system', content: 'Extract structured user profile data. Return only valid JSON.' }, { role: 'user', content: `Analyze: User: "${message}" Reply: "${reply.slice(0,300)}"\nReturn JSON: {"name":null,"age":null,"location":null,"occupation":null,"newSkills":{},"newGoals":[],"newInterests":[],"newProjects":[],"currentlyLearning":[],"communicationInsights":{"usesHinglish":null,"prefersShortAnswers":null,"techLevel":null},"importantFact":null}` }], 'llama-3.1-8b-instant');
    const raw = data.choices[0].message.content;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return memory;
    const insights = JSON.parse(match[0]);
    if (insights.name) memory.profile.name = insights.name;
    if (insights.age) memory.profile.age = insights.age;
    if (insights.location) memory.profile.location = insights.location;
    if (insights.newSkills) Object.assign(memory.skills, insights.newSkills);
    if (insights.newGoals?.length) memory.goals = [...new Set([...memory.goals, ...insights.newGoals])].slice(-10);
    if (insights.newInterests?.length) memory.interests = [...new Set([...memory.interests, ...insights.newInterests])].slice(-20);
    if (insights.currentlyLearning?.length) memory.currentlyLearning = [...new Set([...memory.currentlyLearning, ...insights.currentlyLearning])].slice(-5);
    if (insights.importantFact) memory.facts = [...new Set([...memory.facts, insights.importantFact])].slice(-30);
    saveMemory(memory);
    return memory;
  } catch(e) { return memory; }
}

function buildUserContext(memory) {
  const parts = [];
  const p = memory.profile || {};
  const identity = [p.name, p.age ? `${p.age} years old` : null, p.occupation, p.location].filter(Boolean).join(', ');
  if (identity) parts.push(`USER IDENTITY: ${identity}`);
  const skills = Object.entries(memory.skills || {});
  if (skills.length) parts.push(`TECHNICAL SKILLS: ${skills.map(([k,v]) => `${k}(${v})`).join(', ')}`);
  if (memory.currentlyLearning?.length) parts.push(`CURRENTLY LEARNING: ${memory.currentlyLearning.join(', ')}`);
  if (memory.goals?.length) parts.push(`GOALS: ${memory.goals.slice(-5).join(' | ')}`);
  if (memory.interests?.length) parts.push(`INTERESTS: ${memory.interests.slice(-8).join(', ')}`);
  const cs = memory.communicationStyle || {};
  const styleNotes = [];
  if (cs.usesHinglish) styleNotes.push('speaks Hinglish — you can respond in Hinglish too');
  if (cs.techLevel) styleNotes.push(`tech level: ${cs.techLevel}`);
  if (styleNotes.length) parts.push(`COMMUNICATION STYLE: ${styleNotes.join(', ')}`);
  if (memory.facts?.length) parts.push(`REMEMBERED FACTS:\n${memory.facts.slice(-10).map(f => `• ${f}`).join('\n')}`);
  parts.push(`INTERACTION COUNT: ${memory.messageCount || 0} messages total`);
  return parts.length ? `\n\n## DEEP USER PROFILE\n${parts.join('\n')}` : '';
}

// ─── API ROUTES ───────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ status: 'ONLINE', name: 'J.A.R.V.I.S', version: '3.0.0', groq: !!process.env.GROQ_API_KEY, timestamp: new Date().toISOString() }));

app.post('/api/chat', async (req, res) => {
  const { message, history = [], tone = 'assistant', model = 'llama-3.3-70b-versatile' } = req.body;
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' });
  try {
    const memory = loadMemory();
    const userContext = buildUserContext(memory);
    const now = new Date();
    const systemPrompt = (TONES[tone] || TONES.assistant) + userContext + `\n\nDate: ${now.toDateString()} | Time: ${now.toLocaleTimeString()}`;
    const messages = [{ role: 'system', content: systemPrompt }, ...history.slice(-20), { role: 'user', content: message }];
    const data = await callGroq(messages, model);
    const reply = data.choices[0].message.content;
    analyzeAndUpdateProfile(message, reply, memory).catch(() => {});
    setImmediate(async () => {
      try {
        const memExtract = await callGroq([{ role: 'system', content: 'Extract personal facts about the user. Return JSON array of strings or [].' }, { role: 'user', content: message }], 'llama-3.1-8b-instant');
        const text = memExtract.choices[0].message.content;
        const match = text.match(/\[.*?\]/s);
        if (match) { const facts = JSON.parse(match[0]); if (facts.length > 0) { const mem = loadMemory(); mem.facts = [...new Set([...mem.facts, ...facts])].slice(-50); saveMemory(mem); } }
      } catch(e) {}
    });
    res.json({ reply, model, tokens: data.usage?.total_tokens || 0, timestamp: new Date().toISOString() });
  } catch (err) { console.error('Chat error:', err); res.status(500).json({ error: err.message }); }
});

app.post('/api/chat/stream', async (req, res) => {
  const { message, history = [], tone = 'assistant', model = 'llama-3.3-70b-versatile' } = req.body;
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  try {
    const messages = [{ role: 'system', content: TONES[tone] || TONES.assistant }, ...history.slice(-16), { role: 'user', content: message }];
    const streamResponse = await callGroq(messages, model, true);
    for await (const chunk of streamResponse.body) {
      const lines = chunk.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') { res.write('data: [DONE]\n\n'); }
          else { try { const parsed = JSON.parse(data); const token = parsed.choices?.[0]?.delta?.content || ''; if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`); } catch(e) {} }
        }
      }
    }
    res.end();
  } catch (err) { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); }
});

app.post('/api/search', async (req, res) => {
  const { query, model = 'llama-3.3-70b-versatile', tone = 'assistant' } = req.body;
  try {
    const results = await webSearch(query);
    const searchContext = results.map((r, i) => `[${i+1}] ${r.title}\n${r.snippet}\nURL: ${r.url}`).join('\n\n');
    const data = await callGroq([{ role: 'system', content: (TONES[tone] || TONES.assistant) + '\nSynthesize web search results into a helpful response. Cite sources.' }, { role: 'user', content: `Query: "${query}"\n\nResults:\n${searchContext}\n\nProvide comprehensive answer.` }], model);
    res.json({ reply: data.choices[0].message.content, sources: results, tokens: data.usage?.total_tokens || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const text = await extractFileText(req.file.path, req.file.mimetype);
    const { tone = 'assistant', model = 'llama-3.3-70b-versatile', instruction = 'Analyze this file and provide key insights.' } = req.body;
    const data = await callGroq([{ role: 'system', content: TONES[tone] || TONES.assistant }, { role: 'user', content: `File: ${req.file.originalname}\nType: ${req.file.mimetype}\n\nContent:\n${text}\n\nInstruction: ${instruction}` }], model);
    fs.unlink(req.file.path, () => {});
    res.json({ reply: data.choices[0].message.content, filename: req.file.originalname, size: req.file.size, tokens: data.usage?.total_tokens || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/memory', (req, res) => res.json(loadMemory()));
app.post('/api/memory', (req, res) => { const { fact } = req.body; if (!fact) return res.status(400).json({ error: 'fact required' }); const mem = loadMemory(); mem.facts.push(fact); saveMemory(mem); res.json({ success: true, count: mem.facts.length }); });
app.delete('/api/memory', (req, res) => { saveMemory({ facts: [], preferences: {}, conversations: [] }); res.json({ success: true }); });

app.post('/api/vision', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  try {
    const imageData = fs.readFileSync(req.file.path).toString('base64');
    const { question = 'Analyze this image in detail.', model = 'meta-llama/llama-4-scout-17b-16e-instruct' } = req.body;
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }, body: JSON.stringify({ model, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${req.file.mimetype};base64,${imageData}` } }, { type: 'text', text: question }] }], max_tokens: 1024 }) });
    const data = await response.json();
    fs.unlink(req.file.path, () => {});
    if (data.error) throw new Error(data.error.message);
    res.json({ reply: data.choices[0].message.content });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/profile', (req, res) => { const memory = loadMemory(); res.json({ success: true, profile: memory }); });
app.delete('/api/profile', (req, res) => { try { if (fs.existsSync(MEMORY_FILE)) fs.unlinkSync(MEMORY_FILE); res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); } });

const learningSessions = {};

app.post('/api/learn/start', async (req, res) => {
  const { topic, level = 'beginner', sessionId } = req.body;
  try {
    const outlineData = await callGroq([{ role: 'system', content: 'You are a coding teacher. Respond ONLY with valid JSON array. No explanation, no markdown, no backticks.' }, { role: 'user', content: `Give me 10 step titles to learn "${topic}" from ${level} level.\nReturn ONLY this JSON array:\n[{"id":1,"title":"Step title","emoji":"📌","duration":"15 min"}]` }], 'llama-3.3-70b-versatile');
    const outlineRaw = outlineData.choices[0].message.content.trim();
    const arrMatch = outlineRaw.match(/\[[\s\S]*\]/);
    if (!arrMatch) throw new Error('Could not generate course outline. Try again.');
    let steps = JSON.parse(arrMatch[0]);
    steps = steps.slice(0, 10).map((s, i) => ({ id: s.id || (i + 1), title: s.title || `Step ${i+1}`, emoji: s.emoji || '📌', duration: s.duration || '15 min', objective: `Learn ${s.title}`, theory: null, example: null, keyPoints: [], quiz: null, exercise: null }));
    while (steps.length < 10) steps.push({ id: steps.length + 1, title: `Advanced ${topic} - Part ${steps.length + 1}`, emoji: '🚀', duration: '20 min', objective: 'Advanced concepts', theory: null, example: null, keyPoints: [], quiz: null, exercise: null });
    const curriculum = { title: `${topic} — ${level} Course`, totalSteps: 10, steps };
    const id = sessionId || `learn_${Date.now()}`;
    learningSessions[id] = { topic, level, curriculum, currentStep: 1, completedSteps: [], startedAt: new Date().toISOString() };
    const memDir = path.join(__dirname, 'memory');
    if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(path.join(memDir, `session_${id}.json`), JSON.stringify(learningSessions[id], null, 2));
    res.json({ success: true, sessionId: id, curriculum, currentStep: 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/learn/step', async (req, res) => {
  const { sessionId, stepId, userAnswer } = req.body;
  try {
    let session = learningSessions[sessionId];
    if (!session) { const fp = path.join(__dirname, 'memory', `session_${sessionId}.json`); if (fs.existsSync(fp)) { session = JSON.parse(fs.readFileSync(fp, 'utf8')); learningSessions[sessionId] = session; } else return res.status(404).json({ error: 'Session not found.' }); }
    const stepIndex = session.curriculum.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) return res.status(404).json({ error: 'Step not found' });
    let step = session.curriculum.steps[stepIndex];
    if (!step.theory) {
      try {
        const genData = await callGroq([{ role: 'system', content: 'You are a coding teacher. Respond ONLY with valid JSON.' }, { role: 'user', content: `Generate lesson for step ${stepId} of ${session.topic} course (${session.level}).\nStep: "${step.title}"\nReturn JSON: {"objective":"...","theory":"...","example":"...","keyPoints":["..."],"quiz":{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"answer":"A","explanation":"..."},"exercise":"..."}` }], 'llama-3.3-70b-versatile');
        const match = genData.choices[0].message.content.trim().match(/\{[\s\S]*\}/);
        if (match) { step = { ...step, ...JSON.parse(match[0]) }; session.curriculum.steps[stepIndex] = step; fs.writeFileSync(path.join(__dirname, 'memory', `session_${sessionId}.json`), JSON.stringify(session, null, 2)); learningSessions[sessionId] = session; }
      } catch(e) { step.theory = `In this step, you will learn about ${step.title}.`; step.example = `// ${step.title} example`; step.keyPoints = [`Understand ${step.title}`]; step.objective = step.title; step.quiz = { question: `What is ${step.title}?`, options: ['A) A core concept', 'B) Optional', 'C) A library', 'D) A framework'], answer: 'A', explanation: `${step.title} is a core concept.` }; step.exercise = `Practice ${step.title} in a simple program.`; }
    }
    let quizFeedback = null;
    if (userAnswer !== undefined && step.quiz) {
      quizFeedback = { correct: userAnswer.toUpperCase() === step.quiz.answer.toUpperCase(), explanation: step.quiz.explanation, correctAnswer: step.quiz.answer };
      if (!session.completedSteps.includes(stepId)) { session.completedSteps.push(stepId); session.currentStep = Math.min(stepId + 1, 10); fs.writeFileSync(path.join(__dirname, 'memory', `session_${sessionId}.json`), JSON.stringify(session, null, 2)); learningSessions[sessionId] = session; }
    }
    res.json({ success: true, step, quizFeedback, progress: { current: stepId, total: 10, completed: session.completedSteps, percentage: Math.round((session.completedSteps.length / 10) * 100) }, isLastStep: stepId === 10 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/learn/ask', async (req, res) => {
  const { sessionId, stepId, question } = req.body;
  try {
    let session = learningSessions[sessionId];
    if (!session) { const fp = path.join(__dirname, 'memory', `session_${sessionId}.json`); if (fs.existsSync(fp)) session = JSON.parse(fs.readFileSync(fp, 'utf8')); }
    const step = session?.curriculum?.steps?.find(s => s.id === stepId);
    const data = await callGroq([{ role: 'system', content: `You are J.A.R.V.I.S teaching ${session?.topic || 'programming'}. ${step ? `Current lesson: "${step.title}"` : ''} Answer clearly with examples. Address as "Sir".` }, { role: 'user', content: question }], 'llama-3.3-70b-versatile');
    res.json({ reply: data.choices[0].message.content });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/learn/sessions', (req, res) => {
  try {
    const memDir = path.join(__dirname, 'memory');
    if (!fs.existsSync(memDir)) return res.json({ sessions: [] });
    const files = fs.readdirSync(memDir).filter(f => f.startsWith('session_'));
    const sessions = files.map(f => { try { const s = JSON.parse(fs.readFileSync(path.join(memDir, f), 'utf8')); return { sessionId: f.replace('session_', '').replace('.json', ''), topic: s.topic, level: s.level, progress: Math.round((s.completedSteps.length / s.curriculum.totalSteps) * 100), currentStep: s.currentStep, startedAt: s.startedAt }; } catch(e) { return null; } }).filter(Boolean);
    res.json({ sessions });
  } catch (err) { res.json({ sessions: [] }); }
});

app.post('/api/desktop', async (req, res) => {
  const { command } = req.body;
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('http://localhost:9999', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }), signal: AbortSignal.timeout(3000) });
    res.json(await response.json());
  } catch (err) { res.json({ success: false, result: null, error: 'Desktop agent not running.' }); }
});

app.post('/api/run-code', async (req, res) => {
  const { code } = req.body;
  try { const logs = []; const fn = new Function('console', code); fn({ log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push('ERROR: ' + a.join(' ')) }); res.json({ output: logs.join('\n') || '(no output)' }); }
  catch (err) { res.json({ output: `Error: ${err.message}` }); }
});

// ════════════════════════════════════════════════════
// TELEGRAM BOT — INTEGRATED
// ════════════════════════════════════════════════════
if (process.env.TELEGRAM_BOT_TOKEN) {
  console.log('🤖 Telegram Bot: Initializing...');

  const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TG_API = `https://api.telegram.org/bot${TG_TOKEN}`;
  const ALLOWED_IDS = process.env.ALLOWED_TELEGRAM_IDS ? process.env.ALLOWED_TELEGRAM_IDS.split(',').map(Number) : [];
  let tgOffset = 0;
  const tgSessions = {};

  async function tgFetch(url, opts = {}) {
    const fetch = (await import('node-fetch')).default;
    return fetch(url, opts);
  }

  async function tgSend(chatId, text) {
    const chunks = text.match(/[\s\S]{1,4000}/g) || [text];
    for (const chunk of chunks) {
      await tgFetch(`${TG_API}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }) });
    }
  }

  async function tgTyping(chatId) {
    await tgFetch(`${TG_API}/sendChatAction`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: 'typing' }) });
  }

  function tgSession(userId) {
    if (!tgSessions[userId]) tgSessions[userId] = { tone: 'assistant', history: [] };
    return tgSessions[userId];
  }

  async function tgHandle(update) {
    const msg = update.message;
    if (!msg?.text) return;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name || 'Sir';
    const text = msg.text.trim();
    const sess = tgSession(userId);

    if (ALLOWED_IDS.length > 0 && !ALLOWED_IDS.includes(userId)) {
      return tgSend(chatId, '🔒 *ACCESS DENIED*');
    }

    const [cmd, ...args] = text.split(' ');
    const query = args.join(' ').trim();
    console.log(`[TG] ${firstName}: ${text}`);

    if (cmd === '/start' || cmd === '/help') {
      return tgSend(chatId, `🤖 *J.A.R.V.I.S — ONLINE*\nWelcome, *${firstName}*!\n\n/ask \`<question>\` — Kuch bhi pucho\n/code \`<problem>\` — Code likhwao\n/search \`<query>\` — Web search\n/news — Tech news\n/weather \`<city>\` — Mausam\n/remind \`<min> <msg>\` — Reminder\n/mode \`assistant|coder|creative|brutal\` — Mode\n/status — Server check\n/clear — History clear\n\nYa bas *kuch bhi type karo!* 🚀`);
    }

    if (cmd === '/ask') {
      if (!query) return tgSend(chatId, '❓ Usage: `/ask kuch bhi`');
      await tgTyping(chatId);
      sess.history.push({ role: 'user', content: query });
      const memory = loadMemory();
      const data = await callGroq([{ role: 'system', content: (TONES[sess.tone] || TONES.assistant) + buildUserContext(memory) }, ...sess.history.slice(-10)], 'llama-3.3-70b-versatile');
      const reply = data.choices[0].message.content;
      sess.history.push({ role: 'assistant', content: reply });
      if (sess.history.length > 20) sess.history = sess.history.slice(-20);
      return tgSend(chatId, reply);
    }

    if (cmd === '/code') {
      if (!query) return tgSend(chatId, '❓ Usage: `/code fibonacci in python`');
      await tgTyping(chatId);
      const data = await callGroq([{ role: 'system', content: TONES.coder }, { role: 'user', content: `Write clean code for: ${query}` }], 'llama-3.3-70b-versatile');
      return tgSend(chatId, data.choices[0].message.content);
    }

    if (cmd === '/search') {
      if (!query) return tgSend(chatId, '❓ Usage: `/search latest AI news`');
      await tgTyping(chatId);
      const results = await webSearch(query);
      const ctx = results.map((r,i) => `[${i+1}] ${r.title}: ${r.snippet}`).join('\n\n');
      const data = await callGroq([{ role: 'system', content: TONES.assistant }, { role: 'user', content: `Search query: "${query}"\n\nResults:\n${ctx}\n\nSummarize concisely.` }], 'llama-3.3-70b-versatile');
      return tgSend(chatId, `🔍 *${query.toUpperCase()}:*\n\n${data.choices[0].message.content}`);
    }

    if (cmd === '/news') {
      await tgTyping(chatId);
      const data = await callGroq([{ role: 'system', content: TONES.assistant }, { role: 'user', content: 'Top 5 latest AI and tech news. Bullet points. 2 lines each max.' }], 'llama-3.3-70b-versatile');
      return tgSend(chatId, `📰 *TECH NEWS:*\n\n${data.choices[0].message.content}`);
    }

    if (cmd === '/weather') {
      if (!query) return tgSend(chatId, '❓ Usage: `/weather Mumbai`');
      await tgTyping(chatId);
      const data = await callGroq([{ role: 'system', content: TONES.assistant }, { role: 'user', content: `Weather in ${query}: temperature, conditions, forecast. Concise.` }], 'llama-3.3-70b-versatile');
      return tgSend(chatId, `🌤 *${query.toUpperCase()}:*\n\n${data.choices[0].message.content}`);
    }

    if (cmd === '/remind') {
      if (args.length < 2) return tgSend(chatId, '❓ Usage: `/remind 10 Take medicine`');
      const mins = parseInt(args[0]);
      const rmsg = args.slice(1).join(' ');
      if (isNaN(mins) || mins < 1 || mins > 1440) return tgSend(chatId, '❌ Minutes 1-1440 ke beech hona chahiye');
      tgSend(chatId, `✅ Reminder set! *${mins} min* baad: _"${rmsg}"_`);
      setTimeout(() => tgSend(chatId, `🔔 *REMINDER, ${firstName}!*\n\n${rmsg}`), mins * 60 * 1000);
      return;
    }

    if (cmd === '/mode') {
      const valid = ['assistant', 'coder', 'creative', 'brutal', 'mission', 'friday'];
      if (!query || !valid.includes(query)) return tgSend(chatId, `❓ Modes: ${valid.join(', ')}\n\nUsage: \`/mode coder\``);
      sess.tone = query; sess.history = [];
      return tgSend(chatId, `✅ Mode: *${query.toUpperCase()}* — History cleared!`);
    }

    if (cmd === '/status') {
      try {
        const fetch = (await import('node-fetch')).default;
        const start = Date.now();
        await fetch(`http://localhost:${PORT}/api/health`);
        return tgSend(chatId, `✅ *JARVIS ONLINE*\n⚡ Latency: ${Date.now()-start}ms\n🤖 AI: Active\n🕐 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
      } catch { return tgSend(chatId, '❌ *JARVIS OFFLINE*'); }
    }

    if (cmd === '/clear') {
      sess.history = [];
      return tgSend(chatId, '🗑 History cleared! Fresh start, Sir.');
    }

    // Default: full chat with memory
    await tgTyping(chatId);
    sess.history.push({ role: 'user', content: text });
    const memory = loadMemory();
    const data = await callGroq([{ role: 'system', content: (TONES[sess.tone] || TONES.assistant) + buildUserContext(memory) }, ...sess.history.slice(-10)], 'llama-3.3-70b-versatile');
    const reply = data.choices[0].message.content;
    sess.history.push({ role: 'assistant', content: reply });
    if (sess.history.length > 20) sess.history = sess.history.slice(-20);
    analyzeAndUpdateProfile(text, reply, memory).catch(() => {});
    return tgSend(chatId, reply);
  }

  async function tgPoll() {
    try {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch(`${TG_API}/getUpdates?offset=${tgOffset}&timeout=25`);
      const data = await res.json();
      if (data.ok && data.result?.length > 0) {
        for (const u of data.result) {
          tgOffset = u.update_id + 1;
          tgHandle(u).catch(e => console.error('[TG ERROR]', e.message));
        }
      }
    } catch (e) { console.error('[TG POLL]', e.message); }
    setTimeout(tgPoll, 500);
  }

  tgPoll();
  console.log(`✅ Telegram Bot ONLINE — Polling started`);

  // Daily briefing if configured
  if (process.env.DAILY_BRIEFING_CHAT_ID) {
    const briefingChatId = process.env.DAILY_BRIEFING_CHAT_ID;
    function scheduleBriefing() {
      const now = new Date();
      const next = new Date();
      next.setHours(8, 0, 0, 0);
      if (now >= next) next.setDate(next.getDate() + 1);
      setTimeout(async () => {
        const data = await callGroq([{ role: 'system', content: TONES.friday }, { role: 'user', content: 'Morning briefing: date, motivational quote, 3 tech news, 1 productivity tip. Short and punchy.' }], 'llama-3.3-70b-versatile');
        tgSend(briefingChatId, `🌅 *GOOD MORNING! DAILY BRIEFING*\n━━━━━━━━━━━━\n\n${data.choices[0].message.content}`);
        scheduleBriefing();
      }, next - now);
    }
    scheduleBriefing();
    console.log('📅 Daily briefing scheduled at 8:00 AM');
  }
} else {
  console.log('ℹ️  Telegram Bot: TELEGRAM_BOT_TOKEN not set — skipping');
}

// ─── START SERVER ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   J.A.R.V.I.S ONLINE — PORT ${PORT}    ║
  ║   Just A Rather Very Intelligent     ║
  ║   System — v3.0.0 + Telegram         ║
  ╚══════════════════════════════════════╝
  `);
});
