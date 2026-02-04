import { DivinationPlan, DrawnCard } from '../types';
import { getReading, getFullMeaning } from '../tarotMeanings';

const env = (import.meta as any).env ?? {};
const MODELSCOPE_BASE_URL: string = (env.VITE_MODELSCOPE_BASE_URL || env.VITE_NVIDIA_BASE_URL || 'https://api-inference.modelscope.cn/v1').replace(/\/+$/, '');
const MODELSCOPE_MODEL: string = env.VITE_MODELSCOPE_MODEL || env.VITE_NVIDIA_MODEL || 'deepseek-ai/DeepSeek-V3.2';
let warnedMissingKey = false;

const getModelScopeApiKey = (): string | undefined => {
  const baked = (env.VITE_MODELSCOPE_API_KEY as string | undefined) || (env.VITE_NVIDIA_API_KEY as string | undefined);
  if (baked && baked.trim()) return baked.trim();

  if (typeof window === 'undefined') return undefined;
  const w = window as any;
  const fromWindow =
    (w.__MODELSCOPE_API_KEY as string | undefined) ||
    (w.MODELSCOPE_API_KEY as string | undefined) ||
    (w.__NVIDIA_API_KEY as string | undefined) ||
    (w.NVIDIA_API_KEY as string | undefined);
  if (fromWindow && fromWindow.trim()) return fromWindow.trim();

  try {
    const fromStorage =
      window.localStorage.getItem('VITE_MODELSCOPE_API_KEY') ||
      window.localStorage.getItem('MODELSCOPE_API_KEY') ||
      window.localStorage.getItem('VITE_NVIDIA_API_KEY') ||
      window.localStorage.getItem('NVIDIA_API_KEY') ||
      window.localStorage.getItem('API_KEY');
    if (fromStorage && fromStorage.trim()) return fromStorage.trim();
  } catch {}

  return undefined;
};

type LastAiCall = {
  provider: 'modelscope';
  baseUrl: string;
  model: string;
  ok: boolean;
  error?: string;
  at: number;
};

const setLastAiCall = (call: LastAiCall) => {
  if (typeof window === 'undefined') return;
  (window as any).__LAST_AI_CALL__ = call;
};

export const getAiRuntimeInfo = () => {
  return {
    provider: 'modelscope' as const,
    baseUrl: MODELSCOPE_BASE_URL,
    model: MODELSCOPE_MODEL,
    hasKey: Boolean(getModelScopeApiKey())
  };
};

export const getLastAiCall = (): LastAiCall | null => {
  if (typeof window === 'undefined') return null;
  const v = (window as any).__LAST_AI_CALL__;
  if (!v || typeof v !== 'object') return null;
  return v as LastAiCall;
};

export const setAiApiKeyForRuntime = (apiKey: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (apiKey && apiKey.trim()) {
      window.localStorage.setItem('VITE_MODELSCOPE_API_KEY', apiKey.trim());
    } else {
      window.localStorage.removeItem('VITE_MODELSCOPE_API_KEY');
      window.localStorage.removeItem('MODELSCOPE_API_KEY');
      window.localStorage.removeItem('VITE_NVIDIA_API_KEY');
      window.localStorage.removeItem('NVIDIA_API_KEY');
      window.localStorage.removeItem('API_KEY');
    }
  } catch {}
};

export const testAiConnection = async (): Promise<string> => {
  const text = await modelscopeChat([
    { role: 'system', content: '只回复一个词：OK' },
    { role: 'user', content: 'ping' }
  ]);
  return text;
};

const fallbackPlan: DivinationPlan = {
  type: 'single',
  spreadName: '单张牌',
  cardCount: 1,
  positions: [{ name: '主题', meaning: '问题核心' }]
};

const buildFallbackReading = (question: string, plan: DivinationPlan, cards: DrawnCard[]): string => {
  const items = cards.length > 0 ? cards : [{ name: '未知', isReversed: false }];
  if (plan.type === 'spread' && items.length > 1) {
    const lines = items.map((card, index) => {
      const label = card.position || `位置${index + 1}`;
      const meaning = getReading(card.name, card.isReversed);
      return `${label}：${card.name}${card.isReversed ? '（逆位）' : '（正位）'}。${meaning}`;
    }).join('\n');
    const q = question.trim();
    const prefix = q ? `问题：${q}\n` : '';
    return `${prefix}${plan.spreadName}：\n${lines}`;
  }
  return getReading(items[0].name, items[0].isReversed);
};

const parsePlan = (text: string): DivinationPlan | null => {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      const plan = parsed as DivinationPlan;
      if (plan.type && plan.spreadName && plan.cardCount && Array.isArray(plan.positions)) {
        return plan;
      }
    }
  } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const plan = parsed as DivinationPlan;
    if (plan.type && plan.spreadName && plan.cardCount && Array.isArray(plan.positions)) {
      return plan;
    }
  } catch {}
  return null;
};

type OpenAIChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const modelscopeChat = async (messages: OpenAIChatMessage[]): Promise<string> => {
  const apiKey = getModelScopeApiKey();
  if (!apiKey) throw new Error('Missing ModelScope API key');

  const response = await fetch(`${MODELSCOPE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODELSCOPE_MODEL,
      messages,
      temperature: 0.7,
      extra_body: { enable_thinking: false }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || errorData?.message || `${response.status} ${response.statusText}`;
    setLastAiCall({ provider: 'modelscope', baseUrl: MODELSCOPE_BASE_URL, model: MODELSCOPE_MODEL, ok: false, error: message, at: Date.now() });
    throw new Error(message);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    setLastAiCall({ provider: 'modelscope', baseUrl: MODELSCOPE_BASE_URL, model: MODELSCOPE_MODEL, ok: false, error: 'No content generated', at: Date.now() });
    throw new Error('No content generated');
  }
  setLastAiCall({ provider: 'modelscope', baseUrl: MODELSCOPE_BASE_URL, model: MODELSCOPE_MODEL, ok: true, at: Date.now() });
  return text;
};

export const getDivinationPlan = async (question: string): Promise<DivinationPlan> => {
  if (!getModelScopeApiKey()) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn('ModelScope API key missing; using local fallback.');
    }
    return question.trim().length > 12
      ? { type: 'spread', spreadName: '三张牌：过去-现在-未来', cardCount: 3, positions: [
          { name: '过去', meaning: '问题的根源与背景' },
          { name: '现在', meaning: '当下的状态与核心能量' },
          { name: '未来', meaning: '发展趋势与可能结果' }
        ] }
      : fallbackPlan;
  }

  const prompt = `你是专业塔罗占卜师。根据用户问题决定使用单张牌或常见牌阵。\n\n常见牌阵：\n1. 单张牌（聚焦主题）\n2. 三张牌：过去-现在-未来\n3. 三张牌：现状-障碍-建议\n4. 五张牌：现状-挑战-行动-结果-建议\n5. 凯尔特十字（10张）\n\n请根据问题给出严格 JSON：\n{\n  \"type\": \"single\" | \"spread\",\n  \"spreadName\": \"牌阵名称\",\n  \"cardCount\": 数字,\n  \"positions\": [\n    {\"name\": \"位置名称\", \"meaning\": \"该位置含义\"}\n  ]\n}\n\n如果选择 single，必须返回：spreadName=\"单张牌\"，cardCount=1，positions 仅一项 name=\"主题\" meaning=\"问题核心\"。\n用户问题：${question || '未提供具体问题'}`;

  try {
    const text = await modelscopeChat([
      { role: 'system', content: '只输出严格 JSON，不要输出任何额外文字。' },
      { role: 'user', content: prompt }
    ]);
    const plan = parsePlan(text);
    if (plan) return plan;
    return fallbackPlan;
  } catch (error) {
    console.error('ModelScope API call failed; using local fallback.', error);
    return fallbackPlan;
  }
};

export const getTarotReading = async (
  cardName: string,
  isReversed: boolean,
  question: string,
  plan: DivinationPlan,
  cards: DrawnCard[]
): Promise<string> => {
  if (!getModelScopeApiKey()) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn('ModelScope API key missing; using local fallback.');
    }
    return buildFallbackReading(question, plan, cards);
  }

  const planLabel = plan.type === 'spread' ? plan.spreadName : '单张牌';
  const cardLines = (cards.length ? cards : [{ name: cardName, isReversed }]).map((card, index) => {
    const label = card.position || `位置${index + 1}`;
    return `${label}: ${card.name}（${card.isReversed ? '逆位' : '正位'}）`;
  }).join('\n');

  const prompt = `你是一位神秘而专业的塔罗牌占卜师。\n用户问题：${question || '未提供具体问题'}\n牌阵：${planLabel}\n抽到的牌：\n${cardLines}\n\n请输出“纯 HTML”（不要 Markdown、不要代码块、不要额外解释）。\n\nHTML 结构要求：\n- 用 <section> 包裹全文\n- 使用 <h4> / <p> / <ul><li> / <hr> / <strong> 进行排版\n- 若为牌阵：按位置逐一解读（每个位置一个小标题），最后给出 <h4>“整体建议”\n- 若为单张：给出 <h4>“核心信息” + “建议”\n- 不要使用 <script>、<style>、on* 事件属性、外链图片或链接\n- 不要输出任何思考过程/推理/分析，不要输出 <think> 等标签\n- 不要输出三引号代码块\n- 文风神秘但具体，中文输出`;

  try {
    const text = await modelscopeChat([
      { role: 'system', content: '你将根据抽到的塔罗牌进行占卜解读，并严格按用户要求输出纯 HTML。' },
      { role: 'user', content: prompt }
    ]);
    return text;
  } catch (error) {
    console.error('ModelScope API call failed; using local fallback.', error);
    const fallback = buildFallbackReading(question, plan, cards);
    const msg = error instanceof Error ? error.message : String(error);
    return `AI 调用失败，已回退到本地含义。\n错误：${msg}\n\n${fallback}`;
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
