# StripR bridge API · v1

This deliberately small API lets a browser control a local LED output implementation. The included Node server supports Art-Net. Another implementation can use a microcontroller, serial output or a different LED library while keeping the same HTTP contract.

## Transport

- Base URL: user-selected HTTP(S) origin, optionally with a path prefix.
- Requests/responses: JSON; return a 2xx response containing `{"ok":true}` only **after applying** the command. The browser starts its configured settling delay after acknowledgment.
- Errors: non-2xx JSON, `{"ok":false,"error":"Human-readable explanation"}`.
- Token: `Authorization: Bearer TOKEN` on all API calls. Keep the token out of URLs and logs.
- Respond to CORS preflight with an exact allowed `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization`, and `Vary: Origin`. The reference bridge additionally includes `Access-Control-Allow-Private-Network: true` for older PNA clients.
- CORS must be applied to failures as well as successes for an allowed origin. Reject unapproved browser origins. The canonical Pages origin is `https://benkuper.github.io` (an origin has no `/StripR/` path).
- Serve trusted HTTPS for browsers that require it. Modern Chromium local-network permission and legacy PNA are separate from ordinary CORS.
- Process commands sequentially. A delayed light command must never overtake its following blackout. Implement a watchdog that blacks out within 10 seconds of a lost client.

## GET /api/health

```json
{"ok":true,"protocol":"stripr/1","name":"My LED bridge","adapter":"artnet","watchdogMs":10000}
```

`protocol` is required. `name`, `adapter` and `watchdogMs` describe the server. This must identify a compatible server, not merely return a generic HTML health page.

## POST /api/configure

```json
{
  "strips":[
    {"id":"strip-a","count":60,"universe":0,"channel":1,"order":"rgb"},
    {"id":"strip-b","count":120,"universe":1,"channel":1,"order":"grb"}
  ]
}
```

Replace the current strip configuration and black out both old and new configured outputs. `id` is a stable string. Physical LED indices are **zero-based**. Art-Net universe/port-address is **zero-based**; DMX channel is **one-based**. The reference bridge validates overlapping channels, IDs, RGB orders, integer values and resource limits before configuring anything.

An RGB triplet never crosses a universe boundary. A strip beginning on channel 1 fits 170 LEDs (channels 1–510), skips 511–512, then resumes at channel 1 in the next universe. An unusual start channel fills as many whole RGB pixels as fit, then likewise resumes at channel 1. The shared `pixelAddress()` function in `dist/modules/model.js` is the canonical patch rule for both bridge and exports.

A custom bridge may ignore Art-Net fields if it maps `id` to another physical output, but it must honor `count`, `id`, and pixel exclusivity. Document any different hardware addressing clearly.

## POST /api/pixel

```json
{"strip":"strip-a","index":17,"rgb":[160,160,160]}
```

**Black out every other configured pixel, then illuminate only this LED.** `rgb` always represents red, green and blue, independent of hardware channel order. Each value is an integer from 0 through 255. Apply the configured channel order at the output adapter.

An index may arrive out of order: smart scanning probes endpoints and interior points before scanning the remaining LEDs. Do not assume monotonically increasing indices.

## POST /api/blackout

```json
{}
```

Clear every configured output. This is idempotent. It is used for each dark baseline, after every measurement, on stop/error, and for manual blackout. Honor it even if the browser's preceding light request timed out. The reference bridge also refreshes black frames over Art-Net so a lost UDP packet can be corrected.

## Scan timing

For an individual measurement the client sends blackout, waits `darkDelay`, captures fresh averaged dark frames, sends pixel, waits `delay`, captures fresh averaged lit frames, sends blackout, then detects a centroid in the difference image. It does not upload frames to the bridge. Pending waits and frame callbacks are cancelable. When stopping, the client makes a new blackout request independent of the canceled request signal.

Frame processing uses a maximum width of 640 pixels. Threshold and component-area settings refer to this analysis resolution. Camera movement, automatic exposure changes, tiny/faint LEDs and reflections can affect detection. Missing results stay `null`; they never shift subsequent LED indices.

The Art-Net adapter acknowledges UDP sends, not controller receipt. Actual physical illumination still needs to be verified by the camera. The reference bridge's watchdog is the fallback for lost tabs or failed blackout requests.
