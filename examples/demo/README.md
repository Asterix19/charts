# Stacklatte Charts — Expo Demo

![Demo](./assets/gifs/demo.gif)


Interactive Expo demo app showcasing `@stacklatte/chart-core`.

Features demonstrated:
- Candlestick and line chart modes
- Dark and light themes
- SMA, EMA, and Bollinger Bands overlays
- RSI and MACD sub-panels
- OHLC HUD with crosshair
- Pinch-zoom and pan gestures
- Live streaming candle data
- 12h / 24h time axis toggle

---

## Running locally

```sh
# From the monorepo root
npm install

cd examples/demo
npx expo start
```

Open in:
- **iOS Simulator** — press `i`
- **Android Emulator** — press `a`
- **Web browser** — press `w`
- **Expo Go** — scan the QR code

---

## Requirements

- Node 18+
- Expo CLI (`npm install -g expo-cli`)
- For iOS: Xcode + iOS Simulator
- For Android: Android Studio + emulator
