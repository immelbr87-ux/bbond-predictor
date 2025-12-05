// netlify/functions/predict.js

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

exports.handler = async (event, context) => {
  // Allow only POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  if (!OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY env var");
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server not configured (missing API key)" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const productText = (body.productText || "").trim();

  if (!productText) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "productText is required" }),
    };
  }

  try {
    // Call OpenAI "responses" endpoint directly with fetch
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: `
You are an expert in used-market pricing and resale behavior.

Given a short product description, estimate:

1. predicted used value range in 90 days (low and high USD)
2. demand score (0-100)
3. confidence score (0-100)
4. best resale window (short human sentence)
5. condition-based pricing:
   - A1 (like new)
   - A2 (very good)
   - B1 (good)
   - B2 (fair but fully functional)
6. a short summary sentence.

Important: 
- You MUST respond with a single JSON object ONLY. 
- No extra text, no explanation, no markdown.

The JSON shape MUST be:

{
  "productTitle": "string",
  "valueRange": "string, like \"$250 – $300\"",
  "demandScore": number,
  "confidenceScore": number,
  "resaleWindow": "string",
  "conditionPricing": [
    { "tier": "A1", "range": "string" },
    { "tier": "A2", "range": "string" },
    { "tier": "B1", "range": "string" },
    { "tier": "B2", "range": "string" }
  ],
  "summary": "string"
}
            `.trim()
          },
          {
            role: "user",
            content: `Product: ${productText}`
          }
        ],
        // Tell it we want JSON back
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI API error:", errText);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "OpenAI API error", details: errText })
      };
    }

    const data = await response.json();

    // The "output" field holds response content; for responses API,
    // the model's JSON will usually be in data.output[0].content[0].text;
    // but we'll handle a couple variants defensively.
    let rawText = "";

    try {
      const firstOutput = data.output && data.output[0];
      const firstContent = firstOutput && firstOutput.content && firstOutput.content[0];
      rawText = (firstContent && firstContent.text) || "";
    } catch (e) {
      console.error("Error extracting rawText from OpenAI response:", e, data);
    }

    if (!rawText) {
      console.error("Empty model response:", data);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Empty model response" })
      };
    }

    let prediction;
    try {
      prediction = JSON.parse(rawText);
    } catch (e) {
      console.error("Failed to parse JSON from model response:", rawText);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to parse JSON from model", raw: rawText })
      };
    }

    // Basic sanity check
    if (!prediction.productTitle || !prediction.valueRange) {
      console.error("Prediction missing expected fields:", prediction);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Prediction missing fields", prediction })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prediction)
    };

  } catch (err) {
    console.error("Server error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server error", details: String(err) })
    };
  }
};
