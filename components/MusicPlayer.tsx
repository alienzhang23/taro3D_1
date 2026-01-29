import React, { useState, useEffect, useRef } from 'react';

export const MusicPlayer: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Attempt auto-play
    if (audioRef.current) {
        audioRef.current.volume = 0.3; // Start with lower volume
        const playPromise = audioRef.current.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                setIsPlaying(true);
            }).catch(error => {
                // Auto-play was prevented
                console.log("Auto-play prevented:", error);
                setIsPlaying(false);
                
                // Add a one-time click listener to document to start audio
                const handleUserInteraction = () => {
                    if (audioRef.current) {
                        audioRef.current.play().then(() => {
                            setIsPlaying(true);
                            // Remove listener after successful play
                            document.removeEventListener('click', handleUserInteraction);
                            document.removeEventListener('touchstart', handleUserInteraction);
                            document.removeEventListener('keydown', handleUserInteraction);
                            document.removeEventListener('pointerdown', handleUserInteraction);
                        }).catch(e => console.log("Still failed to play:", e));
                    }
                };

                document.addEventListener('click', handleUserInteraction);
                document.addEventListener('touchstart', handleUserInteraction);
                document.addEventListener('keydown', handleUserInteraction);
                document.addEventListener('pointerdown', handleUserInteraction);
            });
        }
    }
  }, []);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="fixed top-6 right-48 z-50">
      <audio 
        ref={audioRef} 
        src="/bgm.mp3" 
        loop 
        autoPlay
      />
      <button
        onClick={togglePlay}
        className="group flex items-center gap-2 px-4 py-2 border border-amber-900/30 rounded-full bg-black/40 backdrop-blur-sm text-amber-500/70 hover:text-amber-400 hover:border-amber-500/50 hover:bg-black/60 transition-all duration-300"
        title={isPlaying ? "暂停音乐" : "播放音乐"}
      >
        {isPlaying ? (
           <span className="relative flex h-3 w-3">
             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
             <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
           </span>
        ) : (
            <span className="h-3 w-3 rounded-full bg-gray-500"></span>
        )}
        <span className="text-xs font-mono tracking-widest uppercase">
            {isPlaying ? "Music On" : "Music Off"}
        </span>
      </button>
    </div>
  );
};
