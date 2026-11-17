const input = document.querySelector("#bww");
const playbackOptions = document.querySelector(".playback-options");
const bpmInput = document.querySelector("#bpm");
const graceInput = document.querySelector("#grace-ms");
const soundInput = document.querySelector("#sound");
const droneInput = document.querySelector("#drone");
const playButton = document.querySelector("#play");
const stopButton = document.querySelector("#stop");
const positionInput = document.querySelector("#playback-position");
const playbackTime = document.querySelector("#playback-time");
const status = document.querySelector("#status");
const diagnosticsList = document.querySelector("#diagnostics");
const score = document.querySelector("#score");
const scoreError = document.querySelector("#score-error");

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

function clearScore() {
  score.replaceChildren();
  scoreError.hidden = true;
  scoreError.textContent = "";
}

function showScore(abc, notationError) {
  if (abc) {
    try {
      if (!window.ABCJS) throw new Error("Could not load abcjs.");
      window.ABCJS.renderAbc(score, abc, { responsive: "resize" });
      if (!score.querySelector("svg")) throw new Error("No notation was produced.");
    } catch (error) {
      clearScore();
      notationError = error.message;
    }
  }
  if (notationError) {
    scoreError.hidden = false;
    scoreError.textContent = `Sheet music error: ${notationError}`;
  }
}

function formatTime(time) {
  const seconds = Math.floor(time);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function showPosition(position, duration) {
  positionInput.max = duration;
  positionInput.valueAsNumber = position;
  const elapsed = formatTime(position);
  const total = formatTime(duration);
  const display = `${elapsed} / ${total}`;
  if (playbackTime.textContent !== display) {
    playbackTime.textContent = display;
    positionInput.setAttribute("aria-valuetext", `${elapsed} of ${total}`);
  }
}

function stopSource(playback) {
  if (!playback.source) return;
  playback.source.onended = null;
  playback.source.stop();
  playback.source.disconnect();
  playback.source = null;
}

function finish(playback, message, position = 0) {
  if (activePlayback !== playback) return;

  activePlayback = null;
  clearInterval(playback.positionTimer);
  stopSource(playback);
  showPosition(position, playback.samples?.duration ?? 0);
  positionInput.disabled = true;
  showStatus(message);
}

function resetWorker() {
  worker?.terminate();
  worker = null;
}

function startSource(playback, offset) {
  stopSource(playback);
  const source = audioContext.createBufferSource();
  source.buffer = playback.samples;
  source.connect(audioContext.destination);
  source.onended = () => finish(playback, "Finished.", playback.samples.duration);
  const startTime = audioContext.currentTime;
  source.start(startTime, offset);
  playback.source = source;
  playback.startTime = startTime;
  playback.offset = offset;
  showPosition(offset, playback.samples.duration);
}

async function playWav(playback, wav) {
  await playback.audioReady;
  if (activePlayback !== playback) return;

  playback.samples = await audioContext.decodeAudioData(wav.buffer);
  if (activePlayback !== playback) return;

  startSource(playback, 0);
  positionInput.disabled = false;
  playback.positionTimer = setInterval(() => {
    const duration = playback.samples.duration;
    const position = playback.offset + audioContext.currentTime - playback.startTime;
    showPosition(Math.min(position, duration), duration);
  }, 100);
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
    if (playback.text === input.value) showScore(data.abc, data.scoreError);
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

  clearScore();
  showPosition(0, 0);
  const playback = { text, rendering: true };
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

input.addEventListener("input", clearScore);

positionInput.addEventListener("input", () => {
  const playback = activePlayback;
  if (!playback?.source) return;

  try {
    startSource(playback, positionInput.valueAsNumber);
  } catch (error) {
    finish(playback, `Playback error: ${error.message}`);
  }
});

stopButton.addEventListener("click", () => {
  const playback = activePlayback;
  if (!playback) return;

  if (playback.rendering) resetWorker();
  finish(playback, "Stopped.");
});

showStatus("Ready.");
