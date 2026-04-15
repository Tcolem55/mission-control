export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { model, max_tokens, system, messages } = req.body;

    if (!messages || !messages.length) {
      return res.status(400).json({ error: 'No messages provided' });
    }

    const body = {
      model: model || 'claude-sonnet-4-6',
      max_tokens: max_tokens || 1000,
      messages,
    };

    if (system) body.system = system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Claude API error:', JSON.stringify(data));
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Claude handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
