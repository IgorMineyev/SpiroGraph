import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Controls } from './components/Controls';
import { SpirographRenderer } from './components/SpirographRenderer';
import { SpiroConfig, Theme } from './types';
import { DEFAULT_CONFIG, PRESET_COLORS } from './constants';
import { Settings, X, Maximize, Minimize, ZoomIn, ZoomOut, Shuffle, Download, Infinity as InfinityIcon, Clock, FileText, Image as ImageIcon, Pause, Play, Trash2, Sparkles, Sun, Moon, Monitor } from 'lucide-react';

// Custom Crossed Infinity Icon
const InfinityOff = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={className}
    >
        <path d="M12 12c-2-2.3-4-4-7-4a4 4 0 1 0 0 8c3 0 5-1.7 7-4m0 0c2 2.3 4 4 7 4a4 4 0 1 0 0-8c-3 0-5-1.7-7 4" />
        <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
);

const toggleGlobalCursor = (hidden: boolean) => {
    const action = hidden ? 'add' : 'remove';
    document.documentElement.classList[action]('app-no-cursor');
    document.body.classList[action]('app-no-cursor');
    
    const styleId = 'force-cursor-none';
    const existingStyle = document.getElementById(styleId);
    if (hidden) {
        if (!existingStyle) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `*, *::before, *::after { cursor: none !important; }`;
            document.head.appendChild(style);
        }
    } else if (existingStyle) {
        existingStyle.remove();
    }
};

const PERSISTENT_STYLES = `
    .force-cursor-visible, .force-cursor-visible * { cursor: default !important; }
    .force-cursor-visible button, .force-cursor-visible a, .force-cursor-visible [role="button"],
    .force-cursor-visible [role="slider"],
    .force-cursor-visible input { cursor: pointer !important; }
    
    /* Style for timer duration arrows to match the UI color scheme */
    input[type="number"].themed-spin::-webkit-inner-spin-button,
    input[type="number"].themed-spin::-webkit-outer-spin-button {
        opacity: 0.5;
        cursor: pointer;
        filter: invert(0.6) sepia(1) saturate(2) hue-rotate(180deg); /* Style to match muted slate */
    }
    input[type="number"].themed-spin:hover::-webkit-inner-spin-button {
        opacity: 1;
    }

    /* Force black background in screensaver mode and prevent white bounce */
    html.screensaver-active, 
    html.screensaver-active body, 
    html.screensaver-active #root,
    html.screensaver-active :fullscreen,
    html.screensaver-active ::backdrop {
        background-color: #000000 !important;
        background: #000000 !important;
        overscroll-behavior: none !important;
        color-scheme: dark !important;
    }
`;

const calculateResponsiveLineWidth = (k: number, width: number, height: number) => {
    const minDim = Math.min(width, height);
    const targetVisualWidth = Math.max(1.1, minDim / 450); 
    const computedLineWidth = targetVisualWidth / (k || 1);
    return Math.max(0.1, Math.min(30, computedLineWidth));
};

const generateRandomConfig = (currentTheme: Theme = 'light'): SpiroConfig => {
  let n, d;
  do { n = Math.floor(Math.random() * 99) + 2; d = Math.floor(Math.random() * 99) + 2; } while (n === d);
  const ratio = n / d;
  const outerRadius = Math.floor(60 + Math.random() * 50);
  const innerRadius = Math.floor(outerRadius * ratio);
  const penOffset = Math.floor(innerRadius * (0.4 + Math.random() * 0.8));
  const availableColors = PRESET_COLORS.filter(c => c !== (currentTheme === 'dark' ? '#000000' : '#ffffff'));
  const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];

  return { ...DEFAULT_CONFIG, outerRadius, innerRadius, penOffset, statorAspect: 0.6 + Math.random() * 0.8, rotorAspect: 0.6 + Math.random() * 0.8, penColor: randomColor, showGears: true, speed: 1, numerator: n, denominator: d };
};

const calculateOptimalScale = (cfg: SpiroConfig, width: number, height: number): number => {
    const R = cfg.outerRadius; const r = cfg.innerRadius; const d = cfg.penOffset;
    const sAspect = cfg.statorAspect || 1; const rAspect = cfg.rotorAspect || 1;
    const maxR = R * Math.max(1, sAspect); const maxr = r * Math.max(1, rAspect);
    const centerDist = Math.abs(R - r); const traceExtent = centerDist + d;
    const gearExtent = cfg.showGears ? (centerDist + maxr) : 0;
    const statorExtent = maxR; const maxExtent = Math.max(traceExtent, gearExtent, statorExtent);
    const minDim = Math.min(width, height);
    return Math.max(0.1, Math.min(5, (minDim / 2 * 0.9) / (maxExtent || 1)));
};

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const App: React.FC = () => {
  const [config, setConfig] = useState<SpiroConfig>(() => generateRandomConfig('light'));
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [shouldClear, setShouldClear] = useState<boolean>(false);
  const [downloadState, setDownloadState] = useState<{ active: boolean; theme?: 'dark' | 'light'; withStats?: boolean; }>({ active: false });
  const [showControls, setShowControls] = useState<boolean>(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isScreensaver, setIsScreensaver] = useState<boolean>(false);
  const [isInfinityMode, setIsInfinityMode] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [screensaverDuration, setScreensaverDuration] = useState<number>(300000); 
  const [durationInput, setDurationInput] = useState<string>("5");
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isIdle, setIsIdle] = useState<boolean>(false);
  
  const previousThemeRef = useRef<Theme>(theme);
  const nextSwitchTimeRef = useRef<number>(0);

  useEffect(() => {
    const k = calculateOptimalScale(config, window.innerWidth, window.innerHeight);
    setConfig(prev => ({ ...prev, lineWidth: calculateResponsiveLineWidth(k, window.innerWidth, window.innerHeight) * 4 }));
    setViewTransform(prev => ({ ...prev, k }));
  }, []);

  // Sync body and document class with the current theme and screensaver state to ensure black background on mobile
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    if (isScreensaver) {
      html.classList.add('screensaver-active');
      body.style.backgroundColor = '#000000';
      // Update theme-color meta tag for mobile browsers status bar
      let metaTheme = document.querySelector('meta[name="theme-color"]');
      if (!metaTheme) {
        metaTheme = document.createElement('meta');
        metaTheme.setAttribute('name', 'theme-color');
        document.head.appendChild(metaTheme);
      }
      metaTheme.setAttribute('content', '#000000');
    } else {
      html.classList.remove('screensaver-active');
      body.style.backgroundColor = '';
      let metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute('content', theme === 'dark' ? '#020617' : '#ffffff');
      }
    }
  }, [theme, isScreensaver]);

  const stopScreensaver = useCallback(() => {
    setIsScreensaver(false);
    setIsInfinityMode(false);
    toggleGlobalCursor(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setTheme(previousThemeRef.current);
    setConfig(prev => ({ ...prev, showGears: true }));
    setShowControls(true); // Return to standard view with settings window visible
  }, []); 

  const triggerNextScreensaverImage = useCallback(() => {
    const newConfig = generateRandomConfig('dark');
    const k = calculateOptimalScale(newConfig, window.innerWidth, window.innerHeight);
    newConfig.lineWidth = calculateResponsiveLineWidth(k, window.innerWidth, window.innerHeight) * 4;
    setConfig(newConfig); setShouldClear(true); setIsPlaying(true);
    setViewTransform({ x: 0, y: 0, k });
    nextSwitchTimeRef.current = Date.now() + screensaverDuration;
  }, [screensaverDuration]);

  const handleRandomize = useCallback(() => {
    const newConfig = generateRandomConfig(theme);
    const k = calculateOptimalScale(newConfig, window.innerWidth, window.innerHeight);
    newConfig.lineWidth = calculateResponsiveLineWidth(k, window.innerWidth, window.innerHeight) * 4;
    setConfig(newConfig);
    setShouldClear(true);
    setIsPlaying(true);
    setViewTransform({ x: 0, y: 0, k });
    setShowControls(false);
  }, [theme]);

  // Screensaver Keyboard Interaction Logic
  useEffect(() => {
    if (!isScreensaver) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Explicitly catch Escape to ensure it triggers stopScreensaver even if event handling is tricky
      if (e.key === 'Escape') {
        e.preventDefault();
        stopScreensaver();
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        if (!(e.target instanceof HTMLInputElement)) {
          e.preventDefault();
          triggerNextScreensaverImage();
        }
      } else {
        const modifiers = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'];
        if (!modifiers.includes(e.key)) {
          stopScreensaver();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isScreensaver, triggerNextScreensaverImage, stopScreensaver]);

  // Ensure screensaver mode stops if user exits fullscreen (e.g. via Escape key or browser chrome)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);
      if (!isCurrentlyFullscreen && isScreensaver) {
        stopScreensaver();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isScreensaver, stopScreensaver]);

  useLayoutEffect(() => {
    if (!isScreensaver) { setIsIdle(false); toggleGlobalCursor(false); return; }
    setIsIdle(true); toggleGlobalCursor(true);
    let idleTimer: number;
    const onActivity = () => {
        setIsIdle(false); toggleGlobalCursor(false);
        clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => { setIsIdle(true); toggleGlobalCursor(true); }, 3000);
    };
    window.addEventListener('mousemove', onActivity);
    return () => {
        window.removeEventListener('mousemove', onActivity);
        clearTimeout(idleTimer);
    };
  }, [isScreensaver]);

  const startScreensaver = () => {
    setIsScreensaver(true);
    setShowControls(false); 
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    previousThemeRef.current = theme;
    setTheme('dark');
    const k = calculateOptimalScale(config, window.innerWidth, window.innerHeight);
    setConfig(prev => ({ ...prev, lineWidth: calculateResponsiveLineWidth(k, window.innerWidth, window.innerHeight) * 4, speed: 1 }));
    setViewTransform({ x: 0, y: 0, k });
    nextSwitchTimeRef.current = Date.now() + screensaverDuration;
    setTimeLeft(Math.ceil(screensaverDuration / 1000));
  };

  useEffect(() => {
    if (!isScreensaver || isInfinityMode) return;
    const interval = setInterval(() => {
        const diff = nextSwitchTimeRef.current - Date.now();
        if (diff <= 0) triggerNextScreensaverImage();
        else setTimeLeft(Math.ceil(diff / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isScreensaver, isInfinityMode, triggerNextScreensaverImage]);

  const handleDurationInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    setDurationInput(valStr);
    const val = parseFloat(valStr);
    if (!isNaN(val) && val > 0) {
        const newDuration = val * 60 * 1000;
        setScreensaverDuration(newDuration);
        if (isScreensaver && !isInfinityMode) {
             nextSwitchTimeRef.current = Date.now() + newDuration;
             setTimeLeft(Math.ceil(newDuration / 1000));
        }
    }
  };

  const greyBtnClass = theme === 'dark' ? 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'bg-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-300';
  const screensaverBtnClass = 'bg-slate-900 text-slate-500 hover:bg-slate-800 hover:text-slate-400 shadow-lg transition-colors';
  const screensaverLightBtnClass = 'bg-slate-500 text-slate-900 hover:bg-slate-400 hover:text-slate-950 shadow-lg transition-colors';
  
  const logoText = theme === 'dark' ? 'text-slate-600 group-hover:text-slate-500' : 'text-slate-200 group-hover:text-slate-500';
  const logoBg = theme === 'dark' ? 'white' : 'black';
  const settingsBtnClass = theme === 'dark' ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100';
  const headerActionBtnClass = theme === 'dark' ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100';

  const overlayOpacity = isScreensaver ? (isIdle ? 'opacity-0' : 'opacity-100') : 'opacity-0 group-hover:opacity-100';

  // Determine main container background color
  const containerBg = isScreensaver ? 'bg-black' : (theme === 'dark' ? 'bg-slate-950' : 'bg-white');

  return (
    <div className={`flex flex-col md:flex-row h-screen w-screen relative overflow-hidden transition-colors duration-300 ${containerBg} ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'} ${isScreensaver ? 'cursor-none' : ''}`}>
      <style>{PERSISTENT_STYLES}</style>
      
      {/* Mobile Header (Hidden in Screensaver) */}
      {!isScreensaver && (
        <div className={`md:hidden p-4 flex justify-between items-center z-30 shrink-0 ${theme === 'dark' ? 'bg-slate-900' : 'bg-white border-b border-slate-200'}`}>
            <a 
            href="https://igormineyev.github.io/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="flex flex-col group"
            >
                <span className={`text-[10px] font-bold mb-1 pl-1 transition-colors duration-300 ${logoText}`}>Igor Mineyev's</span>
                <div className="inline-block">
                    <div style={{ background: logoBg, padding: '4px 10px', borderRadius: '8px', display: 'inline-block', lineHeight: '1' }}>
                        <span style={{ color: '#22c55e', fontSize: '18px', fontWeight: 'bold' }}>SpiroGraph</span>
                    </div>
                </div>
            </a>
            <div className="flex items-center gap-1">
                {/* Download button */}
                <button onClick={() => setDownloadState({ active: true, withStats: false })} className={`p-2 rounded-lg transition-colors ${headerActionBtnClass}`} title="Download pattern">
                    <Download size={20} />
                </button>
                {/* Randomize button */}
                <button onClick={handleRandomize} className={`p-2 rounded-lg transition-colors ${headerActionBtnClass}`} title="Randomize pattern">
                    <Sparkles size={20} />
                </button>
                {/* Screensaver button added between random and theme buttons */}
                <button onClick={startScreensaver} className={`p-2 rounded-lg transition-colors ${headerActionBtnClass}`} title="Start screensaver">
                    <Monitor size={20} />
                </button>
                {/* Theme button */}
                <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className={`p-2 rounded-lg transition-colors ${headerActionBtnClass}`} title="Switch theme">
                    {theme === 'dark' ? <Sun size={20} fill="currentColor" /> : <Moon size={20} fill="currentColor" />}
                </button>
                <button onClick={() => setShowControls(true)} className={`p-2 rounded-lg transition-colors ${settingsBtnClass}`} aria-label="Open settings">
                    <Settings size={20} />
                </button>
            </div>
        </div>
      )}

      {/* Settings Drawer */}
      <div className={`fixed inset-0 z-[110] transition-transform duration-300 ease-in-out ${showControls ? 'translate-x-0' : '-translate-x-full'} ${!isScreensaver ? 'md:static md:translate-x-0 md:flex md:h-full' : 'md:fixed'}`}>
        <Controls 
          config={config} setConfig={setConfig} isPlaying={isPlaying} 
          onTogglePlay={() => setIsPlaying(!isPlaying)} onClear={() => setShouldClear(true)} 
          onDownload={(ws) => setDownloadState({ active: true, withStats: ws })} 
          onClose={() => setShowControls(false)} theme={theme} 
          onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} 
          isFullscreen={isFullscreen} onToggleFullscreen={() => !document.fullscreenElement ? document.documentElement.requestFullscreen() : document.exitFullscreen()} 
          onStartScreensaver={startScreensaver} 
          onAutoZoom={(c) => { 
            const k = calculateOptimalScale(c, window.innerWidth, window.innerHeight); 
            setConfig(prev => ({...c, lineWidth: calculateResponsiveLineWidth(k, window.innerWidth, window.innerHeight) * 4})); 
            setViewTransform({x:0, y:0, k}); 
          }} 
        />
      </div>

      <div className="flex-1 relative h-full w-full overflow-hidden group">
        <SpirographRenderer config={config} isPlaying={isPlaying} shouldClear={shouldClear} onCleared={() => setShouldClear(false)} downloadState={downloadState} onDownloaded={() => setDownloadState({ active: false })} theme={theme} transform={viewTransform} onTransformChange={setViewTransform} isCursorHidden={isScreensaver && isIdle} />
        
        {/* Overlay */}
        <div className={`absolute bottom-0 left-0 p-4 pb-16 md:p-10 z-30 flex items-end transition-opacity duration-300 w-full ${overlayOpacity} force-cursor-visible`} onMouseDown={(e) => e.stopPropagation()}>
           <div className="flex flex-col md:flex-row md:items-center justify-between w-full gap-4 md:gap-0">
              <div className="flex flex-wrap items-center gap-2 md:gap-4">
                  <button onClick={() => setViewTransform(prev => ({ ...prev, k: prev.k * 1.2 }))} className={`p-2 rounded-full ${isScreensaver ? screensaverBtnClass : greyBtnClass}`} title="Zoom In"><ZoomIn size={20} /></button>
                  <button onClick={() => setViewTransform({ x:0, y:0, k: calculateOptimalScale(config, window.innerWidth, window.innerHeight) })} className={`p-2 rounded-full ${isScreensaver ? screensaverBtnClass : greyBtnClass}`} title="Reset View"><Maximize size={20} /></button>
                  <button onClick={() => setViewTransform(prev => ({ ...prev, k: prev.k / 1.2 }))} className={`p-2 rounded-full ${isScreensaver ? screensaverBtnClass : greyBtnClass}`} title="Zoom Out"><ZoomOut size={20} /></button>
                  
                  {isScreensaver && (
                    <>
                        <button onClick={triggerNextScreensaverImage} className={`p-2 rounded-full ${screensaverBtnClass}`} title="New Random Pattern"><Shuffle size={20} /></button>
                        
                        {/* Screensaver Sliders */}
                        <div className="flex items-center gap-4 md:gap-6 md:ml-4 bg-slate-900 p-3 rounded-xl shadow-lg border border-slate-800/50">
                            <div className="flex flex-col gap-1 w-20 md:w-28">
                                <div className="flex justify-between text-[10px] text-slate-500 font-medium px-1">
                                    <span>Speed</span>
                                    <span className="text-slate-500">{config.speed.toFixed(1)}</span>
                                </div>
                                <input
                                    type="range" min={0.1} max={15} step={0.1} value={config.speed}
                                    onChange={(e) => setConfig(c => ({...c, speed: parseFloat(e.target.value)}))}
                                    className="h-1 bg-slate-950 rounded-full appearance-none cursor-pointer focus:outline-none transition-colors [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-600 hover:[&::-webkit-slider-thumb]:bg-slate-500"
                                />
                            </div>
                            <div className="flex flex-col gap-1 w-20 md:w-28">
                                <div className="flex justify-between text-[10px] text-slate-500 font-medium px-1">
                                    <span>Thickness</span>
                                    <span className="text-slate-500">{config.lineWidth.toFixed(2)}</span>
                                </div>
                                <input
                                    type="range" min={0.1} max={15} step={0.1} value={config.lineWidth}
                                    onChange={(e) => setConfig(c => ({...c, lineWidth: parseFloat(e.target.value)}))}
                                    className="h-1 bg-slate-950 rounded-full appearance-none cursor-pointer focus:outline-none transition-colors [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-600 hover:[&::-webkit-slider-thumb]:bg-slate-500"
                                />
                            </div>
                        </div>

                        {/* Infinity & Timer section with duration input */}
                        <div className="flex items-center gap-2 md:gap-4 md:ml-4">
                            <button onClick={() => setIsInfinityMode(!isInfinityMode)} className={`p-2 rounded-full ${screensaverBtnClass}`} title={isInfinityMode ? "Disable Infinity Mode" : "Enable Infinity Mode"}>
                                {isInfinityMode ? <InfinityOff size={20} /> : <InfinityIcon size={20} />}
                            </button>

                            {!isInfinityMode && (
                                <div className={`flex items-center gap-2 px-2 md:px-3 py-2 rounded-lg font-mono text-[10px] md:text-xs shadow-lg transition-colors select-none bg-slate-900 text-slate-500 border border-slate-800/50`}>
                                    <Clock size={16} />
                                    <span className="w-10 md:w-12 text-center">{formatTime(timeLeft)}</span>
                                    <div className="w-px h-4 bg-slate-800 mx-1"></div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-slate-600">every</span>
                                        <input 
                                            type="number" min="0.1" step="0.1" value={durationInput} onChange={handleDurationInputChange}
                                            className="themed-spin w-8 md:w-10 bg-transparent text-center border-b border-slate-700 text-slate-500 focus:outline-none focus:border-slate-500 hover:border-slate-600 transition-colors"
                                        />
                                        <span className="text-[10px] text-slate-600">min</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                  )}
              </div>

              {/* Screensaver Download buttons */}
              {isScreensaver && (
                  <div className="flex items-center gap-2 mt-2 md:mt-0 justify-end">
                    <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-full border border-slate-800/50">
                        <button onClick={() => setDownloadState({ active: true, theme: 'light', withStats: false })} className={`p-2 rounded-full ${screensaverLightBtnClass} shadow-none`} title="Download Light Image"><Download size={20} /></button>
                        <button onClick={() => setDownloadState({ active: true, theme: 'light', withStats: true })} className={`p-2 rounded-full ${screensaverLightBtnClass} shadow-none`} title="Download Light Image with Data"><FileText size={20} /></button>
                    </div>
                    <div className="w-px h-6 bg-slate-800 mx-1 md:mx-2"></div>
                    <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-full border border-slate-800/50">
                        <button onClick={() => setDownloadState({ active: true, theme: 'dark', withStats: false })} className={`p-2 rounded-full ${screensaverBtnClass} shadow-none`} title="Download Dark Image"><Download size={20} /></button>
                        <button onClick={() => setDownloadState({ active: true, theme: 'dark', withStats: true })} className={`p-2 rounded-full ${screensaverBtnClass} shadow-none`} title="Download Dark Image with Data"><FileText size={20} /></button>
                    </div>
                    <button onClick={stopScreensaver} className={`p-2.5 rounded-full ${screensaverBtnClass} border-slate-800/50 text-slate-500 hover:text-slate-300 ml-1 md:ml-2`} title="Exit"><X size={22} /></button>
                  </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default App;