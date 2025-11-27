import express from "express";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the `public` directory
const publicDir = path.join(process.cwd(), "public");
app.use(express.static(publicDir));

// Root route: serve `public/index.html`
app.get("/", (req, res) => {
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

// ===== ENHANCED KNOWLEDGE BASE =====
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

// ===== GEMINI API INTEGRATION =====
async function callGeminiAPI(prompt) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not found in environment variables");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
  
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
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    return data.candidates[0].content.parts[0].text;
  }
  
  throw new Error("Unexpected response format from Gemini API");
}

// ===== HELPER: DETECT PAIN POINT =====
function detectPainPoint(question) {
  const painKeywords = [
    'مشكلة', 'صعوبة', 'لا أستطيع', 'لا يمكنني', 'تحدي', 'لا نستطيع',
    'خطأ', 'فشل', 'نفقد', 'problem', 'issue', 'can\'t', 'cannot', 
    'struggle', 'difficult', 'losing', 'lost', 'unable', 'failing'
  ];
  
  const questionLower = question.toLowerCase();
  return painKeywords.some(keyword => questionLower.includes(keyword));
}

// ===== IMPROVED GEMINI PROMPT BUILDER =====
function buildGeminiPrompt(question, context, industry, scenario) {
  const isPainPoint = detectPainPoint(question);
  
  let prompt = "";
  
  if (isPainPoint) {
    // MODE 1: Pain-Point Solution (What & Why for THIS client)
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
- 💰 **العائد المالي:** [مثال: توفير X% من التكاليف، زيادة Y% في الإيرادات]
- ⏱️ **توفير الوقت:** [مثال: تقليل Z ساعة أسبوعياً]
- 📈 **النمو:** [مثال: القدرة على التوسع دون تعقيدات]

## ⏰ لماذا الآن؟
- ✓ المشكلة تكلفك خسائر يومية
- ✓ التطبيق سريع (1-2 أسبوع)
- ✓ يمكنك التجربة مجاناً لمدة 14 يوم

## 🎤 كيف تقدم العرض للعميل:
**جملة الافتتاح:**
"[جملة قوية واحدة تلخص الحل - يجب أن تكون مباشرة ومؤثرة]"

**نقاط البيع الرئيسية:**
1. [نقطة بيع قوية]
2. [نقطة بيع قوية]
3. [نقطة بيع قوية]

---
**مهم:** اجعل الإجابة عملية وقابلة للتطبيق فوراً. استخدم أرقام محددة من السياق.`;

  } else {
    // MODE 2: General Discovery (What, To Whom, When)
    prompt = `أنت مستشار مبيعات خبير في منتجات Zoho. مندوب مبيعات يريد معلومات عامة عن منتج لاستكشاف الفرص.

**السؤال:**
${question}

**القطاع:** ${industry ? getIndustryLabel(industry) : 'غير محدد'}

**السياق من قاعدة المعرفة:**
${context}

---

**مهمتك:** قدم دليل شامل لمندوب المبيعات عن هذا المنتج.

قدم الإجابة بهذا التنسيق:

# 📱 [اسم المنتج] - دليل البيع السريع

## 1️⃣ ما هو المنتج (What)
**الوصف في جملة واحدة:**
[جملة واحدة واضحة]

**الميزات الأساسية:**
- ✓ [ميزة 1]
- ✓ [ميزة 2]
- ✓ [ميزة 3]
- ✓ [ميزة 4]

## 2️⃣ لمن نقدمه (To Whom)

### العملاء المثاليون:
**القطاعات الأنسب:**
1. **[قطاع 1]** - حجم الشركة: [X-Y موظف]
2. **[قطاع 2]** - حجم الشركة: [X-Y موظف]

### علامات العميل المثالي:
- 🎯 [علامة 1]
- 🎯 [علامة 2]
- 🎯 [علامة 3]

## 3️⃣ متى نقدمه (When)

### إشارات الشراء (Buying Signals):
استمع لهذه الجمل من العميل:
- ✅ "[جملة محددة]"
- ✅ "[جملة محددة]"
- ✅ "[جملة محددة]"

## 4️⃣ عبارة البيع السريعة
"[جملة واحدة قوية تفتح المحادثة - 15-20 كلمة]"

---
**مهم:** اجعل الإجابة عملية وسهلة الحفظ لمندوب المبيعات.`;
  }
  
  return prompt;
}

// ===== ASK ENDPOINT WITH AI =====
app.post("/ask", async (req, res) => {
  const { question, industry, scenario, top_k = 6, use_gemini = true } = req.body || {};
  if (!question) return res.status(400).json({ error: "question required" });

  try {
    // 1. Search local knowledge base
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

    // 2. Build context from knowledge base
    const context = relevant.map(chunk => chunk.text).join("\n\n");

    // 3. Use Gemini AI if enabled
    let answer = "";
    
    if (use_gemini && process.env.GEMINI_API_KEY) {
      const prompt = buildGeminiPrompt(question, context, industry, scenario);
      answer = await callGeminiAPI(prompt);
    } else {
      answer = buildFallbackAnswer(question, relevant, industry, scenario);
    }

    res.json({ 
      answer_ar: answer, 
      low_confidence: lowConfidence,
      ai_powered: use_gemini && !!process.env.GEMINI_API_KEY,
      query_mode: detectPainPoint(question) ? "pain-point" : "discovery",
      sources: relevant.map(s => ({
        file: path.basename(s.file),
        chunk_index: s.chunk_index,
        score: s.score
      }))
    });

  } catch (error) {
    console.error("Error in /ask:", error);
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
  
  answer += `## المصادر:\n\n`;
  relevantChunks.forEach((chunk, idx) => {
    answer += `${idx + 1}. **${path.basename(chunk.file)}** - درجة التطابق: ${(chunk.score * 100).toFixed(1)}%\n`;
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

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    uptime: process.uptime(), 
    timestamp: Date.now(),
    gemini_configured: !!process.env.GEMINI_API_KEY
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Gemini AI: ${process.env.GEMINI_API_KEY ? 'Enabled ✅' : 'Disabled ❌'}`);
});
