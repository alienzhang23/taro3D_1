import React, { useState } from 'react';
import { AppMode, DivinationPlan } from './types';
import { IntroScreen } from './components/IntroScreen';
import { LearnScreen } from './components/LearnScreen';
import { TarotCanvas } from './components/TarotCanvas';
import { MusicPlayer } from './components/MusicPlayer';
import { getDivinationPlan } from './services/geminiService';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.LANDING);
  const [question, setQuestion] = useState('');
  const [plan, setPlan] = useState<DivinationPlan | null>(null);
  const [planning, setPlanning] = useState(false);

  const handleStart = async () => {
    if (planning) return;
    setPlanning(true);
    const nextPlan = await getDivinationPlan(question);
    setPlan(nextPlan);
    setMode(AppMode.DRAWING);
    setPlanning(false);
  };

  return (
    <div className="w-full h-screen bg-black text-white selection:bg-amber-900 selection:text-white">
      <MusicPlayer />
      {mode === AppMode.LANDING && (
        <IntroScreen
          setMode={setMode}
          question={question}
          setQuestion={setQuestion}
          onStart={handleStart}
          loading={planning}
        />
      )}
      
      {mode === AppMode.DRAWING && (
        <TarotCanvas onExit={() => setMode(AppMode.LANDING)} question={question} plan={plan} />
      )}
      
      {mode === AppMode.LEARNING && (
        <LearnScreen setMode={setMode} />
      )}
    </div>
  );
};

export default App;
