import React, { useState } from 'react';
import { AppMode } from '../types';
import {
  fetchAiModels,
  getAiRuntimeInfo,
  getStoredAiModels,
  PRESET_DIVINATION_PLANS,
  setAiApiKeyForRuntime,
  setAiConfigForRuntime,
  testAiConnection
} from '../services/geminiService';

interface IntroScreenProps {
  setMode: (mode: AppMode) => void;
  question: string;
  setQuestion: (value: string) => void;
  selectedSpreadName: string;
  setSelectedSpreadName: (value: string) => void;
  onStart: () => void;
  loading: boolean;
}

export const IntroScreen: React.FC<IntroScreenProps> = ({
  setMode,
  question,
  setQuestion,
  selectedSpreadName,
  setSelectedSpreadName,
  onStart,
  loading
}) => {
  const [aiInfo, setAiInfo] = useState(() => getAiRuntimeInfo());
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [baseUrlInput, setBaseUrlInput] = useState(() => aiInfo.baseUrl);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [modelInput, setModelInput] = useState(() => aiInfo.model);
  const [modelOptions, setModelOptions] = useState<string[]>(() => getStoredAiModels());
  const [aiStatusText, setAiStatusText] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [modelsBusy, setModelsBusy] = useState(false);

  const refreshAiInfo = () => {
    setAiInfo(getAiRuntimeInfo());
  };

  const openAiSettings = () => {
    const currentInfo = getAiRuntimeInfo();
    setAiInfo(currentInfo);
    setAiStatusText(null);
    setBaseUrlInput(currentInfo.baseUrl);
    setApiKeyInput('');
    setModelInput(currentInfo.model);
    setModelOptions(getStoredAiModels());
    setShowAiSettings(true);
  };

  const saveSettings = () => {
    setAiConfigForRuntime({
      baseUrl: baseUrlInput,
      ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
      model: modelInput
    });
    refreshAiInfo();
    setModelOptions((items) => Array.from(new Set([modelInput, ...items])));
    setAiStatusText('已保存到本地');
  };

  const clearKey = () => {
    setAiApiKeyForRuntime(null);
    refreshAiInfo();
    setAiStatusText('已清除 API Key');
  };

  const fetchModelsNow = async () => {
    if (modelsBusy) return;
    setModelsBusy(true);
    setAiStatusText(null);
    try {
      const models = await fetchAiModels({
        baseUrl: baseUrlInput,
        ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {})
      });
      setModelOptions(models);
      if (!models.includes(modelInput)) {
        setModelInput(models[0] || modelInput);
      }
      setAiStatusText(`获取模型成功：${models.length} 个`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setAiStatusText(`获取模型失败：${msg}`);
    } finally {
      setModelsBusy(false);
    }
  };

  const testNow = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    setAiStatusText(null);
    try {
      setAiConfigForRuntime({
        baseUrl: baseUrlInput,
        ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
        model: modelInput
      });
      refreshAiInfo();
      await testAiConnection();
      setAiStatusText('测试成功');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setAiStatusText(`测试失败：${msg}`);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="relative w-full h-screen flex flex-col items-center justify-center bg-black overflow-hidden">
      <div className="absolute inset-0 bg-[url('/bg_universe.jpg')] opacity-20 bg-cover bg-center animate-pulse"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black"></div>

      <div className="z-10 text-center space-y-8 p-4 w-full max-w-2xl">
        <h1 className="text-5xl md:text-7xl text-amber-500 tracking-[0.2em] uppercase font-bold drop-shadow-2xl mb-4">
          Arcana
        </h1>
        <p className="text-gray-400 text-lg md:text-xl max-w-xl mx-auto italic font-light tracking-wider">
          "命运是分叉的花园，用你的双手拨开迷雾。"
        </p>

        <div className="mt-10">
          <div className="text-xs tracking-widest uppercase text-gray-500 mb-3">占卜问题</div>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            className="w-full bg-black/40 border border-amber-900/40 focus:border-amber-500/70 outline-none text-gray-200 text-sm tracking-wide p-4 rounded-sm shadow-[0_0_20px_rgba(0,0,0,0.4)] placeholder:text-gray-600"
            placeholder="请输入你想占卜的问题，例如：这段关系是否值得继续？"
          />
        </div>

        <div className="mt-5 text-left">
          <div className="text-xs tracking-widest uppercase text-gray-500 mb-3 text-center">牌阵选择</div>
          <select
            value={selectedSpreadName}
            onChange={(e) => setSelectedSpreadName(e.target.value)}
            className="w-full bg-black/40 border border-amber-900/40 focus:border-amber-500/70 outline-none text-gray-200 text-sm tracking-wide px-4 py-3 rounded-sm shadow-[0_0_20px_rgba(0,0,0,0.4)]"
          >
            <option value="">由 AI 根据问题判断</option>
            {PRESET_DIVINATION_PLANS.map((plan) => (
              <option key={plan.spreadName} value={plan.spreadName}>
                {plan.spreadName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col md:flex-row gap-8 mt-10 justify-center items-center">
          <button
            onClick={onStart}
            disabled={loading}
            className={`group relative px-8 py-4 bg-transparent border overflow-hidden transition-all duration-500 ${
              loading
                ? 'border-amber-900/40 text-amber-900/60 cursor-not-allowed'
                : 'border-amber-600 text-amber-500 hover:text-black hover:bg-amber-600'
            }`}
          >
            <span className="relative z-10 tracking-widest text-sm uppercase">{loading ? '占卜准备中' : '开始占卜'}</span>
          </button>

          <button
            onClick={() => setMode(AppMode.LEARNING)}
            className="group relative px-8 py-4 bg-transparent border border-gray-600 text-gray-400 overflow-hidden transition-all duration-500 hover:text-white hover:border-white"
          >
            <span className="relative z-10 tracking-widest text-sm uppercase">研习图鉴</span>
          </button>

          <button
            onClick={openAiSettings}
            className="group relative px-8 py-4 bg-transparent border border-gray-700 text-gray-500 overflow-hidden transition-all duration-500 hover:text-white hover:border-white"
          >
            <span className="relative z-10 tracking-widest text-sm uppercase">AI 设置</span>
          </button>
        </div>

        <div className="mt-6 text-[10px] tracking-widest uppercase text-gray-600">
          {aiInfo.hasKey ? `AI：已配置 · ${aiInfo.model}` : `AI：未配置（将使用本地含义） · ${aiInfo.model}`}
        </div>
      </div>

      {showAiSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto">
          <div className="w-full max-w-lg mx-4 bg-black/60 border border-amber-900/40 shadow-[0_0_50px_rgba(0,0,0,0.8)] rounded-sm p-6 text-left">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-amber-500 tracking-widest uppercase text-sm">AI 设置</div>
                <div className="text-[10px] text-gray-500 tracking-widest uppercase mt-1">
                  {`Base: ${aiInfo.baseUrl} · Model: ${aiInfo.model}`}
                </div>
              </div>
              <button
                onClick={() => setShowAiSettings(false)}
                className="px-3 py-1 border border-gray-800 text-gray-500 hover:text-white hover:border-white transition-colors uppercase text-xs tracking-widest"
              >
                关闭
              </button>
            </div>

            <div className="text-[10px] text-gray-500 tracking-widest uppercase mb-2">Base URL</div>
            <input
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
              className="w-full bg-black/40 border border-amber-900/40 focus:border-amber-500/70 outline-none text-gray-200 text-xs tracking-wide px-3 py-2 rounded-sm mb-4"
              placeholder="https://api-inference.modelscope.cn/v1"
              type="text"
              autoComplete="off"
              spellCheck={false}
            />

            <div className="text-[10px] text-gray-500 tracking-widest uppercase mb-2">API Key</div>
            <input
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="w-full bg-black/40 border border-amber-900/40 focus:border-amber-500/70 outline-none text-gray-200 text-xs tracking-wide px-3 py-2 rounded-sm"
              placeholder="sk-... / ms-..."
              type="password"
              autoComplete="off"
              spellCheck={false}
            />

            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <div className="text-[10px] text-gray-500 tracking-widest uppercase mb-2">Model</div>
                <select
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  className="w-full bg-black/40 border border-amber-900/40 focus:border-amber-500/70 outline-none text-gray-200 text-xs tracking-wide px-3 py-2 rounded-sm"
                >
                  {Array.from(new Set([modelInput, ...modelOptions])).map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={fetchModelsNow}
                disabled={modelsBusy}
                className={`self-end px-4 py-2 border uppercase text-xs tracking-widest transition-colors ${
                  modelsBusy
                    ? 'border-amber-900/40 text-amber-900/60 cursor-not-allowed'
                    : 'border-gray-700 text-gray-400 hover:text-white hover:border-white'
                }`}
              >
                {modelsBusy ? '获取中' : '获取模型'}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <button
                onClick={saveSettings}
                className="px-4 py-2 border border-amber-700 text-amber-500 hover:text-black hover:bg-amber-600 hover:border-amber-600 transition-colors uppercase text-xs tracking-widest"
              >
                保存
              </button>
              <button
                onClick={clearKey}
                className="px-4 py-2 border border-gray-700 text-gray-400 hover:text-white hover:border-white transition-colors uppercase text-xs tracking-widest"
              >
                清除 Key
              </button>
              <button
                onClick={testNow}
                disabled={aiBusy}
                className={`px-4 py-2 border uppercase text-xs tracking-widest transition-colors ${
                  aiBusy
                    ? 'border-amber-900/40 text-amber-900/60 cursor-not-allowed'
                    : 'border-amber-700 text-amber-500 hover:text-black hover:bg-amber-600 hover:border-amber-600'
                }`}
              >
                {aiBusy ? '测试中' : '测试连接'}
              </button>
            </div>

            {aiStatusText && (
              <div className="mt-4 text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                {aiStatusText}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="absolute bottom-10 text-gray-600 text-xs tracking-widest uppercase">
        使用摄像头进行交互 · 开启声音体验更佳
      </div>
    </div>
  );
};
