# DRO Phone Control — TURN / ICE Recovery

The Phone Control WebRTC path now supports STUN + TURN, browser/native ICE restart, and peer reconnect.

## Render environment variables

Set these on the FLI Render web service:

- `DRO_TURN_URLS` — comma-separated TURN URLs, for example `turn:turn.example.com:3478,turns:turn.example.com:5349`
- `DRO_TURN_USERNAME` — TURN username
- `DRO_TURN_CREDENTIAL` — TURN credential

The backend only returns TURN configuration to an authenticated web user or a trusted Android device token.

## TURN server

Use a real public TURN server. Coturn supports UDP/TCP on 3478 and TLS/DTLS on 5349. Keep the relay UDP port range open on the TURN host.

Do not put TURN credentials in source control.

## Recovery behavior

Browser:
1. Uses TURN + STUN from the authenticated ICE config endpoint.
2. Detects ICE `failed` / `disconnected`.
3. Calls `restartIce()` and sends a new SDP offer.
4. Retries peer creation after repeated failures.

Android:
1. Loads the same ICE server configuration with its device bearer token.
2. Detects native ICE failure/disconnect.
3. Calls native `restartIce()`, creates a new offer, and answers browser restart offers.
4. After repeated restart failures, tears down and recreates the peer/capture pipeline.

ICE restart is preferred over an immediate full reset because the WebRTC specification explicitly supports restarting ICE after a failed connection.