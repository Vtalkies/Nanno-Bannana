import React, { useRef, useState, useEffect } from 'react';
import { InteractiveCamera } from './InteractiveCamera';

interface SketchPadProps {
  onChange: (base64: string | null) => void;
  onCameraChange?: (description: string | null) => void;
}

export const SketchPad: React.FC<SketchPadProps> = ({ onChange, onCameraChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  // Initialize canvas with white background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const pixel = ctx.getImageData(0, 0, 1, 1).data;
            if (pixel[3] === 0) {
               ctx.fillStyle = '#ffffff';
               ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
    }
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    
    if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
    }
    
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    // InteractiveCamera handles its own events via capturing. 
    // Since it's pointer-events-none on container, clicks fall through to canvas 
    // UNLESS they hit the camera icon (pointer-events-auto).
    
    if (e.cancelable) e.preventDefault();
    setIsDrawing(true);
    const { x, y } = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
     if (e.cancelable) e.preventDefault();
     if (!isDrawing) return;
     const { x, y } = getPos(e);
     const ctx = canvasRef.current?.getContext('2d');
     if (ctx) {
         ctx.lineTo(x, y);
         ctx.stroke();
     }
  };

  const stopDrawing = () => {
     if (isDrawing) {
         setIsDrawing(false);
         const canvas = canvasRef.current;
         if (canvas) {
             onChange(canvas.toDataURL('image/png'));
         }
     }
  };
  
  const clear = () => {
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            onChange(null);
        }
    }
  };

  const toggleCamera = () => {
     if (showCamera) {
         setShowCamera(false);
         onCameraChange?.(null);
     } else {
         setShowCamera(true);
     }
  };

  return (
    <div className="flex flex-col gap-2">
        <div 
          className="relative border-2 border-slate-600 rounded-lg overflow-hidden touch-none bg-white cursor-crosshair"
          ref={containerRef}
        >
            <canvas
                ref={canvasRef}
                width={500}
                height={500}
                className="w-full h-auto block"
                style={{ aspectRatio: '1/1' }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
            />

            {showCamera && containerRef.current && (
                <InteractiveCamera 
                    containerRef={containerRef}
                    onUpdate={(desc) => onCameraChange?.(desc)}
                    onClose={() => { setShowCamera(false); onCameraChange?.(null); }}
                />
            )}
        </div>
        <div className="flex justify-between items-center text-xs text-slate-400 gap-2">
           <button 
             onClick={toggleCamera} 
             className={`flex items-center gap-1 px-3 py-1.5 rounded transition-colors ${showCamera ? 'bg-amber-500 text-slate-900 font-bold' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
           >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                <path d="M10 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
              </svg>
              {showCamera ? 'Remove Camera' : 'Add Camera'}
           </button>
           <button onClick={clear} className="text-red-400 hover:text-red-300 font-medium px-2 py-1">Clear Canvas</button>
        </div>
        {showCamera && (
           <div className="bg-slate-900/50 p-2 rounded text-[10px] text-amber-200 border border-slate-700">
              Drag camera to move • Drag white dot to rotate lens
           </div>
        )}
    </div>
  );
};