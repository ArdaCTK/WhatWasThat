# Contributing to WhatWasThat

Thank you for your interest in contributing!

## Before you start

Read [`docs/LICENSE.md`](docs/LICENSE.md). By submitting a pull request you agree
your contribution will be licensed under the same terms.

## Setup

```bash
# Prerequisites
# - Node.js ≥ 18
# - Rust stable (rustup)
# - Tauri prerequisites: https://tauri.app/v1/guides/getting-started/prerequisites
# - Tesseract OCR (optional, enables OCR)
# - Ollama (optional, enables local AI)

git clone https://github.com/ArdaCTK/WhatWasThat.git
cd WhatWasThat
npm install
npm run tauri dev      # hot-reload dev build
```

## Running tests

```bash
# Rust backend tests
cd src-tauri && cargo test

# TypeScript type check
npx tsc --noEmit
```

## Adding a UI language

All strings live in one file: `src/i18n/translations.ts`.

1. Copy the `en` block, change the key to your ISO 639-1 code (e.g. `'es'`).
2. Translate every value.
3. Add your language to the `<select>` in `src/components/SettingsPanel.tsx`.
4. Open a PR — that's it.

## Coding conventions

- **Rust**: `cargo fmt` and `cargo clippy` before committing.
- **TypeScript**: all UI strings must go through `getLangMap()` — no hardcoded
  text in component files.
- **New Tauri commands**: add to `invoke_handler!` in `main.rs` and expose in
  `commands.rs`.
- Keep PRs focused — one logical change per PR makes review faster.

## Reporting issues

Open a GitHub Issue with:
- WhatWasThat version (visible in Settings → Storage area → version badge)
- OS + version
- Steps to reproduce
- What you expected vs. what happened

Sensitive security issues → contact the maintainer privately via the repository
contact before opening a public issue.
