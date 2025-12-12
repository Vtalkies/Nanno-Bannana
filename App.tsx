import React, { useState, useRef, useEffect } from 'react';
import { generateImage, editImage, fileToBase64 } from './services/geminiService';
import { GeneratedAsset, Character, AppMode, GenerationConfig, ModelTier, ImageResolution, PhotographicConfig } from './types';
import { Loading } from './components/Loading';
import { IconWand, IconPhoto, IconTrash, IconDownload } from './components/Icons';

// Simple Plus/User Icon for the Character Vault
const IconUserPlus: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3.75 15a7.125 7.125 0 0 1 14.25 0v.003l-.081.019a8.51 8.51 0 0 0-3.425 2.502 8.51 8.51 0 0 0-3.626-2.503L3.75 15.002Z" />
  </svg>
);

const IconCheck: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
);

const STYLES = [
  "Cinematic",
  "Photorealistic",
  "Anime",
  "3D Render",
  "Oil Painting",
  "Cyberpunk",
  "Watercolor",
  "Noir",
  "None"
];

const LIGHTING_OPTIONS = ["None", "Natural", "Studio", "Dramatic", "Neon", "Golden Hour", "Volumetric", "Low Key"];
const CAMERA_OPTIONS = ["None", "Wide Angle", "Telephoto", "Macro", "Drone View", "Low Angle", "Eye Level"];
const DEPTH_OPTIONS = ["None", "Shallow (Bokeh)", "Deep Focus"];

export default function App() {
  // State
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPermissionError, setIsPermissionError] = useState(false);
  const [currentAsset, setCurrentAsset] = useState<GeneratedAsset | null>(null);
  const [history, setHistory] = useState<GeneratedAsset[]>([]);
  const [mode, setMode] = useState<AppMode>(AppMode.CREATE);
  
  // Character Vault State
  const [characterVault, setCharacterVault] = useState<Character[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [showSaveCharModal, setShowSaveCharModal] = useState(false);
  const [newCharName, setNewCharName] = useState('');
  const [consistencyStrength, setConsistencyStrength] = useState<'Low' | 'Medium' | 'High'>('High');

  // Configuration State
  const [aspectRatio, setAspectRatio] = useState<GenerationConfig['aspectRatio']>('16:9');
  const [modelTier, setModelTier] = useState<ModelTier>('flash');
  const [resolution, setResolution] = useState<ImageResolution>('1K');
  const [useGrounding, setUseGrounding] = useState(false);
  const [style, setStyle] = useState('Cinematic');
  
  // Photographic State
  const [lighting, setLighting] = useState('None');
  const [camera, setCamera] = useState('None');
  const [depth, setDepth] = useState('None');

  // Reference Images (Manual Uploads)
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const charUploadRef = useRef<HTMLInputElement>(null);

  // Load history & vault from local storage on mount
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('cinebanana_history');
      if (savedHistory) setHistory(JSON.parse(savedHistory));

      const savedVault = localStorage.getItem('cinebanana_vault');
      if (savedVault) setCharacterVault(JSON.parse(savedVault));
    } catch (e) {
      console.error("Failed to load from local storage:", e);
    }
  }, []);

  // Save history when it updates
  useEffect(() => {
    try {
      localStorage.setItem('cinebanana_history', JSON.stringify(history));
    } catch (e) {
      console.error("Storage limit reached (History)", e);
      // We do not set error state here to avoid disrupting the user experience with constant alerts,
      // but the data simply won't persist to next reload.
    }
  }, [history]);

  // Save vault when it updates
  useEffect(() => {
    try {
      localStorage.setItem('cinebanana_vault', JSON.stringify(characterVault));
    } catch (e) {
      console.error("Storage limit reached (Vault)", e);
      setError("Browser storage is full. New characters may not be saved after reload.");
    }
  }, [characterVault]);

  const handleApiKeySelection = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        setError(null);
        setIsPermissionError(false);
      }
    } catch (e) {
      console.error("Failed to open key selector", e);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    // API Key Check for Pro Model
    if (modelTier === 'pro') {
      try {
        if (window.aistudio) {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          if (!hasKey) {
            await window.aistudio.openSelectKey();
          }
        }
      } catch (e) {
        console.warn("API Key selection flow encountered an error, proceeding anyway:", e);
      }
    }

    setLoading(true);
    setError(null);
    setIsPermissionError(false);
    
    try {
      let resultBase64: string;
      
      const photographic: PhotographicConfig = {
        lighting,
        camera,
        depth
      };

      const config: GenerationConfig = {
        aspectRatio,
        modelTier,
        resolution: modelTier === 'pro' ? resolution : undefined,
        useGrounding: modelTier === 'pro' ? useGrounding : false,
        consistencyStrength,
        style,
        photographic
      };
      
      // Collect Vault References
      const vaultRefs = characterVault
        .filter(c => selectedCharacterIds.includes(c.id))
        .map(c => c.base64);

      // Determine if we are creating new or editing existing
      if (mode === AppMode.EDIT && currentAsset) {
         // Editing Logic: Pass current image + prompt
         resultBase64 = await editImage(currentAsset.base64, prompt, config);
      } else {
         // Creation Logic: Pass prompt + manual refs + vault refs
         const allReferences = [...referenceImages, ...vaultRefs];
         resultBase64 = await generateImage(prompt, config, allReferences);
      }

      const newAsset: GeneratedAsset = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url: resultBase64,
        base64: resultBase64,
        prompt: prompt,
        timestamp: Date.now(),
        type: mode === AppMode.CREATE ? 'character' : 'scene'
      };

      setCurrentAsset(newAsset);
      setHistory(prev => [newAsset, ...prev]);
      
      // Cleanup after generation
      if (mode === AppMode.CREATE) {
        setMode(AppMode.EDIT);
        setPrompt(""); 
        setReferenceImages([]); // Clear manual references
        // Note: We intentionally keep selectedCharacterIds active for continuity
      } else {
        setPrompt("");
      }

    } catch (err: any) {
      console.error(err);
      const errorMessage = err.message || JSON.stringify(err);
      if (errorMessage.includes('403') || errorMessage.includes('PERMISSION_DENIED')) {
        setError("Access Denied. You may need to select a valid paid API key for this model.");
        setIsPermissionError(true);
      } else {
        setError(errorMessage || "Something went wrong generating the image.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // If we are already in edit mode, replace the current asset (Legacy behavior + safety)
    if (mode === AppMode.EDIT && currentAsset) {
       const file = files[0];
       try {
        const base64 = await fileToBase64(file);
        const importedAsset: GeneratedAsset = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: base64,
            base64: base64,
            prompt: "Imported Image",
            timestamp: Date.now(),
            type: 'scene'
        };
        setCurrentAsset(importedAsset);
       } catch (e) {
        setError("Failed to upload image.");
       } finally {
         if (fileInputRef.current) fileInputRef.current.value = '';
       }
       return;
    }

    // In Create mode, we add to reference images list
    const newRefs: string[] = [];
    try {
        for (let i = 0; i < files.length; i++) {
            const base64 = await fileToBase64(files[i]);
            newRefs.push(base64);
        }
        setReferenceImages(prev => [...prev, ...newRefs]);
    } catch (err) {
        setError("Failed to load reference images.");
    } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  // --- Character Vault Logic ---

  const handleCharacterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input immediately to allow re-selection if cancelled or failed
    e.target.value = '';

    // We need a name immediately. For simplicity in this flow, we'll prompt standard or use filename
    const name = window.prompt("Enter character name:", file.name.split('.')[0]);
    if (!name) return;

    try {
      const base64 = await fileToBase64(file);
      const newChar: Character = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        base64,
        timestamp: Date.now()
      };
      setCharacterVault(prev => [newChar, ...prev]);
      // Auto select newly uploaded character
      setSelectedCharacterIds(prev => [...prev, newChar.id]);
    } catch (err) {
      setError("Failed to upload character.");
    }
  };

  const saveCurrentToVault = () => {
    if (!currentAsset || !newCharName.trim()) return;
    const newChar: Character = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: newCharName,
      base64: currentAsset.base64,
      timestamp: Date.now()
    };
    setCharacterVault(prev => [newChar, ...prev]);
    setShowSaveCharModal(false);
    setNewCharName("");
    // Switch to create mode so user can use the new character
    setMode(AppMode.CREATE);
    setSelectedCharacterIds([newChar.id]);
    setCurrentAsset(null);
  };

  const toggleCharacterSelection = (id: string) => {
    setSelectedCharacterIds(prev => 
      prev.includes(id) 
        ? prev.filter(cid => cid !== id) 
        : [...prev, id]
    );
  };

  const deleteCharacter = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm("Delete this character from vault?")) {
      setCharacterVault(prev => prev.filter(c => c.id !== id));
      setSelectedCharacterIds(prev => prev.filter(cid => cid !== id));
    }
  };

  // -----------------------------

  const handleClear = () => {
    setCurrentAsset(null);
    setMode(AppMode.CREATE);
    setPrompt("");
    setReferenceImages([]);
    setError(null);
  };

  const handleHistorySelect = (asset: GeneratedAsset) => {
    setCurrentAsset(asset);
    setMode(AppMode.EDIT);
    setError(null);
  };

  const handleDownload = () => {
    if (!currentAsset) return;
    const link = document.createElement('a');
    link.href = currentAsset.url;
    link.download = `cinebanana-${currentAsset.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-200 overflow-hidden">
      
      {/* LEFT PANEL - CONTROLS */}
      <div className="w-full md:w-[420px] flex flex-col border-r border-slate-800 bg-slate-900/50 backdrop-blur-sm z-10 shrink-0">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-300 to-yellow-500 bg-clip-text text-transparent flex items-center gap-2">
            <span>CineBanana</span>
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">Studio</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {modelTier === 'pro' ? 'Powered by Nano Banana Pro' : 'Powered by Nano Banana'}
          </p>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Mode Switcher */}
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-400 mb-3">Workflow</h2>
            <div className="flex gap-2 bg-slate-900 p-1 rounded-lg">
              <button 
                onClick={() => { setMode(AppMode.CREATE); setCurrentAsset(null); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === AppMode.CREATE ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:text-white'}`}
              >
                Create
              </button>
              <button 
                onClick={() => setMode(AppMode.EDIT)}
                disabled={!currentAsset}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === AppMode.EDIT ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'} ${!currentAsset ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Edit / Scene
              </button>
            </div>
             {mode === AppMode.CREATE && (
              <p className="text-xs text-amber-200/70 mt-2 px-1">
                Generate new concepts. {modelTier === 'pro' && "Supports blending characters & refs."}
              </p>
            )}
             {mode === AppMode.EDIT && (
              <p className="text-xs text-indigo-300 mt-2 px-1">
                Refine the current image or change the scene details.
              </p>
            )}
          </div>

          {/* Character Vault Section */}
          <div className="bg-slate-800/20 p-4 rounded-xl border border-slate-800">
             <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-400">Cast & Characters</h2>
                <input
                    type="file"
                    ref={charUploadRef}
                    onChange={handleCharacterUpload}
                    accept="image/*"
                    className="hidden"
                  />
                <button 
                  onClick={() => charUploadRef.current?.click()}
                  className="text-xs text-amber-500 hover:text-amber-400 font-medium flex items-center gap-1"
                >
                  <IconUserPlus className="w-3 h-3" />
                  <span>Add New</span>
                </button>
             </div>
             
             {characterVault.length === 0 ? (
               <div className="text-center py-4 border border-dashed border-slate-800 rounded-lg text-slate-600 text-xs">
                 No saved characters. <br/> Upload or generate one to start building your cast.
               </div>
             ) : (
               <div className="grid grid-cols-4 gap-2">
                 {characterVault.map(char => {
                   const isSelected = selectedCharacterIds.includes(char.id);
                   return (
                     <button
                       key={char.id}
                       onClick={() => toggleCharacterSelection(char.id)}
                       className={`relative group aspect-square rounded-lg overflow-hidden border-2 transition-all ${isSelected ? 'border-amber-500 ring-1 ring-amber-500' : 'border-slate-800 hover:border-slate-600'}`}
                       title={char.name}
                     >
                       <img src={char.base64} alt={char.name} className="w-full h-full object-cover" />
                       {/* Selection Indicator */}
                       {isSelected && (
                         <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                           <IconCheck className="w-5 h-5 text-white drop-shadow-md" />
                         </div>
                       )}
                       {/* Name Label */}
                       <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-white p-0.5 text-center truncate">
                         {char.name}
                       </div>
                       {/* Delete Action */}
                       <div 
                         onClick={(e) => deleteCharacter(e, char.id)}
                         className="absolute top-0 right-0 bg-red-500/80 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 cursor-pointer"
                       >
                         <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                       </div>
                     </button>
                   );
                 })}
               </div>
             )}
             
             {/* Consistency Strength Control */}
             {(selectedCharacterIds.length > 0 || referenceImages.length > 0) && mode === AppMode.CREATE && (
               <div className="mt-4 pt-3 border-t border-slate-700/50">
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[10px] uppercase font-semibold text-slate-400">Character Consistency</label>
                    <span className="text-[10px] text-amber-500 font-medium">{consistencyStrength}</span>
                  </div>
                  <div className="flex gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
                    {(['Low', 'Medium', 'High'] as const).map((level) => (
                      <button
                        key={level}
                        onClick={() => setConsistencyStrength(level)}
                        className={`flex-1 py-1 text-[10px] font-medium rounded transition-all ${
                          consistencyStrength === level
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
               </div>
             )}
          </div>

          {/* Model Configuration */}
          <div className="space-y-4">
             {/* Model Selector */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setModelTier('flash')}
                className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden ${modelTier === 'flash' ? 'bg-amber-500/10 border-amber-500' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}
              >
                 <div className="font-semibold text-sm mb-1 text-amber-100">Nano Banana</div>
                 <div className="text-[10px] text-slate-400">Fast • Efficient</div>
                 {modelTier === 'flash' && <div className="absolute top-0 right-0 w-3 h-3 bg-amber-500 rounded-bl-lg"></div>}
              </button>
               <button
                onClick={() => setModelTier('pro')}
                className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden ${modelTier === 'pro' ? 'bg-purple-500/10 border-purple-500' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}
              >
                 <div className="font-semibold text-sm mb-1 text-purple-100">Nano Banana Pro</div>
                 <div className="text-[10px] text-slate-400">High Def • Smart</div>
                 {modelTier === 'pro' && <div className="absolute top-0 right-0 w-3 h-3 bg-purple-500 rounded-bl-lg"></div>}
              </button>
            </div>

            {/* Pro Capabilities */}
            {modelTier === 'pro' && (
              <div className="bg-purple-500/5 rounded-xl p-4 border border-purple-500/20 space-y-4 animate-in fade-in slide-in-from-top-2">
                
                {/* Resolution */}
                <div>
                    <label className="text-xs font-semibold text-purple-300 mb-2 block">Resolution & Grounding</label>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1 flex-1">
                        {['1K', '2K', '4K'].map((res) => (
                            <button
                              key={res}
                              onClick={() => setResolution(res as ImageResolution)}
                              className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                resolution === res 
                                ? 'bg-purple-600 border-purple-500 text-white' 
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                              }`}
                            >
                              {res}
                            </button>
                        ))}
                      </div>
                      
                      {/* Grounding Toggle */}
                      <button 
                        onClick={() => setUseGrounding(!useGrounding)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-2 ${useGrounding ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                        title="Use Google Search Grounding for real-world accuracy"
                      >
                         <span className="w-2 h-2 rounded-full bg-current"></span>
                         Search
                      </button>
                    </div>
                </div>
                
                {/* Cinematic Controls */}
                <div>
                    <label className="text-xs font-semibold text-purple-300 mb-2 block">Cinematic Controls</label>
                    <div className="grid grid-cols-3 gap-2">
                         <select value={lighting} onChange={(e) => setLighting(e.target.value)} className="bg-slate-800 border-slate-700 rounded text-[10px] p-1.5 outline-none focus:border-purple-500">
                            {LIGHTING_OPTIONS.map(o => <option key={o} value={o}>{o === 'None' ? 'Lighting' : o}</option>)}
                         </select>
                         <select value={camera} onChange={(e) => setCamera(e.target.value)} className="bg-slate-800 border-slate-700 rounded text-[10px] p-1.5 outline-none focus:border-purple-500">
                            {CAMERA_OPTIONS.map(o => <option key={o} value={o}>{o === 'None' ? 'Camera' : o}</option>)}
                         </select>
                         <select value={depth} onChange={(e) => setDepth(e.target.value)} className="bg-slate-800 border-slate-700 rounded text-[10px] p-1.5 outline-none focus:border-purple-500">
                            {DEPTH_OPTIONS.map(o => <option key={o} value={o}>{o === 'None' ? 'Depth' : o}</option>)}
                         </select>
                    </div>
                </div>
              </div>
            )}

            {/* Style & Aspect */}
            <div className="grid grid-cols-2 gap-3">
               <div>
                <label className="text-xs font-semibold text-slate-400 mb-2 block">Aspect Ratio</label>
                <select 
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as GenerationConfig['aspectRatio'])}
                  className="w-full bg-slate-800 border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-amber-500/50 outline-none transition-all"
                >
                  <option value="16:9">Cinematic (16:9)</option>
                  <option value="21:9">Ultrawide (21:9)</option>
                  <option value="9:16">Mobile (9:16)</option>
                  <option value="4:3">TV Standard (4:3)</option>
                  <option value="3:4">Portrait (3:4)</option>
                  <option value="1:1">Square (1:1)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 mb-2 block">Style</label>
                <select 
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="w-full bg-slate-800 border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-amber-500/50 outline-none transition-all"
                >
                  {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-slate-400 block">
                  {mode === AppMode.CREATE ? "Description" : "Editing Instruction"}
                </label>
                {modelTier === 'pro' && <span className="text-[10px] text-purple-400">Supports text rendering</span>}
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={mode === AppMode.CREATE 
                  ? "A noir detective holding a sign that says 'GUILTY', raining city street, 8k..." 
                  : "Change the background to a sunny beach, ensure text 'SUMMER' is visible..."}
                className={`w-full h-28 bg-slate-800 border-slate-700 rounded-xl p-4 text-sm outline-none resize-none placeholder:text-slate-600 transition-all focus:ring-2 ${modelTier === 'pro' ? 'focus:ring-purple-500/50' : 'focus:ring-amber-500/50'}`}
              />
            </div>

            {/* Manual Reference Upload (Create Mode Only) */}
            {mode === AppMode.CREATE && (
               <div className="space-y-3">
                  <div className="relative flex justify-center py-2">
                    <span className="bg-slate-900 px-2 text-xs text-slate-500 uppercase">
                      Additional Ref {modelTier === 'pro' ? '(Blend)' : '(Single)'}
                    </span>
                    <div className="absolute inset-0 flex items-center -z-10" aria-hidden="true">
                      <div className="w-full border-t border-slate-800"></div>
                    </div>
                  </div>

                  {/* Reference Image List */}
                  {referenceImages.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700">
                      {referenceImages.map((img, idx) => (
                        <div key={idx} className="relative w-16 h-16 shrink-0 group">
                           <img src={img} alt={`Ref ${idx}`} className="w-full h-full object-cover rounded-lg border border-slate-700" />
                           <button 
                             onClick={() => removeReferenceImage(idx)}
                             className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                           >
                             &times;
                           </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <input
                    type="file"
                    multiple={modelTier === 'pro'}
                    ref={fileInputRef}
                    onChange={handleManualFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 border border-dashed border-slate-700 rounded-xl text-slate-400 hover:text-slate-200 hover:border-slate-500 hover:bg-slate-800/50 transition-all text-sm flex items-center justify-center gap-2"
                  >
                    <IconPhoto className="w-4 h-4" />
                    <span>Upload References</span>
                  </button>
               </div>
            )}
            
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt}
              className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                loading 
                ? 'bg-slate-700 cursor-wait text-slate-400' 
                : modelTier === 'pro'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-500/25'
                  : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-900 shadow-lg shadow-amber-500/25'
              }`}
            >
              {loading ? (
                <span>Generating...</span>
              ) : (
                <>
                  <IconWand className="w-5 h-5" />
                  <span>{mode === AppMode.CREATE ? "Generate" : "Update Scene"}</span>
                </>
              )}
            </button>
          </div>

          {/* History / Gallery */}
          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-400">Reel History</h2>
              <button onClick={() => setHistory([])} className="text-xs text-slate-600 hover:text-red-400">Clear</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {history.map((asset) => (
                <button 
                  key={asset.id}
                  onClick={() => handleHistorySelect(asset)}
                  className={`relative aspect-square rounded-lg overflow-hidden border transition-all ${currentAsset?.id === asset.id ? 'border-amber-500 ring-1 ring-amber-500' : 'border-slate-800 hover:border-slate-600'}`}
                >
                  <img src={asset.url} alt="History" className="w-full h-full object-cover" />
                </button>
              ))}
              {history.length === 0 && (
                <div className="col-span-3 text-center py-8 text-slate-600 text-xs italic">
                  No scenes generated yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL - PREVIEW */}
      <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 opacity-20" 
             style={{ 
               backgroundImage: 'radial-gradient(#334155 1px, transparent 1px)', 
               backgroundSize: '24px 24px' 
             }}>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4">
             <div className="bg-red-500/10 border border-red-500/50 text-red-200 px-6 py-4 rounded-xl backdrop-blur-md shadow-xl animate-in fade-in slide-in-from-top-4 relative">
                <div className="flex items-start gap-3">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mt-2 shrink-0"></span>
                  <div className="flex-1">
                    <p className="font-semibold text-red-100 mb-1">Error</p>
                    <p className="text-sm text-red-200/80 leading-relaxed mb-3 break-words">{error}</p>
                    
                    {isPermissionError && (
                      <button 
                        onClick={handleApiKeySelection}
                        className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-red-900/20 flex items-center gap-2"
                      >
                         <span>Select Paid API Key</span>
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                           <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2.5a2.25 2.25 0 0 1-2.25 2.25H10.5v3.75a.75.75 0 0 1-1.5 0V10H8v1.75a.75.75 0 0 1-1.5 0V10h-.25A2.25 2.25 0 0 1 4 7.75v-2.5A2.25 2.25 0 0 1 6.25 3H5.25A.75.75 0 0 0 4.5 3.75v.5c0 .414.336.75.75.75H3a.75.75 0 0 0-.75.75v2.5c0 .414.336.75.75.75h.75a2.25 2.25 0 0 0 2.25-2.25v-2.5a.75.75 0 0 0-.75-.75H4.5a.75.75 0 0 0-.75-.75v-.5Z" clipRule="evenodd" />
                         </svg>
                      </button>
                    )}
                  </div>
                  <button onClick={() => setError(null)} className="text-red-300 hover:text-white transition-colors">&times;</button>
                </div>
             </div>
          </div>
        )}

        {/* Save Character Modal */}
        {showSaveCharModal && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95">
                <h3 className="text-lg font-bold text-white mb-4">Save to Character Vault</h3>
                <input 
                  autoFocus
                  type="text" 
                  value={newCharName}
                  onChange={(e) => setNewCharName(e.target.value)}
                  placeholder="Character Name (e.g. Detective Joe)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white mb-4 focus:ring-2 focus:ring-amber-500 outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && saveCurrentToVault()}
                />
                <div className="flex gap-3">
                  <button onClick={() => setShowSaveCharModal(false)} className="flex-1 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800 transition-colors">Cancel</button>
                  <button onClick={saveCurrentToVault} disabled={!newCharName.trim()} className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold transition-colors disabled:opacity-50">Save Character</button>
                </div>
             </div>
          </div>
        )}

        {/* Main Canvas */}
        <div className="relative z-10 p-8 w-full h-full flex items-center justify-center">
          {loading ? (
             <Loading message={mode === AppMode.CREATE ? "Dreaming up character..." : "Applying edits..."} />
          ) : currentAsset ? (
            <div className="relative group max-w-full max-h-full shadow-2xl shadow-black/50">
              <img 
                src={currentAsset.url} 
                alt="Generated Result" 
                className="max-w-full max-h-[85vh] object-contain rounded-sm border-4 border-slate-900"
              />
              
              {/* Overlay Actions */}
              <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                 <button 
                  onClick={() => setShowSaveCharModal(true)}
                  className="bg-amber-500/90 hover:bg-amber-500 text-slate-900 p-2.5 rounded-lg backdrop-blur-sm shadow-lg font-bold"
                  title="Save as Character to Vault"
                >
                  <IconUserPlus className="w-5 h-5" />
                </button>
                <div className="w-px h-8 bg-white/20 mx-1 self-center"></div>
                <button 
                  onClick={handleDownload}
                  className="bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-lg backdrop-blur-sm border border-white/10"
                  title="Download"
                >
                  <IconDownload className="w-5 h-5" />
                </button>
                <button 
                  onClick={handleClear}
                  className="bg-red-500/80 hover:bg-red-600/90 text-white p-2.5 rounded-lg backdrop-blur-sm"
                  title="Clear & New"
                >
                   <IconTrash className="w-5 h-5" />
                </button>
              </div>

              {/* Prompt Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-6 pt-12 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <p className="text-white text-sm font-medium line-clamp-2">{currentAsset.prompt}</p>
                {currentAsset.type && <span className="text-[10px] text-slate-400 bg-slate-900/50 px-2 py-0.5 rounded uppercase">{currentAsset.type}</span>}
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4 max-w-md">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto border text-slate-700 ${modelTier === 'pro' ? 'bg-slate-900 border-purple-900/50' : 'bg-slate-900 border-slate-800'}`}>
                <IconWand className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-semibold text-slate-300">Start Your Production</h3>
              <p className="text-slate-500">
                Create a consistent character or scene using the panel on the left.
              </p>
              <div className="flex gap-2 justify-center flex-wrap mt-4">
                 <span className="text-xs bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-slate-500">"Cyberpunk street vendor"</span>
                 <span className="text-xs bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-slate-500">"Oil painting style"</span>
                 <span className="text-xs bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-slate-500">"Add cinematic lighting"</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}