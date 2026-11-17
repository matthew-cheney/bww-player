const input = document.querySelector("#bww");
const bpmInput = document.querySelector("#bpm");
const graceInput = document.querySelector("#grace-ms");
const soundInput = document.querySelector("#sound");
const droneInput = document.querySelector("#drone");
const highlightInput = document.querySelector("#highlight-note");
const playButton = document.querySelector("#play");
const playLoading = document.querySelector("#play-loading");
const playLabel = document.querySelector("#play-label");
const stopButton = document.querySelector("#stop");
const positionInput = document.querySelector("#playback-position");
const playbackTime = document.querySelector("#playback-time");
const status = document.querySelector("#status");
const diagnosticsList = document.querySelector("#diagnostics");
const score = document.querySelector("#score");
const scoreLoading = document.querySelector("#score-loading");
const scoreError = document.querySelector("#score-error");

let audioContext;
let worker;
let tune;
let activePlayback;
let exampleRequest;

function showStatus(message) {
  status.textContent = message;
  const rendering = Boolean(tune?.rendering);
  const waitingForScore = rendering && !tune.scoreReceived;
  playLoading.hidden = !rendering;
  playLabel.textContent = rendering ? "Generating audio…" : "Play";
  playButton.setAttribute("aria-busy", String(rendering));
  scoreLoading.hidden = !waitingForScore;
  score.setAttribute("aria-busy", String(waitingForScore));
  playButton.disabled = !tune?.wav || Boolean(activePlayback);
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
      window.ABCJS.renderAbc(score, abc, { responsive: "resize", add_classes: true });
      if (!score.querySelector("svg")) throw new Error("No notation was produced.");
      return score.querySelectorAll(".abcjs-note");
    } catch (error) {
      clearScore();
      notationError = error.message;
    }
  }
  if (notationError) {
    scoreError.hidden = false;
    scoreError.textContent = `Sheet music error: ${notationError}`;
  }
  return null;
}

function setHighlightedNote(playback, note) {
  if (playback.highlightedNote === note) return;
  playback.highlightedNote?.classList.remove("is-playing");
  playback.noteMarker?.remove();
  playback.highlightedNote = note;
  if (!note) return;

  const { x, y, width, height } = note.getBBox();
  const marker = playback.noteMarker ??= document.createElementNS(
    "http://www.w3.org/2000/svg", "rect",
  );
  marker.setAttribute("class", "playing-note-marker");
  marker.setAttribute("aria-hidden", "true");
  marker.setAttribute("x", x - 4);
  marker.setAttribute("y", y - 4);
  marker.setAttribute("width", width + 8);
  marker.setAttribute("height", height + 8);
  marker.setAttribute("rx", 4);
  note.prepend(marker);
  note.classList.add("is-playing");
}

function highlightAt(playback, position) {
  if (!highlightInput.checked || !playback.scoreNotes?.length) return;

  // The timeline is in playback order, so a repeat can reuse an SVG note.
  const timeline = playback.timeline;
  let first = 0;
  let last = timeline.length;
  while (first < last) {
    const middle = Math.floor((first + last) / 2);
    if (timeline[middle][0] <= position) {
      first = middle + 1;
    } else {
      last = middle;
    }
  }
  const noteIndex = timeline[first - 1]?.[1];
  setHighlightedNote(playback, playback.scoreNotes[noteIndex] ?? null);
}

function formatTime(time) {
  const seconds = Math.floor(time);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function showPosition(position, duration) {
  if (positionInput.max !== String(duration)) positionInput.max = duration;
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
  cancelAnimationFrame(playback.positionFrame);
  setHighlightedNote(playback, null);
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
  highlightAt(playback, offset);
}

function playSamples(playback) {
  startSource(playback, 0);
  positionInput.disabled = false;
  function updatePosition() {
    const duration = playback.samples.duration;
    const position = Math.min(playback.offset + audioContext.currentTime - playback.startTime, duration);
    showPosition(position, duration);
    highlightAt(playback, position);
    playback.positionFrame = requestAnimationFrame(updatePosition);
  }
  playback.positionFrame = requestAnimationFrame(updatePosition);
  showStatus("Playing…");
}

function createWorker() {
  const nextWorker = new Worker("render-worker.js");
  nextWorker.onmessage = ({ data }) => {
    if (worker !== nextWorker || !tune?.rendering) return;

    if (data.status) {
      showStatus(data.status);
      return;
    }
    if (data.type === "score") {
      showDiagnostics(data.diagnostics);
      tune.scoreReceived = true;
      tune.scoreNotes = showScore(data.abc, data.scoreError);
      showStatus("Rendering audio…");
      return;
    }

    tune.rendering = false;
    if (data.error) {
      if (data.resetWorker) resetWorker();
      showStatus(data.error);
      return;
    }

    tune.timeline = data.timeline;
    tune.wav = data.wav;
    showStatus("Ready to play.");
  };
  nextWorker.onerror = (event) => {
    if (worker !== nextWorker) return;
    resetWorker();
    if (tune?.rendering) {
      tune.rendering = false;
      showStatus(`Worker error: ${event.message || "Could not load the renderer."}`);
    }
  };
  return nextWorker;
}

function renderTune() {
  if (tune?.rendering) resetWorker();
  tune = null;
  if (activePlayback) finish(activePlayback, "");
  clearScore();
  showDiagnostics([]);
  showPosition(0, 0);
  const text = input.value;
  if (!text.trim()) {
    showStatus("Paste a BWW tune first.");
    return;
  }

  const bpm = bpmInput.value === "" ? null : bpmInput.valueAsNumber;
  if (!bpmInput.validity.valid || (bpm !== null && (!Number.isFinite(bpm) || bpm <= 0))) {
    showStatus("Enter a tempo greater than zero, or leave it blank.");
    return;
  }

  const graceMs = graceInput.valueAsNumber;
  if (!graceInput.validity.valid || !Number.isFinite(graceMs)) {
    showStatus("Enter a grace note duration of zero or greater.");
    return;
  }

  tune = { rendering: true };
  try {
    showStatus(worker ? "Reading tune…" : "Loading Pyodide and pybww…");
    worker ??= createWorker();
    worker.postMessage({
      text, bpm, graceMs, sound: soundInput.value, drone: droneInput.checked,
    });
  } catch (error) {
    resetWorker();
    tune.rendering = false;
    showStatus(`Loading error: ${error.message}`);
  }
}

playButton.addEventListener("click", async () => {
  if (!tune?.wav || activePlayback) return;

  const renderedTune = tune;
  const playback = { timeline: renderedTune.timeline, scoreNotes: renderedTune.scoreNotes };
  activePlayback = playback;
  showStatus("Preparing audio…");
  try {
    audioContext ??= new AudioContext();
    await audioContext.resume();
    if (activePlayback !== playback) return;

    renderedTune.samples ??= await audioContext.decodeAudioData(renderedTune.wav.slice().buffer);
    if (activePlayback !== playback) return;

    playback.samples = renderedTune.samples;
    playSamples(playback);
  } catch (error) {
    finish(playback, `Playback error: ${error.message}`);
  }
});

input.addEventListener("input", () => {
  exampleRequest?.abort();
  renderTune();
});

for (const field of [bpmInput, graceInput, soundInput, droneInput]) {
  field.addEventListener("input", renderTune);
}

for (const button of document.querySelectorAll("[data-example]")) {
  button.addEventListener("click", async () => {
    exampleRequest?.abort();
    const request = new AbortController();
    exampleRequest = request;

    try {
      const response = await fetch(`examples/${button.dataset.example}.bww`, {
        signal: request.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const text = await response.text();
      if (request.signal.aborted) return;

      input.value = text;
      renderTune();
    } catch (error) {
      if (!request.signal.aborted) {
        showStatus(`Could not load ${button.textContent}: ${error.message}`);
      }
    } finally {
      if (exampleRequest === request) exampleRequest = null;
    }
  });
}

highlightInput.addEventListener("change", () => {
  if (!highlightInput.checked && activePlayback) {
    setHighlightedNote(activePlayback, null);
  }
});

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

  finish(playback, "Stopped.");
});

renderTune();
