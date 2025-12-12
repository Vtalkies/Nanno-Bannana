import React, { useState, useRef, useEffect } from 'react';
import { generateImage, editImage, fileToBase64 } from './services/geminiService';
import { GeneratedAsset, AppMode, GenerationConfig, ModelTier, ImageResolution } from './types';
import { Loading } from './components/Loading';
import { IconWand, IconPhoto, IconTrash, IconDownload } from './components/Icons';

export default function App() {
  // State
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPermissionError, setIsPermissionError] = useState(false);
  const [currentAsset, setCurrentAsset] = useState<GeneratedAsset | null>(null);
  const [history, setHistory] = useState<GeneratedAsset[]>([]);
  const [mode, setMode] = useState<AppMode>(AppMode.CREATE);
  
  // Configuration State
  const [aspectRatio, setAspectRatio] = useState<GenerationConfig['aspectRatio']>('16:9');
  const [modelTier, setModelTier] = useState<ModelTier>('flash');
  const [resolution, setResolution] = useState<ImageResolution>('1K');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load history from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('cinebanana_history');
    if (saved) {
      setHistory(JSON.parse(saved));
    }
  }, []);

  // Save history when it updates
  useEffect(() => {
    localStorage.setItem('cinebanana_history', JSON.stringify(history));
  }, [history]);

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
      const config: GenerationConfig = {
        aspectRatio,
        modelTier,
        resolution: modelTier === 'pro' ? resolution : undefined
      };
      
      // Determine if we are creating new or editing existing
      if (mode === AppMode.EDIT && currentAsset) {
         // Editing Logic: Pass current image + prompt
         resultBase64 = await editImage(currentAsset.base64, prompt, config);
      } else {
         // Creation Logic: Just prompt
         resultBase64 = await generateImage(prompt, config);
      }

      const newAsset: GeneratedAsset = {
        id: Date.now().toString(),
        url: resultBase64,
        base64: resultBase64,
        prompt: prompt,
        timestamp: Date.now(),
        type: mode === AppMode.CREATE ? 'character' : 'scene'
      };

      setCurrentAsset(newAsset);
      setHistory(prev => [newAsset, ...prev]);
      
      // Workflow auto-switching
      if (mode === AppMode.CREATE) {
        setMode(AppMode.EDIT);
        setPrompt(""); 
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await fileToBase64(file);
      const importedAsset: GeneratedAsset = {
        id: Date.now().toString(),
        url: base64,
        base64: base64,
        prompt: "Imported Image",
        timestamp: Date.now(),
        type: 'character' // Default assumption
      };
      setCurrentAsset(importedAsset);
      setMode(AppMode.EDIT); // Switch to edit mode immediately for imported images
      setError(null);
    } catch (err) {
      setError("Failed to load image file.");
    }
  };

  const handleClear = () => {
    setCurrentAsset(null);
    setMode(AppMode.CREATE);
    setPrompt("");
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
      <div className="w-full md:w-[400px] flex flex-col border-r border-slate-800 bg-slate-900/50 backdrop-blur-sm z-10 shrink-0">
        
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
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
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
                Describe a character or scene to generate from scratch.
              </p>
            )}
             {mode === AppMode.EDIT && (
              <p className="text-xs text-indigo-300 mt-2 px-1">
                Currently editing the image on screen.
              </p>
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
                 <div className="text-[10px] text-slate-400">High Def • 4K</div>
                 {modelTier === 'pro' && <div className="absolute top-0 right-0 w-3 h-3 bg-purple-500 rounded-bl-lg"></div>}
              </button>
            </div>

            {/* Resolution (Pro Only) */}
            {modelTier === 'pro' && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="text-xs font-semibold text-purple-300 mb-2 flex justify-between">
                  <span>Pro Resolution</span>
                  <span className="text-[10px] bg-purple-900/50 px-2 py-0.5 rounded text-purple-200">Requires Paid Key</span>
                </label>
                <div className="flex gap-2">
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
              </div>
            )}

             <div>
              <label className="text-xs font-semibold text-slate-400 mb-2 block">Aspect Ratio</label>
              <select 
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as GenerationConfig['aspectRatio'])}
                className="w-full bg-slate-800 border-slate-700 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-amber-500/50 outline-none transition-all"
              >
                <option value="16:9">Cinematic (16:9)</option>
                <option value="9:16">Mobile (9:16)</option>
                <option value="4:3">TV Standard (4:3)</option>
                <option value="3:4">Portrait (3:4)</option>
                <option value="1:1">Square (1:1)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 mb-2 block">
                {mode === AppMode.CREATE ? "Character Description" : "Editing Instruction"}
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={mode === AppMode.CREATE 
                  ? "A noir detective in a trench coat, raining city street, 8k resolution..." 
                  : "Add a retro filter, make it snowing, remove the background..."}
                className={`w-full h-32 bg-slate-800 border-slate-700 rounded-xl p-4 text-sm outline-none resize-none placeholder:text-slate-600 transition-all focus:ring-2 ${modelTier === 'pro' ? 'focus:ring-purple-500/50' : 'focus:ring-amber-500/50'}`}
              />
            </div>
            
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
                  <span>{mode === AppMode.CREATE ? "Generate Character" : "Update Scene"}</span>
                </>
              )}
            </button>

            {mode === AppMode.CREATE && (
              <div className="relative pt-4">
                 <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-slate-800"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-slate-900 px-2 text-xs text-slate-500 uppercase">Or upload reference</span>
                </div>
                 <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 w-full py-2.5 border border-dashed border-slate-700 rounded-xl text-slate-400 hover:text-slate-200 hover:border-slate-500 hover:bg-slate-800/50 transition-all text-sm flex items-center justify-center gap-2"
                >
                  <IconPhoto className="w-4 h-4" />
                  <span>Upload Image</span>
                </button>
              </div>
            )}
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
                Create a consistent character or scene using the panel on the left. Once generated, you can continue to edit it with text commands.
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