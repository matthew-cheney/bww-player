const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
const WHEEL = "vendor/pybww-0.1.0+9ef4229-py3-none-any.whl";

let renderer;

async function loadRenderer() {
  importScripts(PYODIDE_URL + "pyodide.js");
  const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
  await pyodide.loadPackage(new URL(WHEEL, self.location.href).href);
  pyodide.runPython(`
from pybww import parse_text
from pybww.audio import render_wav

def render_bww(text, bpm, grace_ms, sound, drone, send_score):
    result = parse_text(text, strict=False)
    diagnostics = [(item.severity, item.message) for item in result.diagnostics]

    if result.tune is None:
        send_score(diagnostics, None, None)
        return "Parse error: No playable tune was found.", None, []

    abc = None
    score_error = None
    try:
        abc = result.tune.to_abc(allow_partial=True)
    except Exception as error:
        score_error = str(error)

    send_score(diagnostics, abc, score_error)

    try:
        wav, timeline = render_wav(
            result.tune, bpm=bpm, grace_ms=grace_ms, sound=sound, drone=drone
        )
    except Exception as error:
        return f"Rendering error: {error}", None, []
    return None, wav, [
        (entry.start_seconds, entry.note_index) for entry in timeline
    ]
`);
  return pyodide.globals.get("render_bww");
}

function sendScore(diagnostics, abc, scoreError) {
  self.postMessage({ type: "score", diagnostics: diagnostics.toJs(), abc, scoreError });
}

self.onmessage = async ({ data: { text, bpm, graceMs, sound, drone } }) => {
  let stage = "Loading";
  try {
    if (!renderer) {
      self.postMessage({ status: "Loading Pyodide and pybww…" });
      renderer = await loadRenderer();
    }

    stage = "Rendering";
    self.postMessage({ status: "Reading tune…" });
    const result = renderer(text, bpm, graceMs, sound, drone, sendScore);
    try {
      const [error, wav, timeline] = result.toJs();
      self.postMessage({ error, wav, timeline }, wav ? [wav.buffer] : []);
    } finally {
      result.destroy();
    }
  } catch (error) {
    self.postMessage({
      error: `${stage} error: ${error.message}`,
      resetWorker: stage === "Loading",
    });
  }
};
