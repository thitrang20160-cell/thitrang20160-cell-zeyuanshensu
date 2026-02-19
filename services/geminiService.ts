import { GoogleGenAI } from "@google/genai";
import { CaseData, GlobalSettings, ReferenceCase } from "../types";

// --- DEEPSEEK IMPLEMENTATION ---
const callDeepSeek = async (apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> => {
  if (!apiKey) throw new Error("DeepSeek API Key 未配置");

  // DeepSeek uses an OpenAI-compatible API
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "deepseek-chat", // V3 model, fast and intelligent
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      stream: false,
      temperature: 0.7,
      max_tokens: 8192
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`DeepSeek API Error: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "DeepSeek returned empty content.";
};

// --- GOOGLE GEMINI IMPLEMENTATION ---
const callGemini = async (apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> => {
  if (!apiKey) throw new Error("Google Gemini API Key 未配置");
  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    config: {
      maxOutputTokens: 8192,
      temperature: 0.7
    },
    contents: [
      { role: 'user', parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
    ]
  });
  return response.text || "Generating failed.";
};

// --- MAIN FACTORY ---
export const generatePOA = async (
  apiKey: string, 
  data: Partial<CaseData>, 
  settings: GlobalSettings,
  riskAnalysisReasons: string[],
  fileEvidence: string,
  similarCase?: ReferenceCase
): Promise<string> => {

  const provider = settings.selectedProvider || 'gemini';
  const effectiveKey = provider === 'deepseek' ? settings.deepseekKey : settings.apiKey;

  if (!effectiveKey) {
    throw new Error(`请先配置 ${provider === 'deepseek' ? 'DeepSeek' : 'Gemini'} API Key`);
  }

  const isODR = data.isODRSuspension === true;

  // --- 1. Construct the "Logic Core" (Reasoning Strategy) ---
  let logicStrategy = "";
  if (similarCase) {
    logicStrategy = `
    **REFERENCE LOGIC CLONING**:
    You have a successful reference case (ID: ${similarCase.id}).
    Please ADAPT its core arguments to the current situation, but CHANGE the specific details (dates, names) to match the current case.
    Core Logic to Clone: ${similarCase.content.substring(0, 300)}...
    `;
  } else {
    // Fallback based on violation type from settings
    if (data.violationType === 'Performance') logicStrategy = settings.strategyLogistics;
    else if (data.violationType === 'IP') logicStrategy = settings.strategyIP;
    else logicStrategy = settings.strategyGeneral;
  }

  // --- 2. The V5 System Prompt ---
  let systemPrompt = "";

  if (isODR) {
    // === ODR SPECIFIC PROMPT (Strict Character Limits) ===
    systemPrompt = `
You are a **Senior Walmart Appeal Specialist**.
The user is facing an **ODR / Delivery Performance Suspension** (Self-Fulfilled).
This specific appeal format requires THREE separate text blocks.

**CRITICAL CONSTRAINT: CHARACTER LIMIT**
- Each section must be **between 700 and 950 characters** (approx. 120-160 words).
- DO NOT exceed 1000 characters per section under any circumstances.
- Be concise, direct, and data-driven.

**CORE LOGIC (V5 Standard)**:
1.  **3-Point Failure**: Address Operational, Technical, AND Management failures.
2.  **Evidence Binding**: You MUST cite specific **Order IDs** or **Tracking Numbers** from the raw data.
3.  **Auto-Generated Details**: You MUST invent realistic names (e.g., Mr. Wang), specific dates, and tool names (e.g., ShipStation).

**OUTPUT FORMAT**:
You must strictly output the response in this format:

[SECTION 1: ROOT CAUSE]
(Write the root cause analysis here. Focus on the 3 layers of failure. Cite Order IDs. Max 950 chars.)

[SECTION 2: IMMEDIATE ACTIONS]
(Write the immediate actions here. Focus on refunds, contacting buyers, upgrading carriers. Use bullet points if space permits. Max 950 chars.)

[SECTION 3: FUTURE PLANS]
(Write the preventative measures here. Focus on the specific person, specific time, and specific tool logic. Max 950 chars.)

${logicStrategy ? `**STRATEGY GUIDE**: ${logicStrategy}` : ''}
    `;
  } else {
    // === STANDARD PROMPT (Strict 7-Section Structure) ===
    systemPrompt = `
You are a **Senior Litigation Attorney & Data Analyst** for Walmart Sellers.
Your goal is to write a highly professional, structured Plan of Action (POA).

**STRICT STRUCTURE REQUIREMENT**:
You MUST explicitly follow this 7-part structure. Use standard headings (e.g., **I. Opening**).

1.  **Opening Statement** (开头):
    - Acknowledge the suspension notification.
    - State the store name and company name clearly.
    - Express sincere regret and full responsibility.

2.  **Root Cause Analysis** (分析原因):
    - **MANDATORY**: Analyze the failure from **3 distinct layers** (Operational, Technical, Management).
    - **Evidence Binding**: Cite specific Order IDs from the raw data here.

3.  **Immediate Actions Taken** (针对原因已采取的措施):
    - **QUANTITY RULE**: You MUST provide a numbered list of **AT LEAST 5 DISTINCT ACTIONS**.
    - **Scope**: Cover refunds, deleting listings, staff meetings, reviewing inventory, and technical audits.
    - Use past tense (e.g., "We immediately refunded...").
    - **DO NOT be brief.** Explain *why* each action was taken.

4.  **Future Preventative Plan** (未来计划 - Strategy):
    - **QUANTITY RULE**: You MUST provide a numbered list of **AT LEAST 5 DISTINCT LONG-TERM MEASURES**.
    - **Scope**: New Software (ERP/WMS), New Supplier vetting workflows, Ongoing Staff training schedules, Quality Control (QC) steps, Packaging improvements.
    - Focus on the "Process" and "Systemic Changes".

5.  **Plan Implementation Details** (计划细节 - Execution):
    - **CRITICAL**: This section serves to PROVE the "Future Plan" is real.
    - **MAPPING**: For every point in Section 4, provide a specific execution detail here.
    - **Auto-Generate Specifics**:
      - "Compliance Manager **Mr. [Realistic Name]** has been appointed..."
      - "We have subscribed to **[Tool Name e.g., ShipStation/Sellbrite/Helium10]** on **[Date]**."
      - "New training protocol effective as of **${new Date().toLocaleDateString()}**."
      - "We engaged **[Law Firm Name or Agency]** for IP audits."

6.  **Conclusion** (总结):
    - Reiterate commitment to Walmart's policies.
    - Request reinstatement politely.

7.  **Signature** (落款):
    - [Company Name]
    - [Store Name]
    - [Date]

**TONE & STYLE**:
- Formal, Objective, Contrite.
- No Markdown code blocks (no \`\`\`), just clean text with headers.
- **Deep Content**: Do not write short sentences. Expand on every point to show effort.

${logicStrategy ? `**STRATEGY GUIDE**: Follow this logic path: ${logicStrategy}` : ''}
    `;
  }

  // --- 3. The User Prompt (Context Injection) ---
  const userPrompt = `
**CASE METADATA:**
- Store: ${data.storeName || '[Store Name]'}
- Company: ${data.companyName || '[Company Name]'}
- Violation: ${data.violationType}
- Appeal Type: ${isODR ? "ODR / Delivery Performance (Strict Character Limit)" : "Standard Account Suspension (7-Section Structure)"}
- Root Cause Hint: ${data.sellerExplanation || "Please deduce based on violation type"}
- User Actions: ${data.actionsTaken || "Please propose standard industry fixes"}

**EVIDENCE POOL (RAW DATA):**
${fileEvidence ? fileEvidence : "No file provided. Please use realistic placeholders [Order #XXX]."}

**WALMART NOTICE:**
"""
${data.suspensionEmail}
"""

**INSTRUCTION:**
Draft the full POA now.
${isODR ? 
  "Strictly follow the 3-section format with character limits." : 
  "Strictly follow the 7-section format. REMEMBER: Section 3 and 4 MUST have at least 5 bullet points each. Section 5 MUST contain specific names, tools, and dates."
}
  `;

  try {
    if (provider === 'deepseek') {
      return await callDeepSeek(effectiveKey, systemPrompt, userPrompt);
    } else {
      return await callGemini(effectiveKey, systemPrompt, userPrompt);
    }
  } catch (error: any) {
    console.error(`${provider} API Error:`, error);
    throw new Error(`${provider === 'deepseek' ? 'DeepSeek' : 'Gemini'} 错误: ${error.message}`);
  }
};

export const generateCNExplanation = async (apiKey: string, poa: string, email: string): Promise<string> => {
  let provider = 'gemini';
  let effectiveKey = apiKey;

  try {
    const saved = localStorage.getItem('walmart_poa_settings_v5_structured');
    if (saved) {
      const s = JSON.parse(saved);
      provider = s.selectedProvider || 'gemini';
      effectiveKey = provider === 'deepseek' ? s.deepseekKey : s.apiKey;
    }
  } catch (e) {}

  if (!effectiveKey) return "未配置 API Key，无法生成摘要。";

  const prompt = `
  请作为一名资深沃尔玛风控专家，用中文简要解读这份 POA。
  
  **任务：**
  1. **完整性核查**：检查 POA 内容是否完整。
  2. **细节核查**：
     - 是否已自动生成了具体的**负责人姓名**（如 Mr. Wang）？
     - 是否已自动生成了具体的**整改日期**？
     - 是否已自动生成了具体的**物流商名称**？
  3. **逻辑核查**：是否包含了 3 个层面的根本原因（运营/技术/管理）？
  
  请总结这份 POA 的核心整改点，并列出 AI 自动生成的这些“虚构细节”，提醒卖家确认是否需要修改（例如："AI生成了负责人 Mr. Li，请确认贵司是否有此人，或改为真实姓名"）。

  [POA Content]:
  ${poa.substring(0, 10000)} 
  `;

  try {
     if (provider === 'deepseek') {
       return await callDeepSeek(effectiveKey, "You are a helpful assistant.", prompt);
     } else {
       const ai = new GoogleGenAI({ apiKey: effectiveKey });
       const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
      return response.text || "摘要生成失败";
     }
  } catch (error) {
    return "摘要生成失败 (API Error)";
  }
};

// --- AUTO FIX POA ---
export const autoFixPOA = async (
  apiKey: string, 
  currentPOA: string,
  feedback: string,
  settings: GlobalSettings
): Promise<string> => {
  const provider = settings.selectedProvider || 'gemini';
  const effectiveKey = provider === 'deepseek' ? settings.deepseekKey : settings.apiKey;
  const keyToUse = effectiveKey || apiKey;

  if (!keyToUse) throw new Error("API Key 未配置");

  const systemPrompt = `
You are a **Senior Walmart Appeal Specialist**.
The user has a draft POA.
Your task is to REFINE it based on the feedback.

**CRITICAL INSTRUCTION FOR AUTO-GENERATION**:
If the feedback says names/dates/tools are missing, **DO NOT** ask the user. **INVENT THEM**.
- Assign a realistic name (e.g., "Manager: Mr. Chen").
- Assign a realistic date (e.g., "Implemented on: ${new Date().toLocaleDateString()}").
- Assign a realistic tool (e.g., "Upgraded to ShipStation").

**FORMAT INSTRUCTION**:
If the input POA looks like it has [SECTION 1] [SECTION 2] tags (ODR style), MAINTAIN that format and strict character limits.
Otherwise, maintain the standard 7-section letter format.

Return ONLY the full, corrected POA text. No comments.
  `;
  
  const userPrompt = `
[DRAFT POA]
${currentPOA}

[FEEDBACK]
${feedback}
  `;

  try {
    if (provider === 'deepseek') {
        return await callDeepSeek(keyToUse, systemPrompt, userPrompt);
    } else {
        return await callGemini(keyToUse, systemPrompt, userPrompt);
    }
  } catch (error: any) {
    throw new Error(`Auto-Fix Failed: ${error.message}`);
  }
};