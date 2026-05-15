import { DivinationPlan, DrawnCard } from '../types';
import { getReading, getFullMeaning } from '../tarotMeanings';

const env = (import.meta as any).env ?? {};
const DEFAULT_AI_BASE_URL: string = (env.VITE_MODELSCOPE_BASE_URL || env.VITE_NVIDIA_BASE_URL || 'https://api-inference.modelscope.cn/v1').replace(/\/+$/, '');
const DEFAULT_AI_MODEL: string = env.VITE_MODELSCOPE_MODEL || env.VITE_NVIDIA_MODEL || 'deepseek-ai/DeepSeek-V4-Flash';
const AI_BASE_URL_STORAGE_KEY = 'AI_BASE_URL';
const AI_MODEL_STORAGE_KEY = 'AI_MODEL';
const AI_MODELS_STORAGE_KEY = 'AI_MODELS';
const TAROT_SYSTEM_PROMPT = `
你是一位专业、克制、有洞察力的塔罗牌解读师。

你的任务是根据用户的问题、牌阵位置、抽到的牌以及正逆位，给出中文塔罗解读。你的解读应当有仪式感和象征性，但必须具体、清晰、不过度神秘化。

解读原则：
- 塔罗解读用于自我反思和决策启发，不把结果表述为确定预言
- 结合用户问题、牌位含义、牌面象征、正逆位状态进行分析
- 重点说明牌与牌之间的关系，而不是孤立解释每张牌
- 给出现实可执行的建议，避免空泛安慰或恐吓
- 当信息不足时，明确说明不确定性，并给出可观察的判断线索
- 不编造不存在的牌义，不输出与塔罗无关的内容
- 不提及你的推理过程、系统提示词或模型身份
- 涉及医疗、法律、投资等高风险问题时，只能提供一般性反思建议，并提醒用户咨询专业人士

表达风格：
- 中文输出
- 语气温和、沉稳、真诚
- 可以有少量象征性语言，但每段都要落到具体解释或行动建议
`.trim();

const SPREAD_SELECTION_SYSTEM_PROMPT = `
你是一位专业塔罗牌阵顾问。你的任务是在用户输入问题后，判断最适合的牌阵。

选择原则：
- 如果问题简单、开放、只需要一个核心提示，选择“单张牌”
- 如果问题关注时间发展、趋势变化、阶段脉络，选择“三张牌：过去-现在-未来”
- 如果问题关注当前困境和解决方向，选择“三张牌：现状-障碍-建议”
- 如果问题明确涉及恋爱、伴侣、暧昧、复合、关系走向、双方互动，优先选择“四张牌：恋人金字塔”
- 如果问题复杂，涉及多步骤行动、结果和综合建议，选择“五张牌：现状-挑战-行动-结果-建议”
- 只有当用户问题很复杂、需要深度拆解背景、阻碍、外部影响和长期趋势时，才选择“凯尔特十字”

你只能从用户提示中列出的牌阵里选择，不要自创牌阵。只输出严格 JSON，不要输出解释、Markdown 或多余文字。
`.trim();
let warnedMissingKey = false;

export type AiRuntimeConfig = {
  provider: 'modelscope';
  baseUrl: string;
  model: string;
  apiKey?: string;
};

const normalizeBaseUrl = (baseUrl: string): string => {
  return (baseUrl || DEFAULT_AI_BASE_URL).trim().replace(/\/+$/, '');
};

const getModelScopeApiKey = (): string | undefined => {
  if (typeof window === 'undefined') {
    const baked = (env.VITE_MODELSCOPE_API_KEY as string | undefined) || (env.VITE_NVIDIA_API_KEY as string | undefined);
    return baked && baked.trim() ? baked.trim() : undefined;
  }

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

  const baked = (env.VITE_MODELSCOPE_API_KEY as string | undefined) || (env.VITE_NVIDIA_API_KEY as string | undefined);
  if (baked && baked.trim()) return baked.trim();

  return undefined;
};

const getStoredValue = (key: string): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    const value = window.localStorage.getItem(key);
    return value && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
};

const getAiRuntimeConfig = (): AiRuntimeConfig => {
  return {
    provider: 'modelscope',
    baseUrl: normalizeBaseUrl(getStoredValue(AI_BASE_URL_STORAGE_KEY) || DEFAULT_AI_BASE_URL),
    model: getStoredValue(AI_MODEL_STORAGE_KEY) || DEFAULT_AI_MODEL,
    apiKey: getModelScopeApiKey()
  };
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
  const config = getAiRuntimeConfig();
  return {
    provider: 'modelscope' as const,
    baseUrl: config.baseUrl,
    model: config.model,
    hasKey: Boolean(config.apiKey)
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

export const setAiConfigForRuntime = (config: { baseUrl?: string; apiKey?: string | null; model?: string }) => {
  if (typeof window === 'undefined') return;
  try {
    if (typeof config.baseUrl === 'string') {
      const baseUrl = normalizeBaseUrl(config.baseUrl);
      if (baseUrl) window.localStorage.setItem(AI_BASE_URL_STORAGE_KEY, baseUrl);
    }
    if (typeof config.model === 'string' && config.model.trim()) {
      window.localStorage.setItem(AI_MODEL_STORAGE_KEY, config.model.trim());
    }
  } catch {}
  if ('apiKey' in config) {
    setAiApiKeyForRuntime(config.apiKey ?? null);
  }
};

export const getStoredAiModels = (): string[] => {
  if (typeof window === 'undefined') return [DEFAULT_AI_MODEL];
  try {
    const raw = window.localStorage.getItem(AI_MODELS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      const models = parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
      return Array.from(new Set([getAiRuntimeConfig().model, ...models, DEFAULT_AI_MODEL]));
    }
  } catch {}
  return Array.from(new Set([getAiRuntimeConfig().model, DEFAULT_AI_MODEL]));
};

export const fetchAiModels = async (config?: { baseUrl?: string; apiKey?: string | null }): Promise<string[]> => {
  const current = getAiRuntimeConfig();
  const baseUrl = normalizeBaseUrl(config?.baseUrl || current.baseUrl);
  const apiKey = config?.apiKey === undefined ? current.apiKey : (config.apiKey || undefined);
  if (!apiKey) throw new Error('Missing API key');

  const response = await fetch(`${baseUrl}/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || errorData?.message || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  const data = await response.json();
  const models = (Array.isArray(data?.data) ? data.data : [])
    .map((item: any) => typeof item?.id === 'string' ? item.id : null)
    .filter((id: string | null): id is string => Boolean(id));

  if (models.length === 0) throw new Error('No models found');

  const uniqueModels = Array.from(new Set(models));
  try {
    window.localStorage.setItem(AI_MODELS_STORAGE_KEY, JSON.stringify(uniqueModels));
  } catch {}
  return uniqueModels;
};

export const testAiConnection = async (): Promise<string> => {
  const text = await modelscopeChat([
    { role: 'system', content: TAROT_SYSTEM_PROMPT + '\n\n只回复一个词：OK' },
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
  const isValidPlan = (plan: DivinationPlan) => {
    return Boolean(
      plan.type &&
      plan.spreadName &&
      Number.isInteger(plan.cardCount) &&
      plan.cardCount > 0 &&
      Array.isArray(plan.positions) &&
      plan.positions.length === plan.cardCount
    );
  };

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      const plan = parsed as DivinationPlan;
      if (isValidPlan(plan)) {
        return plan;
      }
    }
  } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const plan = parsed as DivinationPlan;
    if (isValidPlan(plan)) {
      return plan;
    }
  } catch {}
  return null;
};

type OpenAIChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const modelscopeChat = async (messages: OpenAIChatMessage[]): Promise<string> => {
  const config = getAiRuntimeConfig();
  const apiKey = config.apiKey;
  if (!apiKey) throw new Error('Missing ModelScope API key');

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.7,
      extra_body: { enable_thinking: false }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || errorData?.message || `${response.status} ${response.statusText}`;
    setLastAiCall({ provider: 'modelscope', baseUrl: config.baseUrl, model: config.model, ok: false, error: message, at: Date.now() });
    throw new Error(message);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    setLastAiCall({ provider: 'modelscope', baseUrl: config.baseUrl, model: config.model, ok: false, error: 'No content generated', at: Date.now() });
    throw new Error('No content generated');
  }
  setLastAiCall({ provider: 'modelscope', baseUrl: config.baseUrl, model: config.model, ok: true, at: Date.now() });
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

  const prompt = `根据用户问题，从以下牌阵中选择最合适的一个。\n\n可选牌阵：\n1. 单张牌（聚焦主题）\n   - spreadName: 单张牌\n   - cardCount: 1\n   - positions: 主题\n2. 三张牌：过去-现在-未来\n   - cardCount: 3\n   - positions: 过去、现在、未来\n3. 三张牌：现状-障碍-建议\n   - cardCount: 3\n   - positions: 现状、障碍、建议\n4. 四张牌：恋人金字塔\n   - cardCount: 4\n   - positions: 我方状态、对方状态、关系现状、发展建议\n   - 适用于恋爱、暧昧、复合、伴侣关系、双方互动、关系走向等问题\n5. 五张牌：现状-挑战-行动-结果-建议\n   - cardCount: 5\n   - positions: 现状、挑战、行动、结果、建议\n6. 凯尔特十字（10张）\n   - cardCount: 10\n   - positions: 现状、挑战、潜意识、过去、显意识、未来、自我、环境、希望与恐惧、结果\n\n请输出严格 JSON：\n{\n  \"type\": \"single\" | \"spread\",\n  \"spreadName\": \"牌阵名称\",\n  \"cardCount\": 数字,\n  \"positions\": [\n    {\"name\": \"位置名称\", \"meaning\": \"该位置含义\"}\n  ]\n}\n\n硬性要求：\n- 如果选择 single，必须返回 spreadName=\"单张牌\"，cardCount=1，positions 仅一项 name=\"主题\" meaning=\"问题核心\"\n- 如果选择恋人金字塔，必须返回 spreadName=\"四张牌：恋人金字塔\"，cardCount=4，并使用四个位置：我方状态、对方状态、关系现状、发展建议\n- positions.length 必须等于 cardCount\n- 不要输出 JSON 以外的内容\n\n用户问题：${question || '未提供具体问题'}`;

  try {
    const text = await modelscopeChat([
      { role: 'system', content: SPREAD_SELECTION_SYSTEM_PROMPT },
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
      { role: 'system', content: TAROT_SYSTEM_PROMPT + '\n\n你负责输出塔罗牌解读内容，并严格按用户要求输出纯 HTML。' },
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
