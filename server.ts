import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize server-side Gemini client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY is not defined. AI explanations will fall back to local templates.");
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// API route for AI Attendance Analysis (calls Gemini API)
app.post("/api/gemini/analyze-attendance", async (req, res) => {
  try {
    const { month, employees, attendanceLogs, rules } = req.body;
    
    const client = getGeminiClient();
    if (!client) {
      return res.status(200).json({
        analysis: `### ⚠️ Configuration Required
Your **GEMINI_API_KEY** is not configured yet. Please add it via **Settings > Secrets** in AI Studio.

Here is a quick overview of your metrics for **${month}**:
- Overall attendance is logged, but interactive AI coaching summary requires a working Gemini API key to run deep diagnostics.
- Lateness rules and lunchtime time deductions are fully active and computed in real-time below!`
      });
    }

    // Process attendance data to provide compact summary for prompt
    const employeeSummary = employees.map((emp: any) => {
      const records = attendanceLogs.filter((a: any) => a.employeeId === emp.id);
      
      let storeLateMinutes = 0;
      let lunchLateMinutes = 0;
      let halfDayCount = 0;
      let presentCount = 0;

      records.forEach((rec: any) => {
        if (rec.status === "half-day") halfDayCount++;
        if (rec.status === "present" || rec.status === "late" || rec.status === "half-day") presentCount++;
        
        // Calculate daily lateness
        if (rec.checkIn && rec.checkIn > "09:00") {
          const [h, m] = rec.checkIn.split(":").map(Number);
          if (!isNaN(h) && !isNaN(m)) {
            const minutes = h * 60 + m - 540; // past 09:00 AM
            if (minutes > 0) storeLateMinutes += minutes;
          }
        }

        // Calculate lunch lateness
        if (rec.lunchOut && rec.lunchIn) {
          try {
            const [outH, outM] = rec.lunchOut.split(":").map(Number);
            const [inH, inM] = rec.lunchIn.split(":").map(Number);
            if (!isNaN(outH) && !isNaN(outM) && !isNaN(inH) && !isNaN(inM)) {
              const diff = (inH * 60 + inM) - (outH * 60 + outM);
              const limit = rules.lunchDurationLimit ?? 60;
              if (diff > limit) {
                lunchLateMinutes += (diff - limit);
              }
            }
          } catch (e) {}
        }
      });

      const hourlyRate = (emp.salary || 0) / 208; // 26 days * 8 hours
      const minuteWage = hourlyRate / 60;
      const totalWastedMinutes = storeLateMinutes + lunchLateMinutes;
      const dynamicDeduction = totalWastedMinutes * minuteWage;

      return {
        name: emp.name,
        role: emp.role,
        monthlySalaryBdt: emp.salary,
        presentDays: presentCount,
        halfDays: halfDayCount,
        storeLateMinutes,
        lunchLateMinutes,
        totalWastedMinutes,
        calculatedDeductionBdt: Math.round(dynamicDeduction)
      };
    });

    const overallWastedHrs = Math.round(employeeSummary.reduce((sum: number, e: any) => sum + e.totalWastedMinutes, 0) / 60 * 10) / 10;
    const overallDeduction = Math.round(employeeSummary.reduce((sum: number, e: any) => sum + e.calculatedDeductionBdt, 0));

    const systemInstruction = `You are a professional retail and shop consulting strategist and senior payroll analyst.
Your job is to analyze the monthly store attendance log, identify productivity issues, and explain time wastage, daily store tardiness, and lunch-break overtime leaks to the store-owner.
Return your response ONLY as highly elegant, beautifully formatted Markdown. Use bold styling, clear tables, and lists. Do not use generic filler language. Speak directly, objectively, and construct an actionable business summary.`;

    const prompt = `Please analyze this store attendance and time wastage report for the month of **${month}**.
    
    ### Store Operations Rules:
    - Shift Start Time: 09:00 AM (Check-ins after are late)
    - Allowed Lunch Break: ${rules.lunchDurationLimit ?? 60} minutes
    - Expected Hours/Day: 8 hours
    
    ### Group Level Totals:
    - Total Time Wasted: ${overallWastedHrs} hours
    - Total Calculated Salary Deductions: ${overallDeduction} BDT
    
    ### Individual Performance Metrics:
    ${JSON.stringify(employeeSummary, null, 2)}
    
    Please write:
    1. **Overview**: Key insights into shop discipline.
    2. **Time and Money Loss Breakdown**: Deep dive into daily store check-in lateness vs. lunch break exceedances (overtime breaches). Mention who are the main drivers of productivity leaks.
    3. **Actionable Recommendations**: Clear, actionable, friendly, professional steps to improve shop operations (e.g. tracking systems, employee motivation, or adjusting break windows) and avoid wasting resources.`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    res.json({ analysis: response.text });
  } catch (error: any) {
    console.error("Gemini analysis error:", error);
    res.status(500).json({ error: "Failed to generate AI analysis report." });
  }
});

// Server check-in/out endpoints or assets
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
