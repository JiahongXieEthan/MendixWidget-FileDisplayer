## FileDisplayer

Mendix pluggable widget for displaying images and PDFs with enhanced review tooling. The widget offers zoom, rotate and drag interactions, download support for all file types and optional protective color shifting for internal style guides.

## Highlights

- **Multi-format support**: Preview common image formats and PDFs inline, fall back to download behavior for other files.
- **Viewer controls**: Zoom in/out, reset, rotate (images only) and drag to inspect high-resolution artwork.
- **Configurable color temperature shift**: Apply a 0-100% adjustment to obfuscate brand colors so competitors cannot easily copy proprietary palettes.
- **Annotation toolkit**: Toggle a pen or arrow, adjust stroke size and color, undo strokes, and hook into your own microflow to persist annotated assets if needed.
- **Responsive layout**: Toolbar and canvas adapt gracefully from desktop to mobile breakpoints.

## Usage

1. Import the `FileDisplayer` widget into your Mendix project (use the generated MPK from `dist/<version>/labull.FileDisplayer.mpk`).
2. Provide the `File` property with a Mendix `FileDocument` dynamic value.
3. Optionally set **Color temperature shift** to a value between 0 and 100. Higher values apply stronger hue/sepia adjustments to deter color sampling.
4. When reviewing images, enable the desired annotation tool (pen or arrow), adjust the color picker and stroke size, add notes directly on the preview, undo when needed, and trigger your own microflow if the annotated output must be stored (annotation is currently available for image files).
5. Place the widget in any page layout; the responsive container will expand to the available space.

## Demo Project

Create a page with a data view returning a `FileDocument`, drop in the widget and bind the `File` property. Adjust the color shift slider in Studio Pro to validate the protective filter effect.

## Issues & Feature Requests

Please open an issue in this repository with reproduction steps or enhancement ideas. Contributions and suggestions are welcome.

## Development & Contribution

1. Install dependencies with `npm install`. If you are on npm v7+, run `npm install --legacy-peer-deps` to avoid peer resolution issues.
2. Use `npm start` for live development; the tooling recompiles the widget and pushes it into the Mendix test project on each save.
3. Run `npm run build:prod` for production bundles or `npm run release` to generate MPK packages under `dist`.
4. Submit pull requests following conventional commit messages and include relevant tests or screenshots when applicable.
