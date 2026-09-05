# Export formats

## JSON project

JSON is the editable project and simplest integration format. It contains:

- `version: 1`, project name, export timestamp, and `demo` provenance.
- A `coordinates` description: top-left origin, normalized units, X right, Y down.
- Scan/output settings, including straight-line optimization and tolerance.
- Ordered strips with stable ID, name, count, display color, RGB order and DMX patch.
- A fixed-length `points` array for every strip. Its **zero-based array index is the physical LED index**. An unmapped LED is `null`.
- Each non-null point: `{x, y, confidence, source}`. Sources are `scan`, `manual`, `demo`, or `interpolated`. Confidence is a detector heuristic, not a calibrated statistical probability. An inferred coordinate inherits the minimum probe confidence; it has not been independently observed.

Multiply X/Y by the desired composition dimensions to obtain composition coordinates. The camera uses its full native aspect ratio without mirroring or cropping; resizing the preview does not change coordinates. Composition width/height independently scale that normalized map. Photos and live frames are never embedded in JSON.

Unknown JSON fields are discarded during import. Strip patches, dimensions, limits and coordinates are validated before replacing the current project. Partial projects can be imported and continued.

## Resolume Arena Advanced Output XML

The exporter emits an `XmlState` → `ScreenSetup` → `screens` document with `CurrentCompositionTextureSize`. Each occupied Art-Net universe becomes a `DmxScreen` (Lumiverse), and every mapped LED becomes a `DmxSlice`. Every slice embeds a one-pixel `FixtureInstance`/`ParamFixturePixels` definition including RGB order and gamma. No external fixture library needs to be installed.

Input rectangles are centered on each normalized LED coordinate, scaled to composition dimensions and bounded to the composition. Sampling area is configurable. The output fixture is one RGB pixel. `Start Channel` uses the shared hardware address calculation, including whole-pixel universe spanning. Universe port-address `U` is encoded as subnet `floor(U / 16)` and universe `U % 16`, supporting 0–255. Net addressing above 255 is outside this release's supported range.

Missing LEDs are omitted from XML, but all remaining addresses are retained. Their absence does not compact or shift the patch. Inferred line positions are exported like measured positions; use JSON to preserve provenance. An incomplete/demo export is labeled in the app before download. TargetIP starts as `TT_DISABLED`: choose the real destination after inspecting the preset in Arena.

To import:

1. Open **Output → Advanced Output** in Resolume Arena.
2. Use the preset menu to load the XML file. Alternatively place it in the version's Documents/Resolume Arena/presets/screensetup directory and select the preset.
3. Review Input Selection and the per-pixel sampling rectangles.
4. In DMX Output, select the controller and verify each Lumiverse's subnet/universe.

Serialization was cross-checked against actual [Arena 7.22.9 preset structure](https://github.com/alv22/AOParser/blob/main/AOFiles/example.xml), and the [MA2-to-Resolume generator's embedded RGB fixtures](https://github.com/christhoms/ma2-plugins/blob/main/MA2%20Layout%20To%20Resolume/MA2%20Layout%20to%20Resolume%20Advanced%20Output.lua). These are schema references; StripR uses its own implementation. See also [Resolume's official DMX documentation](https://resolume.com/support/en/dmx).

The `versionInfo` records the Arena schema baseline used. A version marker is not proof of compatibility with every Arena version. Automated tests validate serialization, escaping, fixture counts, unique IDs and address boundaries. Import into the proprietary application and physical output remain equipment acceptance checks.
