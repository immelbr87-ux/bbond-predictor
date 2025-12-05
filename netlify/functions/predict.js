// netlify/functions/predict.js

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { product } = JSON.parse(event.body || '{}');
    if (!product) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing "product" in request body' }),
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server not configured with API key' }),
      };
    }

    const prompt = `
You are an expert in used-market pricing (like Reverb, StockX, eBay, and Facebook Marketplace combined).

Given a product the user is thinking of buying NEW, estimate:
- What it will likely be worth used in about 90 days
- How strong demand will be on the used market
- How confident you are in this estimate
- The best resale window
- Condition-based pricing bands

Return ONLY valid JSON with this exact shape:

{
  "productTitle": "string",
  "valueRange": "string, like \"$250–$290\"",
  "demandScore": 0-100,
  "confidenceScore": 0-100,
  "resaleWindow": "string",
  "conditionPricing": [
    { "tier": "A1", "range": "string" },
    { "tier": "A2", "range": "string" },
    { "tier": "B1", "range": "string" },
    { "tier": "B2", "range": "string" }
  ],
  "summary": "1–3 sentence summary explaining the estimate to a normal person."
}

Product description:
"${product}"
    `.trim();

    // Call OpenAI Chat Completions API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a precise, honest used-market pricing assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('OpenAI error:', text);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'OpenAI API error', details: text }),
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Try to parse the JSON from the model's response
    let parsed;
    try {
      // Sometimes the model might wrap JSON in ```json ``` fences; strip them.
      const cleaned = content.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error('Failed to parse JSON from model:', content);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to parse AI response as JSON' }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    console.error('Unexpected error in predict function:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unexpected server error' }),
    };
  }
}
