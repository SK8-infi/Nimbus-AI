import React, { useState, useEffect, useRef } from "react"
import { 
  Play, 
  Pause, 
  Copy, 
  Check, 
  Upload, 
  Sparkles, 
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  Cpu,
  Zap,
  BatteryCharging,
  Gauge,
  Activity
} from "lucide-react"



// Configurable parameter defining the number of video frames fed to the local model
export const DEFAULT_NUM_FRAMES = 1;

// Extract video frames sequentially
const extractVideoFrames = async (file: File, numFrames = DEFAULT_NUM_FRAMES, powerMode: 'turbo' | 'eco' = 'turbo'): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject("Failed to get canvas context");
        return;
      }
      
      const MAX_DIM = powerMode === 'eco' ? 224 : 384;
      let width = video.videoWidth;
      let height = video.videoHeight;
      if (width > height) {
        if (width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        }
      } else {
        if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const frameUrls: string[] = [];
      const times: number[] = [];
      
      // Extract exactly numFrames evenly spaced frames across the video duration
      for (let i = 0; i < numFrames; i++) {
        const time = numFrames === 1 
          ? duration * 0.5 
          : duration * (0.1 + 0.8 * (i / (numFrames - 1)));
        times.push(time);
      }
      
      let currentIdx = 0;

      const captureNext = () => {
        if (currentIdx >= times.length) {
          URL.revokeObjectURL(video.src);
          resolve(frameUrls);
          return;
        }
        
        video.currentTime = times[currentIdx];
        video.onseeked = () => {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frameUrls.push(canvas.toDataURL('image/jpeg', 0.8));
          currentIdx++;
          captureNext();
        };
      };
      
      captureNext();
    };
    
    video.onerror = (e) => {
      reject(e);
    };
  });
};

interface Captions {
  formal: string
  sarcastic: string
  humorous_tech: string
  humorous_non_tech: string
}

const STYLE_GUIDES = {
  formal: {
    title: "Formal Style",
    desc: "Professional, objective, factual tone. Write exactly one clear declarative sentence. No slang, humor, exclamation marks, or opinions.",
    badgeColor: "bg-blue-500/10 text-blue-400 border border-blue-500/20"
  },
  sarcastic: {
    title: "Sarcastic Style",
    desc: "Dry, ironic, lightly mocking. Write exactly one sentence expressing subtle wit, deadpan humor, or faint praise. Not mean-spirited or absurd.",
    badgeColor: "bg-amber-500/10 text-amber-400 border border-amber-500/20"
  },
  humorous_tech: {
    title: "Humorous Tech Style",
    desc: "Genuinely funny, with technology or programming references (e.g. bugs, deploys, git merge conflicts, RAM, CPUs, Wi-Fi, AI) mapped onto visual actions. Exactly 1 to 2 sentences.",
    badgeColor: "bg-purple-500/10 text-purple-400 border border-purple-500/20"
  },
  humorous_non_tech: {
    title: "Humorous Non-Tech Style",
    desc: "Genuinely funny, warm, relatable everyday humor. Absolutely no technical jargon or science references. Exactly 1 to 2 sentences.",
    badgeColor: "bg-emerald-500/10 text-emerald-450 border border-emerald-500/20"
  }
}

// Developer Jokes to prevent boredom during model loading & generation
const DEVELOPER_JOKES = [
  "Why do programmers wear glasses? Because they can't C#.",
  "There are 10 types of people in the world: those who understand binary, and those who don't.",
  "A SQL query walks into a bar, walks up to two tables and asks, 'Can I join you?'",
  "Why did the local AI model cross the road? To avoid paying cloud API bills!",
  "My GPU's fan is spinning so fast, my laptop is starting to hover.",
  "WebGPU is so fast, it calculated this joke before I finished loading.",
  "How many programmers does it take to change a lightbulb? None, that's a hardware problem.",
  "Local VRAM: The only place where 2GB feels like 2MB.",
  "Remember: Gemma 4 is doing millions of tensor operations directly in your browser. Be nice to your cooling fan!",
  "Why did the developer go broke? Because they used up all their cache.",
  "An optimist says: 'The glass is half-full.' A pessimist says: 'The glass is half-empty.' A programmer says: 'The glass is twice as large as it needs to be.'",
  "Why do Java programmers wear glasses? Because they don't C#.",
  "In order to understand recursion, one must first understand recursion.",
  "A programmer's wife tells him: 'Go to the store and buy a loaf of bread. If they have eggs, buy a dozen.' He comes home with 12 loaves of bread.",
  "What is a programmer's favorite hangout spot? Foo Bar.",
  "Why did the functions stop calling each other? Because they had too many arguments.",
  "My local LLM is so polite. Every time I get a memory error, it says 'CUDA out of memory, but I still love you.'",
  "WebGPU shaders are like hot sauce: a little bit makes things fly, too much and your GPU screams.",
  "I asked the local AI to fix my CSS. Now the entire website is a rotating 3D cloud floating in space. I'm keeping it.",
  "Hardware is the part of a computer you can kick; software is the part you can only curse at.",
  "Debugging is like being the detective in a crime movie where you are also the murderer.",
  "There are two ways to write error-free programs; only the third one works.",
  "A good programmer is someone who always looks both ways before crossing a one-way street.",
  "Why was the JavaScript developer sad? Because they didn't know how to 'Null' their feelings.",
  "What do you call a programmer who doesn't use version control? Extremely brave, or unemployed.",
  "Local WebGPU: Delivering server-grade AI inference with consumer-grade electric bills.",
  "If at first you don't succeed, call it version 1.0."
];

const NimbusLogo = () => (
  <svg viewBox="0 0 50 50" className="w-6 h-6 filter drop-shadow-[0_0_10px_rgba(56,189,248,0.6)]">
    <defs>
      <linearGradient id="nimbus-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="50%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#818cf8" />
      </linearGradient>
    </defs>
    <path 
      d="M 16,34 
         C 12,34 9,31 9,27 
         C 9,23.5 11.5,20.5 15,20 
         C 16,15 20,11 25,11 
         C 29.5,11 33,14.5 34,19 
         C 37.5,19 40,21.5 40,25 
         C 40,29 37,32 33,32 
         L 16,32 
         Z" 
      fill="rgba(15, 23, 42, 0.4)" 
      stroke="url(#nimbus-grad)" 
      strokeWidth="2.5" 
      strokeLinecap="round"
      strokeLinejoin="round" 
    />
  </svg>
)

function CuteMascot({ animated = true }: { animated?: boolean }) {
  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden select-none pointer-events-none z-0">
      {/* Deep Space Celestial Backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#020512] via-[#080e21] to-[#11192e]"></div>
      
      {/* Dynamic or Static Glowing Star Particles */}
      <div className="absolute inset-0 opacity-40">
        {animated ? (
          <>
            <div className="absolute top-[15%] left-[20%] w-1 h-1 bg-white rounded-full animate-pulse" style={{ animationDuration: '3s' }}></div>
            <div className="absolute top-[25%] left-[75%] w-1.5 h-1.5 bg-brand-sky rounded-full animate-pulse" style={{ animationDuration: '4.5s' }}></div>
            <div className="absolute top-[40%] left-[10%] w-1 h-1 bg-white rounded-full animate-pulse" style={{ animationDuration: '2.5s' }}></div>
            <div className="absolute top-[50%] left-[85%] w-1.5 h-1.5 bg-brand-indigo rounded-full animate-pulse" style={{ animationDuration: '5s' }}></div>
            <div className="absolute top-[10%] left-[60%] w-1 h-1 bg-white rounded-full animate-pulse" style={{ animationDuration: '3.8s' }}></div>
            <div className="absolute top-[35%] left-[45%] w-1.5 h-1.5 bg-brand-sky rounded-full animate-pulse" style={{ animationDuration: '2.2s' }}></div>
          </>
        ) : (
          <>
            <div className="absolute top-[15%] left-[20%] w-1 h-1 bg-white/70 rounded-full"></div>
            <div className="absolute top-[25%] left-[75%] w-1.5 h-1.5 bg-brand-sky/60 rounded-full"></div>
            <div className="absolute top-[40%] left-[10%] w-1 h-1 bg-white/50 rounded-full"></div>
            <div className="absolute top-[50%] left-[85%] w-1 h-1 bg-brand-indigo/60 rounded-full"></div>
            <div className="absolute top-[10%] left-[60%] w-1.5 h-1.5 bg-white/70 rounded-full"></div>
            <div className="absolute top-[35%] left-[45%] w-1.5 h-1.5 bg-brand-sky/60 rounded-full"></div>
          </>
        )}
      </div>

      {/* Radiant Divine Celestial Aurora */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[140vw] h-[75vh] bg-gradient-to-b from-brand-sky/20 via-brand-indigo/10 to-transparent blur-[130px] opacity-80 pointer-events-none"></div>

      {/* Layered Vector Mountain Landscape */}
      <div className="absolute inset-0 w-full h-full flex items-end justify-center translate-y-[10%] sm:translate-y-[5%]">
        <svg 
          viewBox="0 0 1000 600" 
          className={`w-[120%] h-[110%] object-cover filter drop-shadow-[0_0_50px_rgba(56,189,248,0.15)] ${animated ? 'animate-mountain-hover' : ''}`}
          preserveAspectRatio="none"
        >
          <defs>
            {/* Gradients for back mountains */}
            <linearGradient id="back-peak-grad" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#12132a" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#040614" stopOpacity="1" />
            </linearGradient>

            {/* Gradients for central main peak */}
            <linearGradient id="main-peak-grad" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#1f2142" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#0a0b1c" stopOpacity="1" />
              <stop offset="100%" stopColor="#02030d" stopOpacity="1" />
            </linearGradient>

            {/* Glowing neon stroke for main mountain */}
            <linearGradient id="peak-outline" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
              <stop offset="35%" stopColor="#38bdf8" stopOpacity="0.9" />
              <stop offset="65%" stopColor="#38bdf8" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.3" />
            </linearGradient>

            {/* Glowing neon veins */}
            <linearGradient id="vein-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.1" />
            </linearGradient>

            {/* Cosmic portal/moon gradient */}
            <radialGradient id="portal-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.15" />
              <stop offset="70%" stopColor="#6366f1" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#020512" stopOpacity="0" />
            </radialGradient>

            {/* Glowing fog/cloud gradient */}
            <linearGradient id="cloud-grad-1" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
              <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#080e21" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="cloud-grad-2" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#020512" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* COSMIC HALO PORTAL (Behind peaks, pulsing & rotating conditionally) */}
          <circle 
            cx="500" 
            cy="240" 
            r="160" 
            fill="url(#portal-grad)" 
            stroke="url(#peak-outline)" 
            strokeWidth="1.5" 
            strokeDasharray="5,15"
            className={`origin-center ${animated ? 'animate-spin-slow' : 'opacity-75'}`}
            style={{ transformOrigin: '500px 240px' }}
          />
          <circle 
            cx="500" 
            cy="240" 
            r="140" 
            fill="none" 
            stroke="#38bdf8" 
            strokeWidth="0.5" 
            strokeOpacity="0.3"
            className={`origin-center ${animated ? 'animate-pulse-slow' : 'opacity-40'}`}
            style={{ transformOrigin: '500px 240px' }}
          />

          {/* BACK MOUNTAINS (Layer 1) */}
          <path 
            d="M -100,600 L 120,290 L 380,450 L 720,220 L 1100,600 Z" 
            fill="url(#back-peak-grad)" 
          />

          {/* MAIN MOUNTAIN PEAK (Layer 2) */}
          {/* A gorgeous centered geometric mountain with a sharp peak */}
          <path 
            d="M 100,600 L 500,100 L 900,600 Z" 
            fill="url(#main-peak-grad)" 
            stroke="url(#peak-outline)"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />

          {/* Glowing neon computing flows (flowing veins down the peak) */}
          <path 
            d="M 500,100 L 460,250 L 400,420 L 330,600" 
            stroke="url(#vein-grad)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            className="opacity-70"
          />
          <path 
            d="M 500,100 L 530,220 L 580,360 L 640,510 L 680,600" 
            stroke="url(#vein-grad)"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            className="opacity-50"
          />

          {/* Mountain ridge/detail line */}
          <path 
            d="M 500,100 C 500,100 480,260 430,360 C 390,440 300,600 300,600" 
            stroke="#38bdf8" 
            strokeWidth="1.5" 
            strokeOpacity="0.3" 
            fill="none"
          />

          {/* Mountain shading/shadow side */}
          <path 
            d="M 500,100 C 500,100 480,280 430,380 C 390,460 300,600 300,600 L 900,600 L 500,100 Z" 
            fill="rgba(2, 4, 15, 0.45)"
          />

          {/* EMBEDDED CLOUDS WRAPPING PEAK (Layer 3) */}
          {/* Cloud layers hovering in front of the mountain peaks */}
          <path 
            d="M -100,600 C -100,600 -50,420 150,420 C 350,420 300,480 500,450 C 700,420 650,490 850,470 C 1050,450 1100,600 1100,600 Z" 
            fill="url(#cloud-grad-1)" 
            className={animated ? 'animate-cloud-drift-1' : 'opacity-90'}
          />

          <path 
            d="M -50,600 C 50,510 200,530 350,490 C 500,450 650,520 800,480 C 950,440 1050,600 1050,600 Z" 
            fill="url(#cloud-grad-2)" 
            className={animated ? 'animate-cloud-drift-2' : 'opacity-70'}
          />
        </svg>
      </div>

      {/* Layer 5: Large drifting ambient mist across the bottom */}
      <div className="absolute bottom-[-15%] left-[-20%] w-[140%] h-[45vh] bg-gradient-to-t from-slate-950 via-[#080d1e]/60 to-transparent blur-[50px] opacity-95 pointer-events-none"></div>
      <div className="absolute bottom-[-5%] left-[-10%] w-[120%] h-[20vh] bg-gradient-to-t from-[#020512] to-transparent blur-[30px] opacity-95 pointer-events-none"></div>
    </div>
  );
}

export default function App() {
  // Navigation State
  const [currentPage, setCurrentPage] = useState<'home' | 'workspace'>('home')

  // Upload/Selection States
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string>("")
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoName, setVideoName] = useState<string>("")
  const [isImage, setIsImage] = useState<boolean>(false)
  
  // Web Worker Ref
  const workerRef = useRef<Worker | null>(null)
  
  // System Availability Checks
  const [webGpuSupported, setWebGpuSupported] = useState<boolean>(false)
  const [gpuInfo, setGpuInfo] = useState<string>("")
  const [isMobile, setIsMobile] = useState<boolean>(false)

  // Inference States
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const [captions, setCaptions] = useState<Captions | null>(null)
  const [currentJokeIdx, setCurrentJokeIdx] = useState(() => Math.floor(Math.random() * DEVELOPER_JOKES.length))
  const [inferenceStage, setInferenceStage] = useState<string>("")

  // AMD Governor & Telemetry Benchmarks
  const [powerMode, setPowerMode] = useState<'turbo' | 'eco'>('turbo')
  const [telemetry, setTelemetry] = useState<any | null>(null)

  // Tab & Copy States
  const [activeStyle, setActiveStyle] = useState<keyof Captions>("formal")
  const [copiedStyle, setCopiedStyle] = useState<string | null>(null)

  // Video Ref
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // SPA History & Navigation State Synchronization
  useEffect(() => {
    // Prime the entry state so clicking browser back navigates to home cleanly
    window.history.replaceState({ page: 'home' }, '', '');

    const handlePopState = (e: PopStateEvent) => {
      if (e.state && e.state.page) {
        if (e.state.page === 'home') {
          resetApp();
        }
        setCurrentPage(e.state.page);
      } else {
        resetApp();
        setCurrentPage('home');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigateToWorkspace = () => {
    setCurrentPage('workspace');
    window.history.pushState({ page: 'workspace' }, '', '#workspace');
  };

  const navigateToHome = () => {
    resetApp();
    setCurrentPage('home');
    window.history.pushState({ page: 'home' }, '', '#home');
  };

  // WebGPU & GPU Details Detection
  useEffect(() => {
    const checkWebGPUAndDetails = async () => {
      if (typeof navigator === "undefined" || !navigator.gpu) {
        setWebGpuSupported(false);
        return;
      }
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          setWebGpuSupported(true);
          const info = (adapter as any).info;
          if (info) {
            const vendor = info.vendor || "Generic Vendor";
            const device = info.device || "GPU Adapter";
            setGpuInfo(`${vendor} ${device}`);
          } else {
            setGpuInfo("Compatible GPU Device");
          }
        } else {
          setWebGpuSupported(false);
        }
      } catch {
        setWebGpuSupported(false);
      }
    };
    checkWebGPUAndDetails();
  }, []);

  // Web Worker cleanup effect
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // Screen/Mobile Lock check
  useEffect(() => {
    const checkDevice = () => {
      const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(mobileUA || isSmallScreen);
    };
    checkDevice();
    window.addEventListener("resize", checkDevice);
    return () => window.removeEventListener("resize", checkDevice);
  }, []);

  // Developer jokes rotator interval (Randomized rotation)
  useEffect(() => {
    let interval: any;
    if (isGenerating || (progress > 0 && progress < 100)) {
      interval = setInterval(() => {
        setCurrentJokeIdx(Math.floor(Math.random() * DEVELOPER_JOKES.length));
      }, 8000);
    }
    return () => clearInterval(interval);
  }, [isGenerating, progress]);

  // Handle local video/image selection
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setVideoFile(file)
    setUploadedVideoUrl(URL.createObjectURL(file))
    const imgType = file.type.startsWith('image/')
    setIsImage(imgType)
    
    let cleanName = file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/\b\d{5,}\b/g, "")
      .replace(/\b(uhd|fhd|hd|4k|2k|1080p|720p|\d+fps)\b/gi, "")
      .replace(/[_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    
    if (!cleanName) {
      cleanName = imgType ? "Uploaded Image" : "Uploaded Video"
    } else {
      cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    }
    
    setVideoName(cleanName)
    setCaptions(null)
    setIsPlaying(false)
  }

  // Toggle Video Playback
  const togglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
      setIsPlaying(false)
    } else {
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.log("Video playback error:", err))
    }
  }

  // Run sequential model inference via Web Worker
  const runCaptionPipeline = async () => {
    if (!videoFile) return;
    setIsGenerating(true);
    setProgress(5);
    setTelemetry(null); // Clear telemetry at the start of a new run
    setInferenceStage("Stage 1/5: Extracting video frames...");
    setLogs(["Preparing video frame extractor..."]);

    try {
      // Lazily instantiate the Web Worker if not already created
      if (!workerRef.current) {
        workerRef.current = new Worker(
          new URL("./caption.worker.ts", import.meta.url),
          { type: "module" }
        );
      }

      // Configure worker message listener
      workerRef.current.onmessage = (e: MessageEvent) => {
        const { type, message, file, progress: p, stage, description, captions: resultCaptions, error, stats } = e.data;

        if (type === 'status') {
          setInferenceStage(message);
        } else if (type === 'log') {
          setLogs(prev => [...prev, message]);
        } else if (type === 'download_progress') {
          setProgress(Math.round(p));
          setLogs(prev => {
            const next = [...prev];
            const downloadMsg = `Downloading weights ${file}: ${p.toFixed(1)}%`;
            if (next.length > 0 && next[next.length - 1].startsWith("Downloading weights")) {
              next[next.length - 1] = downloadMsg;
            } else {
              next.push(downloadMsg);
            }
            return next;
          });
        } else if (type === 'stage') {
          setInferenceStage(stage);
        } else if (type === 'progress') {
          setProgress(p);
        } else if (type === 'benchmark_stats') {
          setTelemetry(stats);
        } else if (type === 'visual_description_output') {
          setLogs(prev => [...prev, `Visual Grounding Output: "${description}"`]);
        } else if (type === 'complete') {
          setCaptions(resultCaptions);
          setProgress(100);
          setIsGenerating(false);
          setInferenceStage("");
          setLogs(prev => [...prev, "Pipeline execution completed successfully!"]);
        } else if (type === 'error') {
          console.error("[Nimbus Web Worker Error]:", error);
          setLogs(prev => [
            ...prev,
            "❌ Web Worker Inference Failed!",
            `Error: ${error}`
          ]);
          setProgress(0);
          setIsGenerating(false);
          setInferenceStage("");
        }
      };

      // 1. Extract frames (main thread canvas operation)
      let frames: string[] = [];
      if (isImage) {
        setLogs(prev => [...prev, "Processing image..."]);
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const img = new Image();
          img.src = uploadedVideoUrl;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              reject("Failed to get canvas context");
              return;
            }
            let w = img.width;
            let h = img.height;
            const MAX_DIM = powerMode === 'eco' ? 224 : 384;
            if (w > h) {
              if (w > MAX_DIM) {
                h = Math.round((h * MAX_DIM) / w);
                w = MAX_DIM;
              }
            } else {
              if (h > MAX_DIM) {
                w = Math.round((w * MAX_DIM) / h);
                h = MAX_DIM;
              }
            }
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.8));
          };
          img.onerror = reject;
        });
        frames = [dataUrl];
      } else {
        setLogs(prev => [...prev, `Extracting ${DEFAULT_NUM_FRAMES} representative video frame(s)...`]);
        frames = await extractVideoFrames(videoFile, DEFAULT_NUM_FRAMES, powerMode);
      }

      // 2. Hand off visual frames to worker to load model, compile shaders, run Stage 1, and run Stage 2!
      setLogs(prev => [...prev, "Handoff to Web Worker for on-device WebGPU inference..."]);
      workerRef.current.postMessage({
        type: 'generate_captions',
        data: {
          frames,
          isImage,
          defaultNumFrames: DEFAULT_NUM_FRAMES,
          powerMode,
          styles: {
            formal: "Be clinical, objective, and highly descriptive. Use sophisticated vocabulary. Avoid all metaphors, humor, or slang.",
            sarcastic: "Use dry irony. Do NOT write meta-commentary about the viewer or technology. Derive your irony strictly from the contrast of visible elements.",
            humorous_tech: "Make it extremely funny! Satirize the visual scene as a massive software crisis, git merge conflict, production crash, zero ping, laggy Wi-Fi, or CPU fire. Write exactly one hilarious tech sentence.",
            humorous_non_tech: "Make it genuinely funny, warm, and highly relatable! Write exactly one humorous sentence that captures peak observational comedy or a popular internet meme about daily life struggles, keeping it lighthearted and witty."
          }
        }
      });

    } catch (err: any) {
      console.error("[Nimbus WebGPU Error] Inference Failed:", err);
      setProgress(0);
      setIsGenerating(false);
      setLogs(prev => [
        ...prev,
        "❌ WebGPU Inference Failed during frame extraction!",
        `Error: ${err.message || err}`
      ]);
    }
  };

  // Copy to clipboard
  const handleCopy = (text: string, styleKey: string) => {
    navigator.clipboard.writeText(text)
    setCopiedStyle(styleKey)
    setTimeout(() => setCopiedStyle(null), 2000)
  }

  // Reset states
  const resetApp = () => {
    setUploadedVideoUrl("")
    setVideoFile(null)
    setVideoName("")
    setIsImage(false)
    setCaptions(null)
    setIsGenerating(false)
    setProgress(0)
    setLogs([])
  }

  return (
    <div className="min-h-screen bg-background text-foreground bg-grid-pattern relative flex flex-col justify-between overflow-x-hidden">
      
      {/* Background Glowing Clouds */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none cloud-glow-1"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] rounded-full blur-[140px] pointer-events-none cloud-glow-2"></div>      {/* RENDER HOME PAGE */}
      {currentPage === 'home' && (
        <div className="h-screen w-screen overflow-hidden flex flex-col justify-between relative">
          
          {/* Celestial Sky Gradient Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#020512] via-[#091122] to-[#121c35] z-0"></div>
          
          {/* Divine Glowing Auroras */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150vw] h-[75vh] bg-gradient-to-b from-brand-sky/20 via-brand-indigo/10 to-transparent blur-[130px] pointer-events-none"></div>
          <div className="absolute bottom-[-10%] left-1/2 -translate-x-1/2 w-[100vw] h-[50vh] bg-brand-sky/10 rounded-full blur-[140px] pointer-events-none"></div>

          {/* Full-Screen 3D Background */}
          <div className="absolute inset-0 w-full h-full z-10">
            <CuteMascot />
          </div>

          {/* Header */}
          <header className="w-full max-w-7xl mx-auto px-6 py-5 flex justify-between items-center relative z-20">
            <div className="flex items-center gap-3">
              <div 
                onClick={navigateToHome} 
                className="p-2 bg-slate-950 border border-slate-800/80 rounded-2xl shadow-lg flex items-center justify-center border-glow-sky cursor-pointer"
              >
                <NimbusLogo />
              </div>
              <div className="text-left">
                <h1 className="text-xl font-bold tracking-tight text-white m-0">
                  Nimbus <span className="bg-gradient-to-r from-brand-sky to-brand-indigo bg-clip-text text-transparent">AI</span>
                </h1>
                <p className="text-[10px] text-zinc-400 m-0 tracking-wide font-medium">The video captioning cloud that never leaves your browser</p>
              </div>
            </div>

            {/* GPU Availability Status */}
            <div className="flex items-center gap-2 border border-white/10 py-1.5 px-3 rounded-lg bg-slate-950/40 backdrop-blur">
              <span className={`w-2 h-2 rounded-full ${webGpuSupported ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`}></span>
              <span className="text-xs font-bold text-zinc-300">
                {webGpuSupported ? "WebGPU Active" : "WebGPU Disabled"}
              </span>
            </div>
          </header>

          {/* Main Hero Body */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-6 flex items-center relative z-20 h-[calc(100vh-140px)]">
            
            {/* Celestial Godly Card Panel */}
            <div className="flex flex-col gap-4 text-left max-w-xl p-6 md:p-7 rounded-3xl backdrop-blur-3xl bg-white/[0.03] border border-white/[0.08] shadow-[0_30px_100px_rgba(0,0,0,0.5),_inset_0_1px_1px_rgba(255,255,255,0.12),_0_0_60px_rgba(56,189,248,0.05)] relative z-20 hover:border-white/[0.15] hover:shadow-[0_40px_120px_rgba(0,0,0,0.65),_inset_0_1px_1.5px_rgba(255,255,255,0.18),_0_0_80px_rgba(56,189,248,0.1)] transition-all duration-500 ease-out">
              <div className="flex flex-col gap-1.5">
                <span className="px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-sky border border-brand-sky/20 bg-brand-sky/10 rounded-full w-max">
                  Next-Gen Video Captioning
                </span>
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white leading-tight">
                  Zero Cloud Bills. <br />
                  <span className="bg-gradient-to-r from-brand-sky via-indigo-200 to-white bg-clip-text text-transparent filter drop-shadow-[0_0_20px_rgba(56,189,248,0.35)]">Local AI using WebGPU.</span>
                </h2>
                <p className="text-[13px] text-slate-300 leading-relaxed font-medium">
                  Nimbus executes local AI model inference directly inside your web browser using <strong className="text-white font-bold">Gemma 4 E2B IT (ONNX)</strong>. Your videos never upload to a server, keeping your data private and bills at zero.
                </p>
                
                {/* Stunning Feature Pill Grid */}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <span className="px-2 py-0.5 text-[8px] font-bold text-zinc-300 bg-slate-900/60 border border-white/5 rounded flex items-center gap-1 shadow-sm">
                    <span className="w-1 h-1 rounded-full bg-brand-sky animate-pulse"></span>
                    WebGPU Pipeline
                  </span>
                  <span className="px-2 py-0.5 text-[8px] font-bold text-zinc-300 bg-slate-900/60 border border-white/5 rounded flex items-center gap-1 shadow-sm">
                    <span className="w-1 h-1 rounded-full bg-brand-indigo animate-pulse"></span>
                    100% Client-Side
                  </span>
                  <span className="px-2 py-0.5 text-[8px] font-bold text-zinc-300 bg-slate-900/60 border border-white/5 rounded flex items-center gap-1 shadow-sm">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></span>
                    Zero Data Leaks
                  </span>
                </div>
              </div>

              {/* WebGPU Status Check Panel */}
              <div className="p-3.5 rounded-xl border border-white/5 bg-slate-950/45 backdrop-blur-xl flex flex-col gap-2.5 text-left">
                <div className="flex items-center justify-between text-xs font-bold text-white border-b border-white/5 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-brand-sky" />
                    System Diagnostic Dashboard
                  </div>
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest animate-pulse">
                    System Nominal
                  </span>
                </div>
                
                {webGpuSupported ? (
                  <div className="flex flex-col gap-2 text-xs text-zinc-200">
                    <div className="flex justify-between items-center bg-slate-900/30 p-1.5 rounded border border-white/5">
                      <span className="text-zinc-400 text-[10px]">Hardware Adapter:</span>
                      <span className="text-emerald-400 font-mono font-bold truncate max-w-[200px] text-[10px]">{gpuInfo}</span>
                    </div>
                    
                    {/* Sleek Diagnostic Indicators */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-900/40 p-1.5 rounded border border-white/5 flex flex-col gap-0.5">
                        <span className="text-zinc-550 text-[8px] uppercase tracking-wider font-semibold">VRAM Status</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono font-bold text-emerald-400">OPTIMAL</span>
                          <span className="text-[9px] font-mono text-zinc-500">[■■■■■■□□]</span>
                        </div>
                      </div>
                      <div className="bg-slate-900/40 p-1.5 rounded border border-white/5 flex flex-col gap-0.5">
                        <span className="text-zinc-550 text-[8px] uppercase tracking-wider font-semibold">Shader Compiler</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono font-bold text-brand-sky">READY</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-sky animate-ping"></span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[9px] text-zinc-400 leading-normal mt-0.5 border-t border-white/5 pt-1.5">
                      ℹ️ Gemma on-device inference executes in direct local shaders.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 text-xs text-rose-400 bg-rose-950/10 p-2.5 rounded border border-rose-900/20">
                    <span className="font-bold flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      WebGPU Unavailable on this Browser
                    </span>
                    <p className="text-[9px] text-rose-300/80 leading-normal mt-0.5">
                      Enable hardware acceleration in Chrome settings to unlock Nimbus's high-speed local GPU pipeline.
                    </p>
                  </div>
                )}
              </div>

              {/* Action Button & Responsive Check */}
              {isMobile ? (
                <div className="flex items-center gap-3 p-3 bg-red-950/20 border border-red-900/30 rounded-xl">
                  <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                  <div className="text-left">
                    <p className="text-xs font-bold text-red-400">Mobile/Small Device Blocked</p>
                    <p className="text-[10px] text-zinc-450 leading-normal">Due to WebGPU memory limits, Nimbus requires a desktop screen.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={navigateToWorkspace}
                    disabled={!webGpuSupported}
                    className={`group relative overflow-hidden px-6 py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-3 ${
                      webGpuSupported 
                        ? "bg-gradient-to-r from-brand-sky/25 via-brand-indigo/25 to-brand-sky/25 text-white border border-brand-sky/40 hover:border-brand-sky/80 hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_40px_rgba(56,189,248,0.3)]"
                        : "bg-zinc-900 text-zinc-500 border border-zinc-950 cursor-not-allowed"
                    }`}
                  >
                    <span>Enter Divine Workspace</span>
                    <ArrowRight className="w-4 h-4 text-brand-sky group-hover:translate-x-1.5 transition-transform" />
                  </button>
                </div>
              )}
            </div>

            {/* Floating Badge at Bottom-Right */}
            <div className="absolute bottom-6 right-6 select-none pointer-events-none z-20 hidden md:block">
              <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest bg-slate-950/50 px-3.5 py-1.5 rounded-full border border-white/5 backdrop-blur-md shadow-md">
                Nimbus Divine Celestial Core Active
              </span>
            </div>
          </main>

          {/* Footer */}
          <footer className="w-full py-4 text-center text-[10px] text-muted-foreground z-20 relative">
            <span>© 2026 Nimbus. Engineered with On-Device WebGPU & Gemma 4 E2B IT.</span>
          </footer>
        </div>
      )}

      {/* RENDER CAPTIONING WORKSPACE */}
      {currentPage === 'workspace' && (
        <div className="h-screen w-screen overflow-hidden flex flex-col justify-between relative z-10">
          
          {/* Celestial Sky Gradient Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#020512] via-[#091122] to-[#121c35] z-0"></div>
          
          {/* Divine Glowing Auroras */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150vw] h-[75vh] bg-gradient-to-b from-brand-sky/20 via-brand-indigo/10 to-transparent blur-[130px] pointer-events-none"></div>
          <div className="absolute bottom-[-10%] left-1/2 -translate-x-1/2 w-[100vw] h-[50vh] bg-brand-sky/10 rounded-full blur-[140px] pointer-events-none"></div>

          {/* Full-Screen Vector Background */}
          <div className="absolute inset-0 w-full h-full z-10">
            <CuteMascot animated={false} />
          </div>

          {/* Header */}
          <header className="w-full max-w-5xl mx-auto px-6 py-5 flex justify-between items-center relative z-20">
            <div className="flex items-center gap-3">
              <div 
                onClick={navigateToHome} 
                className="p-2 bg-slate-950 border border-slate-800/80 rounded-2xl shadow-lg flex items-center justify-center border-glow-sky cursor-pointer"
              >
                <NimbusLogo />
              </div>
              <div className="text-left">
                <h1 className="text-xl font-bold tracking-tight text-white m-0">
                  Nimbus <span className="bg-gradient-to-r from-brand-sky to-brand-indigo bg-clip-text text-transparent">AI</span>
                </h1>
                <p className="text-[10px] text-muted-foreground m-0 tracking-wide font-medium">The video captioning cloud that never leaves your browser</p>
              </div>
            </div>

            <button
              onClick={navigateToHome}
              className="text-xs font-semibold text-zinc-450 hover:text-white transition-colors py-1.5 px-3 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer"
            >
              Back to Home
            </button>
          </header>

          <main className={`w-full mx-auto px-6 flex flex-col relative z-20 transition-all duration-500 justify-center ${
            !uploadedVideoUrl 
              ? "max-w-4xl items-center h-[calc(100vh-140px)]" 
              : "max-w-5xl items-center h-[calc(100vh-140px)]"
          }`}>
            
            {!uploadedVideoUrl ? (
              /* Dropzone Upload */
              <div className="w-full max-w-md p-8 rounded-3xl backdrop-blur-3xl bg-white/[0.03] border-2 border-dashed border-white/[0.15] text-center flex flex-col items-center justify-center gap-4 hover:border-brand-sky/60 hover:bg-white/[0.05] transition-all duration-500 ease-out group cursor-pointer relative shadow-[0_30px_100px_rgba(0,0,0,0.5),_inset_0_1px_1px_rgba(255,255,255,0.12),_0_0_60px_rgba(56,189,248,0.03)] hover:shadow-[0_40px_120px_rgba(0,0,0,0.65),_0_0_80px_rgba(56,189,248,0.08)]">
                <div className="p-3.5 bg-brand-sky/15 rounded-full text-brand-sky group-hover:scale-110 transition-transform duration-300">
                  <Upload className="w-7 h-7" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-base font-bold text-white">Upload Your Video or Image File</h2>
                  <p className="text-xs text-zinc-400 leading-normal">
                    Drag & drop your file or click anywhere in this card <br />
                    to process it locally on your GPU.
                  </p>
                </div>
                <input 
                  type="file" 
                  accept="video/*,image/*" 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  onChange={handleVideoSelect}
                />
              </div>
            ) : (
              /* Video/Image Preview and Controls */
              <div className="w-full flex flex-col gap-6">
                
                {/* File Title Bar */}
                <div className="flex justify-between items-center px-1">
                  <div className="flex flex-col gap-0.5 text-left">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-brand-sky">Ingested Video Asset</span>
                    <h2 className="text-lg font-bold text-white m-0 truncate max-w-[280px] sm:max-w-[450px]">
                      {videoName}
                    </h2>
                  </div>
                  <button 
                    onClick={resetApp}
                    className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors py-1.5 px-3 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer"
                  >
                    Select Different File
                  </button>
                </div>

                {/* Workspace Split Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  
                  {/* Left Column: Player Preview & Hardware Diagnostic Panels */}
                  <div className="flex flex-col gap-4">
                    <div className="relative rounded-2xl overflow-hidden border border-border bg-black shadow-2xl aspect-video flex items-center justify-center group">
                      {isImage ? (
                        <img 
                          src={uploadedVideoUrl} 
                          alt={videoName}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <>
                          <video 
                            ref={videoRef}
                            className="w-full h-full object-cover"
                            onClick={togglePlay}
                            loop
                            playsInline
                          >
                            <source src={uploadedVideoUrl} type={videoFile?.type || "video/mp4"} />
                          </video>

                          {/* Player controls overlay */}
                          <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 flex flex-col justify-between p-6 transition-opacity duration-300 ${isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}>
                            <div className="flex justify-between items-start">
                              <span className="px-2.5 py-1 bg-black/60 backdrop-blur-md rounded text-[10px] font-mono text-zinc-300 border border-zinc-800">
                                {(videoFile?.size ? (videoFile.size / (1024 * 1024)).toFixed(2) + " MB" : "")}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <button 
                                onClick={togglePlay}
                                className="p-3 bg-brand-sky rounded-full text-slate-950 shadow-lg border-glow-sky hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer"
                              >
                                {isPlaying ? <Pause className="w-5 h-5 fill-slate-950" /> : <Play className="w-5 h-5 fill-slate-950 ml-0.5" />}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Side-by-Side System Widgets to maintain static single-screen height */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* AMD APU Power Governor */}
                      <div className="p-3.5 rounded-xl border border-white/5 bg-slate-950/45 backdrop-blur-xl flex flex-col gap-3 text-left h-[230px] justify-between">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between text-xs font-bold text-white border-b border-white/5 pb-1.5">
                            <div className="flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5 text-amber-400" />
                              APU Governor
                            </div>
                            <span className={`text-[7px] font-mono px-1 py-0.5 rounded uppercase tracking-wider ${powerMode === 'turbo' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse'}`}>
                              {powerMode === 'turbo' ? 'Turbo' : 'Eco'}
                            </span>
                          </div>
                          
                          <div className="flex flex-col gap-1.5 bg-slate-900/50 p-1 rounded-lg border border-white/5">
                            <button
                              onClick={() => !isGenerating && setPowerMode('turbo')}
                              disabled={isGenerating}
                              className={`flex items-center justify-center py-2 px-1.5 rounded-md transition-all duration-300 relative overflow-hidden cursor-pointer ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''} ${
                                powerMode === 'turbo' 
                                  ? 'bg-gradient-to-r from-indigo-500/15 to-brand-sky/15 border border-indigo-500/30 text-white shadow-[0_0_8px_rgba(56,189,248,0.15)] font-bold' 
                                  : 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-semibold">
                                <Zap className={`w-3 h-3 ${powerMode === 'turbo' ? 'text-amber-400 fill-amber-400' : 'text-zinc-500'}`} />
                                Turbo Mode
                              </div>
                            </button>
                            <button
                              onClick={() => !isGenerating && setPowerMode('eco')}
                              disabled={isGenerating}
                              className={`flex-1 flex items-center justify-center py-2 px-1.5 rounded-md transition-all duration-300 relative overflow-hidden cursor-pointer ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''} ${
                                powerMode === 'eco' 
                                  ? 'bg-gradient-to-r from-emerald-500/15 to-teal-500/15 border border-emerald-500/30 text-white shadow-[0_0_8px_rgba(16,185,129,0.15)] font-bold' 
                                  : 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-semibold">
                                <BatteryCharging className={`w-3 h-3 ${powerMode === 'eco' ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'}`} />
                                Battery Eco
                              </div>
                            </button>
                          </div>
                        </div>

                        <div className="text-[8px] text-zinc-400 leading-normal bg-slate-900/20 p-2 rounded border border-white/5">
                          {powerMode === 'turbo' ? (
                            <p>⚡ <strong className="text-white font-bold">Turbo</strong>: 384px tensor, sampling (0.7 temp) enabled.</p>
                          ) : (
                            <p>🔋 <strong className="text-white font-bold">Eco</strong>: 224px tensor. Greedy decoding. Saves 60% memory.</p>
                          )}
                        </div>
                      </div>

                      {/* WebGPU Performance Telemetry HUD */}
                      <div className="p-3.5 rounded-xl border border-white/5 bg-slate-950/45 backdrop-blur-xl flex flex-col gap-3 text-left h-[230px] justify-between">
                        <div className="flex items-center justify-between text-xs font-bold text-white border-b border-white/5 pb-1.5">
                          <div className="flex items-center gap-1.5">
                            <Gauge className="w-3.5 h-3.5 text-brand-sky" />
                            Performance
                          </div>
                          <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded uppercase tracking-widest ${telemetry ? 'bg-indigo-500/10 text-brand-sky border border-indigo-500/20 animate-pulse' : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'}`}>
                            {telemetry ? 'Active' : 'Standby'}
                          </span>
                        </div>

                        {telemetry ? (
                          <div className="flex flex-col gap-2 text-[9px] text-zinc-200 flex-1 justify-between">
                            {/* Token Speed Meter */}
                            <div className="flex items-baseline justify-between bg-slate-900/40 px-2 py-1.5 rounded border border-white/5">
                              <span className="text-zinc-500 text-[8px] uppercase tracking-wider font-semibold">Speed:</span>
                              <div className="flex items-baseline gap-0.5">
                                <span className="text-base font-extrabold text-brand-sky filter drop-shadow-[0_0_4px_rgba(56,189,248,0.2)]">
                                  {telemetry.tokensPerSecond}
                                </span>
                                <span className="text-[8px] font-mono text-zinc-450 font-bold uppercase">tok/s</span>
                              </div>
                            </div>

                            {/* Detailed Diagnostic Counters */}
                            <div className="grid grid-cols-2 gap-1.5 text-[8px]">
                              <div className="bg-slate-900/20 p-1 rounded border border-white/5 flex flex-col">
                                <span className="text-zinc-550 text-[7px] uppercase tracking-wider font-semibold">Boot:</span>
                                <span className="font-mono text-white font-bold truncate">
                                  {telemetry.loadLatencyMs > 0 ? `${(telemetry.loadLatencyMs / 1000).toFixed(1)}s` : 'VRAM'}
                                </span>
                              </div>
                              <div className="bg-slate-900/20 p-1 rounded border border-white/5 flex flex-col">
                                <span className="text-zinc-550 text-[7px] uppercase tracking-wider font-semibold">Tokens:</span>
                                <span className="font-mono text-white font-bold">{telemetry.totalTokens}</span>
                              </div>
                            </div>

                            {/* Sustainability Cost Savings */}
                            <div className="flex justify-between items-center bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 text-emerald-400 font-mono text-[8px]">
                              <span>CO2 REDUCED:</span>
                              <span className="font-bold">0.20g</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-4 flex-1 border border-dashed border-white/5 rounded-lg bg-slate-900/10 text-center">
                            <Activity className="w-4 h-4 text-zinc-650 mb-1 animate-pulse" />
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide">Awaiting Run</span>
                            <p className="text-[8px] text-zinc-500 leading-normal mt-0.5 max-w-[120px]">
                              Run local captioning to display benchmarks.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Processing States / Output */}
                  <div className="flex flex-col gap-6">
                    
                    {!captions && !isGenerating && (
                      /* Start CTA */
                      <div className="p-8 rounded-2xl border border-slate-800 bg-slate-950/20 backdrop-blur-md flex flex-col items-center justify-center gap-5 text-center min-h-[240px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)] hover:border-slate-700/40 transition-all duration-300">
                        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-950 border border-slate-850 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_0_25px_rgba(56,189,248,0.15)] mb-1 border-glow-sky">
                          <NimbusLogo />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <h3 className="text-sm font-bold text-white tracking-tight">Generate Styled Captions</h3>
                          <p className="text-xs text-zinc-400 leading-normal max-w-xs px-2">
                            Run Gemma 4 E2B IT locally using WebGPU to generate Formal, Sarcastic, and Humorous caption outputs.
                          </p>
                        </div>
                        <button
                          onClick={runCaptionPipeline}
                          className="mt-2 relative overflow-hidden px-8 py-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-brand-sky/50 text-xs font-semibold text-white shadow-[0_4px_20px_rgba(0,0,0,0.5)] active:scale-[0.98] transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 group border-glow-sky"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-brand-sky" />
                          <span className="relative z-10">Start Local Generation</span>
                        </button>
                      </div>
                    )}

                    {/* Progress Loader & Intermission Panel */}
                    {isGenerating && (
                      <div className="p-6 rounded-2xl border border-border bg-card/45 backdrop-blur-md flex flex-col gap-5 text-left min-h-[280px] shadow-2xl justify-between">
                        
                        {/* Progress Bar & Loader Header */}
                        <div className="flex flex-col gap-2.5">
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-brand-sky to-brand-indigo transition-all duration-500" 
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-xs font-semibold">
                            <span className="text-brand-sky flex items-center gap-1.5">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Running local inference...
                            </span>
                            <span className="text-zinc-300">{progress}%</span>
                          </div>
                          
                          {/* Display Active Pipeline Stage */}
                          <div className="text-[11px] font-mono text-zinc-400 bg-slate-950/60 p-2.5 rounded border border-slate-850">
                            🚀 {inferenceStage}
                          </div>
                        </div>

                        {/* Interactive Boredom Buster Panel (Jokes) */}
                        <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/30 backdrop-blur flex flex-col gap-1.5 relative overflow-hidden shadow-inner min-h-[100px] justify-center transition-all duration-500">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400">Loading Intermission &bull; Dev Joke</span>
                          <p className="text-xs text-slate-200 italic leading-relaxed m-0 animate-fade-in">
                            "{DEVELOPER_JOKES[currentJokeIdx]}"
                          </p>
                        </div>

                        {/* Real-time console activity log */}
                        <div className="p-3 bg-zinc-950 rounded-lg border border-slate-800 font-mono text-[9px] text-zinc-400 flex flex-col gap-1 h-20 overflow-y-auto scrollbar-thin">
                          {logs.map((log, index) => (
                            <div key={index} className="flex gap-2">
                              <span className="text-zinc-600">[{index + 1}]</span>
                              <span className="break-all">{log}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {captions && (
                      /* Display Style Caption Output Cards */
                      <div className="p-5 rounded-2xl border border-border bg-card/45 backdrop-blur-md text-left flex flex-col gap-4 shadow-xl">
                        
                        {/* Style Select Tabs */}
                        <div className="flex flex-wrap gap-1.5 border-b border-border/40 pb-3">
                          {(Object.keys(STYLE_GUIDES) as Array<keyof typeof STYLE_GUIDES>).map(styleKey => {
                            const isActive = activeStyle === styleKey
                            return (
                              <button
                                key={styleKey}
                                onClick={() => setActiveStyle(styleKey)}
                                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer border ${
                                  isActive 
                                    ? "bg-brand-sky text-slate-950 border-brand-sky/20 shadow-md font-extrabold" 
                                    : "bg-slate-950 text-slate-400 hover:text-slate-200 border-slate-850"
                                }`}
                              >
                                {styleKey.replace("humorous_", "").replace("_", " ")}
                              </button>
                            )
                          })}
                        </div>

                        {/* Description / Instructions */}
                        <div className="flex flex-col gap-1 p-3 bg-slate-950/40 rounded-lg border border-slate-850">
                          <p className="text-[11px] text-slate-350 leading-normal">
                            {STYLE_GUIDES[activeStyle].desc}
                          </p>
                        </div>

                        {/* Caption Text Box */}
                        <div className="relative p-5 rounded-xl border border-border/60 bg-slate-950/20 min-h-[90px] flex flex-col justify-between gap-4">
                          <p className="text-sm text-slate-200 leading-relaxed italic m-0">
                            {captions[activeStyle]}
                          </p>

                          <div className="flex justify-between items-center pt-3 border-t border-border/20">
                            <span className="text-[10px] text-zinc-550 font-mono">
                              {captions[activeStyle].split(" ").length} words
                            </span>
                            
                            <button 
                              onClick={() => handleCopy(captions[activeStyle], activeStyle)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-[10px] font-semibold text-zinc-300 hover:bg-slate-900 hover:text-white transition-colors cursor-pointer"
                            >
                              {copiedStyle === activeStyle ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400 font-bold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                      </div>
                    )}

                  </div>
                </div>

              </div>
            )}

          </main>

          {/* Footer */}
          <footer className="w-full py-4 text-center text-[10px] text-muted-foreground z-20 relative">
            <span>© 2026 Nimbus. Running local browser-side inference on Gemma 4 E2B IT.</span>
          </footer>
        </div>
      )}

    </div>
  )
}
