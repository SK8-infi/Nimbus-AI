import { env, AutoProcessor, Gemma4ForConditionalGeneration, RawImage } from '@huggingface/transformers'

// Configure global environment parameters for high-performance browser caching
env.allowLocalModels = false;
// @ts-ignore
env.use_opfs = true; // Enables Origin Private File System for near-native caching read/write speeds

let processor: any = null;
let model: any = null;

// Persistent state map to track concurrent downloading sharded weights
const downloadProgressMap: { [key: string]: number } = {};

// Computes a monotonic, steadily increasing average progress across all active download threads
const trackDownloadProgress = (data: any) => {
  if (data.status === 'progress') {
    // 1. Log or update progress for this specific sharded file
    downloadProgressMap[data.file] = data.progress;
    
    // 2. Aggregate progress across all detected file streams
    const files = Object.keys(downloadProgressMap);
    const totalProgress = files.reduce((acc, file) => acc + downloadProgressMap[file], 0);
    
    // Divide by safe expected minimum of 6 chunks to prevent jumping to 100% on fast tiny config files
    const fileCount = Math.max(files.length, 6);
    const smoothedProgress = totalProgress / fileCount;

    self.postMessage({
      type: 'download_progress',
      file: data.file,
      progress: Math.min(smoothedProgress, 99.9) // Cap at 99.9% until actual compilation finishes
    });
  }
};

self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data;

  if (type === 'load_model') {
    try {
      const model_id = 'onnx-community/gemma-4-E2B-it-ONNX';

      if (!processor || !model) {
        self.postMessage({ type: 'status', message: 'Downloading model weights... (This might take a few minutes on first run, please keep patience!)' });
        
        processor = await AutoProcessor.from_pretrained(model_id);
        
        model = await Gemma4ForConditionalGeneration.from_pretrained(model_id, {
          device: 'webgpu',
          dtype: 'q4f16',
          progress_callback: trackDownloadProgress
        });
        self.postMessage({ type: 'status', message: 'Model fully compiled and loaded into VRAM!' });
      } else {
        self.postMessage({ type: 'status', message: 'Cached model weights loaded from VRAM.' });
      }
      self.postMessage({ type: 'load_complete' });
    } catch (err: any) {
      self.postMessage({ type: 'error', error: err.message || String(err) });
    }
  }

  else if (type === 'generate_captions') {
    try {
      const { frames, isImage, defaultNumFrames, styles, powerMode } = data;
      const isEco = powerMode === 'eco';

      const model_id = 'onnx-community/gemma-4-E2B-it-ONNX';

      const loadStart = performance.now();
      let loadLatencyMs = 0;

      // 1. Ensure model is loaded with active progress callbacks and logs
      if (!processor || !model) {
        self.postMessage({ type: 'status', message: 'Downloading model weights... (This might take a few minutes on first run, please keep patience!)' });
        self.postMessage({ type: 'log', message: 'Model weights not cached. Initializing local on-demand download...' });
        self.postMessage({ type: 'log', message: 'Downloading model weights: onnx-community/gemma-4-E2B-it-ONNX' });

        processor = await AutoProcessor.from_pretrained(model_id);
        model = await Gemma4ForConditionalGeneration.from_pretrained(model_id, {
          device: 'webgpu',
          dtype: 'q4f16',
          progress_callback: trackDownloadProgress
        });
        self.postMessage({ type: 'log', message: 'Model fully compiled and loaded into VRAM!' });
        loadLatencyMs = performance.now() - loadStart;
      } else {
        self.postMessage({ type: 'log', message: 'Cached model weights loaded from VRAM.' });
      }

      self.postMessage({ type: 'stage', stage: 'Stage 2/5: Running Vision Grounding pass...' });
      self.postMessage({ type: 'log', message: 'Creating visual frame tensors...' });
      self.postMessage({ type: 'log', message: `Running Vision Grounding pass [VRAM Limit: ${isEco ? '224px (Eco)' : '384px (Turbo)'}]...` });

      const visionPrompt = isImage 
        ? "Provide a concise, high-precision description of this image in exactly 1 or 2 sentences."
        : defaultNumFrames === 1
          ? "Provide a concise, high-precision description of this video frame in exactly 1 or 2 sentences."
          : `Provide a concise, high-precision description of these video frames in exactly 1 to 3 sentences to capture the coherent scene.`;

      const rawImages = await Promise.all(frames.map((url: string) => RawImage.fromURL(url)));
      const content: any[] = rawImages.map(() => ({ type: 'image' }));
      content.push({ type: 'text', text: visionPrompt });

      const messages = [{ role: 'user', content }];
      const formattedPrompt = processor.apply_chat_template(messages, { add_generation_prompt: true });
      const inputs = await processor(formattedPrompt, rawImages);

      // Benchmark Stage 1 (Grounding)
      const groundingStart = performance.now();
      const outputs = await model.generate({
        ...inputs,
        max_new_tokens: isEco ? 48 : 80,
        do_sample: false, // Always greedy decoding for maximum grounding factual accuracy
      });
      const groundingTimeMs = performance.now() - groundingStart;

      const inputLength = inputs.input_ids.dims ? inputs.input_ids.dims[1] : inputs.input_ids.shape[1];
      const decodedTokens = Array.from(outputs.data.slice(inputLength)).map(Number);
      const groundingTokens = decodedTokens.length;
      let visualDescription = processor.decode(decodedTokens, { skip_special_tokens: true });

      if (visualDescription) {
        visualDescription = visualDescription.replace(/<[\s\S]*?>/g, '').trim();
        visualDescription = visualDescription
          .replace(/\b(composite|split-screen|split screen|multi-frame|grid of|collage of|montage of)\s*(image|images|video|video frames|frames|keyframes|stills|photos|pictures|views|panels)?\b/gi, '')
          .replace(/\b(first|second|third|left|right|top|bottom)\s*(frame|keyframe|panel|image|view|still|photo|picture)\b/gi, 'the scene')
          .replace(/\b(the frames show|the keyframes show|the images show|the panels show)\b/gi, 'the scene shows')
          .replace(/\b(two|three|four)\s+(different|distinct|separate)?\s*(frames|keyframes|stills|images|panels)\b/gi, 'the scene')
          .replace(/\s+/g, ' ')
          .trim();
      }

      self.postMessage({ type: 'visual_description_output', description: visualDescription });
      self.postMessage({ type: 'progress', progress: 25 });

      let totalStyleTokens = 0;

      // Generate stylistic captions helper inside worker
      const generateStyleText = async (styleName: string, styleInstruction: string) => {
        const textPrompt = `You are an elite video captioning engine. The following visual description was generated from the video:
"${visualDescription}"

Write exactly one single-sentence caption in the requested style:
Style target: ${styleName} (${styleInstruction})`;

        const tMessages = [{ role: 'user', content: [{ type: 'text', text: textPrompt }] }];
        const tFormatted = processor.apply_chat_template(tMessages, { add_generation_prompt: true });
        const tInputs = await processor(tFormatted);

        const tOutputs = await model.generate({
          ...tInputs,
          max_new_tokens: isEco ? 48 : 64,
          do_sample: !isEco, // Greedy in Eco mode, Sampling in Turbo mode
          temperature: 0.7,
          top_p: 0.9,
        });

        const tInputLength = tInputs.input_ids.dims ? tInputs.input_ids.dims[1] : tInputs.input_ids.shape[1];
        const tDecodedTokens = Array.from(tOutputs.data.slice(tInputLength)).map(Number);
        totalStyleTokens += tDecodedTokens.length;

        let tDecoded = processor.decode(tDecodedTokens, { skip_special_tokens: true });
        if (tDecoded) {
          tDecoded = tDecoded.replace(/<[\s\S]*?>/g, '').trim();
        }
        return tDecoded;
      };

      // Benchmark Stage 2 (Copywriting)
      const copywritingStart = performance.now();

      self.postMessage({ type: 'stage', stage: 'Stage 3/5: Generating Formal caption...' });
      const formal = await generateStyleText("formal", styles.formal);
      self.postMessage({ type: 'progress', progress: 50 });

      self.postMessage({ type: 'stage', stage: 'Stage 4/5: Generating Sarcastic caption...' });
      const sarcastic = await generateStyleText("sarcastic", styles.sarcastic);
      self.postMessage({ type: 'progress', progress: 70 });

      self.postMessage({ type: 'stage', stage: 'Stage 5/5: Generating Humorous captions...' });
      self.postMessage({ type: 'log', message: `Synthesizing copywriting passes [Mode: ${isEco ? 'Greedy/Deterministic' : 'Creative/Sampling'}]...` });
      
      const humorous_tech = await generateStyleText("humorous_tech", styles.humorous_tech);
      self.postMessage({ type: 'progress', progress: 85 });

      const humorous_non_tech = await generateStyleText("humorous_non_tech", styles.humorous_non_tech);
      const copywritingTimeMs = performance.now() - copywritingStart;
      self.postMessage({ type: 'progress', progress: 100 });

      // Calculate Aggregated Telemetry Benchmarks
      const totalTokens = groundingTokens + totalStyleTokens;
      const totalInferenceTimeSec = (groundingTimeMs + copywritingTimeMs) / 1000;
      const tokensPerSecond = totalInferenceTimeSec > 0 ? totalTokens / totalInferenceTimeSec : 0;

      // Dispatch Telemetry Stats back to main thread
      self.postMessage({
        type: 'benchmark_stats',
        stats: {
          loadLatencyMs: Math.round(loadLatencyMs),
          groundingTokens,
          groundingTimeMs: Math.round(groundingTimeMs),
          copywritingTokens: totalStyleTokens,
          copywritingTimeMs: Math.round(copywritingTimeMs),
          totalTokens,
          tokensPerSecond: Number(tokensPerSecond.toFixed(1)),
          powerModeUsed: powerMode
        }
      });

      self.postMessage({
        type: 'complete',
        captions: {
          formal,
          sarcastic,
          humorous_tech,
          humorous_non_tech
        }
      });

    } catch (err: any) {
      self.postMessage({ type: 'error', error: err.message || String(err) });
    }
  }
};
