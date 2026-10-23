# NexaChat AI 🧞💬

**Apna khud ka LLM chatbot** — OpenRouter API se. Aapki key, aapka device, aapke chats.
100% client-side (koi backend nahi) · zero npm runtime deps · streaming replies · PWA + Android APK.

## ✨ Features
- 🚀 **Streaming replies** (SSE) — jawab type hote hote aata hai, `⏹` se rok sakte ho
- 🧠 **Live model picker** — OpenRouter se `:free` models pehle (fallback list built-in)
- 🧪 **Key tester** — key valid hai + kitna credit bacha, app me hi dekho
- 💬 **Multi-chat** — sidebar me list, auto-title (pehle sawal se), delete
- 📋 **Courier-level UX** — copy per message, regenerate, edit-and-resend, welcome prompt chips
- 📝 **Markdown** — code blocks (with lang label), bold/italic, lists, links, blockquotes
- 🎭 **Personality presets** — Default / Hinglish Bhai / Tech Expert / Kahani Dost / Habit Dost
- 🌡️ Temperature slider (0–2) + custom system prompt
- 📴 **PWA** — install karo, offline bhi khulta hai (chat ke liye net chahiye)
- 🔒 **Privacy**: key + history sirf `localStorage` me; API calls sirf `openrouter.ai`
- 🤖 APK/AAB **GitHub Actions** se auto-build + GitHub Pages deploy

## 🔔 Sabse pehle: OpenRouter key
1. [openrouter.ai/keys](https://openrouter.ai/keys) → **Create Key** → `sk-or-v1-…` copy
2. App kholo → ⚙️ Settings → key paste → **🧪 Test** → 'Remaining credit' dikhega ✓
3. Save. Bas — chat shuru (100% free `:free` models par ₹0 usage!)

## 🚀 Web (turant khelo)
```bash
cd nexachat
npx serve .        # YA sirf index.html browser me kholo
```

## 🤖 Android APK (GitHub Actions)
Repo GitHub pe push karo (`main`) → **Actions** → *Build NexaChat Android APK & AAB* →
Artifacts me **NexaChat-Android-APK** → phone me install.

## 🌐 Web hosting (GitHub Pages)
Push → *Deploy NexaChat to GitHub Pages* workflow khud `www/` deploy kar deta hai.
HTTPS pe PWA install + service-worker offline shell chalega.

## 📁 Structure
```
nexachat/
├── index.html                  # UI shell + settings modal
├── css/style.css               # dark cyber theme (purple→cyan)
├── js/api.js                   # OpenRouter client: stream SSE, models, key-check, Hinglish errors
├── js/markdown.js              # markdown-lite kanda (code blocks, links, lists)
├── js/app.js                   # chats, streaming UI, settings, presets
├── sw.js                       # offline shell (API calls network se)
├── manifest.json               # PWA changle (icon.svg)
├── assets/icon.svg             # NexaChat vector icon
├── privacy-policy.html         # OpenRouter data flow disclosed
├── capacitor.config.json       # com.nexachat.app
├── package.json                # build → www/ + Capacitor 6
└── .github/workflows/          # android-build.yml + pages.yml
```

## 🔐 Error codes (friendly, Hinglish)
| Code | Matlab |
|---|---|
| 401 | Key galat/expired |
| 402 | Credits khatam — free model lo / top-up |
| 429 | Rate limit — thodi ruko ya model change |
| 404 | Model id galat |

## 🆕 Custom models bhi chalega
Settings me **Custom model id** input se koi bhi OpenRouter model daal sakte ho:
`openai/gpt-4o-mini` · `anthropic/claude-3.5-sonnet` · `google/gemini-2.0-flash-001` …
"🔄 Live list lao" button aapki key se **hazaar+ models** laata hai — free pehle sorted.

---
Package: `com.nexachat.app` · 100% original · MIT © 2026 NexaChat
