const input = document.querySelector("#bww");
const playbackOptions = document.querySelector(".playback-options");
const bpmInput = document.querySelector("#bpm");
const graceInput = document.querySelector("#grace-ms");
const soundInput = document.querySelector("#sound");
const droneInput = document.querySelector("#drone");
const playButton = document.querySelector("#play");
const stopButton = document.querySelector("#stop");
const status = document.querySelector("#status");
const diagnosticsList = document.querySelector("#diagnostics");

let audioContext;
let worker;
let activePlayback;

function showStatus(message) {
  status.textContent = message;
  playButton.disabled = Boolean(activePlayback);
  stopButton.disabled = !activePlayback;
}

function showDiagnostics(diagnostics) {
  const items = diagnostics.map(([severity, message]) => {
    const item = document.createElement("li");
    item.textContent = `${severity}: ${message}`;
    return item;
  });
  diagnosticsList.replaceChildren(...items);
  diagnosticsList.hidden = items.length === 0;
}

function finish(playback, message) {
  if (activePlayback !== playback) return;

  activePlayback = null;
  if (playback.source) {
    playback.source.onended = null;
    playback.source.stop();
    playback.source.disconnect();
  }
  showStatus(message);
}

function resetWorker() {
  worker?.terminate();
  worker = null;
}

async function playWav(playback, wav) {
  await playback.audioReady;
  if (activePlayback !== playback) return;

  const samples = await audioContext.decodeAudioData(wav.buffer);
  if (activePlayback !== playback) return;

  const source = audioContext.createBufferSource();
  source.buffer = samples;
  source.connect(audioContext.destination);
  source.onended = () => finish(playback, "Finished.");
  source.start();
  playback.source = source;
  showStatus("Playing…");
}

function createWorker() {
  const nextWorker = new Worker("render-worker.js");
  nextWorker.onmessage = async ({ data }) => {
    const playback = activePlayback;
    if (worker !== nextWorker || !playback) return;

    if (data.status) {
      showStatus(data.status);
      return;
    }
    playback.rendering = false;
    if (data.diagnostics) showDiagnostics(data.diagnostics);
    if (data.error) {
      if (data.resetWorker) resetWorker();
      finish(playback, data.error);
      return;
    }

    try {
      showStatus("Preparing audio…");
      await playWav(playback, data.wav);
    } catch (error) {
      finish(playback, `Playback error: ${error.message}`);
    }
  };
  nextWorker.onerror = (event) => {
    if (worker !== nextWorker) return;
    resetWorker();
    if (activePlayback) {
      finish(activePlayback, `Worker error: ${event.message || "Could not load the renderer."}`);
    }
  };
  return nextWorker;
}

playButton.addEventListener("click", () => {
  showDiagnostics([]);
  const text = input.value;
  if (!text.trim()) {
    showStatus("Paste a BWW tune first.");
    return;
  }

  const bpm = bpmInput.value === "" ? null : bpmInput.valueAsNumber;
  if (!bpmInput.validity.valid || (bpm !== null && (!Number.isFinite(bpm) || bpm <= 0))) {
    showStatus("Enter a tempo greater than zero, or leave it blank.");
    playbackOptions.open = true;
    bpmInput.focus();
    return;
  }

  const graceMs = graceInput.valueAsNumber;
  if (!graceInput.validity.valid || !Number.isFinite(graceMs)) {
    showStatus("Enter a grace note duration of zero or greater.");
    playbackOptions.open = true;
    graceInput.focus();
    return;
  }

  const playback = { rendering: true };
  activePlayback = playback;
  try {
    audioContext ??= new AudioContext();
    playback.audioReady = audioContext.resume();
    playback.audioReady.catch((error) => {
      if (activePlayback !== playback) return;
      if (playback.rendering) resetWorker();
      finish(playback, `Playback error: ${error.message}`);
    });
  } catch (error) {
    finish(playback, `Playback error: ${error.message}`);
    return;
  }

  try {
    showStatus(worker ? "Rendering tune…" : "Loading Pyodide and pybww…");
    worker ??= createWorker();
    worker.postMessage({
      text, bpm, graceMs, sound: soundInput.value, drone: droneInput.checked,
    });
  } catch (error) {
    resetWorker();
    finish(playback, `Loading error: ${error.message}`);
  }
});

stopButton.addEventListener("click", () => {
  const playback = activePlayback;
  if (!playback) return;

  if (playback.rendering) resetWorker();
  finish(playback, "Stopped.");
});

showStatus("Ready.");
