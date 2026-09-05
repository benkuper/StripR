# StripR bridge API · v1

This deliberately small API lets a browser control a local LED output implementation. The included Node server supports Art-Net. Another implementation can use a microcontroller, serial output or a different LED library while keeping the same HTTP contract.

## Transport

- Base URL: user-selected HTTP(S) origin, optionally with a path prefix.
- Requests/responses: JSON; return a 2xx response containing `{"ok":true}` only **after applying** the command. The browser starts its configured settling delay after acknowledgment.
- Errors: non-2xx JSON, `{"ok":false,"error":"Human-readable explanation"}`.
- Token: optional. When the bridge is configured with `STRIPR_TOKEN`, send `Authorization: Bearer TOKEN` on all API calls. Keep the token out of URLs and logs. The reference bridge does not require authentication by default.
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
    {"id":"strip-a","count":60,"type":"rgb","universe":0,"channel":1,"universePolicy":"led","order":"rgb"},
    {"id":"strip-b","count":120,"type":"rgba","universe":1,"channel":1,"universePolicy":"channel","order":"grb"}
  ]
}
```

Replace the current strip configuration and black out both old and new configured outputs. `id` is a stable string. Physical LED indices are **zero-based**. Art-Net universe/port-address is **zero-based**; DMX address (`channel`) is **one-based**, from 1 to 512. `type` is `rgb` (3 channels per LED) or `rgba` (4 channels per LED). `order` controls the first three color channels; RGBA always places alpha last. The reference bridge drives alpha at 255 while identifying an RGBA LED. The optional fields `type` and `universePolicy` default to `rgb` and `led` for compatibility with earlier v1 clients.

With the default `universePolicy: "led"`, an LED never crosses a universe boundary. A strip beginning at address 1 fits 170 RGB LEDs (addresses 1–510) or 128 RGBA LEDs (addresses 1–512), then resumes with the next LED at address 1 in the next universe. An unusual first address fits as many whole LEDs as possible and skips unused tail channels. `universePolicy: "channel"` instead continues immediately into the next universe and may split one LED across the boundary. The shared `pixelAddress()` and `pixelChannels()` functions in `dist/modules/model.js` are the canonical patch rules.

A custom bridge may ignore Art-Net fields if it maps `id` to another physical output, but it must honor `count`, `id`, and pixel exclusivity. Document any different hardware addressing clearly.

## POST /api/pixel

```json
{"strip":"strip-a","index":17,"rgb":[160,160,160]}
```

**Black out every other configured pixel, then illuminate only this LED.** `rgb` always represents red, green and blue, independent of hardware channel order or strip type. Each value is an integer from 0 through 255. Apply the configured channel order at the output adapter; for RGBA, append a full alpha value.

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
