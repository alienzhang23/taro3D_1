import { getReading, getGeneralMeaning, getFullMeaning } from '../tarotMeanings';

const API_KEY = process.env.API_KEY;

export const getTarotReading = async (cardName: string, isReversed: boolean): Promise<string> => {
  if (!API_KEY) {
    console.warn("Gemini API Key is missing. Using offline fallback.");
    return getReading(cardName, isReversed);
  }

  const position = isReversed ? "reversed" : "upright";
  const prompt = `你是一位神秘的塔罗牌占卜师。请解读"${cardName}"这张牌，目前是${isReversed ? '逆位' : '正位'}。请提供一段神秘、深刻且简洁的解读（不超过3句话），重点关注用户当前的道路。`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Gemini API Error Details:", errorData);
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (text) {
      return text;
    } else {
      throw new Error("No content generated");
    }

  } catch (error) {
    console.error("Gemini API call failed, falling back to local meanings:", error);
    return getReading(cardName, isReversed);
  }
};

export const getCardMeaning = async (cardName: string): Promise<{ text: string; fullMeaning: any }> => {
  const fullMeaning = getFullMeaning(cardName);
  
  if (!fullMeaning) {
    return Promise.resolve({
      text: "未找到该牌的含义。",
      fullMeaning: { upright: "", reversed: "", general: "未找到该牌的含义。" }
    });
  }

  return Promise.resolve({ 
    text: fullMeaning.general,
    fullMeaning: fullMeaning
  });
};