# CT Atlas

Interactive anatomy reference website with **15 series and 1,509 recorded views**. Includes the existing viewer, recorded images, clickable anatomy anchors, segment highlighting where supported by recorded color overlays, zoom/pan, simulated contrast presets, and anatomy descriptions.

The redesigned home page includes an animated background, an interactive anatomy SVG, and MRI / additional CT studies marked Coming soon. MRI content is not included yet. The home page includes a clickable regional anatomy map. Open `viewer.html` to go directly to the viewer. Existing links with a series query still open their selected study.

## Run locally

1. Install Node.js 20 or newer if needed.
2. Open a terminal in this folder (containing `package.json`).
3. Run `npm start`.
4. Open **http://127.0.0.1:8767/** and keep the terminal open while using the viewer.

There are **no npm dependencies to install** and no build step. Serve the website through HTTP instead of double-clicking `index.html`. If Python is installed, an alternative is `python -m http.server 8767 --bind 127.0.0.1` in this folder.

If port 8767 is busy, in PowerShell use `$env:PORT=8768; npm start`, then visit http://127.0.0.1:8768/.

## Upload to GitHub and publish

1. Extract the ZIP. Upload the **extracted contents**, not the ZIP itself.
2. Use GitHub Desktop to create a repository in this extracted folder, commit the files, and publish it. Use GitHub Desktop or Git for this large image collection.
3. For GitHub Pages on a free account, use a public repository. Ensure `index.html` is at the repository root.
4. On GitHub open **Settings > Pages > Build and deployment**. Choose **Deploy from a branch**, select **main** and **/(root)**, then **Save**.
5. Wait for deployment and open the website address shown in Pages settings.

Keep `.nojekyll` in the root. All website assets use relative paths, including repository subpaths. No API key, backend or build process is required. Do not convert the runtime images into Git LFS pointers: Pages needs actual files. Hosting limits apply; see the official links below. This package has not been uploaded or published for you.

## Included views

Counts describe available recorded views, not recovery of every original scan slice.

| Series | Recorded views |
| --- | ---: |
| CT Abdomen/pelvis - Axial | 175 |
| CT Head · Axial | 51 |
| CT Head · Axial Bone Standard | 50 |
| Cardiac CT · Axial | 156 |
| CT Chest · Lung Axial | 124 |
| CT Chest · Axial CE | 124 |
| Cardiac CT · Sagittal | 100 |
| CT Head · Brain Coronal | 61 |
| CT Head · Bone Sagittal | 29 |
| Cardiac CT · Coronal | 101 |
| CT Head · Brain Sagittal | 49 |
| CT Chest · Sagittal | 141 |
| CT Abdomen/pelvis · Sagittal | 148 |
| CT Abdomen/pelvis · Coronal | 91 |
| CT Chest · Coronal | 109 |

Original displayed counters remain in the view data independently of array order. Cardiac axial omits source counters 2, 77, 132 and 160. The nine additional multiplanar series contain 568 verified package views and 261 candidate captures with brief or ambiguous source visibility. This release preserves that existing collection and does not resolve those uncertainties. Repeated blank abdomen coronal end views are represented by the existing grouped blank view.

## Controls

- Choose a study; scroll or use arrow keys to browse.
- Use Home/End for the first/last recorded view.
- Use +, minus, and Fit to zoom/reset; drag to pan.
- Click an anatomy label or endpoint to select its anchor; Escape clears selection.
- Hover/select supported colored segments to highlight their recorded region.
- Open Contrast or choose a window preset.
- Use About anatomy on a selected label to open its description.

## Files and editing

- `index.html`, `landing.css`: landing page and styling.
- `viewer.html`, `style.css`, `app.js`: CT viewer page, styling and logic.
- `reference-interaction.js`: selection and segment highlighting.
- `*-data.js`, `data.js`: series, order, image paths and annotations.
- `*-window-masks.js`, `window-masks.js`: recorded annotation layers used during contrast changes.
- `frames/`, `head/`, `cardiac/`, `chest/`, `multiplanar/`: 1,509 PNG images.
- `anatomy-topics.js`, `anatomy-descriptions.js`: topic lookup and description retrieval.
- `scripts/`: dependency-free local server and package verification.
- `asset-manifest.json`: release file sizes and SHA-256 hashes.

Edit the supplied HTML/CSS/JavaScript directly. Historical extraction scripts, temporary reviews, unused captures and original recordings are excluded. Four local screenshot provenance paths were reduced to filenames; packaged PNG bytes are identical to the current viewer's images.

To add a series, prepare images and evidence-based annotations, register it using the existing series structure in `app.js`, and supply corresponding mask/cleanup data. Check each view's counter, geometry, endpoints and window baseline. Do not invent missing anatomy or copy endpoints between unrelated slices.

## Validation

Run `npm run check` to verify release hashes, image references, counts and HTML dependencies. Hashes detect edits as well as corruption; update the manifest when preparing an edited release. Package verification does not certify anatomical correctness.

## Network and limitations

The scan viewer runs locally without an API key. Google Fonts loads Michroma, DM Sans and Manrope online, with a fallback font if unavailable. Anatomy descriptions use Wikipedia's public summary endpoint and require internet on a first lookup. Topic names are sent to Wikipedia, not scan images. Availability and rate limits are outside this project's control. Existing browser preferences/cache use local storage.

These are images recovered from recordings/screenshots, not diagnostic DICOM data. Compression, captured annotations, omitted slices and uncertain evidence remain. Window controls simulate changes to recorded pixels and cannot recover clipped detail. Segment highlights follow available recorded overlays, not inferred anatomical segmentation. Labels and anchors have not all been independently medically validated.

See [ATTRIBUTION.md](ATTRIBUTION.md) for sources and rights.

## GitHub documentation

- [Configure Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Large files on GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
