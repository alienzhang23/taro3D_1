
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DivinationPlan, DrawnCard, GestureState, Particle } from '../types';
import { TAROT_DECK, TOTAL_CARDS, CARD_RATIO, getCardImage } from '../constants';
import { getAiRuntimeInfo, getLastAiCall, getTarotReading } from '../services/geminiService';
import { StarfieldBackground } from './StarfieldBackground';

interface CardEntity {
  id: number;
  x: number;
  y: number;
  z: number; // Scale/Order
  rotX: number;
  rotY: number; // 0 = back, 180 (PI) = front
  rotZ: number;
  width: number;
  height: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetRotX: number;
  targetRotY: number;
  targetRotZ: number;
  isRevealed: boolean;
  textureId: number; 
  vx: number;
  vy: number;
  phaseX: number; // For organic movement
  phaseY: number;
  speed: number;
}

interface TarotCanvasProps {
  onExit: () => void;
  question: string;
  plan: DivinationPlan | null;
}

const isProbablyHtml = (value: string): boolean => {
  const t = value.trim();
  return t.startsWith('<') && t.includes('>');
};

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const sanitizeReadingHtml = (html: string): string => {
  if (typeof window === 'undefined') return '';
  try {
    const Parser = (window as any).DOMParser as typeof DOMParser | undefined;
    if (!Parser) return `<pre>${escapeHtml(html)}</pre>`;
    const parser = new Parser();
    const doc = parser.parseFromString(html, 'text/html');
    const body = doc.body || doc.getElementsByTagName('body')[0];
    if (!body) return `<pre>${escapeHtml(html)}</pre>`;

    const allowedTags = new Set([
      'SECTION',
      'H1',
      'H2',
      'H3',
      'H4',
      'P',
      'UL',
      'OL',
      'LI',
      'STRONG',
      'EM',
      'B',
      'I',
      'BR',
      'HR',
      'BLOCKQUOTE',
      'DIV',
      'SPAN',
      'CODE',
      'PRE'
    ]);

    const elementNodeType = (window as any).Node?.ELEMENT_NODE ?? 1;

    const walk = (node: Node) => {
      if (node.nodeType === elementNodeType) {
        const el = node as Element;
        const tag = el.tagName.toUpperCase();

        if (!allowedTags.has(tag)) {
          const parent = el.parentNode;
          if (!parent) return;
          const text = el.textContent || '';
          if (text) {
            parent.replaceChild(doc.createTextNode(text), el);
          } else {
            parent.removeChild(el);
          }
          return;
        } else {
          for (const attr of Array.from(el.attributes)) {
            const name = attr.name.toLowerCase();
            if (name.startsWith('on')) {
              el.removeAttribute(attr.name);
              continue;
            }
            if (name === 'style') {
              const v = (attr.value || '').toLowerCase();
              if (v.includes('expression') || v.includes('url(')) el.removeAttribute(attr.name);
              continue;
            }
            el.removeAttribute(attr.name);
          }
        }
      }

      for (const child of Array.from(node.childNodes)) {
        walk(child);
      }
    };

    walk(body);
    return body.innerHTML.trim();
  } catch {
    return `<pre>${escapeHtml(html)}</pre>`;
  }
};

const buildProgressiveHtmlFrames = (safeHtml: string): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const Parser = (window as any).DOMParser as typeof DOMParser | undefined;
    if (!Parser) return [safeHtml];
    const parser = new Parser();
    const doc = parser.parseFromString(safeHtml, 'text/html');
    const body = doc.body || doc.getElementsByTagName('body')[0];
    if (!body) return [safeHtml];

    const nodesToHtml = (nodes: ChildNode[]) => {
      const out: string[] = [];
      for (const n of nodes) {
        if ((n as any).outerHTML && typeof (n as any).outerHTML === 'string') {
          out.push((n as any).outerHTML);
        } else if (n.nodeType === ((window as any).Node?.TEXT_NODE ?? 3)) {
          const text = (n.textContent || '').trim();
          if (text) out.push(`<p>${escapeHtml(text)}</p>`);
        }
      }
      return out;
    };

    const bodyChildren = Array.from(body.childNodes);
    const onlyElementChildren = bodyChildren.filter(n => n.nodeType === ((window as any).Node?.ELEMENT_NODE ?? 1));
    const isSingleSection =
      bodyChildren.length === 1 &&
      onlyElementChildren.length === 1 &&
      (onlyElementChildren[0] as Element).tagName.toUpperCase() === 'SECTION';

    let parts: string[] = [];
    if (isSingleSection) {
      const section = onlyElementChildren[0] as Element;
      parts = nodesToHtml(Array.from(section.childNodes));
    } else {
      parts = nodesToHtml(bodyChildren);
    }

    if (!parts.length) return [safeHtml];
    const frames: string[] = [];
    for (let i = 1; i <= parts.length; i++) {
      frames.push(`<section>${parts.slice(0, i).join('')}</section>`);
    }
    return frames;
  } catch {
    return [safeHtml];
  }
};

const fallbackPlan: DivinationPlan = {
  type: 'single',
  spreadName: '单张牌',
  cardCount: 1,
  positions: [{ name: '主题', meaning: '问题核心' }]
};

export const TarotCanvas: React.FC<TarotCanvasProps> = ({ onExit, question, plan }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null); 
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>(0);
  const gestureRecognizerRef = useRef<any>(null);
  
  // State
  const [gestureState, setGestureState] = useState<GestureState>(GestureState.STACKED);
  const [detectedGesture, setDetectedGesture] = useState<string>("Initializing...");
  const [reading, setReading] = useState<string | null>(null);
  const [displayedReading, setDisplayedReading] = useState<string>("");
  const [loadingReading, setLoadingReading] = useState(false);
  const [isReversed, setIsReversed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [, setForceUpdate] = useState(0);
  const [selectedCards, setSelectedCards] = useState<DrawnCard[]>([]);
  
  // Physics Refs
  const cardsRef = useRef<CardEntity[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const lastVideoTime = useRef(-1);
  const selectedIndexRef = useRef<number>(-1);
  const fingerXHistory = useRef<number[]>([]);
  const lastShakeCheckTime = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const selectedCardsRef = useRef<DrawnCard[]>([]);
  const closeHoldStartedAtRef = useRef<number>(0);
  
  // Hand Motion Tracking
  const handPosRef = useRef<{x: number, y: number} | null>(null);
  const handVelocityRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  
  // Image Loading Ref
  const loadedBackImageRef = useRef<HTMLImageElement | null>(null);
  const cardImageCacheRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const cardImageLoadingRef = useRef<Set<number>>(new Set());
  const cardImageErrorRef = useRef<Set<number>>(new Set());

  const currentPlan = plan || fallbackPlan;
  const drawnDeckIndicesRef = useRef<number[]>([]);

  const ensureCardImageLoaded = useCallback((deckIndex: number) => {
    if (deckIndex < 0 || deckIndex >= TAROT_DECK.length) return;
    if (cardImageCacheRef.current.has(deckIndex)) return;
    if (cardImageErrorRef.current.has(deckIndex)) return;
    if (cardImageLoadingRef.current.has(deckIndex)) return;
    const cardName = TAROT_DECK[deckIndex];
    const url = getCardImage(cardName);
    const img = new Image();
    cardImageLoadingRef.current.add(deckIndex);
    img.onload = () => {
      cardImageLoadingRef.current.delete(deckIndex);
      cardImageCacheRef.current.set(deckIndex, img);
      setForceUpdate(n => n + 1);
    };
    img.onerror = () => {
      cardImageLoadingRef.current.delete(deckIndex);
      cardImageErrorRef.current.add(deckIndex);
      setForceUpdate(n => n + 1);
    };
    img.src = url;
  }, []);

  // Preload Card Back
  useEffect(() => {
    const img = new Image();
    img.src = "/card_bg.jpg";
    img.onload = () => {
      loadedBackImageRef.current = img;
    };
  }, []);

  // Fullscreen Tracking
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  }, []);

  // Initialize Cards
  useEffect(() => {
    const cards: CardEntity[] = [];
    const w = 100; // Base width
    const h = w * CARD_RATIO;
    
    for (let i = 0; i < TOTAL_CARDS; i++) {
      cards.push({
        id: i,
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        z: 1,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        width: w,
        height: h,
        targetX: window.innerWidth / 2,
        targetY: window.innerHeight / 2,
        targetZ: 1,
        targetRotX: 0,
        targetRotY: 0,
        targetRotZ: 0,
        isRevealed: false,
        textureId: i,
        vx: 0,
        vy: 0,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        speed: 0.0001 + Math.random() * 0.0002
      });
    }
    cardsRef.current = cards;
    selectedIndexRef.current = Math.floor(Math.random() * TOTAL_CARDS);
  }, []);

  useEffect(() => {
    selectedCards.forEach((card) => {
      if (typeof card.deckIndex === 'number') ensureCardImageLoaded(card.deckIndex);
    });
  }, [selectedCards, ensureCardImageLoaded]);


  // Setup MediaPipe
  useEffect(() => {
    const setupVision = async () => {
      try {
        setDetectedGesture("加载视觉模型...");
        // @ts-ignore
        const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm");
        const { FilesetResolver, GestureRecognizer } = vision;

        const wasm = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        
        gestureRecognizerRef.current = await GestureRecognizer.createFromOptions(wasm, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
             // Removing explicit delegate request to allow auto-selection (resolves XNNPACK INFO logs being perceived as errors)
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            setDetectedGesture("摄像头就绪。请展示手势。");
          }
        }
      } catch (e) {
        console.error("Failed to load MediaPipe", e);
        setDetectedGesture("视觉错误。请检查摄像头。");
      }
    };
    
    setupVision();
    
    return () => {
       if (gestureRecognizerRef.current) {
         try { gestureRecognizerRef.current.close(); } catch(e) {}
       }
    };
  }, []);

  // Gesture Logic
  const predictWebcam = useCallback(() => {
    if (!videoRef.current || !gestureRecognizerRef.current) return;
    if (videoRef.current.readyState < 2) return;

    // --- DEBUG DRAWING START ---
    const debugCtx = debugCanvasRef.current?.getContext('2d');
    if (debugCtx && debugCanvasRef.current) {
        const w = debugCanvasRef.current.width;
        const h = debugCanvasRef.current.height;

        debugCtx.setTransform(1, 0, 0, 1, 0, 0);
        debugCtx.clearRect(0, 0, w, h);
        
        // Mirror Logic
        debugCtx.translate(w, 0);
        debugCtx.scale(-1, 1);
        
        debugCtx.drawImage(videoRef.current, 0, 0, w, h);
    }

    if (videoRef.current.currentTime !== lastVideoTime.current) {
      lastVideoTime.current = videoRef.current.currentTime;
      
      try {
        const results = gestureRecognizerRef.current.recognizeForVideo(videoRef.current, performance.now());

        // --- DRAW LANDMARKS ---
        if (debugCtx && debugCanvasRef.current && results.landmarks && results.landmarks.length > 0) {
            const landmarks = results.landmarks[0];
            const w = debugCanvasRef.current.width;
            const h = debugCanvasRef.current.height;

            const palm = landmarks[9]; 
            if (handPosRef.current) {
                const dx = (palm.x - handPosRef.current.x);
                const dy = (palm.y - handPosRef.current.y);
                handVelocityRef.current = { x: -dx, y: dy };
            }
            handPosRef.current = { x: palm.x, y: palm.y };

            // Draw Skeleton
            const connections = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17], [5, 9], [9, 13], [13, 17]];

            debugCtx.lineWidth = 2;
            debugCtx.strokeStyle = "rgba(212, 175, 55, 0.8)"; // Gold
            debugCtx.fillStyle = "rgba(212, 175, 55, 1)";

            debugCtx.beginPath();
            for (const [start, end] of connections) {
                const s = landmarks[start];
                const e = landmarks[end];
                debugCtx.moveTo(s.x * w, s.y * h);
                debugCtx.lineTo(e.x * w, e.y * h);
            }
            debugCtx.stroke();

            for (const lm of landmarks) {
                debugCtx.beginPath();
                debugCtx.arc(lm.x * w, lm.y * h, 3, 0, 2 * Math.PI);
                debugCtx.fill();
            }
        } else {
            handVelocityRef.current.x *= 0.9;
            handVelocityRef.current.y *= 0.9;
        }
        
        if (debugCtx) debugCtx.setTransform(1, 0, 0, 1, 0, 0);

        if (results.gestures.length > 0) {
            const gestureName = results.gestures[0][0].categoryName;
            setDetectedGesture(gestureName);

            if (gestureName === "Closed_Fist") {
                const now = Date.now();
                if (gestureState === GestureState.REVEALED) {
                  if (!closeHoldStartedAtRef.current) closeHoldStartedAtRef.current = now;
                  if (now - closeHoldStartedAtRef.current > 650) {
                    closeHoldStartedAtRef.current = 0;
                    setGestureState(GestureState.STACKED);
                  }
                } else {
                  closeHoldStartedAtRef.current = 0;
                  setGestureState(GestureState.STACKED);
                }
            } 
            else if (gestureName === "Open_Palm") {
                closeHoldStartedAtRef.current = 0;
                if (gestureState === GestureState.REVEALED) return;
                if (gestureState !== GestureState.SHUFFLING) {
                    // New Random Pick on Start Shuffle
                    selectedIndexRef.current = Math.floor(Math.random() * TOTAL_CARDS);
                    setReading(null);
                    setIsReversed(false);
                    setSelectedCards([]);
                    selectedCardsRef.current = [];
                    drawnDeckIndicesRef.current = [];
                }
                setGestureState(GestureState.SHUFFLING);
            } 
            else if (gestureName === "Pointing_Up") {
                closeHoldStartedAtRef.current = 0;
                if (gestureState === GestureState.SHUFFLING || gestureState === GestureState.STACKED) {
                    setGestureState(GestureState.SELECTED);
                }
                
                const landmarks = results.landmarks[0];
                if (landmarks && landmarks[8]) {
                    const x = landmarks[8].x;
                    fingerXHistory.current.push(x);
                    if (fingerXHistory.current.length > 15) fingerXHistory.current.shift();
                    
                    const now = Date.now();
                    if (now - lastShakeCheckTime.current > 150 && fingerXHistory.current.length > 5) {
                        const max = Math.max(...fingerXHistory.current);
                        const min = Math.min(...fingerXHistory.current);
                        if (max - min > 0.12 && gestureState === GestureState.SELECTED) { 
                            let nextShakeAllowedAt = now;
                            const targetCount = currentPlan.type === 'spread' ? currentPlan.cardCount : 1;
                            if (currentPlan.type === 'spread' && targetCount > 1) {
                              const positions = currentPlan.positions || [];
                              const deckLen = TAROT_DECK.length;
                              const existing = selectedCardsRef.current;

                              if (existing.length >= targetCount) {
                                setGestureState(GestureState.REVEALED);
                                lastShakeCheckTime.current = now;
                                return;
                              }

                              const used = new Set<number>(drawnDeckIndicesRef.current);
                              let deckIndex = ((selectedIndexRef.current % deckLen) + deckLen) % deckLen;
                              if (used.has(deckIndex)) {
                                const candidates: number[] = [];
                                for (let i = 0; i < deckLen; i++) {
                                  if (!used.has(i)) candidates.push(i);
                                }
                                deckIndex = candidates.length
                                  ? candidates[Math.floor(Math.random() * candidates.length)]
                                  : ((selectedIndexRef.current % deckLen) + deckLen) % deckLen;
                              }

                              const next: DrawnCard = {
                                name: TAROT_DECK[deckIndex],
                                isReversed: Math.random() > 0.5,
                                position: positions[existing.length]?.name,
                                deckIndex
                              };

                              const nextCards = [...existing, next];
                              selectedCardsRef.current = nextCards;
                              drawnDeckIndicesRef.current = [...drawnDeckIndicesRef.current, deckIndex];
                              setSelectedCards(nextCards);

                              if (nextCards.length < targetCount) {
                                const candidates: number[] = [];
                                const used2 = new Set<number>(drawnDeckIndicesRef.current);
                                for (let i = 0; i < deckLen; i++) {
                                  if (!used2.has(i)) candidates.push(i);
                                }
                                if (candidates.length) {
                                  selectedIndexRef.current = candidates[Math.floor(Math.random() * candidates.length)];
                                }
                              } else {
                                nextShakeAllowedAt = now + 650;
                              }
                            } else {
                              setGestureState(GestureState.REVEALED);
                            }
                            lastShakeCheckTime.current = nextShakeAllowedAt;
                            return;
                        }
                    }
                }
            }
            else {
                closeHoldStartedAtRef.current = 0;
            }
        }
      } catch (err) {
        // Suppress noise
      }
    }
  }, [gestureState, currentPlan]);


  // AI Trigger
  useEffect(() => {
    if (gestureState === GestureState.REVEALED && !reading && !loadingReading) {
      const fetchReading = async () => {
        setLoadingReading(true);
        const baseIndex = selectedIndexRef.current % TAROT_DECK.length;
        const baseCard = TAROT_DECK[baseIndex];
        let cards = selectedCardsRef.current;
        if (!cards.length) {
          const single: DrawnCard = { name: baseCard, isReversed: Math.random() > 0.5, position: currentPlan.positions?.[0]?.name, deckIndex: baseIndex };
          cards = [single];
          selectedCardsRef.current = cards;
          drawnDeckIndicesRef.current = [baseIndex];
          setSelectedCards(cards);
          setIsReversed(single.isReversed);
        }
        try {
          const text = await getTarotReading(baseCard, cards[0]?.isReversed ?? false, question, currentPlan, cards);
          setReading(text);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          setReading(`AI 调用失败。\n错误：${msg}`);
        } finally {
          setLoadingReading(false);
        }
      };
      fetchReading();
    } else if (gestureState !== GestureState.REVEALED) {
      setReading(null);
      setIsReversed(false);
      setSelectedCards([]);
      selectedCardsRef.current = [];
      drawnDeckIndicesRef.current = [];
    }
  }, [gestureState, reading, loadingReading, question, currentPlan]);


  // Typewriter Effect for Reading
  useEffect(() => {
    if (reading) {
      if (isProbablyHtml(reading)) {
        const safe = sanitizeReadingHtml(reading);
        const frames = buildProgressiveHtmlFrames(safe);
        if (!frames.length) {
          setDisplayedReading(safe || reading);
          return;
        }

        setDisplayedReading(frames[0]);
        if (frames.length === 1) return;

        let idx = 1;
        const intervalId = setInterval(() => {
          if (idx < frames.length) {
            setDisplayedReading(frames[idx]);
            idx++;
          } else {
            clearInterval(intervalId);
          }
        }, 200);
        return () => clearInterval(intervalId);
      }
      setDisplayedReading("");
      let currentIndex = 0;
      const intervalId = setInterval(() => {
        if (currentIndex < reading.length) {
          setDisplayedReading(prev => reading.slice(0, currentIndex + 1));
          currentIndex++;
        } else {
          clearInterval(intervalId);
        }
      }, 50); // Adjust speed here (ms per char)
      return () => clearInterval(intervalId);
    } else {
      setDisplayedReading("");
    }
  }, [reading]);

  // Animation Loop
  const animate = useCallback((time: number) => {
    requestRef.current = requestAnimationFrame(animate);
    predictWebcam();
    timeRef.current = time;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const isDesktopReveal = gestureState === GestureState.REVEALED && window.innerWidth >= 900;
    const revealedCardLift = gestureState === GestureState.REVEALED
      ? (isDesktopReveal ? 0 : -window.innerHeight * 0.16)
      : 0;
    
    const currentEase = (gestureState === GestureState.SELECTED || gestureState === GestureState.REVEALED) ? 0.02 : 0.08;
    const isSpread = currentPlan.type === 'spread' && currentPlan.cardCount > 1;
    const targetCount = isSpread ? currentPlan.cardCount : 1;
    const drawnDeckIndices = drawnDeckIndicesRef.current;
    const drawnSet = isSpread ? new Set<number>(drawnDeckIndices) : null;
    const revealedCardsCenterX = isDesktopReveal ? window.innerWidth * 0.24 : cx;
    const revealedCardsCenterY = isDesktopReveal ? window.innerHeight * 0.48 : cy + revealedCardLift;
    const spreadSpacing = isDesktopReveal ? Math.min(window.innerWidth * 0.085, 150) : Math.min(window.innerWidth * 0.28, 260);
    const revealSpacingX = isDesktopReveal ? Math.min(window.innerWidth * 0.085, 150) : Math.min(window.innerWidth * 0.22, 220);
    const revealSpacingY = isDesktopReveal ? Math.min(window.innerHeight * 0.21, 170) : Math.min(window.innerHeight * 0.26, 240);
    const revealCols = isSpread ? Math.min(5, targetCount) : 1;
    const revealRows = isSpread ? Math.ceil(targetCount / revealCols) : 1;
    const revealBaseY = revealedCardsCenterY;
    const bottomY = window.innerHeight * 0.78;
    const bottomSpacing = Math.min(window.innerWidth * 0.08, 90);
    const bottomFan = 0.08;
    
    cardsRef.current.forEach((card, i) => {
      const isSelected = i === selectedIndexRef.current;

      if (gestureState === GestureState.STACKED) {
        card.targetX = cx;
        card.targetY = cy + i * 0.15; 
        card.targetZ = 1 - (i * 0.001);
        card.targetRotZ = 0;
        card.targetRotY = 0;
      } 
      else if (gestureState === GestureState.SHUFFLING) {
        const t = time;
        const handVx = handVelocityRef.current.x * 2000;
        const handVy = handVelocityRef.current.y * 2000;

        const spreadX = window.innerWidth * 1.1; 
        const spreadY = window.innerHeight * 1.1;

        const freqX = card.speed * 1.5;
        const freqY = card.speed;
        
        const nx = Math.sin(t * freqX + card.phaseX);
        const ny = Math.cos(t * freqY + card.phaseY);
        
        const nx2 = Math.sin(t * freqX * 2.3 + i);
        const ny2 = Math.cos(t * freqY * 2.3 + i);

        card.targetX = cx + (nx * 0.7 + nx2 * 0.3) * (spreadX / 2) + handVx;
        card.targetY = cy + (ny * 0.7 + ny2 * 0.3) * (spreadY / 2) + handVy;
        card.targetZ = 0.5 + Math.sin(t * 0.001 + i) * 0.4;
        card.targetRotZ = (t * 0.0005 + i * 0.2); 
        card.targetRotY = 0;
      } 
      else if (gestureState === GestureState.SELECTED || gestureState === GestureState.REVEALED) {
        if (isSpread && drawnSet) {
          if (drawnSet.has(i)) {
            const order = drawnDeckIndices.indexOf(i);
            if (gestureState === GestureState.SELECTED) {
              const count = drawnDeckIndices.length;
              const startX = cx - (count - 1) * bottomSpacing / 2;
              card.targetX = startX + order * bottomSpacing;
              card.targetY = bottomY;
              card.targetZ = 1.15;
              card.targetRotZ = (order - (count - 1) / 2) * bottomFan;
              card.targetRotY = 0;
            } else {
              if (targetCount === 3) {
                card.targetX = revealedCardsCenterX + (order - 1) * spreadSpacing;
                card.targetY = revealBaseY;
                card.targetZ = isDesktopReveal ? 1.5 : 2.6;
                card.targetRotZ = 0;
              } else {
                const col = order % revealCols;
                const row = Math.floor(order / revealCols);
                const gridW = (revealCols - 1) * revealSpacingX;
                const gridH = (revealRows - 1) * revealSpacingY;
                card.targetX = revealedCardsCenterX - gridW / 2 + col * revealSpacingX;
                card.targetY = revealBaseY - gridH / 2 + row * revealSpacingY;
                card.targetZ = isDesktopReveal ? (targetCount > 6 ? 1.1 : 1.25) : (targetCount > 6 ? 1.9 : 2.2);
                card.targetRotZ = 0;
              }
              card.targetRotY = Math.PI;
            }
          } else if (isSelected && gestureState === GestureState.SELECTED && drawnDeckIndices.length < targetCount) {
            card.targetX = cx;
            card.targetY = cy;
            card.targetZ = 3.0;
            card.targetRotZ = 0;
            card.targetRotY = 0;
          } else {
            const t = time;
            const spreadX = window.innerWidth * 1.05;
            const spreadY = window.innerHeight * 1.05;
            const freqX = card.speed * 1.7;
            const freqY = card.speed * 1.35;
            const nx = Math.sin(t * freqX + card.phaseX);
            const ny = Math.cos(t * freqY + card.phaseY);
            const nx2 = Math.sin(t * freqX * 2.9 + i);
            const ny2 = Math.cos(t * freqY * 2.6 + i);

            card.targetX = cx + (nx * 0.65 + nx2 * 0.35) * (spreadX / 2);
            card.targetY = cy + (ny * 0.65 + ny2 * 0.35) * (spreadY / 2);
            card.targetZ = 0.55 + Math.sin(t * 0.0012 + i) * 0.18;
            card.targetRotZ = (t * 0.00035 + i * 0.15);
            card.targetRotY = 0;
          }
        } else {
          if (isSelected) {
            card.targetX = isDesktopReveal ? revealedCardsCenterX : cx;
            card.targetY = isDesktopReveal ? revealedCardsCenterY : cy + revealedCardLift;
            card.targetZ = isDesktopReveal ? 1.85 : 3.0; 
            card.targetRotZ = 0;
            card.targetRotY = gestureState === GestureState.REVEALED ? Math.PI : 0;
          } else {
            const angle = (i / TOTAL_CARDS) * Math.PI * 8 + time * 0.0001;
            const dist = Math.max(window.innerWidth, window.innerHeight) * 1.2; 
            card.targetX = cx + Math.cos(angle) * dist;
            card.targetY = cy + Math.sin(angle) * dist;
            card.targetZ = 0.1;
            card.targetRotY = 0;
          }
        }
      }

      card.x += (card.targetX - card.x) * currentEase;
      card.y += (card.targetY - card.y) * currentEase;
      card.z += (card.targetZ - card.z) * currentEase;
      
      let diffRotZ = card.targetRotZ - card.rotZ;
      while (diffRotZ > Math.PI) diffRotZ -= Math.PI * 2;
      while (diffRotZ < -Math.PI) diffRotZ += Math.PI * 2;
      card.rotZ += diffRotZ * currentEase;

      card.rotX += (card.targetRotX - card.rotX) * currentEase;
      card.rotY += (card.targetRotY - card.rotY) * 0.05;
    });

    const reversedByDeckIndex = new Map<number, boolean>();
    for (const c of selectedCardsRef.current) {
      if (typeof c.deckIndex === 'number') reversedByDeckIndex.set(c.deckIndex, Boolean(c.isReversed));
    }

    const sortedCards = [...cardsRef.current].sort((a, b) => a.z - b.z);

    sortedCards.forEach((card) => {
        if (card.z < 0.1) return;

        ctx.save();
        ctx.translate(card.x, card.y);
        ctx.scale(card.z, card.z);
        ctx.rotate(card.rotZ);

        const flipScale = Math.cos(card.rotY);
        const isBack = flipScale > 0;
        
        ctx.scale(Math.abs(flipScale), 1);

        const w = card.width;
        const h = card.height;

        ctx.shadowBlur = 15 * card.z;
        ctx.shadowColor = "rgba(0,0,0,0.5)";

        // Create rounded path
        ctx.beginPath();
        ctx.roundRect(-w/2, -h/2, w, h, 8); // 8px rounded corners
        ctx.clip(); // Clip everything to this rounded shape

        if (isBack) {
            // BACK DESIGN
            if (loadedBackImageRef.current) {
                // Use loaded high-quality texture
                try {
                    ctx.drawImage(loadedBackImageRef.current, -w/2, -h/2, w, h);
                    
                    // Add subtle glow overlay for "magic" feel (Shimmer)
                    const gradient = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
                    const shimmerPos = (Math.sin(timeRef.current * 0.001 + card.id) + 1) / 2; // Oscillate 0 to 1
                    
                    gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
                    gradient.addColorStop(Math.max(0, shimmerPos - 0.2), "rgba(255, 255, 255, 0)");
                    gradient.addColorStop(shimmerPos, "rgba(255, 215, 0, 0.2)"); // Gold shimmer
                    gradient.addColorStop(Math.min(1, shimmerPos + 0.2), "rgba(255, 255, 255, 0)");
                    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
                    
                    ctx.fillStyle = gradient;
                    ctx.fillRect(-w/2, -h/2, w, h);

                    // Border Glow (Inner stroke)
                    ctx.strokeStyle = `rgba(212, 175, 55, ${0.5 + Math.sin(timeRef.current * 0.003) * 0.3})`;
                    ctx.lineWidth = 2; // Slightly thicker
                    ctx.beginPath();
                    ctx.roundRect(-w/2 + 1, -h/2 + 1, w - 2, h - 2, 7); 
                    ctx.stroke();

                } catch (e) {
                    // Fallback to color
                    ctx.fillStyle = "#0a0a0a";
                    ctx.fillRect(-w/2, -h/2, w, h);
                }
            } else {
                // Fallback while loading
                ctx.fillStyle = "#0a0a0a";
                ctx.strokeStyle = "#8a6d3b";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(-w/2, -h/2, w, h, 8);
                ctx.fill();
                ctx.stroke();
            }
        } else {
            // FRONT DESIGN
            const deckIndex = card.id % TAROT_DECK.length;
            if (reversedByDeckIndex.get(deckIndex)) ctx.rotate(Math.PI);
            const shouldRender = deckIndex === (selectedIndexRef.current % TAROT_DECK.length) || drawnDeckIndicesRef.current.includes(deckIndex);
            const cached = cardImageCacheRef.current.get(deckIndex);
            const hasError = cardImageErrorRef.current.has(deckIndex);

            if (shouldRender && cached) {
                try {
                  ctx.fillStyle = "#fff";
                  ctx.fillRect(-w/2, -h/2, w, h);
                  ctx.drawImage(cached, -w/2, -h/2, w, h);
                } catch (e) {
                  ctx.fillStyle = "#fff";
                  ctx.fillRect(-w/2, -h/2, w, h);
                }
            } else if (shouldRender && hasError) {
                // RENDER PROCEDURAL FALLBACK
                ctx.fillStyle = "#f3e5ab"; // Parchment color
                ctx.fillRect(-w/2, -h/2, w, h);
                
                // Border
                ctx.strokeStyle = "#d4af37";
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.roundRect(-w/2 + 4, -h/2 + 4, w - 8, h - 8, 4);
                ctx.stroke();

                // Text
                ctx.fillStyle = "#2c2c2c";
                ctx.textAlign = "center";
                ctx.font = "bold 8px serif";
                
                const cardName = TAROT_DECK[deckIndex];
                const parts = cardName.split(' ');
                
                // Draw card name
                let yOff = 0;
                parts.forEach((p, idx) => {
                     ctx.fillText(p.toUpperCase(), 0, -h/4 + idx * 10 + yOff);
                });
                
                // Draw simple symbol
                ctx.font = "24px serif";
                let symbol = "✦"; // Default Major Arcana
                if (cardName.includes("圣杯")) symbol = "🏆";
                if (cardName.includes("权杖")) symbol = "🌿";
                if (cardName.includes("宝剑")) symbol = "⚔️";
                if (cardName.includes("星币")) symbol = "🪙";
                
                ctx.fillText(symbol, 0, 10);
                
            } else {
                // Other (Background) cards front face (shouldn't be seen often)
                ctx.fillStyle = "#1a1a1a";
                ctx.fillRect(-w/2, -h/2, w, h);
            }
            
            // Common Front Border
            ctx.strokeStyle = "#d4af37";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(-w/2, -h/2, w, h, 8);
            ctx.stroke();
        }
        ctx.restore();
    });

    // Particles - Loop Backwards to safely remove
    if (gestureState === GestureState.SELECTED || gestureState === GestureState.REVEALED) {
       const isThreeCardSpread = currentPlan.type === 'spread' && currentPlan.cardCount === 3;
       const drawnDeckIndices = drawnDeckIndicesRef.current;
       const indices = new Set<number>();

       if (isThreeCardSpread) {
         for (const idx of drawnDeckIndices) indices.add(idx);
         if (gestureState === GestureState.SELECTED && drawnDeckIndices.length < 3) {
           indices.add(selectedIndexRef.current);
         }
         if (indices.size === 0) indices.add(selectedIndexRef.current);
       } else {
         indices.add(selectedIndexRef.current);
       }

       const particlesPerCard = isThreeCardSpread ? 2 : 4;

       for (const idx of indices) {
         const mainCard = cardsRef.current[idx];
         if (!mainCard) continue;
         const w = mainCard.width * mainCard.z;
         const h = mainCard.height * mainCard.z;

         for(let k=0; k<particlesPerCard; k++) {
             const perimeter = (w + h) * 2;
             const pos = Math.random() * perimeter;
             let px=0, py=0;
             
             if (pos < w) { px = pos - w/2; py = -h/2; }
             else if (pos < w + h) { px = w/2; py = (pos - w) - h/2; }
             else if (pos < w*2 + h) { px = (pos - w - h) - w/2; py = h/2; }
             else { px = -w/2; py = (pos - w*2 - h) - h/2; }

             const cos = Math.cos(mainCard.rotZ);
             const sin = Math.sin(mainCard.rotZ);
             const rpx = px * cos - py * sin;
             const rpy = px * sin + py * cos;

             particlesRef.current.push({
                 x: mainCard.x + rpx,
                 y: mainCard.y + rpy,
                 vx: (Math.random() - 0.5) * 2,
                 vy: (Math.random() - 0.5) * 2 - 1.0,
                 life: 1.0,
                 maxLife: 1.0,
                 size: Math.random() * 3 + 1,
                 color: "212, 175, 55"
             });
         }
       }
    }

    ctx.globalCompositeOperation = 'lighter';
    
    // Reverse loop for safe removal
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.life -= 0.02;
       
        if (p.life <= 0) {
           particlesRef.current.splice(i, 1);
        } else {
           ctx.fillStyle = `rgba(${p.color}, ${p.life})`;
           ctx.beginPath();
           ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
           ctx.fill();
        }
    }
    
    ctx.globalCompositeOperation = 'source-over';

  }, [gestureState, predictWebcam]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [animate]);

  const renderedReading = displayedReading || reading || '';
  const isHtmlDisplayed = renderedReading ? isProbablyHtml(renderedReading) : false;
  const safeDisplayedHtml = React.useMemo(() => {
    if (!renderedReading || !isHtmlDisplayed) return '';
    const safe = sanitizeReadingHtml(renderedReading);
    return safe || `<pre>${escapeHtml(renderedReading)}</pre>`;
  }, [renderedReading, isHtmlDisplayed]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden cursor-none">
      <StarfieldBackground />
      <video ref={videoRef} className="absolute opacity-0 pointer-events-none" playsInline autoPlay muted width="320" height="240" />
      <canvas ref={canvasRef} className="block w-full h-full relative z-10" />
      
      <canvas 
        ref={debugCanvasRef} 
        width={320} 
        height={240} 
        className={`absolute top-20 right-6 w-48 h-36 border border-amber-900/50 rounded-lg z-40 bg-black/80 shadow-[0_0_20px_rgba(0,0,0,0.8)] ${
          gestureState === GestureState.REVEALED ? 'hidden' : ''
        }`}
      />
      
      <div className="absolute top-6 left-6 z-50 text-amber-600/50 font-mono text-xs tracking-widest pointer-events-none">
        <div>信号: {detectedGesture}</div>
        <div>状态: {
            {
                [GestureState.STACKED]: "堆叠中",
                [GestureState.SHUFFLING]: "洗牌中",
                [GestureState.SELECTED]: "已选中",
                [GestureState.REVEALED]: "已揭示"
            }[gestureState]
        }</div>
      </div>
      
      <div className="absolute top-6 right-6 z-50 flex flex-col gap-3 pointer-events-auto">
        {/* <button 
          onClick={onExit}
          className="px-6 py-2 border border-gray-800 text-gray-500 hover:text-amber-500 hover:border-amber-500 transition-colors uppercase text-xs tracking-widest bg-black/50 backdrop-blur-sm"
        >
          Sever Connection
        </button> */}
        <button
          onClick={toggleFullscreen}
          className="px-6 py-2 border border-gray-800 text-gray-500 hover:text-amber-500 hover:border-amber-500 transition-colors uppercase text-xs tracking-widest bg-black/50 backdrop-blur-sm"
        >
          {isFullscreen ? '退出全屏' : '进入全屏'}
        </button>
      </div>

      {(currentPlan.type === 'spread' && currentPlan.cardCount > 1 && gestureState !== GestureState.REVEALED) && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="px-5 py-3 bg-black/45 backdrop-blur-md border border-amber-900/40 shadow-[0_0_30px_rgba(0,0,0,0.8)] text-center">
            <div className="text-amber-400 font-serif tracking-[0.25em] text-lg drop-shadow-[0_0_16px_rgba(212,175,55,0.35)]">
              {currentPlan.spreadName}
            </div>
            <div className="mt-1 text-xs text-amber-500/70 tracking-widest">
              {selectedCards.length}/{currentPlan.cardCount} 已抽取
            </div>
            {gestureState === GestureState.SHUFFLING && (
              <div className="mt-2 text-sm text-gray-200/90 font-serif tracking-widest">
                竖起手指开始抽牌
              </div>
            )}
            {gestureState === GestureState.SELECTED && selectedCards.length < currentPlan.cardCount && (
              <div className="mt-2 text-sm text-gray-200/90 font-serif tracking-widest">
                摇动手指抽取第 {selectedCards.length + 1} 张
              </div>
            )}
            {gestureState === GestureState.SELECTED && selectedCards.length >= currentPlan.cardCount && (
              <div className="mt-2 text-sm text-gray-200/90 font-serif tracking-widest">
                已抽完，摇动手指一起翻开
              </div>
            )}
          </div>
        </div>
      )}

      <div className="absolute bottom-12 left-0 w-full text-center pointer-events-none transition-opacity duration-500">
        {gestureState === GestureState.STACKED && (
          <p className="text-gray-400 font-serif italic tracking-widest opacity-60">张开手掌，散开命运之牌。</p>
        )}
        {gestureState === GestureState.SHUFFLING && (
          <p className="text-amber-500/80 font-serif italic tracking-widest animate-pulse">竖起手指，选择一条路径。</p>
        )}
        {gestureState === GestureState.SELECTED && (
          <p className="text-white font-serif tracking-widest drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
            {currentPlan.type === 'spread' && currentPlan.cardCount > 1
              ? (selectedCards.length < currentPlan.cardCount
                  ? `摇动手指，抽取第 ${selectedCards.length + 1} 张。`
                  : '已抽完，摇动手指一起翻开。')
              : '摇动手指，揭示真理。'}
          </p>
        )}
      </div>

      {gestureState === GestureState.REVEALED && (
        <div className="absolute top-16 left-6 right-6 md:left-[4%] md:right-[56%] z-30 text-center pointer-events-none">
          <h3 className="text-amber-500 text-2xl md:text-3xl font-serif uppercase tracking-[0.16em] drop-shadow-[0_0_20px_rgba(212,175,55,0.35)]">
            {currentPlan.type === 'spread'
              ? currentPlan.spreadName
              : `${selectedCards.length > 0 ? selectedCards[0].name : TAROT_DECK[selectedIndexRef.current % TAROT_DECK.length]} ${(selectedCards[0]?.isReversed ?? isReversed) ? "(逆位)" : "(正位)"}`
            }
          </h3>
        </div>
      )}

      {gestureState === GestureState.REVEALED && currentPlan.type === 'spread' && selectedCards.length > 0 && (
        <div className="absolute inset-0 z-30 pointer-events-none hidden md:block">
          {selectedCards.map((card, index) => {
            const count = Math.max(selectedCards.length, 1);
            const cols = Math.min(5, count);
            const row = Math.floor(index / cols);
            const col = index % cols;
            const xOffset = col - (cols - 1) / 2;
            const rowOffset = row - (Math.ceil(count / cols) - 1) / 2;
            const label = card.position || currentPlan.positions?.[index]?.name || `位置${index + 1}`;
            return (
              <div
                key={`${label}-${index}`}
                className="absolute -translate-x-1/2 text-amber-500 text-xl font-serif tracking-[0.12em] drop-shadow-[0_0_16px_rgba(212,175,55,0.45)] whitespace-nowrap"
                style={{
                  left: `calc(24vw + ${xOffset} * min(8.5vw, 150px))`,
                  top: `calc(48vh - 150px + ${rowOffset} * min(21vh, 170px))`
                }}
              >
                {label}
              </div>
            );
          })}
        </div>
      )}

      {gestureState === GestureState.REVEALED && (
        <div className="absolute left-4 right-4 top-[43vh] bottom-3 md:left-[46%] md:right-14 md:top-32 md:bottom-8 text-center transition-all duration-1000 z-30 opacity-100 translate-y-0">
          <div
            className="h-full bg-black/35 backdrop-blur-md p-5 md:p-7 border border-amber-900/30 shadow-[0_0_50px_rgba(0,0,0,0.8)] rounded-sm pointer-events-auto flex flex-col overflow-hidden"
          >
            <div className="text-amber-500 text-2xl md:text-3xl font-serif uppercase tracking-[0.16em] drop-shadow-[0_0_20px_rgba(212,175,55,0.35)] mb-6">
              塔罗解读
            </div>
            {question.trim() !== '' && (
              <div className="text-xs text-gray-500 tracking-widest uppercase mb-3">问题：{question}</div>
            )}
            <div className="text-xs text-gray-500 tracking-widest uppercase mb-4">
              {currentPlan.type === 'spread' ? `${currentPlan.spreadName} · ${currentPlan.cardCount}张` : '单张牌占卜'}
            </div>
            <div className="text-[10px] text-gray-600 tracking-widest uppercase mb-4">
              {(() => {
                const info = getAiRuntimeInfo();
                const last = getLastAiCall();
                if (!info.hasKey) return `AI：未配置（本地含义） · ${info.model}`;
                if (!last) return `AI：已配置 · ${info.model}`;
                return `AI：${last.ok ? '成功' : '失败'} · ${info.model}`;
              })()}
            </div>
            {selectedCards.length > 1 && (
              <div className="text-xs text-gray-400 tracking-widest mb-4">
                {selectedCards.map((card, index) => {
                  const label = card.position ? `${card.position}` : `位置${index + 1}`;
                  return `${label}：${card.name}${card.isReversed ? '（逆）' : '（正）'}`;
                }).join(' · ')}
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto pr-2 text-gray-300 leading-loose font-serif text-left text-base md:text-lg">
              {loadingReading ? (
                <span className="animate-pulse">正在向虚空寻求指引...</span>
              ) : isHtmlDisplayed ? (
                <div dangerouslySetInnerHTML={{ __html: safeDisplayedHtml }} />
              ) : renderedReading ? (
                renderedReading
              ) : (
                <span className="text-gray-500">未收到解读内容。</span>
              )}
            </div>
            <div className="mt-6 text-xs text-gray-600 uppercase tracking-widest">
                握拳收起卡牌
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
