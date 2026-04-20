import React, { useRef, useEffect, useCallback } from 'react';
import type { LiveAnnotation, LiveParticipant } from '../../types';

interface LiveCanvasProps {
  annotations: LiveAnnotation[];
  teacherCursor: { x: number; y: number } | null;
  toolMode: 'laser' | 'draw' | 'eraser';
  currentColor: string;
  currentWidth: number;
  isTeacher: boolean;
  onDraw?: (points: { x: number; y: number }[], color: string, width: number) => void;
  onCursorMove?: (x: number, y: number) => void;
}

const LiveCanvas: React.FC<LiveCanvasProps> = ({
  annotations,
  teacherCursor,
  toolMode,
  currentColor,
  currentWidth,
  isTeacher,
  onDraw,
  onCursorMove,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const currentPath = useRef<{ x: number; y: number }[]>([]);
  const animFrameRef = useRef<number>(0);
  const laserGlowRef = useRef(0);

  // Normalize coords to 0-1
  const getNormalizedCoords = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }, []);

  // Render all annotations + laser
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw annotations
    for (const a of annotations) {
      if (a.type === 'draw' && a.points.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.width * (w / 1000); // Scale width
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.9;

        const p0 = a.points[0];
        ctx.moveTo(p0.x * w, p0.y * h);
        for (let i = 1; i < a.points.length; i++) {
          const p = a.points[i];
          ctx.lineTo(p.x * w, p.y * h);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Draw current in-progress path (local teacher only)
    if (isTeacher && isDrawing.current && currentPath.current.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentWidth * (w / 1000);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.9;

      const p0 = currentPath.current[0];
      ctx.moveTo(p0.x * w, p0.y * h);
      for (let i = 1; i < currentPath.current.length; i++) {
        const p = currentPath.current[i];
        ctx.lineTo(p.x * w, p.y * h);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Draw laser pointer
    if (teacherCursor) {
      laserGlowRef.current = (laserGlowRef.current + 0.05) % (Math.PI * 2);
      const glowSize = 12 + Math.sin(laserGlowRef.current) * 4;
      const cx = teacherCursor.x * w;
      const cy = teacherCursor.y * h;

      // Outer glow
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize * 2);
      grd.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
      grd.addColorStop(0.5, 'rgba(239, 68, 68, 0.15)');
      grd.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cx, cy, glowSize * 2, 0, Math.PI * 2);
      ctx.fill();

      // Inner dot
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();

      // White center
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [annotations, teacherCursor, isTeacher, currentColor, currentWidth]);

  // Animation loop
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      render();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [render]);

  // Resize canvas to match container
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.style.width = container.clientWidth + 'px';
      canvas.style.height = container.clientHeight + 'px';
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Mouse/Touch handlers for teacher drawing
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isTeacher) return;
    const coords = getNormalizedCoords(e);

    if (toolMode === 'laser') {
      onCursorMove?.(coords.x, coords.y);
      return;
    }

    if (toolMode === 'draw') {
      isDrawing.current = true;
      currentPath.current = [coords];
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isTeacher) return;
    const coords = getNormalizedCoords(e);

    if (toolMode === 'laser') {
      onCursorMove?.(coords.x, coords.y);
      return;
    }

    if (toolMode === 'draw' && isDrawing.current) {
      currentPath.current.push(coords);
    }
  };

  const handlePointerUp = () => {
    if (!isTeacher || toolMode !== 'draw' || !isDrawing.current) return;
    isDrawing.current = false;
    
    if (currentPath.current.length > 1) {
      onDraw?.(currentPath.current, currentColor, currentWidth);
    }
    currentPath.current = [];
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-20"
      style={{ touchAction: isTeacher ? 'none' : 'auto', cursor: isTeacher ? (toolMode === 'laser' ? 'none' : 'crosshair') : 'default' }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      />
    </div>
  );
};

export default LiveCanvas;
