# WhatWasThat

**A local-first, AI-powered screenshot archive**

WhatWasThat watches your clipboard and screenshot folder, automatically runs OCR on every capture, and uses an optional LLM to classify, tag, and title each image — so you can find anything you've ever seen.

All data stays on your machine.

---

## Features

| Feature | Details |
|---|---|
| **Automatic capture** | Win+Shift+S (clipboard), Win+PrtSc (Screenshots folder on Windows) |
| **OCR** | Powered by Tesseract; auto-detects language (TR, EN, DE, RU, AR, ZH, …) |
| **AI classification** | OpenAI-compatible APIs or local Ollama |
| **Import existing images** | Drag or pick any PNG/JPG — OCR + AI runs automatically |
| **Full-text search** | FTS5 index on title, description, OCR text, tags, and category |
| **Duplicate detection** | pHash-based image deduplication |
| **Sensitive content masking** | Redacts IBAN, credit cards, TC-ID, API keys, passwords |
| **Archive encryption** | AES-256-GCM + Argon2id password hashing |
| **Browser extension** | Save pages, images, and selections from Chrome/Firefox |
| **Export / Import** | `.wwt` archive format (ZIP bundle with metadata + image) |
| **Themes** | Dark, Light, Midnight, Forest |
| **i18n** | English + Turkish built-in; add more languages in one file |
| **Android** | Standalone app in `android-app/` (separate build) |

---

## Quick Start

### Requirements

| Tool | Version |
|---|---|
| Node.js | ≥ 18 |
| Rust (stable) | ≥ 1.70 |
| Tauri prerequisites | [tauri.app/start/prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites) |
| Tesseract OCR | Optional — enables text recognition |
| Ollama | Optional — enables local AI |

### Install & Run

```bash
# Clone
git clone https://github.com/ArdaCTK/WhatWasThat.git
cd whatwasthat

# Install JS dependencies
npm install

# Development build (hot-reload)
npm run tauri dev

# Production build
npm run tauri build
```

### Tesseract (optional)

```bash
# Windows: download installer from https://github.com/UB-Mannheim/tesseract/wiki
# macOS
brew install tesseract tesseract-lang
# Ubuntu / Debian
sudo apt install tesseract-ocr tesseract-ocr-tur tesseract-ocr-eng
```

### Ollama (optional, local AI)

```bash
# Install from https://ollama.com
ollama serve           # start the server
ollama pull llava      # multimodal model recommended for screenshots
```

Then in WhatWasThat Settings → AI → Provider: **Ollama**.

---

## Adding a New UI Language

All UI strings live in a single file:

```
src/i18n/translations.ts
```

To add Spanish, for example:

1. Open `translations.ts`.
2. Copy the `en` block, change the key to `'es'`.
3. Translate every value.
4. Open a pull request — it's that simple.

---

## Browser Extension

Load `whatwasthat-extension/` as an unpacked extension in Chrome/Edge (`chrome://extensions → Load unpacked`).

- Settings → Security → **API Token** — copy the token.
- Extension Options → paste the token.

---


## Project Structure

```
whatwasthat/
├── src/                    React + TypeScript frontend
│   ├── i18n/               translations.ts — all UI strings
│   ├── components/         Reusable UI components
│   ├── views/              Gallery, Stats
│   └── store/              Zustand state management
├── src-tauri/              Rust backend (Tauri)
│   └── src/
│       ├── main.rs         Entry point
│       ├── commands.rs     Tauri command handlers
│       ├── database.rs     SQLite (rusqlite)
│       ├── ocr.rs          Tesseract wrapper
│       ├── llm.rs          OpenAI / Ollama client
│       ├── crypto.rs       AES-GCM encryption
│       ├── clipboard.rs    Clipboard + screenshot folder monitor
│       ├── queue.rs        Async processing queue
│       └── masking.rs      Sensitive data redaction
└── whatwasthat-extension/  Browser extension (MV3)
```

---

## Contributing

Contributions are welcome! Please read the license terms below before contributing.

1. Fork the repository.
2. Create a branch: `git checkout -b feature/my-change`.
3. Commit your changes with clear messages.
4. Open a pull request against `main`.

By submitting a pull request you agree that your contribution will be licensed under the same terms as this project.

---

## License

WhatWasThat see [`LICENSE.md`](LICENSE.md).
