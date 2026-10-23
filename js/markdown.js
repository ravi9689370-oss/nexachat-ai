/* ============ markdown-lite (zero deps) ============
   Supports: fenced code + lang, inline code, bold, italics, strike,
   headings, ul/ol lists, blockquote, hr, links, autolinks.
*/
(function () {
  "use strict";

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function inline(s) {
    // code spans first → placeholders
    var codes = [];
    s = s.replace(/`([^`\n]+)`/g, function (_, c) {
      codes.push("<code>" + c + "</code>");
      return "\u0000" + (codes.length - 1) + "\u0000";
    });
    s = s
      .replace(/\*\*\*([^*\n]+)\*\*\*/g, "<b><i>$1</i></b>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<i>$2</i>")
      .replace(/(^|[^_\w])_([^_\n]+)_/g, "$1<i>$2</i>")
      .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s])((?:https?:\/\/)[^\s<>]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    return s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return codes[+i]; });
  }

  function render(src) {
    var text = String(src == null ? "" : src).replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    var blocks = [];

    // pull out fenced code blocks
    text = text.replace(/```([a-zA-Z0-9_+\-#]*)\n([\s\S]*?)```/g, function (_, lang, code) {
      blocks.push(
        '<pre><span class="lang">' + esc(lang || "code") + "</span><code>" + esc(code.replace(/\n$/, "")) + "</code></pre>"
      );
      return "\u0001" + (blocks.length - 1) + "\u0001";
    });

    var out = [], i, line, lines = text.split("\n");
    var inList = 0; // 0 = none, 1 = ul, 2 = ol
    function closeList() { if (inList) { out.push(inList === 1 ? "</ul>" : "</ol>"); inList = 0; } }

    for (i = 0; i < lines.length; i++) {
      line = lines[i];
      var m;

      if (/^\u0001\d+\u0001$/.test(line.trim())) { closeList(); out.push(blockHtml(blocks, line.trim())); continue; }
      if (!line.trim()) { closeList(); continue; }
      if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { closeList(); out.push("<hr>"); continue; }

      m = /^(#{1,6})\s+(.*)$/.exec(line);
      if (m) {
        closeList();
        var h = Math.min(m[1].length, 3);
        out.push("<h" + h + ">" + inline(esc(m[2])) + "</h" + h + ">");
        continue;
      }

      if (/^\s*(&t;|>)\s?/.test(line)) {
        closeList();
        out.push("<blockquote>" + inline(esc(line.replace(/^\s*>\s?/, ""))) + "</blockquote>");
        continue;
      }

      m = /^[-*]\s+(.*)$/.exec(line);
      if (m) {
        if (inList !== 1) { closeList(); out.push("<ul>"); inList = 1; }
        out.push("<li>" + inline(esc(m[1])) + "</li>");
        continue;
      }

      m = /^\d+[.)]\s+(.*)$/.exec(line);
      if (m) {
        if (inList !== 2) { closeList(); out.push("<ol>"); inList = 2; }
        out.push("<li>" + inline(esc(m[1])) + "</li>");
        continue;
      }

      closeList();
      out.push("<p>" + inline(esc(line)) + "</p>");
    }
    closeList();

    // re-insert code blocks that may sit inline after line processing
    var html = out.join("\n");
    html = html.replace(/\u0001(\d+)\u0001/g, function (_, n) { return blocks[+n]; });
    return html;
  }

  function blockHtml(blocks, token) {
    return token.replace(/\u0001(\d+)\u0001/, function (_, n) { return blocks[+n]; });
  }

  window.MD = { render: render };
})();
