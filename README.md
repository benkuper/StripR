# StripR

A camera-based LED pixel scanner and mapper. A focused dark workspace, designed for desktop and mobile. The entire mapper runs in your browser, with no account, cloud processing, frontend dependencies, or build step.

**[Open StripR](https://benkuper.github.io/StripR/)** · [Bridge API](docs/API.md) · [Export formats](docs/EXPORTS.md)

## Simple projects stay simple

1. Enter **strips × LEDs each**, then choose **Set**. For mixed lengths, use **Add strips** or edit individual strips.
2. Enable your camera. Connect your local bridge with its address and token.
3. Start scanning. Keep the camera fixed, and the whole setup visible.
4. Review the map and export JSON or Resolume Advanced Output XML.

**Smart straight strips are enabled by default.** For strips with at least 12 LEDs, StripR checks the first, last, quarter, middle and three-quarter LEDs. If all five detections are confident and match a straight, evenly spaced line, the remaining coordinates are interpolated. A 60-LED straight strip needs only five measurements. Curved, uneven, ambiguous or partially invisible probe layouts fall back to scanning every LED, reusing the probes already captured.

Interpolated points are explicitly labeled in the inspector, overview and JSON. Five probes cannot detect every possible bend, obstruction or failed LED between them. Inspect the result; turn off **Detect straight, evenly spaced strips** in Advanced mode when every LED needs an independent measurement. Strong perspective distortion can prevent the fast path, in which case the full scan preserves the real positions.

Simple mode exposes camera, connection, strip counts and brightness. Advanced mode adds patch editing, RGB channel order, light/dark delays, threshold, blob-size limits, frame averaging, scan color and straight-line tolerance. Export settings expose composition dimensions, pixel sampling area and fixture gamma.

Other working features:

- Rear-camera preference and camera switching; inline mobile video.
- Dark-frame subtraction and connected-component detection; ambiguous reflections remain unmapped.
- Pause, resume, stop, missing-only scans, and automatic stop when the page is hidden.
- Per-pixel inspector, click/touch placement, drag corrections and hardware identification.
- Reference-photo manual mapping and an explicitly labeled simulated demo.
- Device-local autosave, JSON import/export, and embedded RGB fixtures in Resolume XML.
- No photos, camera frames or bridge tokens in exported projects or autosave.

## Run the local LED bridge

Install **Node.js 22 or newer**, download/clone this repository, then run:

```sh
node bridge/server.mjs --target 192.168.1.50
```

Replace `192.168.1.50` with the **Art-Net controller's** IP address. The bridge uses unicast UDP on port 6454, refreshes configured universes at 30 fps, and lights only one pixel at a time. Your controller must accept ArtDMX and have its physical outputs patched to the same universes/channels as StripR. The reference adapter covers RGB strips and six RGB channel orders, Art-Net port-addresses 0–255, up to 128 strips and 10,000 total LEDs. It does not configure the controller itself.

On the same computer use `http://localhost:8787`. On a phone, use the **bridge computer's LAN IP**, for example `https://192.168.1.20:8787`; `localhost` on the phone points to the phone itself. Token authentication is disabled by default, so leave the token field empty.

No npm installation is needed. To test the API without hardware:

```sh
node bridge/server.mjs --demo
```

That also serves the app at `http://localhost:8787`. A demo bridge does not produce camera-visible light: use **Explore a demo setup** in the interface for simulated scans.

The bridge accepts the Pages origin `https://benkuper.github.io` and its loopback app origin by default. For another frontend origin, add it explicitly:

```sh
node bridge/server.mjs --target 192.168.1.50 --origin https://your-site.example
```

Run `node bridge/server.mjs --help` for listen address, port and TLS options. Set `STRIPR_TOKEN` to opt into token authentication; when configured, it is checked on every API endpoint and is never saved by the frontend. Exact-origin CORS remains enforced with or without a token. The bridge clears its outputs after **10 seconds** without a successful pixel command, and on normal shutdown. UDP acknowledgment only confirms sending; camera detection verifies the physical light.

## Smartphone camera and HTTPS

Open the public HTTPS Pages site in your phone's regular browser and grant camera permission. Camera capture requires a secure context. Keep your phone and bridge on the same LAN; allow the bridge port through the computer's firewall.

HTTPS-to-HTTP LAN requests are browser-dependent. Chromium may request Local Network Access permission; this is not a universal exemption from mixed-content rules. For iPhone/iPad and browsers that block plain HTTP bridges, use **trusted HTTPS on the bridge**. CORS headers alone cannot fix mixed content or certificate errors. Do not disable browser security.

One option is a locally trusted certificate from [mkcert](https://github.com/FiloSottile/mkcert). Install mkcert using its platform instructions. Substitute the bridge computer's actual LAN IP below:

```sh
mkcert -install
mkcert -cert-file cert.pem -key-file key.pem localhost 127.0.0.1 192.168.1.20
node bridge/server.mjs --target 192.168.1.50 --cert cert.pem --key key.pem
```

The phone also needs to trust the issuing CA. `mkcert -CAROOT` prints the folder containing `rootCA.pem`. On your own iPhone/iPad, transfer that **certificate**, install the profile, and enable its full trust in Settings as described in [mkcert's mobile instructions](https://github.com/FiloSottile/mkcert#mobile-devices). Never transfer `rootCA-key.pem` or commit private keys. Then enter `https://192.168.1.20:8787` and the token in StripR. Visit that HTTPS origin directly to check certificate trust if connection fails. A trusted certificate for your own local hostname is another option.

To serve the app itself from a LAN HTTPS bridge origin, also allow that exact origin with `--origin https://192.168.1.20:8787`. The GitHub Pages frontend needs no such additional origin.

## GitHub Pages

The included workflow checks the app and runs tests, then publishes only `dist/`. All asset links are relative, so `/StripR/` works without a bundler base-path setting. The local bridge is never deployed to Pages; GitHub Pages cannot access UDP hardware or run a Node server.

First-time repository setup:

1. Open **Settings → Pages** and choose **GitHub Actions** as the source.
2. Open **Actions → Test and deploy StripR**, then **Run workflow** (or rerun the deployment if a first attempt happened before Pages was enabled).
3. The deployment's environment URL is the live site, normally `https://benkuper.github.io/StripR/`.

GitHub's normal workflow token cannot enable Pages for a new repository; the source setting must be enabled once by a repository administrator. See [GitHub's Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Development and validation

```sh
npm run check
npm test
npm start
```

The first two commands check JavaScript syntax, imports, assets and DOM IDs, then test the real HTTP bridge, authentication/CORS, blackout watchdog, ArtDMX encoding, detection, line fitting, patch boundaries, and export data. `npm start` serves the app with a demo bridge. Source files are authored directly in `dist/`; it is tracked and must not be deleted as disposable build output.

```
dist/                 Browser app (static, no dependencies)
  modules/            Model, detection, line fitting, camera, API client, XML
bridge/server.mjs     Node HTTP(S) server + Art-Net adapter
scripts/check.mjs     Static validation
tests/               Automated core and bridge tests
docs/                API and export contracts
```

Real camera/hardware capture and import into the proprietary Resolume application require acceptance testing on your equipment. XML serialization follows actual Arena 7 presets, but XML syntax/structure validation is not the same as a confirmed application import. Review the map and DMX patch before enabling show output.

## References

- [Resolume DMX output and Lumiverses](https://resolume.com/support/en/dmx)
- [Art-Net protocol](https://art-net.org.uk/downloads/art-net.pdf)
- [Camera API and secure contexts](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access)

## License

GPL-3.0-only. The repository's original [LICENSE](LICENSE) is preserved.
