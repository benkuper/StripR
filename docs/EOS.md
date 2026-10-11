# ETC Eos integration

## Pixel Map CSV export

StripR can export camera-mapped coordinates in Eos's documented Pixel Map CSV block format. In Eos, copy the CSV to a USB drive, then use **Browser → File → Import → CSV** and enable **Pixel Maps**. ETC documentation: https://support.etcconnect.com/ETC/Consoles/Eos_Family/Software_and_Programming/CSV_Importing_and_Exporting_for_Pixel_Maps

The export uses the `CHANNEL` column. **Those numbers must refer to channels already patched in your Eos show in the same physical LED order as the StripR strips.** StripR's DMX universe/address fields are not Eos channel numbers, so they are deliberately not substituted. Unmapped pixels are omitted from the coordinate rows, but their channel numbers remain reserved so later LEDs do not shift.

Each point is scaled into a 1-based integer grid while preserving the layout's aspect ratio. StripR uses a top-left origin, with X increasing right and Y increasing down, matching the Eos online help coordinate description. Verify a small test map in your installed Eos version before importing a large show.

## OSC

ETC Eos supports OSC commands beginning with `/eos/`, including `/eos/ping` for connection testing and `/eos/pixmap=<number>` to select an existing Pixel Map. OSC selection does not itself create or populate a Pixel Map; use the CSV import for layout data. See ETC OSC documentation: https://www.etcconnect.com/webdocs/Controls/EosFamilyOnlineHelp/en/Content/22_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Eos_Control.htm
