import React, { useState, useEffect, useRef } from 'react';

interface CameraState {
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  height: number; // 0-100 (0=Ground, 50=Eye, 100=Sky)
  rotation: number;
}

interface InteractiveCameraProps {
  containerRef: React.RefObject<HTMLElement>;
  onUpdate: (description: string | null) => void;
  onClose: () => void;
}

export const InteractiveCamera: React.FC<InteractiveCameraProps> = ({ containerRef, onUpdate, onClose }) => {
  // Default: Bottom Center (Front), Eye Level, Pointing Up (North/At Subject)
  const [camera, setCamera] = useState<CameraState>({ x: 50, y: 80, height: 50, rotation: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isAdjustingHeight, setIsAdjustingHeight] = useState(false);
  
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, startValX: 0, startValY: 0 });

  // Calculate Description based on Floor Plan Logic & Optical Physics
  useEffect(() => {
    // 1. Calculate Position relative to Subject (Center 50,50)
    // Grid: 0,0 is Top-Left (Back-Left). 100,100 is Bottom-Right (Front-Right).
    // Center (50, 50) is Subject.
    const dx = camera.x - 50;
    const dy = camera.y - 50; 
    
    // Distance (Max possible from center to corner is ~70.7)
    const distRaw = Math.sqrt(dx*dx + dy*dy);
    const distance = Math.min(distRaw, 100);
    
    // --- LENS & PHYSICS ENGINE ---
    let lensType = "50mm Standard Lens";
    let shotType = "Medium Shot";
    let physicsNote = "";

    if (distance < 12) {
        lensType = "14mm-18mm Ultra-Wide Macro Lens";
        shotType = "Extreme Close-Up";
        physicsNote = "Strong barrel distortion. Subject features closest to camera appear exaggerated. Very shallow depth of field.";
    } else if (distance < 25) {
        lensType = "24mm-35mm Wide Angle Lens";
        shotType = "Close-Up";
        physicsNote = "Dynamic perspective with slight foreshortening. Background feels pushed back.";
    } else if (distance < 45) {
        lensType = "50mm Prime Lens";
        shotType = "Medium Shot (Waist Up)";
        physicsNote = "Natural human vision perspective. Minimal distortion. Accurate proportions.";
    } else if (distance < 65) {
        lensType = "85mm Portrait Telephoto Lens";
        shotType = "Full Body Shot / Cowboy Shot";
        physicsNote = "Spatial compression active. Background appears larger and closer to the subject. Flattering, flattened features.";
    } else {
        lensType = "200mm+ Long Telephoto Lens";
        shotType = "Wide Shot / Long Shot";
        physicsNote = "High spatial compression. Perspective is flattened; foreground and background elements appear stacked. Detached observer feel.";
    }

    // --- AZIMUTH (Angle around subject) ---
    // atan2(dy, dx): 
    // Positive Y is Down (Front). Positive X is Right.
    // 0 deg = Right. 90 deg = Front. -90 deg = Back. 180 = Left.
    const angleRad = Math.atan2(dy, dx);
    let angleDeg = angleRad * (180 / Math.PI); 
    
    let viewSide = "";
    // Normalize logic
    if (angleDeg > 45 && angleDeg < 135) viewSide = "Front View";
    else if (angleDeg >= 135 || angleDeg <= -135) viewSide = "Left Side Profile";
    else if (angleDeg < -45 && angleDeg > -135) viewSide = "Back View";
    else viewSide = "Right Side Profile";

    // --- HEIGHT LOGIC & VISUAL ANCHORS ---
    let verticalAngle = "Eye Level";
    let heightNote = "";
    let visualAnchor = "";

    if (camera.height < 15) {
        verticalAngle = "Extreme Low Angle (Worm's Eye View)";
        heightNote = "Camera is placed virtually on the ground looking up.";
        visualAnchor = "The ground/floor texture must be visible in the immediate foreground. Subject appears towering and dominant against the ceiling or sky.";
    } else if (camera.height < 40) {
        verticalAngle = "Low Angle";
        heightNote = "Camera is waist-level looking up.";
        visualAnchor = "Horizon line is low. Subject appears powerful. We see the underside of chin/nose slightly.";
    } else if (camera.height < 60) {
        verticalAngle = "Eye Level";
        heightNote = "Neutral camera height.";
        visualAnchor = "Horizon line cuts through the subject's eyes/head. Vertical lines are straight.";
    } else if (camera.height < 85) {
        verticalAngle = "High Angle";
        heightNote = "Camera is elevated looking down.";
        visualAnchor = "The floor or ground around the subject is clearly visible. Subject appears slightly foreshortened downwards. Horizon line is high.";
    } else {
        verticalAngle = "Overhead / Top-Down View";
        heightNote = "Camera is directly above.";
        visualAnchor = "We see the top of the subject's head and shoulders. The layout of the floor is the primary background. No horizon line visible.";
    }

    // --- FRAMING (Rotation Check) ---
    // CSS Rotation 0 is UP.
    // Vector to subject: Subject(50,50) - Camera(x,y)
    const toSubX = 50 - camera.x;
    const toSubY = 50 - camera.y;
    // Angle from positive X axis
    const toSubAngleRad = Math.atan2(toSubY, toSubX);
    // Convert to CSS degrees (0=Up, 90=Right, 180=Down, -90=Left)
    // Math: 0=Right. CSS: 0=Up. Offset = +90.
    const idealRotDeg = toSubAngleRad * (180 / Math.PI) + 90;

    const normCamRot = (camera.rotation % 360 + 360) % 360;
    const normIdeal = (idealRotDeg % 360 + 360) % 360;
    let diff = Math.abs(normCamRot - normIdeal);
    if (diff > 180) diff = 360 - diff;

    let composition = "Subject Centered";
    if (diff > 10 && diff <= 35) composition = "Rule of Thirds (Subject Off-Center)";
    else if (diff > 35) composition = "Subject on Edge of Frame / Looking Past Subject";

    // Structured Description for AI
    const description = `
    CAMERA_TYPE: ${shotType} (${lensType})
    POSITION: ${viewSide} relative to subject.
    HEIGHT: ${verticalAngle} (approx ${Math.round(camera.height)}% elevation).
    VISUAL_ANCHORS: ${visualAnchor}
    LENS_PHYSICS: ${physicsNote}
    COMPOSITION: ${composition}.
    `;

    onUpdate(description);
  }, [camera, onUpdate]);

  // Global Event Listeners for smooth drag
  useEffect(() => {
    const handleWindowMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging && !isRotating && !isAdjustingHeight) return;
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const deltaPixelsX = clientX - dragStartRef.current.mouseX;
      const deltaPixelsY = clientY - dragStartRef.current.mouseY;

      if (isDragging) {
        const deltaPercX = (deltaPixelsX / rect.width) * 100;
        const deltaPercY = (deltaPixelsY / rect.height) * 100;

        setCamera(prev => ({
            ...prev,
            x: Math.min(Math.max(dragStartRef.current.startValX + deltaPercX, 0), 100),
            y: Math.min(Math.max(dragStartRef.current.startValY + deltaPercY, 0), 100)
        }));
      } else if (isAdjustingHeight) {
        // Height is purely vertical delta, but inverted (Drag Up = Increase Height)
        // Sensitivity: 1px = 0.5% height
        const deltaHeight = -(deltaPixelsY / 2); 
        setCamera(prev => ({
            ...prev,
            height: Math.min(Math.max(dragStartRef.current.startValX + deltaHeight, 0), 100)
        }));
      } else if (isRotating) {
        const camPixelX = rect.left + (dragStartRef.current.startValX / 100) * rect.width;
        const camPixelY = rect.top + (dragStartRef.current.startValY / 100) * rect.height;
        
        const dx = clientX - camPixelX;
        const dy = clientY - camPixelY;
        
        const angleRad = Math.atan2(dy, dx);
        const angleDeg = angleRad * (180 / Math.PI) + 90; // +90 because CSS 0 is Up
        
        setCamera(prev => ({ ...prev, rotation: angleDeg }));
      }
    };

    const handleWindowUp = () => {
      setIsDragging(false);
      setIsRotating(false);
      setIsAdjustingHeight(false);
      document.body.style.cursor = 'default';
    };

    if (isDragging || isRotating || isAdjustingHeight) {
        window.addEventListener('mousemove', handleWindowMove);
        window.addEventListener('mouseup', handleWindowUp);
        window.addEventListener('touchmove', handleWindowMove, { passive: false });
        window.addEventListener('touchend', handleWindowUp);
        
        document.body.style.cursor = isDragging ? 'move' : isAdjustingHeight ? 'ns-resize' : 'crosshair';
    }

    return () => {
        window.removeEventListener('mousemove', handleWindowMove);
        window.removeEventListener('mouseup', handleWindowUp);
        window.removeEventListener('touchmove', handleWindowMove);
        window.removeEventListener('touchend', handleWindowUp);
        document.body.style.cursor = 'default';
    };
  }, [isDragging, isRotating, isAdjustingHeight, containerRef]);

  // Handlers
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation(); e.preventDefault();
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    dragStartRef.current = { mouseX: clientX, mouseY: clientY, startValX: camera.x, startValY: camera.y };
  };

  const handleHeightStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation(); e.preventDefault();
    setIsAdjustingHeight(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    // We store start Height in X for convenience
    dragStartRef.current = { mouseX: clientX, mouseY: clientY, startValX: camera.height, startValY: 0 };
  };

  const handleRotateStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation(); e.preventDefault();
    setIsRotating(true);
    // We need camera position to pivot around
    dragStartRef.current = { ...dragStartRef.current, startValX: camera.x, startValY: camera.y };
  };

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg z-20">
        {/* Floor Plan Grid - Helper Visuals */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white"></div>
            <div className="absolute top-0 left-1/2 w-px h-full bg-white"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-white"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] text-white mt-3 font-mono">SUBJECT</div>
        </div>

        {/* Labels for Orientation */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[8px] text-white/30 uppercase font-bold tracking-widest">Back</div>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] text-white/30 uppercase font-bold tracking-widest">Front</div>

        <div 
            className="absolute w-0 h-0 flex items-center justify-center pointer-events-auto"
            style={{ 
                top: `${camera.y}%`, 
                left: `${camera.x}%`,
            }}
        >
            {/* Rotation Container (Separated so height slider doesn't rotate with camera) */}
            <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `rotate(${camera.rotation}deg)` }}>
                {/* Field of View Cone */}
                <div className={`absolute bottom-4 pointer-events-none transition-all duration-300 ${isDragging ? 'opacity-5 scale-95' : 'opacity-20 hover:opacity-30'}`}>
                    <div 
                        className="w-0 h-0 border-l-[60px] border-r-[60px] border-b-[200px] border-l-transparent border-r-transparent border-b-amber-500"
                        style={{ transform: 'rotate(180deg)', transformOrigin: 'top center' }}
                    ></div>
                </div>

                {/* Camera Body */}
                <div 
                    className={`relative w-12 h-12 bg-slate-900/90 rounded-2xl border-2 border-amber-500 shadow-xl cursor-move z-10 flex items-center justify-center transition-all duration-200 ${isDragging ? 'scale-110 border-amber-300 shadow-amber-500/20' : 'hover:scale-105 hover:border-amber-400'}`}
                    onMouseDown={handleDragStart}
                    onTouchStart={handleDragStart}
                >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-6 h-6 text-amber-500 transition-colors ${isDragging ? 'text-amber-300' : ''}`}>
                          <path d="M12 9a3.75 3.75 0 1 0 0 7.5A3.75 3.75 0 0 0 12 9Z" />
                          <path fillRule="evenodd" d="M9.344 3.071a4.993 4.993 0 0 1 5.312 0l.315.166a1.25 1.25 0 0 0 1.135.088l1.32-.575A3.25 3.25 0 0 1 21.6 4.793l-1.002 4.364a.75.75 0 1 1-1.465-.336l1.002-4.364a1.75 1.75 0 0 0-2.316-2.07l-1.32.576a2.75 2.75 0 0 1-2.498-.194l-.315-.166a3.493 3.493 0 0 0-3.376 0l-.315.166a2.75 2.75 0 0 1-2.498.194l-1.32-.576a1.75 1.75 0 0 0-2.316 2.07l1.002 4.364a.75.75 0 1 1-1.465.336l-1.002-4.364a3.25 3.25 0 0 1 4.174-2.042l1.32.575a1.25 1.25 0 0 0 1.135-.088l.315-.166ZM12 6a5.25 5.25 0 0 1 5.25 5.25h-10.5A5.25 5.25 0 0 1 12 6ZM3 13.5a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Zm18 0a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
                        </svg>

                        {/* Lens Indicator */}
                        <div className="absolute -top-1 w-2 h-2 bg-amber-500 rounded-full shadow-md"></div>
                </div>

                {/* Rotation Handle */}
                <div 
                    className={`absolute -top-16 w-8 h-8 flex items-center justify-center cursor-grab active:cursor-grabbing z-20 group transition-opacity ${isDragging ? 'opacity-0' : 'opacity-100'}`}
                    onMouseDown={handleRotateStart}
                    onTouchStart={handleRotateStart}
                >
                        <div className="w-3 h-3 rounded-full bg-white border-2 border-amber-500 shadow-md group-hover:scale-125 transition-transform"></div>
                        <div className="absolute top-5 w-0.5 h-6 bg-amber-500 -z-10"></div>
                </div>
            </div>

            {/* Height Slider (Vertical, fixed rotation relative to screen) */}
            <div className={`absolute -right-8 h-16 w-4 flex flex-col items-center justify-end z-30 transition-opacity ${isDragging || isRotating ? 'opacity-0' : 'opacity-100'}`}>
                <div className="w-1 h-full bg-slate-700/80 rounded-full relative">
                    <div 
                        className="absolute bottom-0 w-full bg-amber-500/80 rounded-full" 
                        style={{ height: `${camera.height}%` }}
                    ></div>
                    {/* Slider Thumb */}
                    <div 
                        className="absolute w-3 h-3 bg-white border border-slate-900 rounded-full -left-1 shadow cursor-ns-resize hover:scale-125 transition-transform"
                        style={{ bottom: `${camera.height}%`, transform: 'translateY(50%)' }}
                        onMouseDown={handleHeightStart}
                        onTouchStart={handleHeightStart}
                    ></div>
                </div>
                <div className="absolute -bottom-4 text-[8px] font-bold text-amber-500">H</div>
            </div>

            {/* Close Button */}
            {!isDragging && !isRotating && !isAdjustingHeight && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="absolute -bottom-10 bg-red-500/80 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-all pointer-events-auto opacity-0 group-hover:opacity-100"
                    title="Remove Camera"
                >
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                       <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                     </svg>
                </button>
            )}
        </div>
        
        {/* Info HUD */}
        {(isDragging || isRotating || isAdjustingHeight) && (
             <div className="absolute top-2 right-2 bg-black/70 text-amber-500 text-[10px] font-mono p-1 rounded border border-amber-500/30">
                {isDragging ? `Pos: ${Math.round(camera.x)}, ${Math.round(camera.y)}` : 
                 isRotating ? `Rot: ${Math.round(camera.rotation)}°` : 
                 `Height: ${Math.round(camera.height)}%`}
             </div>
        )}
    </div>
  );
};