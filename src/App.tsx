import { useState, useEffect, useRef } from 'react';
import { usePWAInstall } from './hooks/usePWAInstall';
import { useOnlineStatus } from './hooks/useOnlineStatus';

interface HistoryItem {
  id: string;
  input: string;
  output: string;
  from: string;
  to: string;
  time: string;
}

export default function App() {
  // Navigation State
  const [activePage, setActivePage] = useState<'home' | 'history' | 'camera' | 'settings'>('home');

  // Core Translation States
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('Your translation will appear here.');
  const [fromLang, setFromLang] = useState('English 🇬🇧');
  const [toLang, setToLang] = useState('Urdu 🇵🇰');
  const [selectedModel, setSelectedModel] = useState('Gemini 3.5 Flash');
  const [isProcessing, setIsProcessing] = useState(false);

  // Settings Toggles
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);

  // Speech and Browser API States
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Camera / Scan States
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local History & UI States
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  
  // Custom Toast state
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  // PWA Hooks
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Trigger interactive toast notifications
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
  };

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 2200);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  // Sync dark mode preference with CSS class and localStorage
  useEffect(() => {
    const savedDark = localStorage.getItem('novaDarkMode') === 'true';
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedDark || (!localStorage.getItem('novaDarkMode') && systemDark);
    setDarkMode(isDark);
    if (isDark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const newDark = !darkMode;
    setDarkMode(newDark);
    localStorage.setItem('novaDarkMode', String(newDark));
    if (newDark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
    triggerToast(newDark ? 'Dark mode enabled' : 'Light mode enabled');
  };

  // Load and Save Local History
  useEffect(() => {
    const savedHistory = localStorage.getItem('novaHistory');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        setHistory([]);
      }
    }
  }, []);

  const saveHistory = (newItems: HistoryItem[]) => {
    setHistory(newItems);
    localStorage.setItem('novaHistory', JSON.stringify(newItems));
  };

  const removeHistoryItem = (id: string) => {
    const updated = history.filter(item => item.id !== id);
    saveHistory(updated);
    triggerToast('Translation deleted');
  };

  const clearAllHistory = () => {
    saveHistory([]);
    triggerToast('History cleared');
  };

  // Switch Language Options instantly
  const handleSwapLanguages = () => {
    const temp = fromLang;
    setFromLang(toLang);
    setToLang(temp);
    triggerToast('Languages swapped');
  };

  // Quick Prompt Option Select
  const handleQuickPrompt = (text: string, from: string, to: string) => {
    setInputText(text);
    setFromLang(from);
    setToLang(to);
    triggerToast(`Loaded: ${from} → ${to}`);
  };

  // Helper to map UI names to Speech tags
  const getLangCode = (name: string): string => {
    if (name.includes('Urdu')) return 'ur-PK';
    if (name.includes('English')) return 'en-US';
    if (name.includes('Arabic')) return 'ar-SA';
    if (name.includes('Punjabi')) return 'pa-IN';
    if (name.includes('Hindi')) return 'hi-IN';
    if (name.includes('Japanese')) return 'ja-JP';
    if (name.includes('Chinese')) return 'zh-CN';
    if (name.includes('French')) return 'fr-FR';
    if (name.includes('German')) return 'de-DE';
    if (name.includes('Spanish')) return 'es-ES';
    return 'en-US';
  };

  // Speech-to-Text Integration (Microphone Input)
  const handleToggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      triggerToast('Speech recognition is not supported in this browser.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      triggerToast('Listening stopped');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = getLangCode(fromLang);

    recognition.onstart = () => {
      setIsListening(true);
      triggerToast(`Listening for ${fromLang}...`);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        triggerToast('Mic permission blocked. Click "Open in new tab" at top-right to authorize microphone access!');
      } else if (event.error === 'aborted') {
        // Quietly handle aborted sessions without showing warning toasts
        console.log('Speech recognition session aborted successfully.');
      } else if (event.error === 'no-speech') {
        triggerToast('No speech detected. Please speak clearly into your mic.');
      } else {
        triggerToast(`Voice input error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        setInputText(prev => prev + (prev ? ' ' : '') + finalTranscript);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Text-to-Speech Control (Speak Out Loud)
  const handleSpeakTranslation = () => {
    if (!('speechSynthesis' in window)) {
      triggerToast('Text-to-speech is not supported in this browser.');
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      triggerToast('Playback stopped');
      return;
    }

    if (!outputText || outputText === 'Your translation will appear here.' || outputText.startsWith('[Backend')) {
      triggerToast('No valid translation to listen to.');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(outputText);
    utterance.lang = getLangCode(toLang);

    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
    triggerToast(`Reading in matching accent...`);
  };

  // Main Call: Translate Input
  const handleTranslate = async () => {
    const trimmedInput = inputText.trim();
    if (!trimmedInput) {
      triggerToast('Please type or speak something first.');
      return;
    }

    setIsProcessing(true);
    triggerToast('Sending translation request...');

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmedInput,
          from: autoDetectEnabled ? 'Auto-detect' : fromLang,
          to: toLang,
          model: selectedModel,
        }),
      });

      const data = await response.json();
      if (response.ok && data.translation) {
        setOutputText(data.translation);
        triggerToast('Translation completed!');

        // Save translation item inside persistent browser history
        const newItem: HistoryItem = {
          id: Date.now().toString(),
          input: trimmedInput,
          output: data.translation,
          from: autoDetectEnabled ? 'Auto-detect' : fromLang,
          to: toLang,
          time: new Date().toLocaleString(),
        };

        const updatedHistory = [newItem, ...history].slice(0, 50);
        saveHistory(updatedHistory);

        // Optionally Speak aloud if toggled on
        if (voiceOutputEnabled && 'speechSynthesis' in window) {
          setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(data.translation);
            utterance.lang = getLangCode(toLang);
            window.speechSynthesis.speak(utterance);
          }, 300);
        }
      } else {
        throw new Error(data.error || 'Failed to translate.');
      }
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Translation failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Clipboard Utilities
  const handleCopyToClipboard = async () => {
    if (!outputText || outputText === 'Your translation will appear here.') {
      triggerToast('Nothing to copy yet!');
      return;
    }
    try {
      await navigator.clipboard.writeText(outputText);
      triggerToast('Copied to clipboard');
    } catch (e) {
      triggerToast('Failed to copy');
    }
  };

  // Web Share Utility
  const handleShareTranslation = async () => {
    if (!outputText || outputText === 'Your translation will appear here.') {
      triggerToast('Nothing to share yet!');
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Nova Translate',
          text: `Original: ${inputText}\nTranslated: ${outputText}`,
          url: window.location.href,
        });
      } catch (e) {
        console.error(e);
      }
    } else {
      triggerToast('Native sharing not supported. You can copy the text instead!');
    }
  };

  // OCR Upload / Processing Flow
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      triggerToast('Image uploaded successfully');
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleStartScan = async () => {
    if (!imagePreview) {
      triggerToast('Please choose or upload an image first.');
      return;
    }

    setIsScanning(true);
    triggerToast('Extracting text (OCR)...');

    try {
      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imagePreview,
          mimeType: imageFile?.type || 'image/jpeg',
          model: selectedModel,
        }),
      });

      const data = await response.json();
      if (response.ok && data.text) {
        if (data.text.includes('[No legible text')) {
          triggerToast('No legible text found. Please upload a clearer image.');
        } else {
          setInputText(data.text);
          triggerToast('Text extracted successfully!');
          setActivePage('home'); // Automatically switch to Home
          
          // Trigger immediate translation of extracted text
          setTimeout(() => {
            handleTranslate();
          }, 100);
        }
      } else {
        throw new Error(data.error || 'Failed to scan image.');
      }
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Scan failed. Ensure file is clear and try again.');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="app">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">A</div>
          <span>Nova Translate</span>
        </div>
        <nav className="nav">
          <button 
            className={activePage === 'home' ? 'active' : ''} 
            onClick={() => setActivePage('home')}
          >
            <span className="icon">⌂</span>Home
          </button>
          <button 
            className={activePage === 'history' ? 'active' : ''} 
            onClick={() => setActivePage('history')}
          >
            <span className="icon">◷</span>History
          </button>
          <button 
            className={activePage === 'camera' ? 'active' : ''} 
            onClick={() => setActivePage('camera')}
          >
            <span className="icon">▣</span>Camera
          </button>
          <button 
            className={activePage === 'settings' ? 'active' : ''} 
            onClick={() => setActivePage('settings')}
          >
            <span className="icon">⚙</span>Settings
          </button>
        </nav>
        <div className="sidebottom">AI Translation · v1.0 Full PWA</div>
      </aside>

      {/* Main Container */}
      <main className="main">
        <header className="topbar">
          <div className="mobilebrand">
            <div className="logo">A</div>
            Nova Translate
          </div>
          <div></div>
          <div className="top-actions">
            {isInstallable && (
              <button 
                className="iconbtn" 
                onClick={install} 
                title="Install PWA App" 
                style={{ width: 'auto', padding: '0 12px', fontSize: '13px', fontWeight: 'bold', gap: '5px' }}
              >
                📥 Install
              </button>
            )}
            {isIOS && !isInstalled && (
              <button 
                className="iconbtn" 
                onClick={() => setShowIOSGuide(true)} 
                title="Install iOS App" 
                style={{ width: 'auto', padding: '0 12px', fontSize: '13px', fontWeight: 'bold' }}
              >
                📱 Install
              </button>
            )}
            <button className="iconbtn" id="theme" onClick={toggleDarkMode}>
              {darkMode ? '☼' : '☾'}
            </button>
            <button className="iconbtn" id="help" onClick={() => triggerToast('Select your language, type or speak your text, and click Translate!')}>
              ?
            </button>
          </div>
        </header>

        <div className="content">
          {/* OFFLINE WARNING BANNER */}
          {!isOnline && (
            <div className="workspace" style={{ marginBottom: '18px', background: '#fffbeb', border: '1px solid #fef3c7', padding: '12px 18px', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div>
                <b style={{ color: '#92400e' }}>Offline Mode Active</b>
                <small style={{ display: 'block', color: '#b45309' }}>You can still view cached history and settings. Translating requires an active connection.</small>
              </div>
            </div>
          )}

          {/* PAGE 1: HOME */}
          {activePage === 'home' && (
            <section className="section active" id="home">
              <div className="hero">
                <div>
                  <div className="eyebrow">AI POWERED TRANSLATION</div>
                  <h1>Translate your world.</h1>
                  <p className="subtitle">Fast, simple and natural translation for text, voice and images.</p>
                </div>
                <span className="pill">100+ languages ready</span>
              </div>

              <div className="workspace">
                {/* Engine Selector Dropdown */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)' }}>AI Translation Engine:</span>
                  <select 
                    className="select" 
                    value={selectedModel} 
                    onChange={(e) => setSelectedModel(e.target.value)}
                    style={{ width: 'auto', padding: '8px 12px', fontSize: '13px', borderRadius: '10px' }}
                  >
                    <option>Gemini 3.5 Flash</option>
                    <option>Gemini 3.5 Pro</option>
                    <option>Gemini 3.1 Flash</option>
                    <option>Gemini 3.1 Pro</option>
                    <option>Gemini 2.0 Flash</option>
                    <option>Gemini 1.5 Flash</option>
                  </select>
                </div>

                {/* From / To Language Selectors */}
                <div className="langrow">
                  <select 
                    className="select" 
                    value={fromLang} 
                    onChange={(e) => setFromLang(e.target.value)}
                  >
                    <option>Urdu 🇵🇰</option>
                    <option>English 🇬🇧</option>
                    <option>Arabic 🇸🇦</option>
                    <option>Punjabi 🇵🇰</option>
                    <option>Hindi 🇮🇳</option>
                    <option>Japanese 🇯🇵</option>
                    <option>Chinese 🇨🇳</option>
                    <option>French 🇫🇷</option>
                    <option>German 🇩🇪</option>
                    <option>Spanish 🇪🇸</option>
                  </select>
                  
                  <button className="swap" id="swap" onClick={handleSwapLanguages}>⇄</button>
                  
                  <select 
                    className="select" 
                    value={toLang} 
                    onChange={(e) => setToLang(e.target.value)}
                  >
                    <option>English 🇬🇧</option>
                    <option>Urdu 🇵🇰</option>
                    <option>Arabic 🇸🇦</option>
                    <option>Punjabi 🇵🇰</option>
                    <option>Hindi 🇮🇳</option>
                    <option>Japanese 🇯🇵</option>
                    <option>Chinese 🇨🇳</option>
                    <option>French 🇫🇷</option>
                    <option>German 🇩🇪</option>
                    <option>Spanish 🇪🇸</option>
                  </select>
                </div>

                {/* Editor Grid */}
                <div className="editorgrid">
                  <div className="panel">
                    <div className="panelhead">
                      <span>Original {autoDetectEnabled && <small style={{ color: 'var(--primary2)', fontWeight: 'bold' }}>(Auto-detecting)</small>}</span>
                      <span id="count">{inputText.length} / 5000</span>
                    </div>
                    <div className="panelbody">
                      <textarea 
                        id="input" 
                        maxLength={5000} 
                        placeholder="Type or speak something…" 
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                      ></textarea>
                      <div className="tools">
                        <div className="toolgroup">
                          <button 
                            className={`mini ${isListening ? 'on' : ''}`} 
                            id="mic" 
                            onClick={handleToggleListening}
                            style={isListening ? { background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)' } : {}}
                          >
                            🎤 {isListening ? 'Listening…' : 'Speak'}
                          </button>
                          <button className="mini" id="clear" onClick={() => { setInputText(''); setOutputText('Your translation will appear here.'); }}>Clear</button>
                        </div>
                        <div className="muted">Auto-detect available</div>
                      </div>
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panelhead">
                      <span>Translation</span>
                      <span id="status">{isProcessing ? 'Processing…' : 'Ready'}</span>
                    </div>
                    <div className="panelbody">
                      <div className="output" id="output">
                        {outputText}
                      </div>
                      <div className="tools">
                        <div className="toolgroup">
                          <button 
                            className="mini" 
                            id="listen" 
                            onClick={handleSpeakTranslation}
                            style={isSpeaking ? { background: 'var(--accent)', color: '#fff' } : {}}
                          >
                            🔊 {isSpeaking ? 'Stop' : 'Listen'}
                          </button>
                          <button className="mini" id="copy" onClick={handleCopyToClipboard}>📋 Copy</button>
                          <button className="mini" id="share" onClick={handleShareTranslation}>↗ Share</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Trigger Row */}
                <div className="translatebar">
                  <button 
                    className="primary" 
                    id="translate" 
                    onClick={handleTranslate}
                    disabled={isProcessing}
                    style={isProcessing ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                  >
                    ✈ {isProcessing ? 'Translating...' : 'Translate'}
                  </button>
                </div>
              </div>

              {/* Quick Prompt Pills */}
              <div className="quick">
                <button onClick={() => handleQuickPrompt('السلام علیکم، آپ کیسے ہیں؟', 'Urdu 🇵🇰', 'English 🇬🇧')}>Urdu → English</button>
                <button onClick={() => handleQuickPrompt('How are you today?', 'English 🇬🇧', 'Urdu 🇵🇰')}>English → Urdu</button>
                <button onClick={() => handleQuickPrompt('السلام عليكم، كيف حالك؟', 'Arabic 🇸🇦', 'English 🇬🇧')}>Arabic → English</button>
              </div>

              {/* Feature Showcase Cards */}
              <div className="cards">
                <div className="card" onClick={handleToggleListening} style={{ cursor: 'pointer' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎤</div>
                  <h3>Voice Translation</h3>
                  <p>Speak naturally and prepare voice input for instant translation.</p>
                </div>
                <div className="card" onClick={() => setActivePage('camera')} style={{ cursor: 'pointer' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>📷</div>
                  <h3>Camera & Image</h3>
                  <p>Scan text from images. Backend integration will power OCR.</p>
                </div>
                <div className="card" onClick={() => triggerToast('Conversation Mode coming in the next version!')} style={{ cursor: 'pointer' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>💬</div>
                  <h3>Conversation Mode</h3>
                  <p>Two-language conversations can be added in the next version.</p>
                </div>
              </div>
            </section>
          )}

          {/* PAGE 2: HISTORY */}
          {activePage === 'history' && (
            <section className="section active" id="history">
              <div className="hero">
                <div>
                  <div className="eyebrow">YOUR TRANSLATIONS</div>
                  <h1>History</h1>
                  <p className="subtitle">Recent translations saved locally in this prototype.</p>
                </div>
                {history.length > 0 && (
                  <button className="primary" id="clearHistory" onClick={clearAllHistory}>Clear all</button>
                )}
              </div>
              <div id="historyList">
                {history.length === 0 ? (
                  <div className="workspace" style={{ textAlign: 'center', color: 'var(--muted)', padding: '50px' }}>
                    No translations yet.
                  </div>
                ) : (
                  history.map((x) => (
                    <div className="historyitem" key={x.id}>
                      <div>
                        <div className="route">{x.from} → {x.to} · {x.time}</div>
                        <div className="htxt">{x.input}</div>
                        <div className="muted">{x.output}</div>
                      </div>
                      <button className="mini" onClick={() => removeHistoryItem(x.id)}>Delete</button>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* PAGE 3: CAMERA */}
          {activePage === 'camera' && (
            <section className="section active" id="camera">
              <div className="hero">
                <div>
                  <div className="eyebrow">VISUAL TRANSLATION</div>
                  <h1>Camera & Image</h1>
                  <p className="subtitle">Upload an image to extract text and translate with Vision OCR.</p>
                </div>
              </div>
              
              <div className="workspace" style={{ textAlign: 'center', padding: '45px 20px' }}>
                {imagePreview ? (
                  <div style={{ marginBottom: '24px' }}>
                    <img 
                      src={imagePreview} 
                      alt="Uploaded Scan" 
                      style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '16px', margin: '0 auto', border: '2px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
                    />
                    <div style={{ marginTop: '12px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                      <button className="mini" onClick={triggerFileSelect}>Choose Different Image</button>
                      <button className="mini" onClick={() => { setImagePreview(null); setImageFile(null); }} style={{ color: 'var(--danger)' }}>Clear</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ cursor: 'pointer', padding: '30px', border: '2px dashed var(--border)', borderRadius: '16px', marginBottom: '24px' }} onClick={triggerFileSelect}>
                    <div style={{ fontSize: '55px' }}>📷</div>
                    <h2>Scan text from an image</h2>
                    <p className="subtitle">Click to select an image from camera or photo library.</p>
                  </div>
                )}

                <input 
                  type="file" 
                  id="image" 
                  accept="image/*" 
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleImageSelect}
                />

                <div style={{ marginTop: '20px' }}>
                  <button 
                    className="primary" 
                    onClick={handleStartScan}
                    disabled={isScanning || !imagePreview}
                    style={isScanning || !imagePreview ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                  >
                    ✈ {isScanning ? 'Extracting Text...' : 'Start Scan'}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* PAGE 4: SETTINGS */}
          {activePage === 'settings' && (
            <section className="section active" id="settings">
              <div className="hero">
                <div>
                  <div className="eyebrow">PREFERENCES</div>
                  <h1>Settings</h1>
                  <p className="subtitle">Control the Nova Translate experience.</p>
                </div>
              </div>
              <div className="settings">
                <div className="setting">
                  <div>
                    <b>Dark mode</b>
                    <small>Switch between light and dark appearance.</small>
                  </div>
                  <button 
                    className={`switch ${darkMode ? 'on' : ''}`} 
                    id="darkSwitch"
                    onClick={toggleDarkMode}
                  >
                    <i></i>
                  </button>
                </div>

                <div className="setting">
                  <div>
                    <b>Auto-detect language</b>
                    <small>Detect the source language automatically.</small>
                  </div>
                  <button 
                    className={`switch ${autoDetectEnabled ? 'on' : ''}`}
                    onClick={() => {
                      setAutoDetectEnabled(!autoDetectEnabled);
                      triggerToast(autoDetectEnabled ? 'Auto-detect disabled' : 'Auto-detect enabled');
                    }}
                  >
                    <i></i>
                  </button>
                </div>

                <div className="setting">
                  <div>
                    <b>Voice output</b>
                    <small>Read translated text aloud automatically.</small>
                  </div>
                  <button 
                    className={`switch ${voiceOutputEnabled ? 'on' : ''}`}
                    onClick={() => {
                      setVoiceOutputEnabled(!voiceOutputEnabled);
                      triggerToast(voiceOutputEnabled ? 'Voice output disabled' : 'Voice output enabled');
                    }}
                  >
                    <i></i>
                  </button>
                </div>

                <div className="setting">
                  <div>
                    <b>Text size</b>
                    <small>Medium · adjustable in the full app.</small>
                  </div>
                  <span className="pill">Medium</span>
                </div>

                <div className="setting">
                  <div>
                    <b>PWA App Status</b>
                    <small>{isInstalled ? 'Installed on home screen' : 'Available for offline installation'}</small>
                  </div>
                  {isInstalled ? (
                    <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '13px' }}>✓ Standalone Active</span>
                  ) : (
                    <button 
                      className="primary" 
                      onClick={isIOS ? () => setShowIOSGuide(true) : install} 
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      Install App
                    </button>
                  )}
                </div>

                <div className="setting">
                  <div>
                    <b>Gemini API Key Connection</b>
                    <small>Auto-configured and secured by Google AI Studio.</small>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }}></div>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent)' }}>Active (Secured)</span>
                  </div>
                </div>

                <div className="setting">
                  <div>
                    <b>Privacy</b>
                    <small>Your translations are processed securely and not stored on any servers.</small>
                  </div>
                  <span>›</span>
                </div>

                <div className="setting">
                  <div>
                    <b>About Nova Translate</b>
                    <small>AI Translator · v1.0 Production PWA</small>
                  </div>
                  <span>›</span>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Dynamic Toast Element */}
      <div className={`toast ${showToast ? 'show' : ''}`} id="toast">
        {toastMessage}
      </div>

      {/* iOS Installation Guide Modal */}
      {showIOSGuide && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: '20px' }}>
          <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '16px', maxWidth: '380px', width: '100%', border: '1px solid var(--border)', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold' }}>Install on iPhone / iPad</h3>
            <p style={{ margin: '0 0 18px 0', fontSize: '14px', lineHeight: '1.5', color: 'var(--muted)' }}>
              1. Tap the <strong>Share</strong> button (box with an up-arrow) in Safari's lower toolbar.<br /><br />
              2. Scroll down the menu and choose <strong>Add to Home Screen</strong>.
            </p>
            <button 
              className="primary" 
              onClick={() => setShowIOSGuide(false)} 
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Close Guide
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
