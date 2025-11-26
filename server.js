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

// ===== DEMO KNOWLEDGE BASE =====
const INDEX = [
  {
    id: "zoho_1",
    file: "zoho-crm-intro.md",
    chunk_index: 0,
    text: "Zoho CRM هو نظام إدارة علاقات العملاء (CRM) الشامل الذي يساعد الشركات على تنظيم وإدارة عمليات المبيعات والتسويق والخدمات. يوفر Zoho CRM أدوات قوية لتتبع العملاء والفرص والعروض والعقود.",
    vec: {}
  },
  {
    id: "zoho_2",
    file: "zoho-crm-features.md",
    chunk_index: 0,
    text: "من أهم ميزات Zoho CRM: إدارة جهات الاتصال، تتبع الفرص البيعية، أتمتة العمليات، التقارير والتحليلات، التكامل مع تطبيقات أخرى، وتطبيقات الهاتف الذكي.",
    vec: {}
  },
  {
    id: "zoho_3",
    file: "zoho-books-accounting.md",
    chunk_index: 0,
    text: "Zoho Books هو برنامج محاسبة وتمويل سحابي يساعد الشركات الصغيرة والمتوسطة على إدارة فواتيرهم ونفقاتهم وشؤونهم المالية. يدعم Zoho Books إنشاء الفواتير والنفقات والتقارير المالية.",
    vec: {}
  },
  {
    id: "zoho_4",
    file: "zoho-inventory-management.md",
    chunk_index: 0,
    text: "Zoho Inventory هو نظام إدارة المخزون الذي يساعد على تتبع المنتجات والمستودعات والمبيعات والشراء. يوفر تقارير فورية عن حالة المخزون والمنتجات الأكثر مبيعاً.",
    vec: {}
  },
  {
    id: "zoho_5",
    file: "zoho-getting-started.md",
    chunk_index: 0,
    text: "للبدء مع Zoho CRM، تحتاج إلى: إنشاء حساب Zoho مجاني، تسجيل الدخول إلى لوحة التحكم، إضافة جهات اتصال، وإنشاء فرص بيعية. يمكنك بدء النسخة المجانية دون الحاجة إلى بطاقة ائتمان.",
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
      // Fallback to local answer building
      answer = buildComprehensiveAnswer(question, relevant, industry, scenario);
    }

    res.json({ 
      answer_ar: answer, 
      low_confidence: lowConfidence,
      ai_powered: use_gemini && !!process.env.GEMINI_API_KEY,
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

// ===== GEMINI PROMPT BUILDER =====
function buildGeminiPrompt(question, context, industry, scenario) {
  let prompt = `أنت مساعد مبيعات خبير في منتجات Zoho. مهمتك الإجابة على أسئلة العملاء بطريقة شاملة واحترافية باللغة العربية.\n\n`;
  
  if (industry) {
    prompt += `القطاع: ${getIndustryLabel(industry)}\n`;
  }
  if (scenario) {
    prompt += `نوع السؤال: ${getScenarioLabel(scenario)}\n`;
  }
  
  prompt += `\nالسياق من قاعدة المعرفة:\n${context}\n\n`;
  prompt += `السؤال: ${question}\n\n`;
  prompt += `قدم إجابة شاملة ومنظمة تتضمن:\n`;
  prompt += `1. ملخص تنفيذي\n`;
  prompt += `2. شرح تفصيلي\n`;
  prompt += `3. خطوات التطبيق\n`;
  prompt += `4. المشاكل الشائعة وحلولها\n`;
  prompt += `5. النتائج المتوقعة\n`;
  prompt += `6. التفاصيل التقنية\n\n`;
  prompt += `استخدم تنسيق Markdown والعناوين والقوائم لجعل الإجابة واضحة ومنظمة.`;
  
  return prompt;
}

// ===== FALLBACK LOCAL ANSWER BUILDER =====
function buildComprehensiveAnswer(question, relevantChunks, industry, scenario) {
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
  console.log(`Gemini AI: ${process.env.GEMINI_API_KEY ? 'Enabled' : 'Disabled'}`);
});