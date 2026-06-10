import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
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

// API route for parsing stock out events
app.post("/api/gemini/parse-stockout", async (req, res) => {
  try {
    const { query, catalog } = req.body;
    const client = getGeminiClient();
    if (!client) {
      return res.status(200).json({
        explanation: "API Key omitted. Falling back to default match templates.",
        adjustments: []
      });
    }

    const systemInstruction = `You are an expert inventory supervisor and data cleanup engineer.
Your job is to read messy human-written descriptions about stock reduction, damages, or giveaways, and map them to actual products present in the provided catalog.
For each item identified in the description text:
1. Locate the closest matches in the catalog based on matching names and description categories.
2. Extract the physical adjustment quantity and the catalog Product ID and exact Unit.
3. Determine the disruption reason (choose only from: 'damage', 'sample', 'internal', 'return', 'adjustment').
4. Compute the value loss (quantity * product's lastPurchasePrice).
5. State the confidence level in matching the item (0-100%).

Return the results matching the configured response schema.`;

    const prompt = `Convert the following description into structured inventory adjustments.
User Description: "${query}"

Available Product Catalog:
${JSON.stringify(catalog, null, 2)}`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            explanation: {
              type: Type.STRING,
              description: "Brief summary narrative of the identified events and how they map to catalog products."
            },
            adjustments: {
              type: Type.ARRAY,
              description: "Extracted stock adjustments list.",
              items: {
                type: Type.OBJECT,
                properties: {
                  productId: { type: Type.STRING, description: "Match product ID from catalog." },
                  productName: { type: Type.STRING, description: "Catalog product name matched." },
                  quantity: { type: Type.NUMBER, description: "Stock-out subtraction amount." },
                  unit: { type: Type.STRING, description: "Product catalog measurement unit." },
                  reason: { type: Type.STRING, description: "Disruption reason tag: damage, sample, internal, return, or adjustment." },
                  valueLoss: { type: Type.NUMBER, description: "Estimated financial loss matching quantity * lastPurchasePrice." },
                  confidence: { type: Type.INTEGER, description: "Match match certainty (0 - 100 percentage)." }
                },
                required: ["productId", "productName", "quantity", "unit", "reason", "valueLoss", "confidence"]
              }
            }
          },
          required: ["explanation", "adjustments"]
        }
      }
    });

    const parsedJson = JSON.parse(response.text || "{}");
    res.json(parsedJson);
  } catch (error: any) {
    console.error("Parse stockout API error:", error);
    res.status(500).json({ error: "Failed to parse stock adjustments with AI." });
  }
});

// API route for calculating purchase splits / proportions
app.post("/api/gemini/calculate-purchase-split", async (req, res) => {
  try {
    const { prompt } = req.body;
    const client = getGeminiClient();
    if (!client) {
      return res.status(200).json({
        summary: { baseTotalBdt: 0, overheadsBdt: 0, discountsBdt: 0, grandTotalBdt: 0 },
        items: []
      });
    }

    const systemInstruction = `You are a professional cost accounting analyst and procurement controller.
Your task is to parse unstructured descriptions of supplier purchase orders/invoices (quantities, base pricing, added cargo/shipping/packing costs, rebates or discounts).
You must:
1. Identify all bought items, their quantities, and base unit purchase costs.
2. Sum the base product costs (exclusive of shipping/concessions).
3. Identify general overhead costs (e.g. carriage inwards, packing overheads, cargo, shipping fees).
4. Identify general vendor discounts or rebate adjustments.
5. Apply the general overhead additions and vendor discounts PROPORTIONALLY to each item based on its subset contribution to the base total value.
   (For example, if Item A represents 60% of base value, it absorbs 60% of transport charges and receives 60% of the discount split).
6. Compute the net True Unit Cost for each item (Base unit cost + Allocated Unit Overhead - Allocated Unit Discount).
7. Compute grand totals.

Return the results matching the configured response schema.`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Calculate proportional splits for: "${prompt}"`,
      config: {
        systemInstruction,
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.OBJECT,
              properties: {
                baseTotalBdt: { type: Type.NUMBER, description: "Sum total product costs exclusive of extra overheads." },
                overheadsBdt: { type: Type.NUMBER, description: "Added shipping, packing, freight, custom fees." },
                discountsBdt: { type: Type.NUMBER, description: "Gross concessions, rebates, vendor rebates subtracted." },
                grandTotalBdt: { type: Type.NUMBER, description: "Net cost: baseTotalBdt + overheadsBdt - discountsBdt." }
              },
              required: ["baseTotalBdt", "overheadsBdt", "discountsBdt", "grandTotalBdt"]
            },
            items: {
              type: Type.ARRAY,
              description: "Itemised list with proportional cost factors mapped.",
              items: {
                type: Type.OBJECT,
                properties: {
                  itemName: { type: Type.STRING, description: "Target product label." },
                  quantity: { type: Type.NUMBER, description: "Purchased parcel quantities." },
                  baseUnitCostBdt: { type: Type.NUMBER, description: "Supplier's invoice list price per unit." },
                  overheadFractionBdt: { type: Type.NUMBER, description: "Proportional cost division of packaging/freight added per unit." },
                  calculatedNetUnitCostBdt: { type: Type.NUMBER, description: "Net unit cost: baseUnitCostBdt + allocated overhead per unit - allocated discount per unit." }
                },
                required: ["itemName", "quantity", "baseUnitCostBdt", "overheadFractionBdt", "calculatedNetUnitCostBdt"]
              }
            }
          },
          required: ["summary", "items"]
        }
      }
    });

    const parsedJson = JSON.parse(response.text || "{}");
    res.json(parsedJson);
  } catch (error: any) {
    console.error("Proportion cost calculator API error:", error);
    res.status(500).json({ error: "Failed to estimate proportional splits with AI." });
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
