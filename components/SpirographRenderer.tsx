import React, { useRef, useEffect, useCallback } from 'react';
import { SpiroConfig, Theme } from '../types';
import { COLOR_NAMES } from '../constants';

interface SpirographRendererProps {
  config: SpiroConfig;
  isPlaying: boolean;
  shouldClear: boolean;
  onCleared: () => void;
  downloadState: { active: boolean; theme?: 'dark' | 'light'; withStats?: boolean; };
  onDownloaded: () => void;
  theme: Theme;
  transform: { x: number; y: number; k: number };
  onTransformChange: (newTransform: { x: number; y: number; k: number } | ((prev: { x: number; y: number; k: number }) => { x: number; y: number; k: number })) => void;
  isCursorHidden?: boolean;
}

const calculateEllipseCircumference = (radius: number, aspect: number): number => {
    // Ramanujan's approximation
    const a = radius;
    const b = radius * aspect;
    if (aspect === 1) return 2 * Math.PI * radius;
    
    const h = Math.pow(a - b, 2) / Math.pow(a + b, 2);
    return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
};

export const SpirographRenderer: React.FC<SpirographRendererProps> = ({
  config,
  isPlaying,
  shouldClear,
  onCleared,
  downloadState,
  onDownloaded,
  theme,
  transform,
  onTransformChange,
  isCursorHidden = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const traceCanvasRef = useRef<HTMLCanvasElement>(null);
  const gearsCanvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  // Ref for animation loop access without dependencies
  const transformRef = useRef(transform); 

  // Sync ref
  useEffect(() => { transformRef.current = transform; }, [transform]);

  // Simulation State
  const angleRef = useRef<number>(0); 
  const rotorParamRef = useRef<number>(0);
  const rotorRotationRef = useRef<number>(0);
  
  // History of points for redrawing
  // Storing {x, y} relative to center (0,0)
  const pointsRef = useRef<{x: number, y: number}[]>([]);
  
  // Interaction State
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  // Resize handler
  const handleResize = useCallback(() => {
    if (!containerRef.current || !traceCanvasRef.current || !gearsCanvasRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const dpr = window.devicePixelRatio || 1;

    // Set display size
    traceCanvasRef.current.style.width = `${clientWidth}px`;
    traceCanvasRef.current.style.height = `${clientHeight}px`;
    gearsCanvasRef.current.style.width = `${clientWidth}px`;
    gearsCanvasRef.current.style.height = `${clientHeight}px`;

    // Set actual size
    traceCanvasRef.current.width = clientWidth * dpr;
    traceCanvasRef.current.height = clientHeight * dpr;
    gearsCanvasRef.current.width = clientWidth * dpr;
    gearsCanvasRef.current.height = clientHeight * dpr;
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [handleResize]);

  // Handle Clear
  useEffect(() => {
    if (shouldClear) {
      pointsRef.current = [];
      angleRef.current = 0;
      rotorParamRef.current = 0;
      rotorRotationRef.current = 0;
      onCleared();
    }
  }, [shouldClear, onCleared]);

  // --- MATH ENGINE HELPERS ---

  // Geometric Reconstruction Helper (Reused by animate and download)
  // Calculates the physical state of the gears based on current parameters (t, u)
  const getGeometry = (
    t: number, 
    u: number, 
    R: number, 
    r: number, 
    d: number, 
    sAspect: number, 
    rAspect: number
  ) => {
    // 1. Stator contact point and tangent angle
    const sx = R * Math.cos(t);
    const sy = R * sAspect * Math.sin(t);
    // Tangent vector of stator: (-R sin t, R*k cos t)
    const stx = -R * Math.sin(t);
    const sty = R * sAspect * Math.cos(t);
    const alpha = Math.atan2(stx, -sty); // Angle of the tangent vector

    // 2. Rotor tangent angle relative to its own frame
    // Tangent vector of rotor: (-r sin u, r*k cos u)
    const rtx = -r * Math.sin(u);
    const rty = r * rAspect * Math.cos(u);
    const beta = Math.atan2(rtx * -1, rty); 

    // 3. Global Rotation of Rotor
    const phi = alpha - beta + Math.PI;

    // 4. Rotor Center position
    const rcx = r * Math.cos(u);
    const rcy = r * rAspect * Math.sin(u);
    
    // Rotate this vector by phi to get it in world frame
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const rotRcx = rcx * cosPhi - rcy * sinPhi;
    const rotRcy = rcx * sinPhi + rcy * cosPhi;

    // Center = StatorContact - RotatedRotorVector
    const cx = sx - rotRcx;
    const cy = sy - rotRcy;

    // 5. Pen Position
    const px = cx + d * cosPhi;
    const py = cy + d * sinPhi;

    return { px, py, cx, cy, phi, contactX: sx, contactY: sy };
  };

  const calculateExactStep = (t: number, R: number, r: number, d: number) => {
    const cx = (R - r) * Math.cos(t);
    const cy = (R - r) * Math.sin(t);
    const phi = t * (1 - R / r);
    const px = cx + d * Math.cos(phi);
    const py = cy + d * Math.sin(phi);
    const contactX = R * Math.cos(t);
    const contactY = R * Math.sin(t);
    return { px, py, cx, cy, newU: 0, phi, contactX, contactY };
  };

  const getEllipseMetric = (angle: number, radius: number, aspect: number) => {
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const dx = -radius * sin;
    const dy = radius * aspect * cos;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getDerivative = (t: number, u: number, R: number, sAspect: number, r: number, rAspect: number) => {
    const statorSpeed = getEllipseMetric(t, R, sAspect);
    const rotorSpeed = getEllipseMetric(u, r, rAspect);
    return statorSpeed / (rotorSpeed || 0.0001);
  };

  const calculatePhysicsStep = (
    t: number, 
    dt: number, 
    currentU: number, 
    R: number, 
    r: number, 
    d: number, 
    sAspect: number, 
    rAspect: number
  ) => {
    // RK4
    const k1 = getDerivative(t, currentU, R, sAspect, r, rAspect);
    const k2 = getDerivative(t + dt/2, currentU + (dt * k1) / 2, R, sAspect, r, rAspect);
    const k3 = getDerivative(t + dt/2, currentU + (dt * k2) / 2, R, sAspect, r, rAspect);
    const k4 = getDerivative(t + dt, currentU + dt * k3, R, sAspect, r, rAspect);

    const newU = currentU + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    
    // Use the helper to get geometry for t+dt and newU
    const geom = getGeometry(t + dt, newU, R, r, d, sAspect, rAspect);

    return { ...geom, newU };
  };

  // Helper function to draw rounded rectangles
  const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  };

  // Handle Download
  useEffect(() => {
    if (downloadState.active && traceCanvasRef.current) {
      const sourceCanvas = traceCanvasRef.current;
      const downloadTheme = downloadState.theme || theme;
      const withStats = downloadState.withStats || false;
      
      const width = sourceCanvas.width;
      const height = sourceCanvas.height;
      const dpr = window.devicePixelRatio || 1;
      const { x, y, k } = transformRef.current;
      
      // Constants for colors
      const bgColor = downloadTheme === 'dark' ? '#020617' : '#ffffff';
      const textColor = downloadTheme === 'dark' ? '#ffffff' : '#000000';
      // Slate-500 (Medium Grey) for light mode to ensure OCR contrast
      // Slate-400 for Dark mode
      const footerTextColor = downloadTheme === 'dark' ? '#94a3b8' : '#64748b';
      const gearStroke = downloadTheme === 'dark' ? '#475569' : '#cbd5e1';
      const rotorStroke = downloadTheme === 'dark' ? '#64748b' : '#94a3b8';

      // Footer
      const footerText = "Play at https://igormineyev.github.io/SpiroGraph/";
      // Increase relative font size for export
      const footerFontSize = Math.max(12, width / 70);
      const footerPaddingBottom = footerFontSize * 0.8;
      
      // Calculate Footer Box
      const tCtx = sourceCanvas.getContext('2d');
      if (!tCtx) return;
      tCtx.font = `500 ${footerFontSize}px Inter, sans-serif`;
      const fMetrics = tCtx.measureText(footerText);
      const fTextWidth = fMetrics.width;
      const fPadding = footerFontSize * 0.5;
      const fBoxWidth = fTextWidth + (fPadding * 2);
      const fBoxHeight = footerFontSize + (fPadding * 1.5);
      const fBoxX = (width / 2) - (fBoxWidth / 2);
      const fBoxY = height - footerPaddingBottom - footerFontSize - (fPadding * 0.75);

      // --- PNG GENERATION (High Res) ---
      // Force high resolution for better OCR (approx 3000px wide)
      const targetWidth = 3000;
      const scaleFactor = Math.max(2, targetWidth / width);
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width * scaleFactor;
      tempCanvas.height = height * scaleFactor;
      const ctx = tempCanvas.getContext('2d');
      
      if (ctx) {
        // 0. Scale Context
        // All subsequent drawing ops will be scaled automatically
        ctx.scale(scaleFactor, scaleFactor);

        // 1. Fill background (use explicit raw dimensions for clear fill)
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to fill entire pixel buffer
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        ctx.restore();
        
        // Setup transform for drawing (Re-use logic)
        // Note: Since we scaled the context, 'width' and 'height' in logic map to scaled pixels.
        // cx/cy calculation is based on source coordinates, which is correct.
        const cx = (sourceCanvas.width / 2) + (x * dpr);
        const cy = (sourceCanvas.height / 2) + (y * dpr);
        const sk = k * dpr;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(sk, sk);

        // 2. Draw the trace
        ctx.strokeStyle = config.penColor;
        ctx.lineWidth = config.lineWidth;
        ctx.globalAlpha = config.opacity;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const points = pointsRef.current;
        if (points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();
        }
        
        // 3. Draw Initial Gears
        if (withStats) {
            ctx.globalAlpha = 1.0;
            
            const { outerRadius: R, innerRadius: r, penOffset: d, statorAspect, rotorAspect } = config;
            const sAspect = statorAspect ?? 1.0;
            const rAspect = rotorAspect ?? 1.0;
            const isCircular = Math.abs(sAspect - 1.0) < 0.005 && Math.abs(rAspect - 1.0) < 0.005;

            let state;
            if (isCircular) {
                state = calculateExactStep(0, R, r, d);
            } else {
                state = getGeometry(0, 0, R, r, d, sAspect, rAspect);
            }

            const baseLW = 2 / k;
            
            // Draw Stator
            ctx.strokeStyle = gearStroke;
            ctx.lineWidth = baseLW * 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, R, R * sAspect, 0, 0, Math.PI * 2);
            ctx.stroke();
            
            // Draw Rotor
            ctx.strokeStyle = rotorStroke;
            ctx.lineWidth = baseLW;
            ctx.beginPath();
            ctx.ellipse(state.cx, state.cy, r, r * rAspect, state.phi, 0, Math.PI * 2);
            ctx.stroke();

            // Draw Arm
            ctx.strokeStyle = rotorStroke;
            ctx.beginPath();
            ctx.moveTo(state.cx, state.cy);
            ctx.lineTo(state.px, state.py);
            ctx.stroke();

            // Draw Pen Holder
            const tipRadius = config.lineWidth / 2;
            const holderRadius = tipRadius * (4.1 / 2.55);

            ctx.fillStyle = rotorStroke;
            ctx.beginPath();
            ctx.arc(state.px, state.py, holderRadius, 0, Math.PI * 2);
            ctx.fill();

            // Draw Pen Tip
            ctx.fillStyle = config.penColor;
            ctx.beginPath();
            ctx.arc(state.px, state.py, tipRadius, 0, Math.PI * 2);
            ctx.fill();

            // Draw Contact Point
            const contactRadius = 6 / k;
            ctx.fillStyle = '#ef4444'; 
            ctx.beginPath();
            ctx.arc(state.contactX, state.contactY, contactRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        // 4. Draw Stats Overlay (PNG ONLY for now)
        if (withStats) {
            let ratioText = "";
            if (config.numerator && config.denominator) {
                ratioText = `${config.numerator}/${config.denominator}`;
            } else {
                const outerC = calculateEllipseCircumference(config.outerRadius, config.statorAspect);
                const innerC = calculateEllipseCircumference(config.innerRadius, config.rotorAspect);
                const val = innerC / outerC;
                let bestN = 0, bestD = 1;
                let minError = Number.MAX_VALUE;
                for(let d = 1; d <= 1000; d++) {
                    const n = Math.round(val * d);
                    const error = Math.abs(val - n/d);
                    if (error < minError) { bestN = n; bestD = d; minError = error; }
                }
                ratioText = `${bestN}/${bestD}`;
            }

            const colorName = COLOR_NAMES[config.penColor] || 'Custom';
            const lines = [
                `Color: ${colorName} (${config.penColor})`,
                `Thickness: ${config.lineWidth.toFixed(2)}`,
                `Opacity: ${config.opacity.toFixed(2)}`,
                `Rotor/stator ratio: ${ratioText}`,
                `Stator radius: ${config.outerRadius}`,
                `Rotor radius: ${config.innerRadius}`,
                `Pen offset: ${config.penOffset}`,
                `Stator eccentricity: ${config.statorAspect.toFixed(2)}`,
                `Rotor eccentricity: ${config.rotorAspect.toFixed(2)}`
            ];

            const fontSize = 14;
            const lineHeight = 18;
            const padding = 12;
            ctx.font = `bold ${fontSize}px Inter, monospace`;

            let maxWidth = 0;
            lines.forEach(line => {
                const m = ctx.measureText(line);
                if (m.width > maxWidth) maxWidth = m.width;
            });

            const boxWidth = maxWidth + (padding * 2);
            const boxHeight = (lines.length * lineHeight) + (padding * 2);
            const margin = 20;
            const footerSpace = footerFontSize + footerPaddingBottom + 10;
            const boxX = margin;
            const boxY = height - boxHeight - margin - footerSpace;

            ctx.fillStyle = bgColor;
            drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 8);
            ctx.fillStyle = textColor;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            lines.forEach((line, i) => {
                ctx.fillText(line, boxX + padding, boxY + padding + (i * lineHeight));
            });
        }
        
        // 5. Draw Footer (Watermark)
        ctx.save();
        ctx.font = `500 ${footerFontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = bgColor;
        drawRoundedRect(ctx, fBoxX, fBoxY, fBoxWidth, fBoxHeight, 8);
        ctx.fillStyle = footerTextColor;
        ctx.fillText(footerText, width / 2, height - footerPaddingBottom);
        ctx.restore();

        const timestamp = Date.now();
        const link = document.createElement('a');
        const filename = withStats 
            ? `IgorMineyevSpiroGraph-${timestamp}-with-data.png`
            : `IgorMineyevSpiroGraph-${timestamp}.png`;
            
        link.download = filename;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
      }
      
      onDownloaded();
    }
  }, [downloadState, onDownloaded, theme, config]);

  // Main Animation Loop
  const animate = useCallback(() => {
    if (!traceCanvasRef.current || !gearsCanvasRef.current || !containerRef.current) return;

    const traceCtx = traceCanvasRef.current.getContext('2d');
    const gearsCtx = gearsCanvasRef.current.getContext('2d');
    if (!traceCtx || !gearsCtx) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    if (width === 0 || height === 0) {
        requestRef.current = requestAnimationFrame(animate);
        return;
    }

    const { outerRadius: R, innerRadius: r, penOffset: d, speed, showGears, statorAspect, rotorAspect } = config;
    const sAspect = statorAspect ?? 1.0;
    const rAspect = rotorAspect ?? 1.0;
    const isCircular = Math.abs(sAspect - 1.0) < 0.005 && Math.abs(rAspect - 1.0) < 0.005;

    // Simulation Step (Only if playing)
    if (isPlaying) {
      const dt = 0.002; 
      const steps = Math.ceil(speed * 5); 

      for (let i = 0; i < steps; i++) {
        let state;
        if (isCircular) {
           angleRef.current += dt;
           state = calculateExactStep(angleRef.current, R, r, d);
        } else {
           state = calculatePhysicsStep(
                angleRef.current, dt, rotorParamRef.current, 
                R, r, d, sAspect, rAspect
            );
            angleRef.current += dt;
            rotorParamRef.current = state.newU;
            rotorRotationRef.current = state.phi;
        }
        pointsRef.current.push({ x: state.px, y: state.py });
      }
      
      // Keep rotation ref updated for gears if circular (physics step does it otherwise)
      if (isCircular) {
          const state = calculateExactStep(angleRef.current, R, r, d);
          rotorRotationRef.current = state.phi;
      }
    }

    // DRAWING
    const dpr = window.devicePixelRatio || 1;
    const { x, y, k } = transformRef.current;
    
    const centerX = (width / 2) + x;
    const centerY = (height / 2) + y;

    // 1. Draw Trace
    traceCtx.setTransform(1, 0, 0, 1, 0, 0);
    traceCtx.clearRect(0, 0, traceCanvasRef.current.width, traceCanvasRef.current.height);
    traceCtx.setTransform(k * dpr, 0, 0, k * dpr, centerX * dpr, centerY * dpr);
    
    traceCtx.strokeStyle = config.penColor;
    traceCtx.lineWidth = config.lineWidth; 
    traceCtx.globalAlpha = config.opacity;
    traceCtx.lineJoin = 'round';
    traceCtx.lineCap = 'round';

    const points = pointsRef.current;
    if (points.length > 0) {
        traceCtx.beginPath();
        traceCtx.moveTo(points[0].x, points[0].y);
        const stride = k < 0.2 ? 5 : 1; 
        for (let i = 1; i < points.length; i += stride) {
            traceCtx.lineTo(points[i].x, points[i].y);
        }
        if (stride > 1) traceCtx.lineTo(points[points.length-1].x, points[points.length-1].y);
        traceCtx.stroke();
    }

    // 2. Draw Gears
    gearsCtx.setTransform(1, 0, 0, 1, 0, 0);
    gearsCtx.clearRect(0, 0, gearsCanvasRef.current.width, gearsCanvasRef.current.height);

    if (showGears) {
        gearsCtx.setTransform(k * dpr, 0, 0, k * dpr, centerX * dpr, centerY * dpr);
        
        const state = isCircular
            ? calculateExactStep(angleRef.current, R, r, d)
            : getGeometry(angleRef.current, rotorParamRef.current, R, r, d, sAspect, rAspect);

        const baseLW = 2 / k;
        const thinLW = 1 / k;

        // Use opaque colors (Slate palette)
        const gearStroke = theme === 'dark' ? '#475569' : '#cbd5e1'; // Slate-600 : Slate-300
        const rotorStroke = theme === 'dark' ? '#64748b' : '#94a3b8'; // Slate-500 : Slate-400
        const spokeStroke = theme === 'dark' ? '#334155' : '#e2e8f0'; // Slate-700 : Slate-200
        const armStroke = theme === 'dark' ? '#64748b' : '#94a3b8';   // Slate-500 : Slate-400

        // Stator (Outer Gear)
        gearsCtx.strokeStyle = gearStroke;
        gearsCtx.lineWidth = baseLW * 2;
        gearsCtx.beginPath();
        gearsCtx.ellipse(0, 0, R, R * sAspect, 0, 0, Math.PI * 2);
        gearsCtx.stroke();

        // Rotor (Inner Gear)
        gearsCtx.strokeStyle = rotorStroke;
        gearsCtx.lineWidth = baseLW;
        gearsCtx.beginPath();
        gearsCtx.ellipse(state.cx, state.cy, r, r * rAspect, state.phi, 0, Math.PI * 2);
        gearsCtx.stroke();

        // Spokes
        gearsCtx.save();
        gearsCtx.translate(state.cx, state.cy);
        gearsCtx.rotate(state.phi);
        gearsCtx.strokeStyle = spokeStroke;
        gearsCtx.lineWidth = thinLW;
        gearsCtx.beginPath();
        gearsCtx.moveTo(-r, 0);
        gearsCtx.lineTo(r, 0);
        gearsCtx.moveTo(0, -r * rAspect);
        gearsCtx.lineTo(0, r * rAspect);
        gearsCtx.stroke();
        gearsCtx.restore();

        // Arm
        gearsCtx.strokeStyle = armStroke;
        gearsCtx.lineWidth = baseLW;
        gearsCtx.beginPath();
        gearsCtx.moveTo(state.cx, state.cy);
        gearsCtx.lineTo(state.px, state.py);
        gearsCtx.stroke();

        // Pen Holder (Large Circle)
        const tipRadius = config.lineWidth / 2;
        const holderRadius = tipRadius * (4.1 / 2.55);

        gearsCtx.fillStyle = rotorStroke;
        gearsCtx.beginPath();
        gearsCtx.arc(state.px, state.py, holderRadius, 0, Math.PI * 2);
        gearsCtx.fill();

        // Pen Tip (Inner Dot)
        gearsCtx.fillStyle = config.penColor;
        gearsCtx.beginPath();
        gearsCtx.arc(state.px, state.py, tipRadius, 0, Math.PI * 2);
        gearsCtx.fill();

        // Contact Point
        // Requirement: Size (diameter) = 3 * StatorThickness.
        // Stator thickness = baseLW * 2 = 4 / k.
        // Diameter = 12 / k. Radius = 6 / k.
        gearsCtx.fillStyle = '#ef4444';
        gearsCtx.beginPath();
        gearsCtx.arc(state.contactX, state.contactY, 6 / k, 0, Math.PI * 2);
        gearsCtx.fill();
    }

    requestRef.current = requestAnimationFrame(animate);

  }, [config, isPlaying, theme]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [animate]);


  // --- INTERACTION HANDLERS ---
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const sensitivity = 0.001;
    const delta = -e.deltaY;
    const scaleFactor = Math.exp(delta * sensitivity);

    onTransformChange(prev => {
        const newK = Math.max(0.1, Math.min(20, prev.k * scaleFactor));
        const W = rect.width;
        const H = rect.height;
        const worldX = (mouseX - (W / 2 + prev.x)) / prev.k;
        const worldY = (mouseY - (H / 2 + prev.y)) / prev.k;
        const newX = mouseX - W / 2 - worldX * newK;
        const newY = mouseY - H / 2 - worldY * newK;
        return { x: newX, y: newY, k: newK };
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastPointerRef.current.x;
    const dy = e.clientY - lastPointerRef.current.y;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    onTransformChange(prev => ({...prev, x: prev.x + dx, y: prev.y + dy}));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  return (
    <div 
        ref={containerRef} 
        style={isCursorHidden ? { cursor: 'none' } : undefined}
        className={`relative w-full h-full overflow-hidden touch-none ${isCursorHidden ? 'cursor-none' : 'cursor-grab active:cursor-grabbing'}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
    >
      <canvas ref={traceCanvasRef} className="absolute top-0 left-0 w-full h-full z-10" />
      <canvas ref={gearsCanvasRef} className="absolute top-0 left-0 w-full h-full z-20 pointer-events-none" />
    </div>
  );
};