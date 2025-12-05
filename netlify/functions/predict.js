// netlify/functions/predict.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const productText = (body.productText || "").trim();

    if (!productText) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "productText is required" }),
      };
    }

    // 🔮 Call OpenAI to get a prediction
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: `
You are an expert in used-market pricing.

Given this product description:
"${productText}"

Return ONLY a JSON object with these fields:
- productTitle (string)
- valueRange (string, e.g. "$260 – $310")
- demandScore (integer 0–100)
- confidenceScore (integer 0–100)
- resaleWindow (string sentence)
- summary (string sentence)
- conditionPricing (array of objects: { tier: "A1"|"A2"|"B1"|"B2", range: "$X – $Y" })
      `,
      response_format: { type: "json_object" },
    });

    const content = response.output[0].content[0].text; // already JSON
    const prediction = JSON.parse(content);

    return {
      statusCode: 200,
      body: JSON.stringify(prediction),
    };
  } catch (err) {
    console.error("Predict error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "OpenAI API error",
        details: err.message || String(err),
      }),
    };
  }
}
