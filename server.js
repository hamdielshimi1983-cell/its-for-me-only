import express from "express";
import dotenv from "dotenv";
import path from "path";
import session from "express-session";
import bcrypt from "bcrypt";
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== SESSION SETUP =====
app.use(
  session({
    secret: process.env.SESSION_SECRET || "zoho-qna-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
  })
);

// ===== AUTH MIDDLEWARE =====
function ensureAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: "Not authenticated" });
}

// ===== STATIC FILES =====
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// ===== AUTH ROUTES =====
app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  
  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASS || "password";
  
  if (username === adminUser && password === adminPass) {
    req.session.user = { username };
    return res.json({ ok: true });
  }
  
  return res.status(401).json({ ok: false, error: "Invalid credentials" });
});

app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.json({ ok: true });
  });
});

app.get("/check-auth", (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ authenticated: true, user: req.session.user });
  }
  return res.json({ authenticated: false });
});

// ===== ROOT ROUTE =====
app.get("/", (req, res) => {
  // If not authenticated, show login page
  if (!req.session || !req.session.user) {
    return res.sendFile(path.join(publicDir, "login.html"));
  }
  // Otherwise show main app
  res.sendFile(path.join(publicDir, "index.html"));
});

// ===== VECTORIZATION HELPERS =====
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 0);
}

function termFreqVector(tokens) {
  const vec = {};
  tokens.forEach(token => {
    vec[token] = (vec[token] || 0) + 1;
  });
  return vec;
}

function cosine(vec1, vec2) {
  const keys = new Set([...Object.keys(vec1), ...Object.keys(vec2)]);
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  keys.forEach(key => {
    const v1 = vec1[key] || 0;
    const v2 = vec2[key] || 0;
    dotProduct += v1 * v2;
    mag1 += v1 * v1;
    mag2 += v2 * v2;
  });
  
  const denominator = Math.sqrt(mag1) * Math.sqrt(mag2);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// ===== KNOWLEDGE BASE =====
const INDEX = [
  {
    id: "zoho_1",
    file: "zoho-crm-intro.md",
    chunk_index: 0,
    text: "Zoho CRM هو نظام إدارة علاقات العملاء (CRM) الشامل الذي يساعد الشركات على تنظيم وإدارة عمليات المبيعات والتسويق والخدمات. يوفر Zoho CRM أدوات قوية لتتبع العملاء والفرص والعروض والعقود والحملات التسويقية.",
    vec: {}
  },
  {
    id: "zoho_2",
    file: "zoho-crm-features.md",
    chunk_index: 0,
    text: "من أهم ميزات Zoho CRM: إدارة جهات الاتصال، تتبع الفرص البيعية، أتمتة العمليات، التقارير والتحليلات، التكامل مع تطبيقات أخرى، وتطبيقات الهاتف الذكي. مثالي للشركات التي تفقد فرص المبيعات أو تستخدم Excel لإدارة العملاء.",
    vec: {}
  },
  {
    id: "zoho_3",
    file: "zoho-books-accounting.md",
    chunk_index: 0,
    text: "Zoho Books هو برنامج محاسبة وتمويل سحابي يساعد الشركات الصغيرة والمتوسطة على إدارة فواتيرهم ونفقاتهم وشؤونهم المالية. يدعم Zoho Books إنشاء الفواتير والنفقات والتقارير المالية تلقائياً. مثالي لمن يواجه تأخير في الفواتير أو أخطاء في الحسابات.",
    vec: {}
  },
  {
    id: "zoho_4",
    file: "zoho-inventory-management.md",
    chunk_index: 0,
    text: "Zoho Inventory هو نظام إدارة المخزون الذي يساعد على تتبع المنتجات والمستودعات والمبيعات والشراء في الوقت الفعلي. يوفر تقارير فورية عن حالة المخزون والمنتجات الأكثر مبيعاً. يمنع نفاد المخزون والبيع الزائد. مثالي لمتاجر التجزئة والتجارة الإلكترونية التي تواجه مشاكل في تتبع المخزون أو نفاد المنتجات.",
    vec: {}
  },
  {
    id: "zoho_5",
    file: "zoho-inventory-benefits.md",
    chunk_index: 0,
    text: "فوائد Zoho Inventory: تقليل نفاد المخزون بنسبة 80%، توفير 15 ساعة أسبوعياً من الجرد اليدوي، منع البيع الزائد تلقائياً، ربط مباشر مع Shopify و WooCommerce. العائد المتوقع: زيادة المبيعات 20-30% بتوفر المنتجات دائماً.",
    vec: {}
  },
  {
    id: "zoho_6",
    file: "zoho-crm-ideal-customers.md",
    chunk_index: 0,
    text: "العملاء المثاليون لـ Zoho CRM: شركات التجزئة (10-500 موظف) التي تستخدم Excel حالياً، وكالات العقارات (5-200 وكيل) التي تفقد العملاء المحتملين، شركات الخدمات المالية التي تحتاج تتبع دقيق للعملاء. إشارات الشراء: العميل يذكر 'نفقد فرص مبيعات' أو 'لا نستطيع تتبع العملاء' أو 'فريقنا ينمو بسرعة'.",
    vec: {}
  }
];

// Pre-compute vectors
INDEX.forEach(chunk => {
  const tokens = tokenize(chunk.text);
  chunk.vec = termFreqVector(tokens);
});

// ===== GEMINI API =====
async function callGeminiAPI(prompt) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  if (!GEMINI_API_KEY) {
    console.warn("⚠️ GEMINI_API_KEY not configured - using fallback mode");
    throw new Error("GEMINI_API_KEY not configured");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
  
  console.log("🤖 Calling Gemini API...");
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Gemini API error:", response.status, errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    console.log("✅ Gemini API response received");
    return data.candidates[0].content.parts[0].text;
  }
  
  throw new Error("Unexpected response format from Gemini API");
}

// ===== PAIN POINT DETECTION =====
function detectPainPoint(question) {
  const painKeywords = [
    'مشكلة', 'صعوبة', 'لا أستطيع', 'لا يمكنني', 'تحدي', 'لا نستطيع',
    'خطأ', 'فشل', 'نفقد', 'problem', 'issue', 'can\'t', 'cannot', 
    'struggle', 'difficult', 'losing', 'lost', 'unable', 'failing'
  ];
  
  const questionLower = question.toLowerCase();
  return painKeywords.some(keyword => questionLower.includes(keyword));
}

// ===== PROMPT BUILDER =====
function buildGeminiPrompt(question, context, industry, scenario) {
  const isPainPoint = detectPainPoint(question);
  
  let prompt = "";
  
  if (isPainPoint) {
    prompt = `أنت مستشار مبيعات خبير في حلول Zoho. عميل يواجه مشكلة محددة ويحتاج حل عملي.

**المشكلة التي يواجهها العميل:**
${question}

**القطاع:** ${industry ? getIndustryLabel(industry) : 'غير محدد'}
**السيناريو:** ${scenario ? getScenarioLabel(scenario) : 'عام'}

**السياق من قاعدة المعرفة:**
${context}

---

**مهمتك:** قدم حلاً عملياً واضحاً يساعد مندوب المبيعات على إقناع العميل.

قدم الإجابة بهذا التنسيق:

# 🎯 الحل لمشكلتك

## 📌 المشكلة التي تواجهها
[اشرح المشكلة بوضوح وتأثيرها على العمل - 2-3 جمل]

## ✅ الحل المناسب: [اسم المنتج من Zoho]

### ما الذي يفعله هذا الحل:
[3-4 ميزات محددة تحل هذه المشكلة بالضبط]

### لماذا يناسب عملك:
- 💰 **العائد المالي:** [مثال محدد]
- ⏱️ **توفير الوقت:** [مثال محدد]
- 📈 **النمو:** [مثال محدد]

## 🎤 كيف تقدم العرض للعميل:
[3 نقاط بيع رئيسية]`;

  } else {
    prompt = `أنت مستشار مبيعات خبير في منتجات Zoho.

**السؤال:**
${question}

**السياق من قاعدة المعرفة:**
${context}

---

قدم دليل شامل لمندوب المبيعات عن هذا المنتج متضمناً: ما هو، لمن، متى نقدمه، وعبارة بيع سريعة.`;
  }
  
  return prompt;
}

// ===== ASK ENDPOINT =====
app.post("/ask", ensureAuth, async (req, res) => {
  const { question, industry, scenario, top_k = 6, use_gemini = true } = req.body || {};
  
  if (!question) {
    return res.status(400).json({ error: "question required" });
  }

  console.log(`📝 Question received: "${question.substring(0, 50)}..."`);
  console.log(`🔧 Config: industry=${industry}, scenario=${scenario}, use_gemini=${use_gemini}`);

  try {
    // 1. Search knowledge base
    const qtokens = tokenize(question);
    const qvec = termFreqVector(qtokens);

    const scored = INDEX.map((c) => ({
      id: c.id,
      file: c.file,
      chunk_index: c.chunk_index,
      text: c.text,
      score: cosine(qvec, c.vec),
    }))
      .sort((a, b) => b.score - a.score)
      .slice(0, top_k);

    const relevant = scored.filter((s) => s.score > 0.01);
    
    let lowConfidence = false;
    if (relevant.length === 0 && scored.length > 0) {
      relevant.push(scored[0]);
      lowConfidence = true;
    }

    console.log(`📊 Found ${relevant.length} relevant chunks`);

    // 2. Build context
    const context = relevant.map(chunk => chunk.text).join("\n\n");

    // 3. Generate answer
    let answer = "";
    let aiPowered = false;
    
    if (use_gemini && process.env.GEMINI_API_KEY) {
      try {
        const prompt = buildGeminiPrompt(question, context, industry, scenario);
        answer = await callGeminiAPI(prompt);
        aiPowered = true;
      } catch (geminiError) {
        console.error("⚠️ Gemini failed, using fallback:", geminiError.message);
        answer = buildFallbackAnswer(question, relevant, industry, scenario);
      }
    } else {
      console.log("ℹ️ Using fallback mode (Gemini disabled)");
      answer = buildFallbackAnswer(question, relevant, industry, scenario);
    }

    console.log("✅ Answer generated successfully");

    res.json({ 
      answer_ar: answer, 
      low_confidence: lowConfidence,
      ai_powered: aiPowered,
      query_mode: detectPainPoint(question) ? "pain-point" : "discovery",
      sources: relevant.map(s => ({
        file: path.basename(s.file),
        chunk_index: s.chunk_index,
        score: s.score
      }))
    });

  } catch (error) {
    console.error("❌ Error in /ask:", error);
    res.status(500).json({ 
      error: "حدث خطأ في معالجة السؤال",
      details: error.message 
    });
  }
});

// ===== FALLBACK ANSWER =====
function buildFallbackAnswer(question, relevantChunks, industry, scenario) {
  let answer = `# الإجابة على سؤالك\n\n`;
  answer += `**السؤال:** ${question}\n\n`;
  
  if (industry) answer += `**القطاع:** ${getIndustryLabel(industry)}\n`;
  if (scenario) answer += `**السيناريو:** ${getScenarioLabel(scenario)}\n`;
  
  answer += `\n## المعلومات من قاعدة المعرفة:\n\n`;
  
  relevantChunks.forEach((chunk, idx) => {
    answer += `### ${idx + 1}. من ${path.basename(chunk.file)}\n\n`;
    answer += `${chunk.text}\n\n`;
  });
  
  return answer;
}

// ===== HELPER FUNCTIONS =====
function getIndustryLabel(industry) {
  const labels = {
    "retail": "التجزئة والتجارة الإلكترونية",
    "logistics": "الخدمات اللوجستية",
    "fintech": "التكنولوجيا المالية",
    "tourism": "السياحة والضيافة",
    "realestate": "العقارات والإنشاءات",
    "health": "الرعاية الصحية"
  };
  return labels[industry] || industry;
}

function getScenarioLabel(scenario) {
  const labels = {
    "discovery": "اكتشاف الاحتياجات",
    "objection": "معالجة الاعتراضات",
    "value": "توضيح القيمة",
    "recommend": "اختيار التطبيق المناسب",
    "workflow": "حل مشكلة تشغيلية",
    "closing": "إغلاق الصفقة"
  };
  return labels[scenario] || scenario;
}

// ===== HEALTH CHECK =====
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    uptime: process.uptime(), 
    timestamp: Date.now(),
    gemini_configured: !!process.env.GEMINI_API_KEY,
    auth_enabled: true
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`🔐 Auth: Enabled`);
  console.log(`🤖 Gemini AI: ${process.env.GEMINI_API_KEY ? '✅ Enabled' : '❌ Disabled (fallback mode)'}`);
  console.log(`📚 Knowledge Base: ${INDEX.length} chunks loaded\n`);
});
