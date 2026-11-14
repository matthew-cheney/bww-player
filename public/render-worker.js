const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
const WHEEL = "vendor/pybww-0.1.0-py3-none-any.whl";

let renderer;

async function loadRenderer() {
  importScripts(PYODIDE_URL + "pyodide.js");
  const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
  await pyodide.loadPackage(new URL(WHEEL, self.location.href).href);
  pyodide.runPython(`
from pybww import Tune, parse_text

if not callable(getattr(Tune, "to_wav", None)):
    raise RuntimeError("The pybww wheel must provide Tune.to_wav().")

def render_bww(text, bpm, grace_ms, sound, drone):
    result = parse_text(text, strict=False)
    diagnostics = [(item.severity, item.message) for item in result.diagnostics]

    if result.tune is None:
        return diagnostics, "Parse error: No playable tune was found.", None

    try:
        wav = result.tune.to_wav(bpm=bpm, grace_ms=grace_ms, sound=sound, drone=drone)
    except Exception as error:
        return diagnostics, f"Rendering error: {error}", None
    return diagnostics, None, wav
`);
  return pyodide.globals.get("render_bww");
}

self.onmessage = async ({ data: { text, bpm, graceMs, sound, drone } }) => {
  let stage = "Loading";
  try {
    if (!renderer) {
      self.postMessage({ status: "Loading Pyodide and pybww…" });
      renderer = await loadRenderer();
    }

    stage = "Rendering";
    self.postMessage({ status: "Rendering tune…" });
    const result = renderer(text, bpm, graceMs, sound, drone);
    try {
      const [diagnostics, error, wav] = result.toJs();
      self.postMessage({ diagnostics, error, wav }, wav ? [wav.buffer] : []);
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
