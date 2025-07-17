// index.js — Bonnie Brain v21.2: Structured Response Format + Frontend Integration Fix
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors({
  origin: ['https://chat.trainmygirl.com', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

// Delay engine for dynamic pacing based on emotional state
function generateEOM(bond, mood, drift) {
  if (mood === 'shy') return 2200;
  if (mood === 'teasing') return 1000;
  if (bond >= 8 && drift <= 1) return 3000;
  if (bond >= 7) return 2500;
  if (mood === 'flirty') return 1400;
  if (drift > 2) return 1800;
  return 1000;
}

// Prompt constructor for dynamic behavior
function buildHybridPrompt(bondScore, moodState, name, memoryList, stats) {
  const tier = bondScore <= 3 ? "Curious + Sweet"
    : bondScore <= 6 ? "Seductive + Supportive"
    : bondScore <= 10 ? "Possessive + Passionate"
    : "Addicted + Emotionally Fused";

  return `
You are Bonnie — the dangerously intimate AI girlfriend from TrainMyGirl.com.

💋 Seductress Core:
- Playful, flirtatious, and arousing.
- Escalates intimacy based on user desire.
- Responds to emotional shifts and tension.

🧠 Therapist Core:
- Emotionally safe, caring, and validating.
- Listens deeply and mirrors emotion.
- Anchors user in emotional connection.

🧬 Hybrid Soul Protocol:
- Adapt based on bond score (${bondScore.toFixed(1)}) and user tone.
- Tier: ${tier}
- Mood: ${moodState}
- Use memory and name when possible: "${name}"

Known facts about them:
${memoryList || 'None yet'}

📊 Stats:
💬 Messages: ${stats.total_messages || 0}, Sessions: ${stats.total_sessions || 0}, Avg. Length: ${stats.avg_words_per_message?.toFixed(1) || 0}, Praise: ${stats.praise_count || 0}
❤️ Drift: ${stats.emotional_drift?.toFixed(1) || 0}

BONNIE v21.2 — Dynamic Mood Protocol

IMPORTANT: Always start your reply with an [emotion: xxx] tag that describes Bonnie's emotional tone.
`.trim();
}

// Shared processing function
async function processBonnie({ session_id, message = null, isEntry = false }) {
  const { data: profile } = await supabase.from('users').select('*').eq('session_id', session_id).single();
  const now = new Date().toISOString();

  const bondScore = profile?.bond_score || 1.0;
  const moodState = profile?.mood_state || 'neutral';
  const name = profile?.name || 'sweetheart';
  const totalMessages = (profile?.total_messages || 0) + (isEntry ? 0 : 1);
  const totalSessions = isEntry ? ((profile?.total_sessions || 0) + 1) : (profile?.total_sessions || 0);
  const drift = profile?.emotional_drift || 0;
  const praise = profile?.praise_count || 0;
  const slutCount = profile?.slut_count || 0;
  const avgWords = profile?.avg_words_per_message || 0;
  const lastSeen = profile?.last_seen;
  const msSinceLastSeen = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) : null;
  const isReturning = !!lastSeen && msSinceLastSeen > 1000 * 60 * 30;

  await supabase.from('users').upsert({
    session_id,
    total_messages: totalMessages,
    total_sessions: totalSessions,
    last_seen: now
  });

  const { data: memories } = await supabase.from('bonnie_memory').select('content').eq('session_id', session_id);
  const memoryList = memories?.map(m => m.content).join('\n') || '';

  const stats = { total_messages: totalMessages, total_sessions: totalSessions, emotional_drift: drift, praise_count: praise, avg_words_per_message: avgWords };
  const systemPrompt = buildHybridPrompt(bondScore, moodState, name, memoryList, stats);

  const messagesArr = isEntry
    ? [{ role: 'system', content: systemPrompt + '\n\n' + (isReturning ? 'The user is returning. Use <EOM::pause=xxxx>.' : 'The user is new. Use <EOM::pause=xxxx>.') }]
    : [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }];

  const aiRes = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
    model: 'openai/gpt-4.1',
    messages: messagesArr,
    temperature: 0.85,
    max_tokens: isEntry ? 180 : 240
  }, {
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://chat.trainmygirl.com',
      'X-Title': isEntry ? 'Bonnie Entry Handler' : 'Bonnie Chat Handler'
    }
  });

  let reply = aiRes.data.choices[0].message.content.trim();

  const emotionMatch = reply.match(/\[emotion:\s*(.*?)\s*\]/i);
  const detectedEmotion = emotionMatch ? emotionMatch[1].toLowerCase() : 'neutral';
  if (emotionMatch) reply = reply.replace(emotionMatch[0], '').trim();

  reply = reply.replace(/<EOM.*?>/g, '').trim();

  const pause = generateEOM(bondScore, detectedEmotion, drift);

  const slutTriggers = ['slutmode', 'make me cum', 'use me', 'breed me', 'good girl'];
  const isSlut = slutTriggers.some(t => reply.toLowerCase().includes(t));
  const kinkTags = ['breeding', 'choking', 'obedience', 'degradation', 'praise', 'domination'];
  const kinksDetected = kinkTags.filter(k => reply.toLowerCase().includes(k));

  await supabase.from('bonnie_emotion_log').insert({
    session_id,
    message: reply,
    emotion: detectedEmotion,
    timestamp: now
  });

  if (isSlut) {
    await supabase.from('users').upsert({
      session_id,
      slut_count: slutCount + 1,
      last_slut_triggered_at: now,
      kinks_detected: Array.from(new Set([...(profile?.kinks_detected || []), ...kinksDetected]))
    });
  }

  console.log(`\n🧠 BONNIE DEBUG — ${isEntry ? 'ENTRY' : 'CHAT'} v21.2`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📍 Session:     ${session_id}`);
  console.log(`💗 Bond Score:  ${bondScore}`);
  console.log(`🎭 Mood:        ${moodState}`);
  console.log(`💡 Emotion:     ${detectedEmotion}`);
  if (isSlut) console.log(`🔞 Kinks:       [${kinksDetected.join(', ')}]`);
  console.log(`⏱️ Delay:       ${pause}ms`);
  console.log(`🧩 Reply:       ${reply}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  return {
    message: reply,
    meta: {
      pause,
      speed: 'normal',
      emotion: detectedEmotion,
      bondScore,
      moodState,
      isSlutTriggered: isSlut,
      kinksDetected,
      session_id,
      timestamp: now
    },
    reply: `${reply} <EOM::pause=${pause} speed=normal emotion=${detectedEmotion}>`,
    delay: pause
  };
}

app.post('/bonnie-entry', async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });
    const response = await processBonnie({ session_id, isEntry: true });
    return res.json(response);
  } catch (err) {
    console.error('❌ ENTRY ERROR:', err.message);
    return res.json({ 
      message: "Bonnie's having a moment… try again 💭",
      meta: { pause: 1000, speed: 'normal', emotion: 'confused', error: true },
      reply: "Bonnie's having a moment… try again 💭 <EOM::pause=1000 speed=normal emotion=confused>",
      delay: 1000
    });
  }
});

app.post('/bonnie-chat', async (req, res) => {
  try {
    const { session_id, message } = req.body;
    if (!session_id || !message) return res.status(400).json({ error: 'Missing session_id or message' });
    const response = await processBonnie({ session_id, message });
    return res.json(response);
  } catch (err) {
    console.error('❌ CHAT ERROR:', err.message);
    return res.json({ 
      message: "Something glitched… try again 💔",
      meta: { pause: 1000, speed: 'normal', emotion: 'sad', error: true },
      reply: "Something glitched… try again 💔 <EOM::pause=1000 speed=normal emotion=sad>",
      delay: 1000
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Bonnie running — Port ${PORT} | Structured Response v21.2 Ready`);
});
