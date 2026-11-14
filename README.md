# BWW Player

Paste Bagpipe Music Writer (BWW) text into the [BWW Player](https://matthew-cheney.github.io/bww-player/)
and click **Play**. Use **Stop** to cancel rendering or stop playback. The
status area shows progress and errors.

Open **Playback options** to override the tune’s tempo, set the target grace
note duration, choose a sound, or add bass and tenor drones. The defaults are
the tune’s tempo (90 BPM if unspecified), 25 ms grace notes, chanter sound,
and drones off. Changes apply the next time you press **Play**.

The browser loads Pyodide 0.27.7 from jsDelivr and a pinned pybww wheel from
the site. Pasted text stays in the browser. pybww handles parsing, timing,
embellishments, and WAV synthesis in a Web Worker.

## Run locally

From the repo root, run the static server with Python 3.

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory public
```

Open [localhost:8000](http://127.0.0.1:8000/).

## Update the pybww wheel

The bundled pybww 0.1.0 wheel was built from commit
`038dad39f5ae069b0c33f172004499e5908a2bd5`. Build a wheel from the library
checkout and place it in `public/vendor/`. These commands assume sibling
checkouts and run from the player repo root.

```powershell
python -m pip install build
python -m build --wheel --outdir public/vendor ../pybww
```

Use a new pybww version for changed wheel contents so browsers get a new
asset URL. Update `WHEEL` in `public/render-worker.js` and the version and
source commit above. Remove the superseded wheel and commit the new wheel
with the updated reference. PyPI publishing is optional.

## GitHub Pages

Set the publishing source to **GitHub Actions** in **Settings → Pages**.
The workflow in `.github/workflows/static.yml` publishes the contents of
`public/` on pushes to `main`.
