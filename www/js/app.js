/* ============ NexaChat AI — app logic ============ */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var LS_CHATS = "nexachat.chats.v1";
  var LS_SET = "nexachat.settings.v1";

  var DEFAULT_SETTINGS = {
    key: "",
    model: "deepseek/deepseek-chat-v3-0324:free",
    temperature: 0.7,
    system: "You are NexaChat — a helpful, friendly AI assistant. Reply in the SAME language the user writes in (Hinglish/Hindi in Devanagari or Latin script is fine if the user uses it). Keep answers clear. Use markdown when useful. Never claim to have seen the user's data.",
  };

  var state = {
    settings: Object.assign({}, DEFAULT_SETTINGS, load(LS_SET, {})),
    chats: load(LS_CHATS, []),
    currentId: null,
    streaming: false,
    abort: null
  };

  function load(k, def) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; }
    catch (e) { return def; }
  }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function saveAll() { save(LS_CHATS, state.chats); save(LS_SET, state.settings); }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function currentChat() {
    for (var i = 0; i < state.chats.length; i++) if (state.chats[i].id === state.currentId) return state.chats[i];
    return null;
  }

  /* ---------------- chats ---------------- */
  function newChat() {
    var c = { id: uid(), title: "Nai baat-chat", created: Date.now(), messages: [] };
    state.chats.unshift(c);
    state.currentId = c.id;
    saveAll(); renderSidebar(); renderChat();
    if (window.innerWidth <= 820) closeDrawer();
  }

  function deleteChat(id) {
    state.chats = state.chats.filter(function (c) { return c.id !== id; });
    if (state.currentId === id) state.currentId = state.chats.length ? state.chats[0].id : null;
    saveAll(); renderSidebar(); renderChat();
  }

  /* ---------------- rendering ---------------- */
  function renderSidebar() {
    var list = $("chat-list");
    list.innerHTML = "";
    state.chats.forEach(function (c) {
      var div = document.createElement("div");
      div.className = "chat-item" + (c.id === state.currentId ? " active" : "");
      div.innerHTML = '<span class="t">' + esc(c.title) + '</span><button class="del" title="Delete">🗑️</button>';
      div.onclick = function () {
        state.currentId = c.id; saveAll(); renderSidebar(); renderChat();
        if (window.innerWidth <= 820) closeDrawer();
      };
      div.querySelector(".del").onclick = function (e) {
        e.stopPropagation();
        if (confirm('"' + c.title + '" delete kar dein?')) deleteChat(c.id);
      };
      list.appendChild(div);
    });
    if (!state.chats.length) {
      list.innerHTML = '<p style="color:var(--muted);font-size:12px;padding:10px;">Chats isi list me save honge 📚</p>';
    }
  }

  function welcomeHtml() {
    var chips = [
      "Hindi me ek joke suna de 😄",
      "Python mini project ka code likho ek page me",
      "Interview prep: 5 common sawal + answer",
      "Mere ye code ka bug dhundo: "
    ].map(function (t) { return '<button class="chip" data-q="' + esc(t) + '">' + esc(t) + "</button>"; }).join("");
    return '' +
      '<div id="welcome">' +
      '  <div class="wizard">🧞</div>' +
      '  <h1>Nexa<span>Chat</span> AI</h1>' +
      '  <p>Aapki key, aapka model, aapki chats — sab aapke phone par. Chuno aur poochho 👇</p>' +
      '  <div class="chips">' + chips + "</div>" +
      "</div>";
  }

  function msgHtml(m, last) {
    var isUser = m.role === "user";
    var body;
    if (!isUser && m.errorText) {
      body = '<div class="bubble err">❌ ' + esc(m.errorText) + "</div>";
    } else {
      body = isUser ? '<div class="bubble">' + esc(m.content) + "</div>"
        : '<div class="bubble">' + MD.render(m.content) + "</div>";
    }
    var acts = "";
    if (!state.streaming && last) {
      acts = '<div class="acts">' +
        (isUser ? '<button data-act="edit">✏️ Edit</button>' : '<button data-act="copy">📋 Copy</button><button data-act="regen">↻ Regenerate</button>') +
        "</div>";
    }
    return '<div class="msg ' + (isUser ? "user" : "ai") + '">' +
      '  <div class="avatar">' + (isUser ? "🙋" : "🧞") + "</div>" +
      '  <div class="body"><div class="tag">' + (isUser ? "Tum" : "NexaChat") + "</div>" + body + acts + "</div>" +
      "</div>";
  }

  function renderChat() {
    var c = currentChat();
    var scroller = $("scroller");
    if (!c || !c.messages.length) {
      scroller.innerHTML = welcomeHtml();
      Array.prototype.forEach.call(scroller.querySelectorAll(".chip[data-q]"), function (el) {
        el.onclick = function () { $("input").value = el.getAttribute("data-q"); focusInput(); };
      });
      return;
    }
    var html = c.messages.map(function (m, i) { return msgHtml(m, i === c.messages.length - 1); }).join("");
    scroller.innerHTML = '<div id="chat">' + html + "</div>";
    wireMessages(scroller, c);
    scroller.scrollTop = scroller.scrollHeight;
  }

  function wireMessages(scroller, c) {
    Array.prototype.forEach.call(scroller.querySelectorAll("[data-act]"), function (btn) {
      btn.onclick = function () {
        var i = c.messages.length - 1;
        var act = btn.getAttribute("data-act");
        if (act === "copy") {
          copyText(c.messages[i].content).then(function () { btn.textContent = "✅ Copied"; setTimeout(function () { btn.textContent = "📋 Copy"; }, 1200); });
        } else if (act === "edit") {
          $("input").value = c.messages[i].content; focusInput();
        } else if (act === "regen") {
          // drop last assistant msg, resend from last user msg
          if (c.messages[i] && c.messages[i].role === "assistant") c.messages.pop();
          saveAll(); send(false);
        }
      };
    });
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    var ta = document.createElement("textarea");
    ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    return Promise.resolve();
  }

  /* ---------------- sending + streaming ---------------- */
  function send(fromInput) {
    if (state.streaming) return;
    var s = state.settings;
    var input = $("input");
    var text = (input ? input.value : "").trim();
    if (fromInput && !text) return;

    if (!s.key) { openSettings("Pehle apni OpenRouter key daalo 👇"); return; }
    if (!s.model) { openSettings("Model chuno 👇"); return; }

    var chat = currentChat() || null;
    if (!chat) {
      var c = { id: uid(), title: "Nai baat-chat", created: Date.now(), messages: [] };
      state.chats.unshift(c); chat = c; state.currentId = c.id; saveAll(); renderSidebar();
    }

    if (fromInput || text) {
      if (text) {
        chat.messages.push({ role: "user", content: text, ts: Date.now() });
        if (chat.title === "Nai baat-chat") chat.title = text.slice(0, 34) + (text.length > 34 ? "…" : "");
        saveAll(); renderSidebar();
      }
    }
    var last = chat.messages[chat.messages.length - 1];
    if (!last || last.role !== "user") { renderChat(); return; }

    if (fromInput && input) { input.value = ""; autoGrow(input); }

    // streaming message placeholder
    var ai = { role: "assistant", content: "" };
    chat.messages.push(ai);
    state.streaming = true; updateSendBtn();

    var scroller = $("scroller");
    var streamBox = null;
    var html = '<div id="chat">' + chat.messages.slice(0, -1).map(function (m) { return msgHtml(m, false); }).join("") +
      '<div class="msg ai"><div class="avatar">🧞</div><div class="body"><div class="tag">NexaChat</div>' +
      '<div class="bubble" id="stream-bubble"><span class="scratch"></span></div></div></div></div>';
    scroller.innerHTML = html;
    streamBox = $("stream-bubble");
    scroller.scrollTop = scroller.scrollHeight;
    if (window.innerWidth <= 820) closeDrawer();

    // messages: system + history minus the empty assistant placeholder
    var msgs = [{ role: "system", content: s.system }].concat(
      chat.messages.slice(0, -1).map(function (m) { return { role: m.role, content: m.content }; })
    );

    var lastUpd = 0;
    function paint(full) {
      if (Date.now() - lastUpd < 60) return; // throttle: re-render ~16 fps max
      lastUpd = Date.now();
      streamBox.innerHTML = MD.render(full) + '<span class="scratch"></span>';
      var nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140;
      if (nearBottom) scroller.scrollTop = scroller.scrollHeight;
    }

    state.abort = new AbortController();
    NXAPI.chat(
      { key: s.key, model: s.model, messages: msgs, temperature: s.temperature, signal: state.abort.signal },
      function (full) { paint(full); },
      function (err, full) {
        state.streaming = false; state.abort = null;
        if (err === "ABORT" && !full) {
          chat.messages.pop();
          if (!chat.messages.length) deleteChatNoConfirm(chat.id);
        } else if (err) {
          chat.messages.pop();
          chat.messages.push({
            role: "assistant", content: "", errorText: NXAPI.friendlyError(err), ts: Date.now()
          });
        }
        saveAll(); renderChat(); updateSendBtn();
        if (err === "KEY_INVALID") openSettings("Key reject hui — dobara check karo 👇");
      }
    );
  }

  function deleteChatNoConfirm(id) { deleteChat(id); }

  function updateSendBtn() {
    var btn = $("send");
    if (state.streaming) {
      btn.textContent = "⏹"; btn.classList.add("stop"); btn.title = "Rok do";
      btn.disabled = false;
    } else {
      btn.innerHTML = "➤"; btn.classList.remove("stop"); btn.title = "Bhejo";
      btn.disabled = false;
    }
  }

  /* ---------------- drawer / topbar ---------------- */
  function openDrawer() { $("sidebar").classList.add("open"); $("backdrop").classList.add("show"); }
  function closeDrawer() { $("sidebar").classList.remove("open"); $("backdrop").classList.remove("show"); }

  function setKeyDot() {
    var dot = $("key-dot"), label = $("key-label");
    if (state.settings.key) { dot.classList.add("on"); label.textContent = "Key active ✓ — bolt band: FULL POWER"; }
    else { dot.classList.remove("on"); label.textContent = "Key nahi lagi (Settings → ⚙️)"; }
  }

  function syncModelPick() {
    var sel = $("model-pick"), cur = state.settings.model;
    if (!Array.prototype.some.call(sel.options, function (o) { return o.value === cur; })) {
      var o = document.createElement("option");
      o.value = cur; o.textContent = cur + " (current)";
      sel.appendChild(o);
    }
    sel.value = cur;
  }

  /* ---------------- settings modal ---------------- */
  var modelCache = null;
  function openSettings(msg) {
    var m = $("modal-wrap");
    if (msg) { $("set-flash").textContent = msg; $("set-flash").style.display = "block"; }
    else { $("set-flash").style.display = "none"; }
    var s = state.settings;
    $("in-key").value = s.key;
    $("in-temp").value = s.temperature;
    $("in-temp-val").textContent = s.temperature.toFixed(1);
    $("in-system").value = s.system;
    $("key-status").textContent = "";
    m.classList.add("show");
    initModelPicker(false);
  }
  function closeSettings() { $("modal-wrap").classList.remove("show"); saveAll(); setKeyDot(); }

  function initModelPicker(invalidate) {
    var sel = $("in-model"), inp = $("in-model-custom");
    var s = state.settings;
    function fill(list) {
      sel.innerHTML = "";
      list.forEach(function (id) {
        var o = document.createElement("option");
        o.value = id; o.textContent = id.replace(":free", " (FREE)");
        if (id === s.model) o.selected = true;
        sel.appendChild(o);
      });
      if (list.indexOf(s.model) === -1) {
        var o = document.createElement("option");
        o.value = s.model; o.textContent = s.model + " (current)";
        sel.appendChild(o);
      }
    }
    fill(modelCache && !invalidate ? modelCache.free.concat(modelCache.paid) : [s.model]);
    inp.value = "";

    var btn = $("load-models");
    btn.disabled = !state.settings.key || btn.dataset.loading === "1";
    btn.textContent = state.settings.key ? "🔄 Live list lao" : "🔒 Key do pehle";
  }

  async function loadModels() {
    var btn = $("load-models"), sel = $("in-model");
    btn.dataset.loading = "1"; btn.disabled = true; btn.textContent = "⏳ Laya ja raha…";
    var res = await NXAPI.getModels(state.settings.key.trim());
    modelCache = res;
    var list = res.free.concat(res.paid.slice(0, 40));
    sel.innerHTML = "";
    list.forEach(function (id) {
      var o = document.createElement("option");
      o.value = id; o.textContent = id.replace(":free", " (FREE)");
      sel.appendChild(o);
    });
    if (list.indexOf(state.settings.model) !== -1) sel.value = state.settings.model;
    else sel.selectedIndex = 0;
    var hint = res.live ? "✅ " + list.length + "+ models mile" : "⚠️ Live list hi nahi hai — fallback list dikha rahe";
    $("model-hint").textContent = hint;
    btn.dataset.loading = "0"; btn.disabled = false; btn.textContent = "🔄 Dobara lao";
  }

  async function testKey() {
    var st = $("key-status"), key = $("in-key").value.trim();
    if (!key) { st.className = "bad"; st.textContent = "❌ Key khali hai"; return; }
    st.className = ""; st.textContent = "⏳ Check kar rahe hain…";
    try {
      var info = await NXAPI.checkKey(key);
      st.className = "good"; st.textContent = "✅ " + info;
    } catch (e) {
      st.className = "bad";
      st.textContent = "❌ " + NXAPI.friendlyError(e);
    }
  }

  /* ---------------- presets ---------------- */
  var PRESETS = {
    "default": DEFAULT_SETTINGS.system,
    "hinglish-bhai": "You are a fun, thoda filmy Hinglish 'bhai' assistant. Speak Hinglish (Roman Hindi + English mix), use emojis lightly, crack dhandhe-style examples. Knowledge solid rakho, bakwas avoid.",
    "tech-expert": "You are a senior software engineer. Give precise technical answers with code examples in fenced blocks, mention edge cases and best practices. Keep prose short.",
    "khani-dost": "You are a creative storyteller. Write vivid stories in the user's language, with dialogue, suspense, and warm endings. Ask clarifying Q if user's brief is vague.",
    "aadat-dost": "You are a supportive coach for study, health and habit goals. Reply in Hinglish. Small steps, daily targets, gentle accountability questions at the end."
  };
  function applyPreset(name) {
    $("in-system").value = PRESETS[name] || PRESETS["default"];
    $("in-temp").value = name === "tech-expert" ? 0.3 : name === "khani-dost" ? 0.9 : 0.7;
    $("in-temp-val").textContent = (+$("in-temp").value).toFixed(1);
    Array.prototype.forEach.call(document.querySelectorAll(".preset-row .chip"), function (el) {
      el.style.borderColor = el.dataset.p === name ? "var(--accent-2)" : "var(--border)";
    });
  }

  /* ---------------- boot ---------------- */
  function autoGrow(el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 180) + "px"; }
  function focusInput() { $("input").focus(); }

  function initSvc() {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  window.addEventListener("DOMContentLoaded", function () {
    initSvc();

    // first run: seed one empty chat
    if (!state.chats.length) newChat();
    else if (!currentChat()) state.currentId = state.chats[0].id;

    renderSidebar(); renderChat(); setKeyDot(); updateSendBtn(); syncModelPick();

    // topbar
    $("burger").onclick = openDrawer;
    $("backdrop").onclick = closeDrawer;
    $("model-pick").value = state.settings.model;
    $("model-pick").onchange = function () { state.settings.model = $("model-pick").value; saveAll(); };
    $("gear").onclick = function () { openSettings(); };

    // composer
    var input = $("input");
    input.oninput = function () { autoGrow(input); };
    input.onkeydown = function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault(); send(true);
      }
    };
    $("send").onclick = function () { send(true); };

    // settings
    $("close-modal").onclick = closeSettings;
    $("modal-wrap").onclick = function (e) { if (e.target === $("modal-wrap")) closeSettings(); };
    $("show-key").onclick = function () { var k = $("in-key"); k.type = k.type === "password" ? "text" : "password"; };
    $("test-key").onclick = testKey;
    $("load-models").onclick = loadModels;
    $("in-key").oninput = function () { $("key-status").textContent = ""; var b = $("load-models"); b.disabled = !this.value.trim();
      if (!b.disabled && b.textContent.indexOf("🔒") !== -1) b.textContent = "🔄 Live list lao"; };
    $("in-model-custom").oninput = function () { var v = this.value.trim(); if (v) { $("in-model").value = v; } };
    $("in-temp").oninput = function () { $("in-temp-val").textContent = (+this.value).toFixed(1); };
    Array.prototype.forEach.call(document.querySelectorAll(".preset-row .chip"), function (el) {
      el.onclick = function () { applyPreset(el.dataset.p); };
    });
    $("wipe").onclick = function () {
      if (!confirm("Saare chats + key — sab wipe kar dein? Ye permanent hai.")) return;
      localStorage.removeItem(LS_CHATS); localStorage.removeItem(LS_SET);
      location.reload();
    };
    $("save-set").onclick = function () {
      state.settings.key = $("in-key").value.trim();
      state.settings.model = ($("in-model-custom").value.trim() || $("in-model").value.trim()) || state.settings.model;
      state.settings.temperature = +$("in-temp").value;
      state.settings.system = $("in-system").value.trim() || DEFAULT_SETTINGS.system;
      saveAll(); closeSettings();
      syncModelPick(); setKeyDot();
    };
  });
})();
