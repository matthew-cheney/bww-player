const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
const WHEEL = "vendor/pybww-0.1.0-py3-none-any.whl";

let renderer;

async function loadRenderer() {
  importScripts(PYODIDE_URL + "pyodide.js");
  const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
  await pyodide.loadPackage(new URL(WHEEL, self.location.href).href);
  pyodide.runPython(`
from pybww import ParseError, Tune, parse_text

if not callable(getattr(Tune, "to_wav", None)):
    raise RuntimeError("The pybww wheel must provide Tune.to_wav().")

def render_bww(text):
    try:
        result = parse_text(text, strict=True)
    except ParseError as error:
        messages = [item.message for item in error.diagnostics if item.severity == "error"]
        return "Parse error: " + " ".join(messages)

    if result.tune is None:
        return "Parse error: No playable tune was found."

    try:
        return result.tune.to_wav()
    except Exception as error:
        return f"Rendering error: {error}"
`);
  return pyodide.globals.get("render_bww");
}

self.onmessage = async ({ data: text }) => {
  let stage = "Loading";
  try {
    if (!renderer) {
      self.postMessage({ status: "Loading Pyodide and pybww…" });
      renderer = await loadRenderer();
    }

    stage = "Rendering";
    self.postMessage({ status: "Rendering tune…" });
    const result = renderer(text);
    if (typeof result === "string") {
      self.postMessage({ error: result });
      return;
    }

    try {
      const wav = result.toJs();
      self.postMessage({ wav }, [wav.buffer]);
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
