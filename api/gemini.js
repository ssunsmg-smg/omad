export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });
 
  try {
    const { prompt } = req.body;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: '당신은 OMAD(한영주류 영업팀) 마케팅 콘텐츠 생성기입니다. 반드시 JSON만 반환하고 마크다운 코드블록 없이 순수 JSON만 출력하세요.',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || '오류' });
 
    // Claude 응답을 Gemini 형식처럼 변환
    const text = data.content.map(c => c.text || '').join('');
    return res.status(200).json({
      candidates: [{ content: { parts: [{ text }] } }]
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
 
