import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Controls } from './components/Controls';
import { SpirographRenderer } from './components/SpirographRenderer';
import { SpiroConfig, Theme } from './types';
import { DEFAULT_CONFIG, PRESET_COLORS } from './constants';
import { Settings, X, Maximize, Minimize, ZoomIn, ZoomOut, Shuffle, Download, Infinity as InfinityIcon, Clock, FileText, Image as ImageIcon, Pause, Play, Trash2, Sparkles, Sun, Moon } from 'lucide-react';

// Custom Crossed Infinity Icon to match "Show Gears" style (EyeOff)
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
        <path d="M12 12c-2-2.3-4-4-7-4a4 4 0 1 0 0 8c3 0 5-1.7 7-4m0 0c2 2.3 4 4 7 4a4 4 0 1 0 0-8c-3 0-5 1.7-7 4" />
        <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
);

// Helper for global cursor control to ensure consistency across lifecycle
const toggleGlobalCursor = (hidden: boolean) => {
    const action = hidden ? 'add' : 'remove';
    document.documentElement.classList[action]('app-no-cursor');
    document.body.classList[action]('app-no-cursor');
    document.getElementById('root')?.classList[action]('app-no-cursor');

    // Forceful override using style tag for maximum reliability
    const styleId = 'force-cursor-none';
    const existingStyle = document.getElementById(styleId);
    
    const transparentCursor = "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), none";

    if (hidden) {
        if (!existingStyle) {
            const style = document.createElement('style');
            style.id = styleId;
            // This ONLY handles the nuclear option of hiding everything.
            // The restoration/forcing of cursor visible is handled by the persistent style block in App component.
            style.textContent = `
                *, *::before, *::after { 
                    cursor: none !important; 
                    cursor: ${transparentCursor} !important;
                }
            `;
            document.head.appendChild(style);
        }
    } else {
        if (existingStyle) {
            existingStyle.remove();
        }
    }
};

// Persistent styles for force-visible cursor areas
// This ensures that even when the global 'hidden' style is removed (during activity),
// and the app falls back to 'cursor-none' class on the container,
// these specific controls still force a visible cursor.
const PERSISTENT_STYLES = `
    .force-cursor-visible, .force-cursor-visible * {
        cursor: default !important;
    }
    .force-cursor-visible button, 
    .force-cursor-visible a, 
    .force-cursor-visible [role="button"],
    .force-cursor-visible input,
    .force-cursor-visible input[type="range"],
    .force-cursor-visible input[type="range"]::-webkit-slider-thumb {
        cursor: pointer !important;
    }
    /* Ensure text inputs/labels are selectable or at least have default cursor */
    .force-cursor-visible span, 
    .force-cursor-visible label,
    .force-cursor-visible p {
        cursor: default !important;
    }
`;

// Helper to generate a random configuration
const generateRandomConfig = (currentTheme: Theme = 'light'): SpiroConfig => {
  // Generate random eccentricities (aspects)
  const randomEccentricity = () => {
    const val = 0.6 + Math.random() * 0.8; // 0.6 to 1.4
    return Math.abs(val - 1.0) < 0.1 ? 0.6 : Number(val.toFixed(2));
  };

  // Generate random ratio with numerator/denominator between 2 and 100
  let n, d;
  do {
    n = Math.floor(Math.random() * 99) + 2; // 2 to 100
    d = Math.floor(Math.random() * 99) + 2; // 2 to 100
  } while (n === d);
  
  const ratio = n / d;

  // Generate geometry
  const outerRadius = Math.floor(60 + Math.random() * 50); // 60 - 110
  const innerRadius = Math.floor(outerRadius * ratio);
  
  // Pen offset
  const penOffset = Math.floor(innerRadius * (0.4 + Math.random() * 0.8));

  // Random Color Logic (Exclude background)
  const forbiddenColor = currentTheme === 'dark' ? '#000000' : '#ffffff';
  const availableColors = PRESET_COLORS.filter(c => c !== forbiddenColor);
  const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];

  return {
    ...DEFAULT_CONFIG,
    outerRadius,
    innerRadius,
    penOffset,
    statorAspect: randomEccentricity(),
    rotorAspect: randomEccentricity(),
    penColor: randomColor,
    showGears: true,
    speed: 1, // Default speed (slow)
    numerator: n,
    denominator: d
  };
};

const calculateOptimalScale = (cfg: SpiroConfig, width: number, height: number): number => {
    const R = cfg.outerRadius;
    const r = cfg.innerRadius;
    const d = cfg.penOffset;
    
    const sAspect = cfg.statorAspect || 1;
    const rAspect = cfg.rotorAspect || 1;
    
    // Effective max radii accounting for eccentricity
    const maxR = R * Math.max(1, sAspect);
    const maxr = r * Math.max(1, rAspect);
    
    // Calculate max radial distance from center
    // Center of rotor orbits at distance |R-r| from origin (approximately)
    const centerDist = Math.abs(R - r);
    
    // 1. Trace extent: centerDist + d
    const traceExtent = centerDist + d;
    
    // 2. Gears extent: centerDist + rotorRadius (if gears shown)
    const gearExtent = cfg.showGears ? (centerDist + maxr) : 0;
    
    // 3. Stator extent: statorRadius
    const statorExtent = maxR;
    
    // Max extent from origin
    const maxExtent = Math.max(traceExtent, gearExtent, statorExtent);
    
    // Fit within the smallest screen dimension with padding
    const padding = 0.9; 
    const minDim = Math.min(width, height);
    
    // Desired: maxExtent * scale <= minDim / 2 * padding
    const scale = (minDim / 2 * padding) / (maxExtent || 1);
    
    // Clamp to reasonable limits (0.1x to 5x)
    return Math.max(0.1, Math.min(5, scale));
};

// Helper for responsive line width calculation
const calculateResponsiveLineWidth = (k: number, width: number, height: number) => {
    const minDim = Math.min(width, height);
    // Visual thickness ~ proportional to screen size
    // For 400px screen (phone) -> ~1.2-1.5px
    // For 1080px screen (desktop) -> ~2.7-3.0px
    const targetVisualWidth = Math.max(1.2, minDim / 400); 
    const computedLineWidth = targetVisualWidth / (k || 1);
    return Math.max(0.1, Math.min(30, computedLineWidth));
};

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const App: React.FC = () => {
  // Use random config for initial state (light mode default)
  const [config, setConfig] = useState<SpiroConfig>(() => generateRandomConfig('light'));
  
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [shouldClear, setShouldClear] = useState<boolean>(false);
  const [downloadState, setDownloadState] = useState<{ active: boolean; theme?: 'dark' | 'light'; withStats?: boolean; }>({ active: false });
  const [showControls, setShowControls] = useState<boolean>(false);
  const [theme, setTheme] = useState<Theme>('light');
  
  // New States
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isScreensaver, setIsScreensaver] = useState<boolean>(false);
  const [isInfinityMode, setIsInfinityMode] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [screensaverDuration, setScreensaverDuration] = useState<number>(300000); // Default 5 minutes
  const [durationInput, setDurationInput] = useState<string>("5");

  // View Transform State (Lifted from Renderer)
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, k: 1 });
  
  // Screensaver Idle State
  const [isIdle, setIsIdle] = useState<boolean>(false);
  
  // Ref to store previous theme and fullscreen state
  const previousThemeRef = useRef<Theme>(theme);
  const wasFullscreenBeforeScreensaverRef = useRef<boolean>(false);
  const nextSwitchTimeRef = useRef<number>(0);
  const isInfinityModeRef = useRef(isInfinityMode);
  
  // Sync ref
  useEffect(() => {
    isInfinityModeRef.current = isInfinityMode;
  }, [isInfinityMode]);

  // Initialize scale and line width on mount
  useEffect(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const k = calculateOptimalScale(config, width, height);
    
    // Set initial responsive line width
    const lw = calculateResponsiveLineWidth(k, width, height);
    setConfig(prev => ({ ...prev, lineWidth: lw }));

    setViewTransform(prev => ({ ...prev, k }));
  }, []);

  // --- Fullscreen Logic ---
  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
  }, []);

  // Sync fullscreen state with browser events
  const stopScreensaver = useCallback(() => {
    setIsScreensaver(false);
    setIsInfinityMode(false);
    
    // IMMEDIATE Restore cursor on all elements
    toggleGlobalCursor(false);
    
    // Exit fullscreen ONLY if we weren't fullscreen before screensaver started
    // If the user manually toggled fullscreen before walking away, keep it fullscreen.
    if (!wasFullscreenBeforeScreensaverRef.current && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }

    // Restore previous theme
    setTheme(previousThemeRef.current);
    
    // Restore sane defaults but PRESERVE the current settings used in screensaver (Speed, Thickness, etc)
    // We only enable gears to ensure the user isn't lost.
    setConfig(prev => ({ 
        ...prev, 
        showGears: true,
        // Do NOT reset speed or lineWidth. Keep what was "used by the player within screensaver".
    }));
  }, [theme]); 

  useEffect(() => {
    const handleFullscreenChange = () => {
        const isFS = !!document.fullscreenElement;
        setIsFullscreen(isFS);
        
        // Ensure cursor remains hidden if we are in screensaver
        if (isFS && isScreensaver) {
            toggleGlobalCursor(true);
        }

        // If user exits fullscreen manually (pressed Esc), exit screensaver
        // But only if it was the screensaver that (presumably) requested it or we are in screensaver mode
        if (!isFS && isScreensaver) {
            stopScreensaver();
        }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isScreensaver, stopScreensaver]);

  // --- Screensaver Logic ---
  
  // Idle Timer
  // Use useLayoutEffect to ensure cursor hiding happens before paint
  useLayoutEffect(() => {
    if (!isScreensaver) {
        setIsIdle(false);
        // Ensure class is removed when not in screensaver
        toggleGlobalCursor(false);
        return;
    }

    // Start as idle (controls hidden) immediately
    setIsIdle(true);
    // FORCE CURSOR HIDDEN IMMEDIATELY
    toggleGlobalCursor(true);

    let idleTimer: number;
    let listenerTimeout: number;
    
    const onActivity = () => {
        setIsIdle(false);
        // SHOW CURSOR on activity
        toggleGlobalCursor(false);

        clearTimeout(idleTimer);
        // Hide cursor again after 3 seconds of inactivity
        idleTimer = window.setTimeout(() => {
            setIsIdle(true);
            toggleGlobalCursor(true);
        }, 3000);
    };

    // Delay attaching listeners to prevent immediate trigger from the click that started the screensaver.
    // 1s delay ensures initial movement doesn't wake it.
    listenerTimeout = window.setTimeout(() => {
        window.addEventListener('mousemove', onActivity);
        window.addEventListener('mousedown', onActivity);
        window.addEventListener('touchstart', onActivity);
        // Removed keydown to prevent Space from showing menu
    }, 1000);

    return () => {
        window.removeEventListener('mousemove', onActivity);
        window.removeEventListener('mousedown', onActivity);
        window.removeEventListener('touchstart', onActivity);
        clearTimeout(idleTimer);
        clearTimeout(listenerTimeout);
        // Cleanup: ensure cursor is visible when effect cleans up (e.g. unmount)
        toggleGlobalCursor(false);
    };
  }, [isScreensaver]);

  const startScreensaver = () => {
    // 1. DOM OVERRIDE (Sync) - Apply immediately
    toggleGlobalCursor(true);
    
    // Double ensure with a small delay to catch any browser frame weirdness
    requestAnimationFrame(() => toggleGlobalCursor(true));

    // 2. Remove focus and selection
    (document.activeElement as HTMLElement)?.blur();
    document.getSelection()?.removeAllRanges();
    
    // 3. Capture current state
    const isCurrentlyFullscreen = !!document.fullscreenElement;
    wasFullscreenBeforeScreensaverRef.current = isCurrentlyFullscreen;

    // 4. State Updates
    // Explicitly set isIdle to true before anything else to ensure controls start hidden
    setIsIdle(true);
    setIsScreensaver(true);
    
    // 5. Fullscreen Attempt
    // Note: If triggered by a timer (auto-screensaver), requestFullscreen will fail due to browser security policies.
    // We catch the error so the app continues in "Windowed Screensaver" mode.
    if (!isCurrentlyFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {
            // Expected error on auto-trigger
        });
    }
    
    // 6. Theme and Config
    previousThemeRef.current = theme;
    setTheme('dark');
    
    // 7. Config Adaptation (Continue current drawing)
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Calculate new scale to fit the screen
    const k = calculateOptimalScale(config, width, height);
    
    // Calculate proportional line thickness using helper
    const computedLineWidth = calculateResponsiveLineWidth(k, width, height);
    
    // Update config with new visual properties, preserving the rest
    setConfig(prev => ({
        ...prev,
        lineWidth: computedLineWidth,
        speed: 1, // Reset speed to default screensaver speed
        // Preserve colors, gears, geometry
    }));
    
    // Apply new transform
    setViewTransform({ x: 0, y: 0, k });
    
    // Ensure animation is playing
    setIsPlaying(true);
    
    // Start timer for the *next* image (Using configurable duration)
    const duration = screensaverDuration;
    nextSwitchTimeRef.current = Date.now() + duration;
    setTimeLeft(Math.ceil(duration / 1000));
  };

  // Auto-screensaver trigger (10 minutes of inactivity)
  useEffect(() => {
    if (isScreensaver) return;

    const IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes
    let timerId: number;

    const goIdle = () => {
        startScreensaver();
    };

    const resetTimer = () => {
        window.clearTimeout(timerId);
        timerId = window.setTimeout(goIdle, IDLE_TIMEOUT);
    };

    // Attach listeners for activity
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'wheel'];
    events.forEach(event => window.addEventListener(event, resetTimer));

    // Initialize
    resetTimer();

    return () => {
        window.clearTimeout(timerId);
        events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [isScreensaver, startScreensaver]);

  const triggerNextScreensaverImage = useCallback(() => {
    // Screensaver is always dark mode
    const newConfig = generateRandomConfig('dark');
    newConfig.speed = 1; // Default slow speed for new image
    newConfig.showGears = true; 
    
    // Auto-scale
    const width = window.innerWidth;
    const height = window.innerHeight;
    const k = calculateOptimalScale(newConfig, width, height);
    setViewTransform({ x: 0, y: 0, k });

    // Calculate line width using helper
    const computedLineWidth = calculateResponsiveLineWidth(k, width, height);
    
    newConfig.lineWidth = computedLineWidth;

    setConfig(newConfig);
    setShouldClear(true);
    setIsPlaying(true);
    
    // Set timer for next switch (Using configurable duration)
    const duration = screensaverDuration; 
    nextSwitchTimeRef.current = Date.now() + duration;
    setTimeLeft(Math.ceil(duration / 1000));
  }, [screensaverDuration]);

  // Timer Interval Effect
  useEffect(() => {
    if (!isScreensaver || isInfinityMode) return;

    const interval = setInterval(() => {
        const now = Date.now();
        const diff = nextSwitchTimeRef.current - now;
        
        if (diff <= 0) {
            triggerNextScreensaverImage();
        } else {
            setTimeLeft(Math.ceil(diff / 1000));
        }
    }, 1000);

    return () => clearInterval(interval);
  }, [isScreensaver, isInfinityMode, triggerNextScreensaverImage]);

  // Handle interactions to exit screensaver
  useEffect(() => {
    if (!isScreensaver) return;

    const controller = new AbortController();
    const { signal } = controller;

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
            e.preventDefault();
            triggerNextScreensaverImage();
        } else {
            // Exit on any other key (like Escape)
            stopScreensaver();
        }
    };

    window.addEventListener('keydown', handleKeyDown, { signal });

    return () => {
        controller.abort();
    };
  }, [isScreensaver, stopScreensaver, triggerNextScreensaverImage]);

  const handleTogglePlay = () => setIsPlaying(!isPlaying);
  
  const handleClear = () => {
    setShouldClear(true);
  };

  const handleDownloaded = () => setDownloadState({ active: false });
  
  const handleCleared = () => {
    setShouldClear(false);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };
  
  // View Control Handlers
  const handleZoomIn = (e: React.MouseEvent) => {
    setViewTransform(prev => ({ ...prev, k: Math.min(20, prev.k * 1.2) }));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    setViewTransform(prev => ({ ...prev, k: Math.max(0.1, prev.k / 1.2) }));
  };

  const handleResetView = (e: React.MouseEvent) => {
    // Re-calculate optimal fit for current config
    const k = calculateOptimalScale(config, window.innerWidth, window.innerHeight);
    setViewTransform({ x: 0, y: 0, k });
  };
  
  const handleNewScreensaverImage = (e: React.MouseEvent) => {
    triggerNextScreensaverImage();
  };

  const handleToggleInfinity = (e: React.MouseEvent) => {
    const newVal = !isInfinityMode;
    setIsInfinityMode(newVal);
    
    if (!newVal) {
        // Mode Disabled: Reset the timer to a full duration instead of immediate switch
        const duration = screensaverDuration;
        nextSwitchTimeRef.current = Date.now() + duration;
        setTimeLeft(Math.ceil(duration / 1000));
    }
  };

  const handleDurationInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    setDurationInput(valStr);
    
    const val = parseFloat(valStr);
    if (!isNaN(val) && val > 0) {
        const newDuration = val * 60 * 1000;
        setScreensaverDuration(newDuration);
        
        // Update active timer immediately if valid
        if (isScreensaver && !isInfinityMode) {
             nextSwitchTimeRef.current = Date.now() + newDuration;
             setTimeLeft(Math.ceil(newDuration / 1000));
        }
    }
  };

  // Called by Controls when "Random" is clicked (Desktop/Settings drawer)
  const handleAutoZoom = useCallback((newConfig: SpiroConfig) => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const k = calculateOptimalScale(newConfig, width, height);
    
    // Override line width for desktop random action as well
    const lw = calculateResponsiveLineWidth(k, width, height);
    setConfig(c => ({ ...newConfig, lineWidth: lw }));

    setViewTransform({ x: 0, y: 0, k });
  }, []);

  const handleMobileRandom = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const newConfig = generateRandomConfig(theme);
    
    const k = calculateOptimalScale(newConfig, width, height);
    
    // Override line width for mobile random action
    const lw = calculateResponsiveLineWidth(k, width, height);
    newConfig.lineWidth = lw;

    setConfig(newConfig);
    setShouldClear(true);
    setIsPlaying(true);
    setViewTransform({ x: 0, y: 0, k });
  };

  // Theme-based classes
  const containerClass = theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-white text-slate-900';
  const mobileHeaderClass = theme === 'dark' ? 'bg-slate-900' : 'bg-white border-b border-slate-200';
  const mobileTextClass = theme === 'dark' 
    ? 'text-slate-600 group-hover:text-slate-500' 
    : 'text-slate-200 group-hover:text-slate-500';

  const logoBg = theme === 'dark' ? 'white' : 'black';
  
  // Updated settingsBtnClass to match web browser theme colors exactly
  const settingsBtnClass = theme === 'dark' 
    ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' 
    : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100';
  
  // Grey Button Class (Control Panel)
  const greyBtnClass = theme === 'dark'
    ? 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
    : 'bg-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-300';
    
  // Screensaver Darker Grey Button Class
  const screensaverBtnClass = 'bg-slate-900 text-slate-500 hover:bg-slate-800 hover:text-slate-400 shadow-lg transition-colors';
  
  // Inverted class for Light Theme download buttons (Grey bg, Black text)
  const screensaverLightBtnClass = 'bg-slate-500 text-slate-900 hover:bg-slate-400 hover:text-slate-950 shadow-lg transition-colors';
  
  // Determine if overlay controls should be shown
  const showOverlay = isScreensaver ? !isIdle : true;
  const overlayOpacityClass = isScreensaver 
     ? (showOverlay ? 'opacity-100' : 'opacity-0')
     : 'opacity-0 group-hover:opacity-100';

  return (
    <div 
        className={`flex flex-col md:flex-row h-screen w-screen relative overflow-hidden transition-colors duration-300 ${containerClass} ${isScreensaver ? 'cursor-none' : ''}`}
    >
      <style>{PERSISTENT_STYLES}</style>

      {/* Screensaver Overlay Exit Button (Only visible in screensaver when active) */}
      {isScreensaver && (
        <div 
            className={`absolute top-0 right-0 p-10 z-[100] transition-opacity duration-300 ${!isIdle ? 'opacity-100' : 'opacity-0'} ${isScreensaver && isIdle ? 'pointer-events-none' : ''} ${isScreensaver ? 'force-cursor-visible' : ''}`}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
        >
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    stopScreensaver();
                }}
                className="bg-transparent hover:bg-slate-800 text-slate-500 hover:text-slate-300 p-3 rounded-full backdrop-blur-sm transition-all border border-transparent hover:border-slate-700"
                title="Exit Screensaver"
            >
                <X size={24} />
            </button>
        </div>
      )}

      {/* Mobile Header (Hidden in Screensaver) */}
      {!isScreensaver && (
        <div className={`md:hidden p-4 flex justify-between items-center z-30 shrink-0 ${mobileHeaderClass}`}>
            <a 
            href="https://igormineyev.github.io/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="flex flex-col group"
            >
                <span className={`text-[10px] font-bold mb-1 pl-1 transition-colors duration-300 ${mobileTextClass}`}>Igor Mineyev's</span>
                <div className="inline-block">
                    <div 
                        style={{ 
                        background: logoBg, 
                        padding: '4px 10px', 
                        borderRadius: '8px', 
                        display: 'inline-block',
                        lineHeight: '1'
                        }}
                    >
                        <span style={{ color: '#22c55e', fontSize: '18px', fontWeight: 'bold' }}>SpiroGraph</span>
                    </div>
                </div>
            </a>
            
            <div className="flex items-center gap-2">
                <button 
                onClick={handleMobileRandom} 
                className={`p-2 rounded-lg transition-colors ${settingsBtnClass}`}
                aria-label="Draw random"
                >
                <Sparkles size={20} />
                </button>

                <button 
                onClick={toggleTheme} 
                className={`p-2 rounded-lg transition-colors ${settingsBtnClass}`}
                aria-label="Toggle theme"
                >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </button>

                <button 
                onClick={() => setShowControls(true)} 
                className={`p-2 rounded-lg transition-colors ${settingsBtnClass}`}
                aria-label="Open settings"
                >
                <Settings size={20} />
                </button>
            </div>
        </div>
      )}

      {/* Controls Container - Responsive Drawer (Hidden in Screensaver) */}
      <div className={`
        fixed inset-0 z-50 md:static md:z-auto 
        ${isScreensaver ? 'hidden' : 'md:block'}
        transition-transform duration-300 ease-in-out
        ${showControls ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Controls
          key={isScreensaver ? 'screensaver' : 'active'}
          config={config}
          setConfig={setConfig}
          isPlaying={isPlaying}
          onTogglePlay={handleTogglePlay}
          onClear={handleClear}
          onDownload={(withStats) => setDownloadState({ active: true, withStats })}
          onClose={() => setShowControls(false)}
          theme={theme}
          onToggleTheme={toggleTheme}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          onStartScreensaver={startScreensaver}
          onAutoZoom={handleAutoZoom}
        />
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative h-full w-full overflow-hidden group">
        <SpirographRenderer 
          config={config}
          isPlaying={isPlaying}
          shouldClear={shouldClear}
          onCleared={handleCleared}
          downloadState={downloadState}
          onDownloaded={handleDownloaded}
          theme={theme}
          transform={viewTransform}
          onTransformChange={setViewTransform}
          isCursorHidden={isScreensaver && isIdle}
        />
        
        {/* Left View Controls Overlay */}
        <div 
            className={`absolute bottom-0 left-0 p-10 z-30 flex items-end transition-opacity duration-300 ${overlayOpacityClass} ${isScreensaver && isIdle ? 'pointer-events-none' : ''} ${isScreensaver ? 'force-cursor-visible' : ''}`}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
        >
           {/* 1. Zoom/Pan/Shuffle Controls - Standard Controls */}
           <div className="flex items-center gap-4">
                <button 
                    onClick={handleZoomIn}
                    className={`p-2 rounded-full ${isScreensaver ? screensaverBtnClass : greyBtnClass}`}
                    title="Zoom In"
                >
                    <ZoomIn size={20} />
                </button>
                <button 
                    onClick={handleResetView}
                    className={`p-2 rounded-full ${isScreensaver ? screensaverBtnClass : greyBtnClass}`}
                    title="Reset View"
                >
                    <Maximize size={20} />
                </button>
                <button 
                    onClick={handleZoomOut}
                    className={`p-2 rounded-full ${isScreensaver ? screensaverBtnClass : greyBtnClass}`}
                    title="Zoom Out"
                >
                    <ZoomOut size={20} />
                </button>
                
                {isScreensaver && (
                    <button 
                        onClick={handleNewScreensaverImage}
                        className={`p-2 rounded-full ${screensaverBtnClass}`}
                        title="New Random Pattern"
                    >
                        <Shuffle size={20} />
                    </button>
                )}
           </div>

           {/* 2. Screensaver Sliders - The "Controls" */}
           {isScreensaver && (
               <div className="flex items-center gap-6 ml-4 bg-slate-900 p-3 rounded-xl shadow-lg border border-slate-800/50">
                   <div className="flex flex-col gap-1 w-28">
                        <div className="flex justify-between text-[10px] text-slate-500 font-medium px-1">
                            <span>Speed</span>
                            <span className="text-slate-500">{config.speed.toFixed(1)}</span>
                        </div>
                        <input
                            type="range"
                            min={0.1}
                            max={10}
                            step={0.1}
                            value={config.speed}
                            onChange={(e) => setConfig(c => ({...c, speed: parseFloat(e.target.value)}))}
                            className="h-1 bg-slate-950 rounded-full appearance-none cursor-pointer focus:outline-none transition-colors [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-600 [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:bg-slate-500"
                        />
                   </div>
                    <div className="flex flex-col gap-1 w-28">
                        <div className="flex justify-between text-[10px] text-slate-500 font-medium px-1">
                            <span>Thickness</span>
                            <span className="text-slate-500">{config.lineWidth.toFixed(2)}</span>
                        </div>
                        <input
                            type="range"
                            min={0.1}
                            max={15}
                            step={0.1}
                            value={config.lineWidth}
                            onChange={(e) => setConfig(c => ({...c, lineWidth: parseFloat(e.target.value)}))}
                            className="h-1 bg-slate-950 rounded-full appearance-none cursor-pointer focus:outline-none transition-colors [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-600 [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:bg-slate-500"
                        />
                   </div>
               </div>
           )}

            {/* 3. Infinity & Timer - Right of the sliders */}
            {isScreensaver && (
               <div className="flex items-center gap-4 ml-4">
                    <button 
                        onClick={handleToggleInfinity}
                        className={`p-2 rounded-full ${screensaverBtnClass}`}
                        title={isInfinityMode ? "Disable Infinity Mode (Enable Timer)" : "Enable Infinity Mode (Keep Drawing)"}
                    >
                        {isInfinityMode ? <InfinityOff size={20} /> : <InfinityIcon size={20} />}
                    </button>

                    {!isInfinityMode && (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs shadow-lg transition-colors select-none bg-slate-900 text-slate-500 border border-slate-800/50`}>
                            <Clock size={16} />
                            <span className="w-12 text-center">{formatTime(timeLeft)}</span>
                            <div className="w-px h-4 bg-slate-800 mx-1"></div>
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-600">every</span>
                                <input 
                                    type="number" 
                                    min="0.1"
                                    step="0.1"
                                    value={durationInput}
                                    onChange={handleDurationInputChange}
                                    className="w-10 bg-transparent text-center border-b border-slate-700 text-slate-500 focus:outline-none focus:border-slate-500 hover:border-slate-600 transition-colors appearance-none [color-scheme:dark] [&::-webkit-inner-spin-button]:opacity-50 hover:[&::-webkit-inner-spin-button]:opacity-100"
                                />
                                <span className="text-[10px] text-slate-600">min</span>
                            </div>
                        </div>
                    )}
               </div>
           )}
        </div>

        {/* Right Download Controls Overlay (Screensaver Only) */}
        {isScreensaver && (
            <div 
                className={`absolute bottom-0 right-0 p-10 z-30 flex items-center gap-2 transition-opacity duration-300 ${overlayOpacityClass} ${isScreensaver && isIdle ? 'pointer-events-none' : ''} ${isScreensaver ? 'force-cursor-visible' : ''}`}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
            >
                {/* Light Theme Group */}
                <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-full border border-slate-800/50">
                    <button 
                        onClick={() => setDownloadState({ active: true, theme: 'light', withStats: false })}
                        className={`p-2 rounded-full ${screensaverLightBtnClass} shadow-none`}
                        title="Download Light Image"
                    >
                        <Download size={20} />
                    </button>
                    <button 
                        onClick={() => setDownloadState({ active: true, theme: 'light', withStats: true })}
                        className={`p-2 rounded-full ${screensaverLightBtnClass} shadow-none`}
                        title="Download Light Image with Data"
                    >
                        <FileText size={20} />
                    </button>
                </div>
                
                <div className="w-px h-6 bg-slate-800 mx-2"></div>

                {/* Dark Theme Group */}
                <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-full border border-slate-800/50">
                    <button 
                        onClick={() => setDownloadState({ active: true, theme: 'dark', withStats: false })}
                        className={`p-2 rounded-full ${screensaverBtnClass} shadow-none`}
                        title="Download Dark Image"
                    >
                        <Download size={20} />
                    </button>
                    <button 
                        onClick={() => setDownloadState({ active: true, theme: 'dark', withStats: true })}
                        className={`p-2 rounded-full ${screensaverBtnClass} shadow-none`}
                        title="Download Dark Image with Data"
                    >
                        <FileText size={20} />
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default App;