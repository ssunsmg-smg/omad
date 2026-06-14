export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const kakaoKey = process.env.KAKAO_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { prompt, isAnalysis, address } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt 없음' });

    // 카카오 상권 데이터 수집 (상권분석 요청일 때만)
    let locationContext = '';
    if (isAnalysis && kakaoKey && address) {
      try {
        const geoRes = await fetch(
          `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
          { headers: { Authorization: `KakaoAK ${kakaoKey}` } }
        );
        const geoData = await geoRes.json();
        const doc = geoData.documents?.[0];
        if (doc) {
          const lat = doc.y, lng = doc.x;
          const roadAddr = doc.road_address?.address_name || address;
          const categories = [
            { code: 'FD6', name: '음식점' },
            { code: 'CE7', name: '카페' },
            { code: 'SW8', name: '지하철역' },
            { code: 'MT1', name: '대형마트' },
            { code: 'CS2', name: '편의점' }
          ];
          const nearby = await Promise.all(categories.map(async (cat) => {
            const r = await fetch(
              `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${cat.code}&x=${lng}&y=${lat}&radius=500&size=3`,
              { headers: { Authorization: `KakaoAK ${kakaoKey}` } }
            );
            const d = await r.json();
            const places = d.documents?.map(p => p.place_name).join(', ') || '없음';
            return `${cat.name}: ${places}`;
          }));
          const kwRes = await fetch(
            `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address)}&x=${lng}&y=${lat}&radius=1000&size=5`,
            { headers: { Authorization: `KakaoAK ${kakaoKey}` } }
          );
          const kwData = await kwRes.json();
          const landmarks = kwData.documents?.slice(0,5).map(p => `${p.place_name}(${p.category_name})`).join(', ') || '없음';
          locationContext = `[카카오 지도 실제 데이터]\n도로명: ${roadAddr}\n반경 500m:\n${nearby.join('\n')}\n랜드마크: ${landmarks}\n\n`;
        }
      } catch(e) { /* 카카오 실패시 무시 */ }
    }

    const finalPrompt = locationContext + prompt;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: '당신은 OMAD(한영주류 영업팀) 마케팅 콘텐츠 생성기입니다. 반드시 JSON만 반환하고 마크다운 코드블록 없이 순수 JSON만 출력하세요.',
        messages: [{ role: 'user', content: finalPrompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Claude API 오류' });
    if (!data.content?.[0]?.text) return res.status(500).json({ error: 'AI 응답이 비어있습니다' });

    const text = data.content[0].text;
    return res.status(200).json({
      candidates: [{ content: { parts: [{ text }] } }]
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || '서버 오류' });
  }
}
