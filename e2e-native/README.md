# Native end-to-end tests (Maestro)

Drives the real `examples/demo` Expo app (which renders `@stacklatte/chart-native` with Skia) on an iOS simulator.

```sh
# one-time: build and install the dev client on a booted simulator
cd examples/demo && npx expo run:ios --no-bundler

# in one terminal: serve the JS bundle
cd examples/demo && npx expo start --dev-client --port 8081

# in another: run the flows (from the repo root)
npm run test:native
```

Requires [Maestro](https://maestro.mobile.dev) (`brew install maestro`). Screenshots land in `e2e-native/screenshots/`.
