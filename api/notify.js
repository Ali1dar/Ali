export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, title, body, requestId } = req.body;
  if (!token) return res.status(400).json({ error: 'No token' });

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title: title || 'دليلك الدوائي',
        body: body || '',
        sound: 'default',
        priority: 'high',
        channelId: 'default',
        data: { requestId: requestId || '' },
      }),
    });

    const result = await response.json();
    console.log('Result:', result);
    res.status(200).json(result);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
