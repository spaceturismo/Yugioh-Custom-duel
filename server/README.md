# Local multiplayer server

This is the first server-side prototype for Custom Duel. It serves the existing static app, exposes a health check, and provides an authoritative in-memory WebSocket room with two players.

## Run locally

From the repository root:

```powershell
npm install
npm run server:dev
```

Open `http://localhost:8787/` for the static app on the host computer. For another device on the same Wi-Fi network, open the LAN URL printed by the server, such as `http://192.168.1.158:8792/`. Do not use `localhost` on the second device.

If the app is hosted somewhere else, pass the server endpoint in the URL:

```text
https://your-pages-site.example/duel.html?server=192.168.1.158:8792
```

The server endpoints are:

- `GET /health`
- `WebSocket /ws`

The initial protocol is intentionally small:

```json
{"type":"create_room"}
{"type":"join_room","roomId":"ABC123"}
{"type":"start_game"}
{"type":"draw"}
{"type":"end_turn"}
```

The server owns room membership, turn order, deck counts, hand counts, and life points. Matches are currently held in memory and are discarded when every client disconnects. The existing duel UI is not connected to this protocol yet; that is the next integration slice.

Deck limits default to a 60-card Main Deck and a 15-card Extra Deck. Tournament deployments can override them with positive integer environment variables:

```powershell
$env:MAIN_DECK_MAX = "45"
$env:EXTRA_DECK_MAX = "8"
```

Custom cards use the same card-record and deck-limit validation as built-in cards.

## Source layout

- `src/domain.ts` contains the shared room state shape and server-validated game actions.
- `src/rooms.ts` owns room creation, membership, and disconnect cleanup.
- `src/static-server.ts` serves the existing static app.
- `src/server.ts` wires HTTP and WebSocket transport to those modules.

## Validate

```powershell
npm run server:typecheck
npm run server:build
Invoke-WebRequest http://localhost:8787/health
```