/* ============ OpenRouter API client (no deps, streaming SSE) ============ */
(function () {
  "use strict";

  var BASE = "https://openrouter.ai/api/v1";

  // fallback list (in case /models fetch fails) — free models only
  var FALLBACK_MODELS = [
    "deepseek/deepseek-chat-v3-0324:free",
    "deepseek/deepseek-r1-0528:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-3-27b-it:free",
    "qwen/qwen-2.5-72b-instruct:free",
    "z-ai/glm-4.5-air:free",
    "openai/gpt-oss-20b:free"
  ];

  var NX = {};

  function headers(key) {
    return {
      "Authorization": "Bearer " + key,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/nexachat",
      "X-Title": "NexaChat"
    };
  }

  /* ---- list models (live), free ones first ---- */
  NX.getModels = async function (key) {
    try {
      var res = await fetch(BASE + "/models", {
        headers: key ? headers(key) : { "Content-Type": "application/json" }
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var json = await res.json();
      var free = [], paid = [];
      (json.data || []).forEach(function (m) {
        var p = m.pricing || {};
        var isFree = (p.prompt === "0" && p.completion === "0") || m.id.endsWith(":free");
        (isFree ? free : paid).push({ id: m.id, free: isFree });
      });
      free.sort(function (a, b) { return a.id.localeCompare(b.id); });
      if (!free.length) free = FALLBACK_MODELS.map(function (id) { return { id: id, free: true }; });
      return { free: free.map(function (f) { return f.id; }), paid: paid.map(function (f) { return f.id; }), live: true };
    } catch (e) {
      return { free: FALLBACK_MODELS.slice(), paid: [], live: false };
    }
  };

  /* ---- check API key + credits ---- */
  NX.checkKey = async function (key) {
    var res = await fetch(BASE + "/auth/key", { headers: headers(key) });
    if (res.status === 401) throw new Error("KEY_INVALID");
    if (!res.ok) throw new Error("HTTP " + res.status);
    var json = await res.json();
    var d = json.data || {};
    var info = "Key chalegi ✓";
    if (typeof d.limit === "number") {
      var left = Math.max(0, (d.limit - (d.usage || 0)));
      info = "Remaining credit: $" + left.toFixed(3);
    } else if (d.limit === null) {
      info = "Unlimited usage limit ✓";
    }
    return info;
  };

  /* ---- chat completion, streaming (SSE) with non-stream fallback ---- */
  // onChunk(fullText) called as text accumulates; onDone(err, fullText) at the end.
  NX.chat = function (opts, onChunk, onDone) {
    // opts: { key, model, messages, temperature, signal }
    var url = BASE + "/chat/completions";
    var body = JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: typeof opts.temperature === "number" ? opts.temperature : 0.7,
      stream: true
    });

    fetch(url, { method: "POST", headers: headers(opts.key), body: body, signal: opts.signal })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        if (!res.body || !res.body.getReader) {
          // WebView without streaming support → non-stream fallback
          return NX._chatNoStream(res, onChunk, onDone);
        }
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        var buf = "", acc = "";
        return reader.read().then(function pump(read) {
          if (read.done) { onDone(null, acc); return; }
          buf += dec.decode(read.value, { stream: true });
          var lines = buf.split("\n");
          buf = lines.pop(); // keep incomplete tail
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line.indexOf("data:") !== 0) continue;
            var payload = line.slice(5).trim();
            if (payload === "[DONE]") { onDone(null, acc); return; }
            try {
              var obj = JSON.parse(payload);
              if (obj.error) throw new Error(obj.error.message || "API error");
              var delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
              var piece = (delta && delta.content) || (obj.choices && obj.choices[0] && obj.choices[0].message && obj.choices[0].message.content) || "";
              if (piece) { acc += piece; onChunk(acc); }
            } catch (pe) {
              if (/API error/.test(String(pe.message))) throw pe; // real API error → abort
              // ignore incomplete JSON lines
            }
          }
          return reader.read().then(pump);
        });
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") { onDone("ABORT", null); return; }
        if (opts._retried !== true && ("" + (err && err.message)).indexOf("HTTP 4") !== 0) {
          // streaming parse/network hiccup → try non-stream once
          NX._chatOnce(opts, onChunk, onDone);
          return;
        }
        onDone(err, null);
      });
  };

  NX._chatNoStream = function (res, onChunk, onDone) {
    return res.json().then(function (json) {
      if (json.error) throw new Error(json.error.message || "API error");
      var text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content || "";
      onChunk(text);
      onDone(null, text);
    });
  };

  NX._chatOnce = function (opts, onChunk, onDone) {
    var body = JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: typeof opts.temperature === "number" ? opts.temperature : 0.7,
      stream: false
    });
    fetch(BASE + "/chat/completions", { method: "POST", headers: headers(opts.key), body: body, signal: opts.signal })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        if (json.error) throw new Error(json.error.message || "API error");
        var text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content || "";
        onChunk(text);
        onDone(null, text);
      })
      .catch(function (err) {
        onDone(err && err.name === "AbortError" ? "ABORT" : err, null);
      });
  };

  /* ---- friendly Hinglish error for user ---- */
  NX.friendlyError = function (err) {
    var m = String(err && err.message || err || "");
    if (m === "ABORT") return "Rok diya — message cancel ho gaya.";
    if (m === "KEY_INVALID" || m.indexOf("401") !== -1) return "API key galat/expired hai (401). Settings me sahi key daalo — openrouter.ai/keys se milegi.";
    if (m.indexOf("402") !== -1) return "Credit khatam hai (402). Settings me ':free' model chuno ya top-up karo.";
    if (m.indexOf("429") !== -1) return "Bahut tez-sar (429) — free models pe limit chalti hai. Thodi der ruk kar try karo ya doosra model lo.";
    if (m.indexOf("404") !== -1) return "Model nahi mila (404) — settings me valid model chuno.";
    if (m.indexOf("500") !== -1 || m.indexOf("502") !== -1 || m.indexOf("503") !== -1) return "OpenRouter/LLM server busy lagta hai (5xx). Thodi der me try karo.";
    if (m.indexOf("NetworkError") !== -1 || m.indexOf("Failed to fetch") !== -1 || m.indexOf("fetch") !== -1) return "Internet nahi mil raha. Connection check karo — app to offline bhi khulti hai, chat ke liye net chahiye.";
    return m || "Kuch ajeeb hua. Dobara try karo.";
  };

  window.NXAPI = NX;
})();
