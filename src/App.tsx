import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { 
  Monitor, HardDrive, FileUp, Play, Square, 
  Trash2, Settings, Info, Power, Download, Upload, 
  ChevronRight, Cpu, Activity, Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { loadDrive, saveDrive, deleteDrive, hasDrive, exportDrive, importDrive } from './lib/storage.ts';

// Add v86 type definitions for window
declare global {
  interface Window {
    V86Starter: any;
  }
}

type BootMode = 'none' | 'drive' | 'iso';

export default function App() {
  const [bootMode, setBootMode] = useState<BootMode>('none');
  const [memoryMb, setMemoryMb] = useState(1024);
  const [diskSizeGb, setDiskSizeGb] = useState(4);
  const [isRunning, setIsRunning] = useState(false);
  const [isDriveAvailable, setIsDriveAvailable] = useState(false);
  const [status, setStatus] = useState<string>('クラウド・エミュレータ準備完了');
  const [consoleOutput, setConsoleOutput] = useState<{msg: string, type: 'info' | 'error' | 'success'}[]>([]);
  const [powerOnProgress, setPowerOnProgress] = useState(0);
  
  const [isEngineReady, setIsEngineReady] = useState(false);
  
  const screenRef = useRef<HTMLDivElement>(null);
  const emulatorRef = useRef<any>(null);
  const isoFileRef = useRef<File | null>(null);

  useEffect(() => {
    checkDrive();
    
    // Check if v86 is already loaded from index.html
    const checkEngine = setInterval(() => {
      if (window.V86Starter) {
        setIsEngineReady(true);
        log('エミュレータ・エンジンが正常に配置されました。', 'success');
        clearInterval(checkEngine);
      }
    }, 100);
    
    return () => clearInterval(checkEngine);
  }, []);

  const checkDrive = async () => {
    const available = await hasDrive();
    setIsDriveAvailable(available);
  };

  const log = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setConsoleOutput(prev => [...prev.slice(-15), { msg, type }]);
    setStatus(msg);
  };

  const handleExport = async () => {
    try {
      log('ディスクイメージを書き出し中...', 'info');
      await exportDrive();
      log('書き出しが完了しました。', 'success');
    } catch (e) {
      log('書き出しに失敗しました。', 'error');
    }
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      log(`${file.name} を読み込み中...`, 'info');
      await importDrive(file);
      checkDrive();
      log('ディスクの読み込みが完了しました。', 'success');
    }
  };

  const startEmulator = async (mode: BootMode) => {
    if (!window.V86Starter) {
      log('エラー: エンジンが読み込まれていません。', 'error');
      return;
    }

    log(`システム構成中: RAM ${memoryMb}MB | HDD ${diskSizeGb}GB`, 'info');
    setIsRunning(true);
    setPowerOnProgress(0);

    let hda: ArrayBuffer | undefined;
    let cdrom: { file: File } | undefined;

    try {
      if (mode === 'drive') {
        const driveData = await loadDrive();
        if (!driveData) throw new Error('保存されたデータが見つかりません。');
        hda = driveData;
        log('保存済みの仮想ディスクを接続しました。', 'success');
      } else if (mode === 'iso') {
        if (!isoFileRef.current) throw new Error('ISO/IMGファイルが選択されていません。');
        cdrom = { file: isoFileRef.current };
        log(`インストールメディア接続: ${isoFileRef.current.name}`, 'info');
        
        const existingDrive = await loadDrive();
        if (existingDrive) {
          hda = existingDrive;
          log('既存のディスクを使用します。', 'info');
        } else {
          log(`空のハードディスクを作成中 (${diskSizeGb}GB)...`, 'info');
          // Important: Limit check for browser memory
          if (diskSizeGb > 4) {
            log('注意: 4GB以上のディスクはブラウザによっては失敗する可能性があります。', 'error');
          }
          hda = new ArrayBuffer(diskSizeGb * 1024 * 1024 * 1024);
        }
      }

      setPowerOnProgress(30);
      log('仮想BIOSを起動中...', 'info');

      emulatorRef.current = new window.V86Starter({
        wasm_path: 'https://cdn.jsdelivr.net/npm/v86@latest/build/v86.wasm',
        memory_size: memoryMb * 1024 * 1024,
        vga_memory_size: 16 * 1024 * 1024,
        screen_container: screenRef.current,
        bios: { url: 'https://cdn.jsdelivr.net/npm/v86@latest/bios/seabios.bin' },
        vga_bios: { url: 'https://cdn.jsdelivr.net/npm/v86@latest/bios/vgabios.bin' },
        cdrom: cdrom,
        hda: hda ? { buffer: hda } : undefined,
        autostart: true,
      });

      setPowerOnProgress(100);
      log('電源 ON。システムが稼働しています。', 'success');
      log('※ Windows等の大容量OSは画面表示まで10分以上かかる場合があります。', 'info');
    } catch (err: any) {
      log(`起動に失敗しました: ${err.message}`, 'error');
      setIsRunning(false);
    }
  };

  const stopEmulator = async () => {
    if (!emulatorRef.current) return;

    log('ディスクの同期と保存を開始します...', 'info');
    try {
      const hdaBuffer = emulatorRef.current.disk_images.hda?.buffer;
      if (hdaBuffer) {
        await saveDrive(hdaBuffer);
        log('データはブラウザの内部ストレージに保存されました。', 'success');
      }
    } catch (e) {
      log('セーブデータの保存に失敗しました。', 'error');
    }

    emulatorRef.current.stop();
    emulatorRef.current = null;
    setIsRunning(false);
    setBootMode('none');
    checkDrive();
    setPowerOnProgress(0);
  };

  const handleIsoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      isoFileRef.current = file;
      log(`準備完了: ${file.name}`, 'info');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#E2E8F0] font-sans selection:bg-blue-500/30 overflow-x-hidden">
      {/* --- Dashboard Header --- */}
      <header className="border-b border-white/5 bg-[#0D0D10]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full animate-pulse" />
              <div className="bg-gradient-to-br from-blue-600 to-blue-400 p-2.5 rounded-xl border border-white/10 relative z-10 shadow-2xl">
                <Monitor className="w-6 h-6 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                WebPC Virtualization Hub
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] bg-white/5 text-slate-400 px-2 py-0.5 rounded border border-white/5 font-mono tracking-tighter">BUILD 2026.04.19</span>
                <span className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.2em]">Live Client</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8 text-[11px] font-bold uppercase tracking-widest text-slate-500">
            <div className="flex items-center gap-3">
              <Cpu className={`w-3.5 h-3.5 ${isEngineReady ? 'text-blue-400' : 'text-amber-500 animate-spin'}`} />
              <span className={isEngineReady ? 'text-white' : 'text-amber-500 italic font-black'}>
                {isEngineReady ? 'Engine Ready' : 'Core Booting...'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Activity className={`w-3.5 h-3.5 ${isRunning ? 'text-green-500 animate-pulse' : 'text-slate-700'}`} />
              <span className={isRunning ? 'text-white' : ''}>{isRunning ? 'System Active' : 'Idle'}</span>
            </div>
            <div className="flex items-center gap-3">
              <Database className={`w-3.5 h-3.5 ${isDriveAvailable ? 'text-blue-500' : 'text-slate-700'}`} />
              <span className={isDriveAvailable ? 'text-white' : ''}>{isDriveAvailable ? 'Drive Mounted' : 'No Media'}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 md:p-10 grid grid-cols-1 xl:grid-cols-12 gap-10">
        {/* --- Sidebar: Controls --- */}
        <div className="xl:col-span-4 flex flex-col gap-8">
          
          {/* Hardware Configuration Card */}
          <section className="bg-[#111114] border border-white/5 rounded-[2.5rem] p-8 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
              <Settings className="w-32 h-32" />
            </div>
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]" />
              Machine Hardware
            </h2>
            
            <div className="space-y-10">
              <div className="space-y-5">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Main Memory</span>
                    <p className="text-2xl font-black text-white font-mono">{memoryMb}<span className="text-sm text-slate-500 ml-1">MB</span></p>
                  </div>
                  <Cpu className="w-5 h-5 text-blue-500/50" />
                </div>
                <input 
                  type="range" min="256" max="2560" step="128"
                  value={memoryMb} onChange={e => setMemoryMb(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all shadow-inner"
                />
              </div>

              <div className="space-y-5">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target Disk Size</span>
                    <p className="text-2xl font-black text-white font-mono">{diskSizeGb}<span className="text-sm text-slate-500 ml-1">GB</span></p>
                  </div>
                  <HardDrive className="w-5 h-5 text-blue-500/50" />
                </div>
                <input 
                  type="range" min="1" max="32" step="1"
                  value={diskSizeGb} onChange={e => setDiskSizeGb(Number(e.target.value))}
                  disabled={isRunning || isDriveAvailable}
                  className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all shadow-inner"
                />
                <div className="flex gap-2 p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                  <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <p className="text-[10px] text-slate-500 font-bold leading-relaxed italic">
                    データを保存した後はサイズ変更できません。新規作成時のみ有効。
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Operation Panel */}
          <section className="bg-[#111114] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl">
            {!isRunning ? (
              <div className="space-y-8">
                <div className="grid grid-cols-1 gap-4">
                  <button
                    onClick={() => setBootMode('drive')}
                    disabled={!isDriveAvailable || !isEngineReady}
                    className={`group relative overflow-hidden flex items-center justify-between w-full p-6 rounded-3xl border-2 transition-all duration-300 ${
                      bootMode === 'drive' 
                        ? 'border-blue-500 bg-blue-500/10 text-white shadow-[0_0_40px_rgba(59,130,246,0.15)]' 
                        : (isDriveAvailable && isEngineReady) 
                          ? 'border-white/5 bg-white/[0.02] hover:border-white/20 text-slate-400 hover:text-white' 
                          : 'border-white/5 bg-white/5 opacity-30 cursor-not-allowed grayscale'
                    }`}
                  >
                    <div className="flex items-center gap-5 relative z-10">
                      <div className={`p-3 rounded-2xl ${bootMode === 'drive' ? 'bg-blue-500 text-white' : 'bg-white/5 text-slate-500 group-hover:text-white'}`}>
                        <Play className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-black uppercase tracking-widest">Normal Boot</p>
                        <p className="text-[10px] font-bold opacity-60 mt-1">保存データから起動</p>
                      </div>
                    </div>
                    <ChevronRight className={`w-5 h-5 transition-transform ${bootMode === 'drive' ? 'translate-x-0' : '-translate-x-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0'}`} />
                  </button>
                  
                  <button
                    onClick={() => setBootMode('iso')}
                    disabled={!isEngineReady}
                    className={`group relative overflow-hidden flex items-center justify-between w-full p-6 rounded-3xl border-2 transition-all duration-300 ${
                      bootMode === 'iso' 
                        ? 'border-emerald-500 bg-emerald-500/10 text-white shadow-[0_0_40px_rgba(16,185,129,0.15)]' 
                        : isEngineReady
                          ? 'border-white/5 bg-white/[0.02] hover:border-white/20 text-slate-400 hover:text-white'
                          : 'border-white/5 bg-white/5 opacity-30 cursor-not-allowed grayscale'
                    }`}
                  >
                    <div className="flex items-center gap-5 relative z-10">
                      <div className={`p-3 rounded-2xl ${bootMode === 'iso' ? 'bg-emerald-500 text-white' : 'bg-white/5 text-slate-500 group-hover:text-white'}`}>
                        <FileUp className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-black uppercase tracking-widest">ISO Setup</p>
                        <p className="text-[10px] font-bold opacity-60 mt-1">メディアを選択して起動</p>
                      </div>
                    </div>
                    <ChevronRight className={`w-5 h-5 transition-transform ${bootMode === 'iso' ? 'translate-x-0' : '-translate-x-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-0'}`} />
                  </button>
                </div>

                <AnimatePresence>
                  {bootMode === 'iso' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }} 
                      animate={{ opacity: 1, height: 'auto' }} 
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl space-y-4">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Select Virtual Media</span>
                        <input 
                          type="file" 
                          accept=".iso,.img" 
                          onChange={handleIsoSelect} 
                          className="text-[10px] w-full file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:bg-white/10 file:text-white hover:file:bg-white/20 cursor-pointer transition-colors"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={() => startEmulator(bootMode)}
                  disabled={bootMode === 'none' || (bootMode === 'iso' && !isoFileRef.current)}
                  className="w-full relative group h-20 flex items-center justify-center gap-4 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-[2rem] text-white font-black overflow-hidden transition-all shadow-2xl shadow-blue-500/20 active:scale-[0.98] disabled:opacity-30 disabled:grayscale"
                >
                  <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Power className="w-6 h-6 drop-shadow-lg" />
                  <span className="text-lg tracking-tight uppercase tracking-[0.1em]">Switch Power On</span>
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                <button
                  onClick={stopEmulator}
                  className="w-full h-20 flex items-center justify-center gap-4 bg-rose-500/10 border-2 border-rose-500/20 rounded-[2rem] text-rose-500 font-black text-lg transition-all hover:bg-rose-500 hover:text-white shadow-lg active:scale-[0.98]"
                >
                  <Square className="w-6 h-6 fill-current" />
                  <span className="uppercase tracking-widest">Safe Shutdown</span>
                </button>
                
                <div className="p-8 bg-blue-500/5 rounded-[2rem] border border-blue-500/20 space-y-6">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">System Telemetry</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                      <span>Boot Sequence</span>
                      <span>{powerOnProgress}%</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${powerOnProgress}%` }}
                        className="h-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Storage Tools */}
          <section className="bg-[#111114] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
              <Database className="w-4 h-4 text-blue-500" /> Storage Toolbox
            </h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                onClick={handleExport}
                disabled={!isDriveAvailable || isRunning}
                className="flex flex-col items-center gap-3 p-5 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/5 transition-all text-slate-400 hover:text-white disabled:opacity-20"
              >
                <Download className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Export IMG</span>
              </button>
              <label className={`flex flex-col items-center gap-3 p-5 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/5 transition-all text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer ${isRunning ? 'pointer-events-none opacity-20' : ''}`}>
                <Upload className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Import IMG</span>
                <input type="file" accept=".img" className="hidden" onChange={handleImport} />
              </label>
            </div>
            <button
              onClick={async () => {
                if(confirm('警告: 全てのデータを消去しますか？')) {
                  await deleteDrive();
                  checkDrive();
                  log('データを初期化しました。', 'info');
                }
              }}
              disabled={!isDriveAvailable || isRunning}
              className="w-full text-[10px] font-black py-4 border border-rose-500/20 text-rose-500/50 hover:text-rose-500 hover:bg-rose-500/5 transition-all rounded-2xl tracking-widest uppercase disabled:opacity-10"
            >
              Clear Local Cache
            </button>
          </section>
        </div>

        {/* --- Main Section: Emulator Screen --- */}
        <div className="xl:col-span-8 flex flex-col gap-10">
          
          <div className="relative group">
            {/* Visual Flare */}
            <div className="absolute -inset-2 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 rounded-[3.5rem] blur-2xl opacity-50 group-hover:opacity-80 transition-opacity" />
            
            <div className="relative bg-[#0D0D10] border-[16px] border-[#18181B] rounded-[3.5rem] overflow-hidden shadow-2xl flex flex-col aspect-[4/3] ring-1 ring-white/10">
              {/* Screen Top Bar */}
              <div className="h-10 bg-[#18181B] flex items-center justify-between px-10 border-b border-white/5">
                <div className="flex gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500/30" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/30" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/30" />
                </div>
                <div className="flex items-center gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-slate-700'}`} />
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em]">Integrated CRT Monitor</span>
                </div>
              </div>

              {/* Real Screen Content */}
              <div className="flex-1 bg-black relative flex items-center justify-center p-2">
                <div 
                  ref={screenRef} 
                  className="w-full h-full bg-black flex items-center justify-center shadow-inner"
                />
                
                <AnimatePresence>
                  {!isRunning && (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md"
                    >
                      <div className="w-20 h-20 rounded-full border-4 border-blue-500/20 flex items-center justify-center mb-6">
                        <Power className="w-10 h-10 text-blue-500/40" />
                      </div>
                      <h3 className="text-2xl font-black mb-1">Standby Mode</h3>
                      <p className="text-[10px] text-slate-500 uppercase tracking-[0.5em] font-bold">Waiting for input...</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* CRT Effects */}
                <div className="absolute inset-0 pointer-events-none z-30 mix-blend-overlay opacity-30 scanlines" />
                <div className="absolute inset-0 pointer-events-none z-30 vignette" />
              </div>
            </div>
          </div>

          {/* Activity Logs (Technical Feed) */}
          <div className="bg-[#111114] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl relative">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-6 flex items-center justify-between">
              <span className="flex items-center gap-3">
                <Activity className="w-4 h-4 text-blue-500/50" />
                Hardware Event Feed
              </span>
              <span className="text-[9px] font-mono opacity-30">T: {new Date().toLocaleTimeString()}</span>
            </h2>
            
            <div className="h-56 overflow-y-auto font-mono scroll-smooth technical-scroll">
              <div className="space-y-2 border-l border-white/5 pl-6 ml-1.5">
                {consoleOutput.length === 0 && (
                   <div className="py-10 text-center opacity-20 italic text-xs">No active processes monitored.</div>
                )}
                {consoleOutput.map((item, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}
                    key={i} 
                    className="group flex gap-6 text-[11px] leading-relaxed"
                  >
                    <span className="opacity-10 font-bold group-hover:opacity-40 transition-opacity">{(i+1).toString().padStart(3, '0')}</span>
                    <span className={`flex-1 font-bold ${
                      item.type === 'error' ? 'text-rose-500' : 
                      item.type === 'success' ? 'text-emerald-400' : 
                      'text-slate-400'
                    }`}>
                      <span className="opacity-30 mr-2">▶</span>
                      {item.msg}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-20 border-t border-white/5 py-24 bg-[#0D0D10]">
        <div className="max-w-[1600px] mx-auto px-10 grid grid-cols-1 md:grid-cols-4 gap-20">
          <div className="md:col-span-2 space-y-6">
            <div className="flex items-center gap-3 text-blue-500">
               <Monitor className="w-5 h-5" />
               <span className="font-black text-lg">WebPC Emulator</span>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed max-w-sm">
              ブラウザだけで動作する、完全クライアントサイド型 PCエミュレータ。
              データをGitHub等のクラウドで公開して持ち運べるように設計されています。
            </p>
          </div>
          <div className="space-y-6">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Technical Spec</h4>
            <ul className="text-sm text-slate-500 space-y-3 font-bold">
              <li>Engine: v86 (x86 JIT Emulator)</li>
              <li>Graphics: Standard VGA / VBE</li>
              <li>Network: Wasm-Relay Bridge</li>
            </ul>
          </div>
          <div className="space-y-6">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Browser Compatibility</h4>
            <ul className="text-sm text-slate-500 space-y-3 font-bold">
              <li>Persistence: IndexedDB v2</li>
              <li>API: File Blob / URL</li>
              <li>Speed: WebAssembly Accelerated</li>
            </ul>
          </div>
        </div>
        <div className="max-w-[1600px] mx-auto px-10 mt-20 pt-10 border-t border-white/5 flex justify-between items-center text-[10px] uppercase font-black text-slate-700 tracking-[0.5em]">
          <span>© 2026 CLOUD VIRTUAL LAB</span>
          <div className="flex gap-10">
            <a href="#" className="hover:text-blue-500 transition-colors">Documentation</a>
            <a href="#" className="hover:text-blue-500 transition-colors">GitHub</a>
          </div>
        </div>
      </footer>

      <style>{`
        .technical-scroll::-webkit-scrollbar { width: 4px; }
        .technical-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .technical-scroll::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.3); }

        .scanlines {
          background: linear-gradient(
            rgba(18, 16, 16, 0) 50%,
            rgba(0, 0, 0, 0.1) 50%
          ), linear-gradient(
            90deg,
            rgba(255, 0, 0, 0.03),
            rgba(0, 255, 0, 0.01),
            rgba(0, 0, 255, 0.03)
          );
          background-size: 100% 4px, 4px 100%;
        }
        
        .vignette {
          background: radial-gradient(circle, transparent 70%, rgba(0,0,0,0.5) 100%);
        }

        canvas {
          image-rendering: pixelated;
          max-width: 100%;
          max-height: 100%;
          border-radius: 8px;
          box-shadow: 0 0 50px rgba(0,0,0,0.8);
        }

        input[type="range"]::-webkit-slider-thumb {
          width: 18px;
          height: 18px;
          background: #3B82F6;
          border: 3px solid #111114;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
        }
      `}</style>
    </div>
  );
}
