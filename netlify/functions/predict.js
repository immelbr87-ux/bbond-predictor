// netlify/functions/predict.js

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY env var');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server not configured (missing API key)' })
      };
    }

    const body = JSON.parse(event.body || '{}');
    const productText = body.productText && body.productText.trim();

    if (!productText) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'productText is required' })
      };
    }

    // Call OpenAI directly with fetch (no openai npm package)
    const prompt = `
You are an expert in used-market pricing.

Given the following product description or link:

"${productText}"

Estimate its resale behavior and respond ONLY with a JSON object with this shape:

{
  "productTitle": "string",
  "valueRange": "$low – $high",
  "demandScore": number (0-100),
  "confidenceScore": number (0-100),
  "resaleWindow": "string sentence about best time to resell",
  "conditionPricing": [
    { "tier": "A1", "range": "$high1 – $high2" },
    { "tier": "A2", "range": "$..." },
    { "tier": "B1", "range": "$..." },
    { "tier": "B2", "range": "$..." }
  ],
  "summary": "one-sentence summary of resale behavior"
}

Return ONLY valid JSON, no extra text.
    `.trim();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: 'You are a precise used-market pricing assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'OpenAI API error', details: errorText })
      };
    }

    const data = await response.json();
    const rawText = data.choices[0].message.content;

    let prediction;
    try {
      prediction = JSON.parse(rawText);
    } catch (e) {
      console.error('Failed to parse JSON from model:', rawText);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Model returned invalid JSON' })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prediction })
    };
  } catch (err) {
    console.error('Unexpected error in predict function:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unexpected server error' })
    };
  }
};
