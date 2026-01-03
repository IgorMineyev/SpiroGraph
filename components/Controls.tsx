import React, { useState, useEffect } from 'react';
import { SpiroConfig, Theme } from '../types';
import { PRESET_COLORS } from '../constants';
import { Play, Pause, Trash2, Download, Eye, EyeOff, X, Shuffle, Sparkles, Sun, Moon, Monitor, Maximize, Minimize, FileText, Palette, Heart } from 'lucide-react';

interface ControlsProps {
  config: SpiroConfig;
  setConfig: React.Dispatch<React.SetStateAction<SpiroConfig>>;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onClear: () => void;
  onDownload: (withStats: boolean) => void;
  onClose?: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onStartScreensaver: () => void;
  onAutoZoom?: (config: SpiroConfig) => void;
}

const calculateEllipseCircumference = (radius: number, aspect: number): number => {
  // Ramanujan's approximation
  const a = radius;
  const b = radius * aspect;
  if (aspect === 1) return 2 * Math.PI * radius;
  
  const h = Math.pow(a - b, 2) / Math.pow(a + b, 2);
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
};

const SliderControl: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  theme: Theme;
}> = ({ label, value, min, max, step = 1, onChange, theme }) => {
  const [inputValue, setInputValue] = useState(value.toString());

  useEffect(() => {
    // Only update from prop if the numeric value actually differs, 
    // to prevent cursor jumping or formatting conflicts while typing.
    if (parseFloat(inputValue) !== value) {
         const display = step < 1 
            ? parseFloat(value.toFixed(4)).toString() 
            : value.toString();
        setInputValue(display);
    }
  }, [value, step]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      onChange(val);
    }
  };

  const handleBlur = () => {
      if (inputValue === '' || isNaN(parseFloat(inputValue))) {
          setInputValue(value.toString());
      } else {
           const display = step < 1 
            ? parseFloat(value.toFixed(4)).toString() 
            : value.toString();
          setInputValue(display);
      }
  };

  return (
    <div className="mb-2">
      <div className={`flex justify-between items-center text-xs mb-1 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
        <span>{label}</span>
        <input
            type="number"
            min={min}
            max={max}
            step="any"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            className={`
                w-20 bg-transparent text-right font-mono focus:outline-none border-b 
                ${theme === 'dark' 
                    ? 'border-slate-700 focus:border-slate-500 text-slate-300' 
                    : 'border-slate-300 focus:border-slate-500 text-slate-900'}
                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
            `}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
            const val = Number(e.target.value);
            setInputValue(val.toString());
            onChange(val);
        }}
        className={`
          w-full h-2 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400/50
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-colors
          [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:transition-colors
          ${theme === 'dark' 
            ? 'bg-slate-700 [&::-webkit-slider-thumb]:bg-slate-400 [&::-moz-range-thumb]:bg-slate-400' 
            : 'bg-slate-300 [&::-webkit-slider-thumb]:bg-black [&::-moz-range-thumb]:bg-black'
          }
        `}
      />
    </div>
  );
};

export const Controls: React.FC<ControlsProps> = ({
  config,
  setConfig,
  isPlaying,
  onTogglePlay,
  onClear,
  onDownload,
  onClose,
  theme,
  onToggleTheme,
  isFullscreen,
  onToggleFullscreen,
  onStartScreensaver,
  onAutoZoom
}) => {
  const [numerator, setNumerator] = useState<number>(2);
  const [denominator, setDenominator] = useState<number>(3);

  // Sync ratio inputs with initial configuration
  useEffect(() => {
    // If config already has valid numerator/denominator (e.g. from Random generation), use them
    if (config.numerator && config.denominator) {
        setNumerator(config.numerator);
        setDenominator(config.denominator);
        return;
    }

    // Otherwise calculate best fit
    const outerC = calculateEllipseCircumference(config.outerRadius, config.statorAspect);
    const innerC = calculateEllipseCircumference(config.innerRadius, config.rotorAspect);
    const val = innerC / outerC;
    
    let bestN = 2, bestD = 2;
    let minError = Number.MAX_VALUE;

    // Search small integers to find matching ratio with constraint 2-100
    // We iterate d from 2 to 100.
    for(let d = 2; d <= 100; d++) {
        const n = Math.round(val * d);
        if (n < 2 || n > 100) continue; 
        
        const error = Math.abs(val - n/d);
        if (error < minError) {
            bestN = n;
            bestD = d;
            minError = error;
        }
    }
    
    // Only update if we found a reasonable approximation
    if (minError < 0.2) {
        setNumerator(bestN);
        setDenominator(bestD);
    }
  }, []); // Run once on mount

  const updateConfig = <K extends keyof SpiroConfig>(key: K, value: SpiroConfig[K]) => {
    setConfig((prev) => {
        const updates: any = { [key]: value };
        // If the user manually changes the radius, the stored numerator/denominator ratio 
        // might no longer be valid. Clear them so the renderer falls back to calculation.
        if (key === 'outerRadius' || key === 'innerRadius') {
            updates.numerator = undefined;
            updates.denominator = undefined;
        }
        return { ...prev, ...updates };
    });
  };

  const outerCircumference = calculateEllipseCircumference(config.outerRadius, config.statorAspect);
  const innerCircumference = calculateEllipseCircumference(config.innerRadius, config.rotorAspect);
  
  const applyRatioValues = (num: number, den: number) => {
    if (num <= 0 || den <= 0) return;
    const targetRatio = num / den;
    
    // ratio = inner / outer => inner = outer * ratio
    // To fit the ratio, we calculate the required Inner Circumference
    const targetInnerCircumference = outerCircumference * targetRatio;
    
    // C = C_unit * r => r = C / C_unit
    const unitInnerCircumference = calculateEllipseCircumference(1, config.rotorAspect);
    const newInnerRadius = targetInnerCircumference / unitInnerCircumference;

    // Clamp to valid range (increased max to allow larger inner gears)
    const clampedRadius = Math.max(10, Math.min(400, newInnerRadius));
    
    // Explicitly set radius AND the ratio values
    setConfig(prev => ({
        ...prev,
        innerRadius: clampedRadius,
        numerator: num,
        denominator: den
    }));
  };

  const handleApplyRatio = () => {
    applyRatioValues(numerator, denominator);
  };

  const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

  const handleRandomRatio = () => {
    // Numerator and Denominator run from 2 to 100
    // Ensure they are different
    let n, d;
    do {
      n = getRandomInt(2, 100);
      d = getRandomInt(2, 100);
    } while (n === d);
    
    setNumerator(n);
    setDenominator(d);
    
    // Use current config state to calculate next state
    const prev = config;
    const outerC = calculateEllipseCircumference(prev.outerRadius, prev.statorAspect);
    const targetInnerC = outerC * (n/d);
    const unitInnerC = calculateEllipseCircumference(1, prev.rotorAspect);
    let newInnerRadius = targetInnerC / unitInnerC;
    newInnerRadius = Math.max(10, Math.min(400, newInnerRadius));
    
    // Calculate new random pen offset (0.4 to 1.2 of inner radius)
    const newPenOffset = Math.floor(newInnerRadius * (0.4 + Math.random() * 0.8));
    
    const nextConfig = {
      ...prev,
      innerRadius: newInnerRadius,
      penOffset: newPenOffset,
      numerator: n,
      denominator: d
    };

    setConfig(nextConfig);
    onClear();
    if (!isPlaying) onTogglePlay();
    if (onAutoZoom) onAutoZoom(nextConfig);
  };

  const handleRandomRatioAndEccentricity = () => {
    // Numerator and Denominator run from 2 to 100
    let n, d;
    do {
      n = getRandomInt(2, 100);
      d = getRandomInt(2, 100);
    } while (n === d);

    setNumerator(n);
    setDenominator(d);

    // Random Eccentricities (Aspects)
    // Range 0.2 to 2.0 to match sliders, weighted slightly towards near-circular (0.8-1.2) for aesthetics
    const randomEcc = () => Number((0.2 + Math.random() * 1.8).toFixed(1));
    const sAspect = randomEcc();
    const rAspect = randomEcc();

    // Calculate new inner radius based on new aspects and ratio
    // We can't use applyRatioValues directly because it relies on current config state
    // We must calculate purely based on the new random values
    
    const prev = config;
    const outerC = calculateEllipseCircumference(prev.outerRadius, sAspect);
    const targetInnerC = outerC * (n/d);
    const unitInnerC = calculateEllipseCircumference(1, rAspect); // Uses NEW rAspect
    
    let newInnerRadius = targetInnerC / unitInnerC;
    
    // Clamp
    newInnerRadius = Math.max(10, Math.min(400, newInnerRadius));
    
    // Calculate new random pen offset
    const newPenOffset = Math.floor(newInnerRadius * (0.4 + Math.random() * 0.8));

    // Random Color Logic (Exclude background)
    const forbiddenColor = theme === 'dark' ? '#000000' : '#ffffff';
    const availableColors = PRESET_COLORS.filter(c => c !== forbiddenColor);
    const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];

    const nextConfig = {
        ...prev,
        statorAspect: sAspect,
        rotorAspect: rAspect,
        innerRadius: newInnerRadius,
        penOffset: newPenOffset,
        numerator: n,
        denominator: d,
        penColor: randomColor
    };

    setConfig(nextConfig);
    onClear();
    if (!isPlaying) onTogglePlay();
    if (onAutoZoom) onAutoZoom(nextConfig);
    
    // If on mobile (or whenever onClose is provided), close the controls drawer
    if (onClose) onClose();
  };

  // Styles based on theme
  // Standard 1px border with 5% opacity. Subtle but existent.
  const bgMain = theme === 'dark' 
    ? 'bg-slate-900 border-r border-white/5' 
    : 'bg-white border-r border-slate-900/5';

  const textPrimary = theme === 'dark' ? 'text-slate-400' : 'text-slate-900';
  const textSecondary = theme === 'dark' ? 'text-slate-400' : 'text-slate-600';
  const textMuted = theme === 'dark' ? 'text-slate-400' : 'text-slate-600';
  const bgPanel = theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200';
  const bgInput = theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300';
  
  // New unified grey button class (similar to Show Gears) - Adjusted for better visibility
  const greyBtnClass = theme === 'dark'
    ? 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
    : 'bg-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-300';

  const btnRandom = theme === 'dark' 
    ? 'bg-fuchsia-600/20 hover:bg-fuchsia-600/30 text-fuchsia-400 border-fuchsia-600/30'
    : 'bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-600 border-fuchsia-200';
    
  const btnSetRatio = theme === 'dark'
    ? 'bg-slate-700 hover:bg-slate-600 text-slate-300 border-slate-600'
    : 'bg-slate-200 hover:bg-slate-300 text-slate-700 border-slate-300';

  const btnRandomRatio = theme === 'dark'
    ? 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border-purple-600/30'
    : 'bg-purple-50 hover:bg-purple-100 text-purple-600 border-purple-200';

  const logoBg = theme === 'dark' ? 'white' : 'black';
  
  const logoText = theme === 'dark' 
    ? 'text-slate-600 group-hover:text-slate-500' 
    : 'text-slate-200 group-hover:text-slate-500';

  return (
    <div className={`flex flex-col h-full w-full md:w-80 overflow-y-auto transition-colors duration-300 ${bgMain}`}>
      <div className="p-4 pb-2 flex justify-between items-start">
            <a 
              href="https://igormineyev.github.io/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex flex-col group"
            >
              <span className={`text-[10px] font-bold mb-1 pl-1 transition-colors duration-300 ${logoText}`}>Igor Mineyev's</span>
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
                    <span style={{ color: '#22c55e', fontSize: '20px', fontWeight: 'bold' }}>SpiroGraph</span>
                </div>
              </div>
            </a>
            
            <div className="flex gap-2">
                <button
                    onClick={onToggleFullscreen}
                    className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'}`}
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                    {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                </button>

                <button
                    onClick={onToggleTheme}
                    className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'}`}
                    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                >
                    {theme === 'dark' ? <Sun size={20} fill="currentColor" /> : <Moon size={20} fill="currentColor" />}
                </button>
                {onClose && (
                <button 
                    onClick={onClose}
                    className={`md:hidden transition-colors ${theme === 'dark' ? 'text-slate-500 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
                >
                    <X size={24} />
                </button>
                )}
            </div>
      </div>

      <div className="p-4 pt-2 flex-1 space-y-3">
        {/* Main Actions Group */}
        <div className="space-y-2">
            <button 
                onClick={handleRandomRatioAndEccentricity}
                className={`w-full p-2 rounded-lg border transition-colors flex items-center justify-center gap-3 text-xs font-medium ${btnRandom}`}
                title="Random ratio, eccentricity, pen offset, and color"
            >
                <Sparkles size={20} className="shrink-0" />
                <span>Draw a random spiro curve!</span>
            </button>

             {/* Screensaver Button */}
            <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStartScreensaver();
                }}
                className={`w-full p-2 rounded-lg transition-colors flex items-center justify-center gap-3 text-xs font-medium ${greyBtnClass}`}
            >
                <Monitor size={20} className="shrink-0" />
                <span>Screensaver</span>
            </button>

            <div className="grid grid-cols-2 gap-3">
            <button
                onClick={onTogglePlay}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg font-medium transition-all border ${
                isPlaying
                    ? (theme === 'dark' ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/50' : 'bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200')
                    : (theme === 'dark' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/50' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-200')
                }`}
            >
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                {isPlaying ? 'Pause' : 'Start'}
            </button>
            
            <button
                onClick={onClear}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg transition-all ${greyBtnClass}`}
            >
                <Trash2 size={18} />
                Clear
            </button>
            </div>
        </div>

        {/* Download Section */}
        <div>
            <div className="grid grid-cols-6 gap-2">
                <button
                    onClick={() => onDownload(false)}
                    className={`col-span-5 flex items-center justify-center gap-3 p-2 rounded-lg transition-all ${greyBtnClass}`}
                    title="Download PNG image"
                >
                    <Download size={20} />
                    <div className="flex flex-col items-start">
                        <span className={`text-[10px] leading-tight ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>If you like this picture,</span>
                        <span className="leading-tight">download it.</span>
                    </div>
                </button>
                <button
                    onClick={() => onDownload(true)}
                    className={`col-span-1 flex items-center justify-center p-2 rounded-lg transition-all ${greyBtnClass}`}
                    title="Download PNG with settings"
                >
                    <FileText size={20} />
                </button>
            </div>

            {/* Support Link */}
            <a 
                href="https://igormineyev.github.io/#donate" 
                target="_blank" 
                rel="noopener noreferrer"
                className={`w-full mt-2 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider font-medium opacity-60 hover:opacity-80 transition-opacity ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}
            >
                <Heart size={10} strokeWidth={2.5} />
                <span>Support this math art</span>
            </a>
        </div>

        {/* Speed - Moved here */}
        <SliderControl
          label="Speed"
          value={config.speed}
          min={0.1}
          max={20}
          step={0.1}
          onChange={(v) => updateConfig('speed', v)}
          theme={theme}
        />

        {/* Style Controls - Moved here */}
        <div className="space-y-1">
           <div className="mb-2">
            <div className="flex justify-between items-center mb-2">
                <label className={`text-xs block ${textSecondary}`}>Pen color</label>
                <div className="relative group">
                    <input 
                        type="color" 
                        value={config.penColor} 
                        onChange={(e) => updateConfig('penColor', e.target.value)}
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                        title="Choose custom color"
                    />
                    <div 
                        className={`text-[10px] px-2 py-0.5 rounded border border-transparent flex items-center gap-1 font-bold shadow-sm transition-opacity group-hover:opacity-90 ${theme === 'dark' ? 'text-black' : 'text-white'}`}
                        style={{ 
                            background: 'linear-gradient(90deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7)',
                            textShadow: theme === 'dark' ? 'none' : '0 1px 2px rgba(0,0,0,0.5)'
                        }}
                    >
                        <Palette size={10} strokeWidth={2.5} />
                        <span>Custom</span>
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => updateConfig('penColor', color)}
                  className={`w-full aspect-square rounded-md transition-transform hover:scale-110 border-2 ${
                    config.penColor === color 
                        ? (theme === 'dark' ? 'border-white' : 'border-slate-900') 
                        : 'border-transparent'
                  } ${color === '#ffffff' ? 'border-slate-200' : ''}`}
                  style={{ backgroundColor: color }}
                  aria-label={`Select color ${color}`}
                />
              ))}
            </div>
          </div>

          <SliderControl
            label="Thickness"
            value={config.lineWidth}
            min={0.5}
            max={15}
            step={0.1}
            onChange={(v) => updateConfig('lineWidth', v)}
            theme={theme}
          />
           <SliderControl
            label="Opacity"
            value={config.opacity}
            min={0.1}
            max={1}
            step={0.1}
            onChange={(v) => updateConfig('opacity', v)}
            theme={theme}
          />
        </div>

         {/* Show Gears - Placed after Opacity */}
         <div className="flex items-center justify-between py-2 mb-2">
            <span className={`text-sm ${textMuted}`}>Show gears</span>
            <button
              onClick={() => updateConfig('showGears', !config.showGears)}
              className={`p-2 rounded-lg transition-colors ${
                 theme === 'dark' ? 'bg-slate-800 text-slate-500 hover:text-slate-300' : 'bg-slate-200 text-slate-400 hover:text-slate-600'
              }`}
            >
              {config.showGears ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

        {/* Ratio Tuning */}
        <div className="space-y-1">
          <div className={`rounded-lg p-3 border space-y-3 ${bgPanel}`}>
            {/* Added Label Left Side */}
            <div className="flex items-center justify-center gap-3">
               <span className={`text-xs ${textSecondary}`}>Rotor/stator ratio =</span>
               {/* Vertical Fraction Input - Centered, no decimal display */}
               <div className="flex flex-col items-center w-24">
                  <input 
                      type="number" 
                      min="1"
                      max="1000"
                      value={numerator} 
                      onChange={(e) => setNumerator(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))}
                      className={`w-full border rounded px-2 py-1 text-sm text-center focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50 transition-all ${bgInput} ${textPrimary}`}
                      aria-label="Numerator"
                  />
                  <div className={`w-full h-[2px] my-1 rounded-full ${theme === 'dark' ? 'bg-slate-700' : 'bg-slate-300'}`}></div>
                  <input 
                      type="number" 
                      min="1"
                      max="1000" 
                      value={denominator} 
                      onChange={(e) => setDenominator(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))}
                      className={`w-full border rounded px-2 py-1 text-sm text-center focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50 transition-all ${bgInput} ${textPrimary}`}
                      aria-label="Denominator"
                  />
               </div>
            </div>
            
            <button 
                onClick={handleApplyRatio}
                className={`w-full text-xs font-medium p-2 rounded-lg transition-colors flex items-center justify-center gap-1 ${greyBtnClass}`}
            >
                Set rotor radius to fit ratio
            </button>
            
            <button 
                onClick={handleRandomRatio}
                className={`w-full text-xs font-medium py-2 rounded border transition-colors flex items-center justify-center gap-1 ${btnRandomRatio}`}
                title="Randomize ratio (2-100)"
            >
                <Shuffle size={14} />
                <span>Random ratio only</span>
            </button>
          </div>
        </div>

        {/* Geometry Controls */}
        <div className="space-y-1 pt-2">
          <SliderControl
            label="Stator radius"
            value={config.outerRadius}
            min={50}
            max={400}
            onChange={(v) => updateConfig('outerRadius', v)}
            theme={theme}
          />
          <SliderControl
            label="Rotor radius"
            value={config.innerRadius}
            min={10}
            max={400}
            onChange={(v) => updateConfig('innerRadius', v)}
            theme={theme}
          />
          <SliderControl
            label="Pen offset"
            value={config.penOffset}
            min={10}
            max={400}
            onChange={(v) => updateConfig('penOffset', v)}
            theme={theme}
          />
        </div>
        
        {/* Shape Controls */}
        <div className="space-y-1">
          <SliderControl
            label="Stator eccentricity"
            value={config.statorAspect}
            min={0.2}
            max={2.0}
            step={0.1}
            onChange={(v) => updateConfig('statorAspect', v)}
            theme={theme}
          />
          <SliderControl
            label="Rotor eccentricity"
            value={config.rotorAspect}
            min={0.2}
            max={2.0}
            step={0.1}
            onChange={(v) => updateConfig('rotorAspect', v)}
            theme={theme}
          />
        </div>

      </div>
    </div>
  );
};