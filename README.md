# BWW Player

Paste Bagpipe Music Writer (BWW) text into the [BWW Player](https://matthew-cheney.github.io/bww-player/).
The sheet music appears below the controls while the audio renders in the
background. Editing the text cancels any pending render and starts a new one.
When the **Play** button becomes available, click it to hear the tune.
The current note is highlighted in blue as the tune plays.
Drag the **Playback position** slider or use its arrow keys to skip around.
Use **Stop** to stop playback.
The status area shows progress and errors.

The player uses permissive parsing. If pybww can recover a playable tune,
playback proceeds and any parse warnings and errors stay visible below the
status.

Open **Playback options** to override the tune’s tempo, set the target grace
note duration, choose a sound, or add bass and tenor drones. The defaults are
the tune’s tempo (90 BPM if unspecified), 25 ms grace notes, chanter sound,
and drones off. Changing an option regenerates the audio.

The browser loads Pyodide 0.27.7 from jsDelivr and a pinned pybww wheel from
the site. Pasted text stays in the browser. A Web Worker uses pybww to parse the
tune and export ABC notation, then calls `pybww.audio.render_wav()` for the WAV
audio and note timeline. The page loads
abcjs 6.7.0 from jsDelivr to draw the notation as SVG.

## Run locally

From the repo root, run the static server with Python 3.

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory public
```

Open [localhost:8000](http://127.0.0.1:8000/).

## Update the pybww wheel

The bundled pybww `0.1.0+9ef4229` wheel was built from commit
`9ef4229dbdeb6ecf744022c1fd9f4fa12d123b8c`. The commit suffix is a local
version added to the build copy of `pyproject.toml` because the library
version was still `0.1.0`. Build a wheel from the library checkout and place
it in `public/vendor/`. These commands assume sibling checkouts and run
from the player repo root.

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
