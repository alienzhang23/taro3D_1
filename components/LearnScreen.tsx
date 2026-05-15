import React, { useState } from 'react';
import { AppMode } from '../types';
import { TAROT_DECK, getCardImage } from '../constants';
import { getCardMeaning } from '../services/geminiService';
import { TarotMeaning } from '../tarotMeanings';
import { publicAsset } from '../utils/assets';

interface LearnScreenProps {
  setMode: (mode: AppMode) => void;
}

export const LearnScreen: React.FC<LearnScreenProps> = ({ setMode }) => {
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [meaning, setMeaning] = useState<TarotMeaning | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCardClick = async (card: string) => {
    setSelectedCard(card);
    setLoading(true);
    setMeaning(null);
    const result = await getCardMeaning(card);
    setMeaning(result.fullMeaning);
    setLoading(false);
  };

  return (
    <div className="w-full h-screen bg-black text-white flex flex-col">
      <div className="p-6 flex justify-between items-center border-b border-gray-900 bg-black z-20">
        <h2 className="text-2xl text-amber-600 tracking-widest uppercase font-serif">塔罗档案</h2>
        <button onClick={() => setMode(AppMode.LANDING)} className="text-gray-500 hover:text-white uppercase text-xs tracking-widest transition-colors duration-300">
          返回首页
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar List */}
        <div className="w-1/3 md:w-1/4 border-r border-gray-900 overflow-y-auto bg-black/90 scrollbar-thin scrollbar-thumb-amber-900/50 scrollbar-track-black">
          {TAROT_DECK.map((card) => (
            <button
              key={card}
              onClick={() => handleCardClick(card)}
              className={`w-full text-left p-4 text-sm tracking-wide transition-all duration-300 border-b border-gray-900/50 ${
                selectedCard === card 
                  ? 'bg-amber-900/20 text-amber-500 border-l-4 border-l-amber-500 pl-5' 
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900/30'
              }`}
            >
              {card}
            </button>
          ))}
        </div>

        {/* Right Content Area */}
        <div
          className="w-2/3 md:w-3/4 relative bg-cover bg-center overflow-hidden"
          style={{ backgroundImage: `url(${publicAsset('bg_universe.jpg')})` }}
        >
          {/* Background Overlay - Fixed relative to container */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-0"></div>
          
          {/* Scrollable Content Wrapper */}
          <div className="absolute inset-0 overflow-y-auto p-6 md:p-12 z-10 scrollbar-thin scrollbar-thumb-amber-900/50 scrollbar-track-black/20">
            <div className="max-w-4xl mx-auto min-h-full flex flex-col items-center">
              {selectedCard ? (
                <div className="w-full animate-fadeIn flex flex-col md:flex-row gap-8 items-start">
                  
                  {/* Card Image Section */}
                  <div className="w-full md:w-1/3 flex-shrink-0 flex flex-col items-center">
                     <div className="relative group perspective-1000">
                        <div className="relative w-64 h-[28rem] rounded-xl shadow-[0_0_30px_rgba(212,175,55,0.2)] transition-transform duration-700 transform group-hover:scale-[1.02]">
                          <img 
                            src={getCardImage(selectedCard)} 
                            alt={selectedCard}
                            className="w-full h-full object-cover rounded-xl border border-amber-900/50"
                          />
                          {/* Overlay Shine Effect */}
                          <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                        </div>
                     </div>
                     <h1 className="mt-6 text-3xl md:text-4xl font-serif text-amber-500 text-center drop-shadow-lg">{selectedCard}</h1>
                  </div>

                  {/* Meanings Section */}
                  <div className="w-full md:w-2/3 space-y-8">
                    {loading ? (
                      <div className="flex flex-col items-center justify-center h-64 space-y-4">
                        <div className="w-12 h-12 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                        <div className="text-amber-500/70 tracking-widest text-sm animate-pulse">正在解读星象...</div>
                      </div>
                    ) : meaning && (
                      <div className="space-y-8 animate-slideUp">
                        
                        {/* General Meaning */}
                        <div className="bg-black/40 p-6 rounded-lg border border-gray-800 backdrop-blur-md">
                          <h3 className="text-amber-500 text-sm tracking-[0.2em] uppercase mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            核心奥义
                          </h3>
                          <p className="text-gray-300 leading-relaxed font-light text-lg">
                            {meaning.general}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                          {/* Upright Meaning */}
                          <div className="bg-emerald-900/10 p-6 rounded-lg border border-emerald-900/30 backdrop-blur-md">
                            <h3 className="text-emerald-500 text-sm tracking-[0.2em] uppercase mb-3 flex items-center gap-2">
                              <span className="text-lg">↑</span>
                              正位解读 (Upright)
                            </h3>
                            <p className="text-gray-300 leading-relaxed font-light">
                              {meaning.upright}
                            </p>
                          </div>

                          {/* Reversed Meaning */}
                          <div className="bg-rose-900/10 p-6 rounded-lg border border-rose-900/30 backdrop-blur-md">
                            <h3 className="text-rose-500 text-sm tracking-[0.2em] uppercase mb-3 flex items-center gap-2">
                              <span className="text-lg">↓</span>
                              逆位解读 (Reversed)
                            </h3>
                            <p className="text-gray-300 leading-relaxed font-light">
                              {meaning.reversed}
                            </p>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>

                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6 opacity-50">
                  <div className="w-24 h-32 border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center">
                    <span className="text-4xl text-gray-700">?</span>
                  </div>
                  <div className="text-gray-500 uppercase tracking-[0.3em] font-light">
                    请从左侧选择一张牌<br/>以揭示其神圣奥秘
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
