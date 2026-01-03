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
            : 'bg-slate-300 [&::-webkit-slider-thumb]:bg-slate-500 [&::-moz-range-thumb]:bg-slate-500'
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
  const [numerator, setNumerator] = useState<number>(config.numerator || 2);
  const [denominator, setDenominator] = useState<number>(config.denominator || 3);

  const updateConfig = <K extends keyof SpiroConfig>(key: K, value: SpiroConfig[K]) => {
    setConfig((prev) => {
        const updates: any = { [key]: value };
        if (key === 'outerRadius' || key === 'innerRadius') {
            updates.numerator = undefined;
            updates.denominator = undefined;
        }
        return { ...prev, ...updates };
    });
  };

  const outerCircumference = calculateEllipseCircumference(config.outerRadius, config.statorAspect);

  const applyRatioValues = (num: number, den: number) => {
    if (num <= 0 || den <= 0) return;
    const targetRatio = num / den;
    const targetInnerCircumference = outerCircumference * targetRatio;
    const unitInnerCircumference = calculateEllipseCircumference(1, config.rotorAspect);
    const newInnerRadius = targetInnerCircumference / unitInnerCircumference;
    const clampedRadius = Math.max(10, Math.min(400, newInnerRadius));
    
    setConfig(prev => ({
        ...prev,
        innerRadius: clampedRadius,
        numerator: num,
        denominator: den
    }));
    onClear();
  };

  const handleApplyRatio = () => {
    applyRatioValues(numerator, denominator);
  };

  const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

  const handleRandomRatio = () => {
    let n, d;
    do { n = getRandomInt(2, 100); d = getRandomInt(2, 100); } while (n === d);
    setNumerator(n);
    setDenominator(d);
    
    const outerC = calculateEllipseCircumference(config.outerRadius, config.statorAspect);
    const targetInnerC = outerC * (n/d);
    const unitInnerC = calculateEllipseCircumference(1, config.rotorAspect);
    let newInnerRadius = Math.max(10, Math.min(400, targetInnerC / unitInnerC));
    const newPenOffset = Math.floor(newInnerRadius * (0.4 + Math.random() * 0.8));
    
    const nextConfig = { ...config, innerRadius: newInnerRadius, penOffset: newPenOffset, numerator: n, denominator: d };
    setConfig(nextConfig);
    onClear();
    if (!isPlaying) onTogglePlay();
    if (onAutoZoom) onAutoZoom(nextConfig);
  };

  const handleRandomRatioAndEccentricity = () => {
    let n, d;
    do { n = getRandomInt(2, 100); d = getRandomInt(2, 100); } while (n === d);
    setNumerator(n);
    setDenominator(d);

    const randomEcc = () => Number((0.2 + Math.random() * 1.8).toFixed(1));
    const sAspect = randomEcc();
    const rAspect = randomEcc();

    const outerC = calculateEllipseCircumference(config.outerRadius, sAspect);
    const targetInnerC = outerC * (n/d);
    const unitInnerC = calculateEllipseCircumference(1, rAspect);
    let newInnerRadius = Math.max(10, Math.min(400, targetInnerC / unitInnerC));
    const newPenOffset = Math.floor(newInnerRadius * (0.4 + Math.random() * 0.8));
    const availableColors = PRESET_COLORS.filter(c => c !== (theme === 'dark' ? '#000000' : '#ffffff'));
    const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];

    const nextConfig = { ...config, statorAspect: sAspect, rotorAspect: rAspect, innerRadius: newInnerRadius, penOffset: newPenOffset, numerator: n, denominator: d, penColor: randomColor };
    setConfig(nextConfig);
    onClear();
    if (!isPlaying) onTogglePlay();
    if (onAutoZoom) onAutoZoom(nextConfig);
  };

  const bgMain = theme === 'dark' ? 'bg-slate-900 border-r border-white/5' : 'bg-white border-r border-slate-900/5';
  const textPrimary = theme === 'dark' ? 'text-slate-300' : 'text-slate-900';
  const textSecondary = theme === 'dark' ? 'text-slate-400' : 'text-slate-600';
  const textMuted = theme === 'dark' ? 'text-slate-400' : 'text-slate-600';
  const bgPanel = theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200';
  const bgInput = theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300';
  const greyBtnClass = theme === 'dark' ? 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'bg-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-300';
  const logoBg = theme === 'dark' ? 'white' : 'black';
  const logoText = theme === 'dark' ? 'text-slate-600 group-hover:text-slate-500' : 'text-slate-200 group-hover:text-slate-500';

  return (
    <div className={`flex flex-col h-full w-full md:w-80 overflow-y-auto transition-colors duration-300 ${bgMain}`}>
      <div className="p-4 pb-2 flex justify-between items-start shrink-0">
            <a href="https://igormineyev.github.io/" target="_blank" rel="noopener noreferrer" className="flex flex-col group">
              <span className={`text-[10px] font-bold mb-1 pl-1 transition-colors duration-300 ${logoText}`}>Igor Mineyev's</span>
              <div className="inline-block">
                <div style={{ background: logoBg, padding: '4px 10px', borderRadius: '8px', display: 'inline-block', lineHeight: '1' }}>
                    <span style={{ color: '#22c55e', fontSize: '20px', fontWeight: 'bold' }}>SpiroGraph</span>
                </div>
              </div>
            </a>
            <div className="flex gap-2">
                <button onClick={onToggleFullscreen} className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'}`} title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
                    {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                </button>
                <button onClick={onToggleTheme} className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'}`} title={`Switch to theme`}>
                    {theme === 'dark' ? <Sun size={20} fill="currentColor" /> : <Moon size={20} fill="currentColor" />}
                </button>
                {onClose && <button onClick={onClose} className="md:hidden text-slate-500 hover:text-white"><X size={24} /></button>}
            </div>
      </div>

      <div className="p-4 pt-2 flex-1 space-y-3">
        <div className="space-y-2">
            <button onClick={handleRandomRatioAndEccentricity} className={`w-full p-2 rounded-lg border transition-colors flex items-center justify-center gap-3 text-xs font-medium ${greyBtnClass}`} title="Random everything">
                <Sparkles size={20} className="shrink-0" /><span>Draw a random spiro curve!</span>
            </button>
            <button onClick={onStartScreensaver} className={`w-full p-2 rounded-lg transition-colors flex items-center justify-center gap-3 text-xs font-medium ${greyBtnClass}`}>
                <Monitor size={20} className="shrink-0" /><span>Screensaver</span>
            </button>
            <div className="grid grid-cols-2 gap-3">
                <button onClick={onTogglePlay} className={`flex items-center justify-center gap-2 p-3 rounded-lg font-medium transition-all ${greyBtnClass}`}>
                    {isPlaying ? <Pause size={18} /> : <Play size={18} />}{isPlaying ? 'Pause' : 'Start'}
                </button>
                <button onClick={onClear} className={`flex items-center justify-center gap-2 p-3 rounded-lg transition-all ${greyBtnClass}`}><Trash2 size={18} />Clear</button>
            </div>
        </div>

        <div>
            <div className="grid grid-cols-6 gap-2">
                <button onClick={() => onDownload(false)} className={`col-span-5 flex items-center justify-center gap-3 p-2 rounded-lg transition-all ${greyBtnClass}`} title="Download PNG image">
                    <Download size={20} /><div className="flex flex-col items-start"><span className={`text-[10px] leading-tight ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>If you like this picture,</span><span className="leading-tight">download it.</span></div>
                </button>
                <button onClick={() => onDownload(true)} className={`col-span-1 flex items-center justify-center p-2 rounded-lg transition-all ${greyBtnClass}`} title="Download PNG with settings"><FileText size={20} /></button>
            </div>
            <a href="https://igormineyev.github.io/#donate" target="_blank" rel="noopener noreferrer" className={`w-full mt-2 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider font-medium opacity-60 hover:opacity-80 transition-opacity ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                <Heart size={10} strokeWidth={2.5} /><span>Support this math art</span>
            </a>
        </div>

        <SliderControl label="Speed" value={config.speed} min={0.1} max={20} step={0.1} onChange={(v) => updateConfig('speed', v)} theme={theme} />

        <div className="space-y-1">
           <div className="mb-2">
            <div className="flex justify-between items-center mb-2">
                <label className={`text-xs block ${textSecondary}`}>Pen color</label>
                <div className="relative group flex items-center">
                    <input type="color" value={config.penColor} onChange={(e) => updateConfig('penColor', e.target.value)} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10" />
                    <div className={`text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 font-medium transition-colors ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-400 group-hover:text-slate-200' : 'bg-slate-100 border-slate-200 text-slate-600 group-hover:text-slate-900'}`}>
                        <Palette size={10} /><span>Custom</span>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
                {PRESET_COLORS.map((color) => (
                    <button 
                        key={color} 
                        onClick={() => updateConfig('penColor', color)} 
                        className={`w-full aspect-square rounded-md border-2 ${config.penColor === color ? (theme === 'dark' ? 'border-white' : 'border-slate-400') : 'border-transparent'}`} 
                        style={{ backgroundColor: color }} 
                    />
                ))}
            </div>
          </div>
          <SliderControl label="Thickness" value={config.lineWidth} min={0.5} max={15} step={0.1} onChange={(v) => updateConfig('lineWidth', v)} theme={theme} />
          <SliderControl label="Opacity" value={config.opacity} min={0.1} max={1} step={0.1} onChange={(v) => updateConfig('opacity', v)} theme={theme} />
        </div>

         <div className="flex items-center justify-between py-2 mb-2">
            <span className={`text-sm ${textMuted}`}>Show gears</span>
            <button onClick={() => updateConfig('showGears', !config.showGears)} className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'bg-slate-800 text-slate-500 hover:text-slate-300' : 'bg-slate-200 text-slate-400 hover:text-slate-600'}`}>
              {config.showGears ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

        <div className="space-y-1">
          <div className={`rounded-lg p-3 border space-y-3 ${bgPanel}`}>
            <div className="flex items-center justify-center gap-3">
               <span className={`text-xs ${textSecondary}`}>Rotor/stator ratio =</span>
               <div className="flex flex-col items-center w-24">
                  <input type="number" min="1" max="1000" value={numerator} onChange={(e) => setNumerator(parseInt(e.target.value) || 1)} className={`w-full border rounded px-2 py-1 text-sm text-center focus:outline-none ${bgInput} ${textPrimary}`} />
                  <div className={`w-full h-[2px] my-1 rounded-full ${theme === 'dark' ? 'bg-slate-700' : 'bg-slate-300'}`}></div>
                  <input type="number" min="1" max="1000" value={denominator} onChange={(e) => setDenominator(parseInt(e.target.value) || 1)} className={`w-full border rounded px-2 py-1 text-sm text-center focus:outline-none ${bgInput} ${textPrimary}`} />
               </div>
            </div>
            <button onClick={handleApplyRatio} className={`w-full text-xs font-medium p-2 rounded-lg transition-colors flex items-center justify-center gap-1 ${greyBtnClass}`}>Set rotor radius to fit ratio</button>
            <button onClick={handleRandomRatio} className={`w-full text-xs font-medium py-2 rounded border transition-colors flex items-center justify-center gap-1 ${greyBtnClass}`} title="Randomize ratio"><Shuffle size={14} /><span>Random ratio only</span></button>
          </div>
        </div>

        <div className="space-y-1 pt-2">
          <SliderControl label="Stator radius" value={config.outerRadius} min={50} max={400} onChange={(v) => updateConfig('outerRadius', v)} theme={theme} />
          <SliderControl label="Rotor radius" value={config.innerRadius} min={10} max={400} onChange={(v) => updateConfig('innerRadius', v)} theme={theme} />
          <SliderControl label="Pen offset" value={config.penOffset} min={10} max={400} onChange={(v) => updateConfig('penOffset', v)} theme={theme} />
        </div>
        
        <div className="space-y-1">
          <SliderControl label="Stator eccentricity" value={config.statorAspect} min={0.2} max={2.0} step={0.1} onChange={(v) => updateConfig('statorAspect', v)} theme={theme} />
          <SliderControl label="Rotor eccentricity" value={config.rotorAspect} min={0.2} max={2.0} step={0.1} onChange={(v) => updateConfig('rotorAspect', v)} theme={theme} />
        </div>
      </div>
    </div>
  );
};
