(function () {
  "use strict";

  var STORAGE_LANG = "devistic-lang";
  var STORAGE_THEME = "devistic-theme";
  var STORAGE_LOG = "devistic-desk-log";
  var BLOCK = /^(javascript|data|vbscript|file):/i;
  var qr;
  var logoData = "";
  var scanStream = null;
  var scanTimer = 0;
  var lastPayload = "";
  var lastShort = "";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function lang() {
    return document.documentElement.getAttribute("data-lang") || "en";
  }
  function dict() {
    return window.I18N[lang()] || window.I18N.en;
  }
  function t(path) {
    var parts = path.split(".");
    var cur = dict();
    for (var i = 0; i < parts.length; i++) {
      cur = cur ? cur[parts[i]] : undefined;
    }
    return cur == null ? path : cur;
  }

  function applyI18n() {
    $all("[data-i]").forEach(function (el) {
      var key = el.getAttribute("data-i");
      var val = t(key);
      if (el.dataset.iHtml === "1") el.innerHTML = val;
      else el.textContent = val;
    });
    $all("[data-i-ph]").forEach(function (el) {
      el.placeholder = t(el.getAttribute("data-i-ph"));
    });
    $all("[data-i-aria]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i-aria")));
    });
    $("#lampBtn").textContent = document.documentElement.getAttribute("data-theme") === "lamp" ? dict().day : dict().lamp;
    var loc = lang();
    document.documentElement.lang = loc === "hi" ? "hi" : loc === "ur" ? "ur" : "en";
    document.documentElement.dir = loc === "ur" ? "rtl" : "ltr";
    document.title = t("pageTitle");
    $all("[data-set-lang]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-set-lang") === loc ? "true" : "false");
    });
    fillTypeOptions();
    renderHistory();
  }

  function fillTypeOptions() {
    var sel = $("#qrType");
    var current = sel.value;
    var types = ["url", "text", "wifi", "vcard", "email", "sms", "whatsapp", "phone", "geo", "upi", "event"];
    sel.innerHTML = types.map(function (k) {
      return '<option value="' + k + '">' + t("stamp.types." + k) + "</option>";
    }).join("");
    sel.value = current || "url";
  }

  function normalizeUrl(raw) {
    var s = (raw || "").trim();
    if (!s) return "";
    if (BLOCK.test(s)) return "";
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) s = "https://" + s;
    try {
      var u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") return "";
      return u.toString();
    } catch (e) {
      return "";
    }
  }

  function setStatus(id, msg, kind) {
    var el = $(id);
    el.hidden = !msg;
    el.textContent = msg || "";
    el.dataset.kind = kind || "";
  }

  function encodeDesk(url) {
    var bytes = new TextEncoder().encode(url);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function deskLink(url) {
    var base = new URL("go.html", location.href).href;
    return base + "#u=" + encodeDesk(url);
  }

  function sanitizeAlias(s) {
    return (s || "").trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  }

  function parseShortBody(body, urlHint) {
    if (!body) return "";
    if (typeof body === "string") {
      var text = body.trim();
      if (/^https?:\/\//i.test(text) && text.length < 200) return text.split(/\s/)[0];
      try { body = JSON.parse(text); } catch (e) { return ""; }
    }
    var keys = ["short_url", "shorturl", "shortUrl", "short", "url", "link"];
    for (var i = 0; i < keys.length; i++) {
      if (body[keys[i]] && /^https?:\/\//i.test(String(body[keys[i]]))) return String(body[keys[i]]);
    }
    if (urlHint && /^https?:\/\//i.test(urlHint)) return urlHint;
    return "";
  }

  async function tryFetch(url, opts) {
    var res = await fetch(url, opts || {});
    var text = await res.text();
    var json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return { ok: res.ok, status: res.status, text: text, json: json };
  }

  var PROVIDERS = {
    tinyurl: async function (url, alias) {
      var u = "https://tinyurl.com/api-create.php?url=" + encodeURIComponent(url);
      if (alias) u += "&alias=" + encodeURIComponent(alias);
      var r = await tryFetch(u);
      return parseShortBody(r.text);
    },
    isgd: async function (url, alias) {
      var u = "https://is.gd/create.php?format=json&url=" + encodeURIComponent(url);
      if (alias) u += "&shorturl=" + encodeURIComponent(alias);
      var r = await tryFetch(u);
      if (r.json && r.json.shorturl) return r.json.shorturl;
      return parseShortBody(r.json || r.text);
    },
    zip1: async function (url, alias) {
      var body = { url: url };
      if (alias) body.alias = alias;
      var r = await tryFetch("https://zip1.io/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body)
      });
      return parseShortBody(r.json || r.text);
    },
    spoo: async function (url, alias) {
      var data = "url=" + encodeURIComponent(url);
      if (alias) data += "&alias=" + encodeURIComponent(alias);
      var r = await tryFetch("https://spoo.me/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: data
      });
      var short = parseShortBody(r.json || r.text);
      if (short && short.indexOf("http://") === 0) short = "https://" + short.slice(7);
      return short;
    },
    dagd: async function (url) {
      var r = await tryFetch("https://da.gd/s?url=" + encodeURIComponent(url));
      return parseShortBody(r.text);
    }
  };

  var AUTO_ORDER = ["tinyurl", "isgd", "zip1", "spoo", "dagd"];
  var AUTO_ALIAS = ["zip1", "spoo", "isgd", "tinyurl"];

  async function shorten(url, alias, provider) {
    var order;
    if (provider && provider !== "auto") order = [provider];
    else order = alias ? AUTO_ALIAS : AUTO_ORDER;
    var lastErr = "";
    for (var i = 0; i < order.length; i++) {
      var name = order[i];
      try {
        var short = await PROVIDERS[name](url, alias);
        if (short && /^https?:\/\//i.test(short)) {
          return { short: short, via: name };
        }
      } catch (e) {
        lastErr = e && e.message ? e.message : String(e);
      }
    }
    throw new Error(lastErr || "fail");
  }

  function luminance(hex) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16) / 255;
    var g = parseInt(h.slice(2, 4), 16) / 255;
    var b = parseInt(h.slice(4, 6), 16) / 255;
    function lin(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function contrastOk(ink, paper) {
    var L1 = luminance(ink);
    var L2 = luminance(paper);
    var hi = Math.max(L1, L2);
    var lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05) >= 4;
  }

  function vcardEscape(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  }

  function wifiEscape(s) {
    return String(s || "").replace(/([\\;,:"])/g, "\\$1");
  }

  function buildPayload() {
    var type = $("#qrType").value;
    if (type === "url" || type === "text") return ($("#qrData").value || "").trim();
    if (type === "wifi") {
      var tsec = $("#wifiType").value || "WPA";
      var hidden = $("#wifiHidden").checked ? "true" : "false";
      return "WIFI:T:" + tsec + ";S:" + wifiEscape($("#wifiSsid").value) + ";P:" + wifiEscape($("#wifiPass").value) + ";H:" + hidden + ";;";
    }
    if (type === "vcard") {
      return [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "FN:" + vcardEscape($("#vcFn").value),
        "ORG:" + vcardEscape($("#vcOrg").value),
        "TEL:" + vcardEscape($("#vcTel").value),
        "EMAIL:" + vcardEscape($("#vcEmail").value),
        "URL:" + vcardEscape($("#vcUrl").value),
        "END:VCARD"
      ].join("\n");
    }
    if (type === "email") {
      var mail = ($("#emTo").value || "").trim();
      var sub = encodeURIComponent($("#emSub").value || "");
      var body = encodeURIComponent($("#emBody").value || "");
      return "mailto:" + mail + "?subject=" + sub + "&body=" + body;
    }
    if (type === "sms") {
      return "sms:" + ($("#smsTo").value || "").trim() + "?body=" + encodeURIComponent($("#smsBody").value || "");
    }
    if (type === "whatsapp") {
      var num = ($("#waNum").value || "").replace(/\D/g, "");
      var msg = encodeURIComponent($("#waBody").value || "");
      return "https://wa.me/" + num + (msg ? "?text=" + msg : "");
    }
    if (type === "phone") return "tel:" + ($("#phoneTo").value || "").trim();
    if (type === "geo") return "geo:" + ($("#geoLat").value || "").trim() + "," + ($("#geoLng").value || "").trim();
    if (type === "upi") {
      var params = new URLSearchParams();
      params.set("pa", ($("#upiPa").value || "").trim());
      params.set("pn", ($("#upiPn").value || "").trim());
      params.set("cu", "INR");
      if ($("#upiAm").value) params.set("am", $("#upiAm").value);
      if ($("#upiTn").value) params.set("tn", $("#upiTn").value);
      return "upi://pay?" + params.toString();
    }
    if (type === "event") {
      function ics(dt) {
        if (!dt) return "";
        return dt.replace(/[-:]/g, "").replace("T", "T") + (dt.length === 16 ? "00" : "");
      }
      return [
        "BEGIN:VEVENT",
        "SUMMARY:" + vcardEscape($("#evSum").value),
        "DTSTART:" + ics($("#evStart").value),
        "DTEND:" + ics($("#evEnd").value),
        "LOCATION:" + vcardEscape($("#evLoc").value),
        "END:VEVENT"
      ].join("\n");
    }
    return "";
  }

  function showTypeFields() {
    var type = $("#qrType").value;
    $all("[data-for]").forEach(function (el) {
      var list = el.getAttribute("data-for").split(/\s+/);
      el.hidden = list.indexOf(type) === -1;
    });
  }

  function qrOptions(data) {
    var size = Number($("#qrSize").value) || 280;
    var ink = $("#qrInk").value || "#1c1612";
    var paper = $("#qrPaper").value || "#faf4e8";
    var dots = $("#qrDots").value || "square";
    var ecc = logoData ? "H" : ($("#qrEcc").value || "M");
    $("#contrastWarn").hidden = contrastOk(ink, paper);
    $("#qrEcc").value = ecc;
    return {
      width: size,
      height: size,
      type: "canvas",
      data: data,
      image: logoData || undefined,
      margin: 8,
      qrOptions: { errorCorrectionLevel: ecc },
      dotsOptions: { color: ink, type: dots },
      backgroundOptions: { color: paper },
      cornersSquareOptions: { color: ink, type: dots === "dots" ? "dot" : "square" },
      cornersDotOptions: { color: ink },
      imageOptions: { crossOrigin: "anonymous", margin: 6, imageSize: 0.28, hideBackgroundDots: true }
    };
  }

  function ensureQr(data) {
    var stage = $("#qrStage");
    var opts = qrOptions(data);
    if (!window.QRCodeStyling) {
      stage.innerHTML = "<p class='tiny'>QR library didn’t load. Check vendor/qr-code-styling.js</p>";
      return;
    }
    if (!qr) {
      qr = new QRCodeStyling(opts);
      stage.innerHTML = "";
      qr.append(stage);
    } else {
      qr.update(opts);
    }
    lastPayload = data;
    var cap = ($("#qrCaption").value || "").trim();
    $("#qrCaptionOut").textContent = cap;
    $("#qrCaptionOut").hidden = !cap;
    $("#emptySlip").hidden = true;
    $("#qrWrap").hidden = false;
  }

  function loadLog() {
    try { return JSON.parse(localStorage.getItem(STORAGE_LOG) || "[]"); } catch (e) { return []; }
  }
  function saveLog(items) {
    localStorage.setItem(STORAGE_LOG, JSON.stringify(items.slice(0, 40)));
  }
  function pushLog(entry) {
    var items = loadLog();
    items.unshift(Object.assign({ at: Date.now() }, entry));
    saveLog(items);
    renderHistory();
  }

  function renderHistory() {
    var items = loadLog();
    var list = $("#receiptList");
    var empty = $("#historyEmpty");
    list.innerHTML = "";
    empty.hidden = items.length > 0;
    items.forEach(function (it, idx) {
      var li = document.createElement("li");
      var tag = document.createElement("span");
      tag.className = "kind-tag";
      tag.textContent = it.kind || "cut";
      var code = document.createElement("code");
      code.textContent = it.short || it.data || "";
      var actions = document.createElement("div");
      actions.className = "actions";
      var reuse = document.createElement("button");
      reuse.className = "btn ghost";
      reuse.type = "button";
      reuse.textContent = t("cut.copy");
      reuse.addEventListener("click", function () {
        var val = it.short || it.data || "";
        if (val) navigator.clipboard.writeText(val);
      });
      var restamp = document.createElement("button");
      restamp.className = "btn ghost";
      restamp.type = "button";
      restamp.textContent = "QR";
      restamp.addEventListener("click", function () {
        $("#qrType").value = "url";
        showTypeFields();
        $("#qrData").value = it.short || it.data || "";
        selectTab("stamp");
        ensureQr($("#qrData").value);
      });
      actions.appendChild(reuse);
      actions.appendChild(restamp);
      li.appendChild(tag);
      li.appendChild(code);
      li.appendChild(actions);
      li.dataset.idx = String(idx);
      list.appendChild(li);
    });
  }

  function selectTab(name) {
    $all(".tab").forEach(function (btn) {
      var on = btn.getAttribute("data-tab") === name;
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    $all(".panel").forEach(function (p) {
      p.hidden = p.id !== "panel-" + name;
    });
  }

  function taggedUrl(base) {
    var url = normalizeUrl(base || $("#utmBase").value || $("#cutUrl").value);
    if (!url) return "";
    var u = new URL(url);
    ["source", "medium", "campaign", "content", "term"].forEach(function (k) {
      var val = ($("#utm_" + k).value || "").trim();
      if (val) u.searchParams.set("utm_" + k, val);
      else u.searchParams.delete("utm_" + k);
    });
    return u.toString();
  }

  function refreshUtm() {
    var out = taggedUrl($("#utmBase").value);
    $("#utmPreview").value = out;
  }

  async function onCut(ev) {
    ev.preventDefault();
    var useUtm = $("#cutUtm").checked;
    var raw = useUtm ? taggedUrl($("#cutUrl").value) : $("#cutUrl").value;
    var url = normalizeUrl(raw);
    if (!url) {
      if (BLOCK.test(($("#cutUrl").value || "").trim())) setStatus("#cutStatus", t("cut.unsafe"), "warn");
      else setStatus("#cutStatus", t("cut.bad"), "warn");
      return;
    }
    var alias = sanitizeAlias($("#cutAlias").value);
    var provider = $("#cutProvider").value;
    var btn = $("#cutBtn");
    btn.disabled = true;
    setStatus("#cutStatus", "…", "");
    try {
      var result = await shorten(url, alias, provider);
      lastShort = result.short;
      $("#shortOut").hidden = false;
      $("#shortOut").textContent = result.short;
      $("#shortVia").textContent = t("slip.via") + " " + result.via;
      $("#emptySlip").hidden = true;
      $("#qrData").value = result.short;
      $("#qrType").value = "url";
      showTypeFields();
      ensureQr(result.short);
      pushLog({ kind: "cut", short: result.short, data: url, via: result.via });
      setStatus("#cutStatus", result.short, "ok");
      if ($("#cutDesk").checked) {
        var ticket = deskLink(url);
        $("#deskOut").hidden = false;
        $("#deskOut").textContent = ticket;
        $("#copyDesk").hidden = false;
      } else {
        $("#deskOut").hidden = true;
        $("#copyDesk").hidden = true;
      }
    } catch (e) {
      var ticket = deskLink(url);
      $("#deskOut").hidden = false;
      $("#deskOut").textContent = ticket;
      $("#copyDesk").hidden = false;
      lastShort = ticket;
      $("#shortOut").hidden = false;
      $("#shortOut").textContent = ticket;
      ensureQr(ticket);
      pushLog({ kind: "desk", short: ticket, data: url, via: "desk" });
      setStatus("#cutStatus", t("cut.fail"), "warn");
    } finally {
      btn.disabled = false;
    }
  }

  function onStamp(ev) {
    ev.preventDefault();
    var data = buildPayload();
    if (!data) return;
    ensureQr(data);
    pushLog({ kind: "qr", data: data.slice(0, 280) });
  }

  async function copyText(text) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setStatus("#cutStatus", t("cut.copied"), "ok");
  }

  async function downloadQr(ext) {
    if (!qr) return;
    var name = "devistic-stamp";
    await qr.download({ name: name, extension: ext });
  }

  async function copyQrImage() {
    if (!qr || !qr.getRawData) return;
    var blob = await qr.getRawData("png");
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setStatus("#cutStatus", t("cut.copied"), "ok");
    }
  }

  function decodeFromCanvas(canvas) {
    if (!window.jsQR) return null;
    var ctx = canvas.getContext("2d");
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var code = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
    return code ? code.data : null;
  }

  function decodeImageElement(img) {
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    var scales = [1, 2, 3, 0.75, 0.5];
    if (w < 220 || h < 220) scales = [3, 4, 2, 1];
    for (var i = 0; i < scales.length; i++) {
      canvas.width = Math.max(1, Math.round(w * scales[i]));
      canvas.height = Math.max(1, Math.round(h * scales[i]));
      ctx.imageSmoothingEnabled = scales[i] !== 1;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var data = decodeFromCanvas(canvas);
      if (data) return data;
    }
    return null;
  }

  function showScan(text, meta) {
    $("#scanOut").hidden = !text;
    $("#scanOut").textContent = text || "";
    var msg = "";
    var kind = "warn";
    if (text) {
      msg = meta === "paste" ? t("scan.pasted") : "";
      kind = "ok";
    } else {
      msg = t("scan.none");
    }
    setStatus("#scanStatus", msg, kind);
    if (text && /^https?:\/\//i.test(text)) {
      $("#qrData").value = text;
    }
  }

  var lastPreviewUrl = "";

  function setScanPreview(url) {
    var prev = $("#scanPreview");
    if (!prev) return;
    if (lastPreviewUrl && lastPreviewUrl !== url) URL.revokeObjectURL(lastPreviewUrl);
    lastPreviewUrl = url || "";
    if (url) {
      prev.src = url;
      prev.hidden = false;
    } else {
      prev.removeAttribute("src");
      prev.hidden = true;
    }
  }

  function ingestQrFile(file, source) {
    if (!file) return;
    selectTab("scan");
    var url = URL.createObjectURL(file);
    setScanPreview(url);
    var img = new Image();
    img.onload = function () {
      showScan(decodeImageElement(img), source);
    };
    img.onerror = function () {
      showScan(null);
    };
    img.src = url;
  }

  function clipboardImage(e) {
    var cd = e.clipboardData;
    if (!cd) return null;
    var i;
    if (cd.files && cd.files.length) {
      for (i = 0; i < cd.files.length; i++) {
        if ((cd.files[i].type || "").indexOf("image/") === 0) return cd.files[i];
      }
    }
    if (cd.items) {
      for (i = 0; i < cd.items.length; i++) {
        if ((cd.items[i].type || "").indexOf("image/") === 0) return cd.items[i].getAsFile();
      }
    }
    return null;
  }

  async function pasteFromClipboardButton() {
    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        var items = await navigator.clipboard.read();
        for (var i = 0; i < items.length; i++) {
          var types = items[i].types || [];
          var imgType = null;
          for (var k = 0; k < types.length; k++) {
            if (types[k].indexOf("image/") === 0) imgType = types[k];
          }
          if (imgType) {
            var blob = await items[i].getType(imgType);
            ingestQrFile(new File([blob], "clipboard.png", { type: imgType }), "paste");
            return;
          }
        }
        setStatus("#scanStatus", t("scan.noImage"), "warn");
        selectTab("scan");
        return;
      } catch (err) {
        setStatus("#scanStatus", t("scan.pasteHint"), "warn");
        selectTab("scan");
        return;
      }
    }
    setStatus("#scanStatus", t("scan.pasteHint"), "warn");
    selectTab("scan");
  }

  function stopScan() {
    if (scanTimer) cancelAnimationFrame(scanTimer);
    scanTimer = 0;
    if (scanStream) {
      scanStream.getTracks().forEach(function (tr) { tr.stop(); });
      scanStream = null;
    }
    var v = $("#scanVideo");
    v.srcObject = null;
    v.hidden = true;
    $("#scanStart").hidden = false;
    $("#scanStop").hidden = true;
  }

  async function startScan() {
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    } catch (e) {
      scanStream = await navigator.mediaDevices.getUserMedia({ video: true });
    }
    var v = $("#scanVideo");
    v.srcObject = scanStream;
    v.hidden = false;
    await v.play();
    $("#scanStart").hidden = true;
    $("#scanStop").hidden = false;
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    function tick() {
      if (!scanStream) return;
      if (v.readyState >= 2) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        var data = decodeFromCanvas(canvas);
        if (data) {
          showScan(data);
          stopScan();
          return;
        }
      }
      scanTimer = requestAnimationFrame(tick);
    }
    tick();
  }

  function readFileQr(file) {
    ingestQrFile(file);
  }

  function bind() {
    $all(".tab").forEach(function (btn) {
      btn.addEventListener("click", function () { selectTab(btn.getAttribute("data-tab")); });
    });
    $all("[data-set-lang]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = btn.getAttribute("data-set-lang");
        document.documentElement.setAttribute("data-lang", next);
        localStorage.setItem(STORAGE_LANG, next);
        applyI18n();
      });
    });
    $("#lampBtn").addEventListener("click", function () {
      var on = document.documentElement.getAttribute("data-theme") === "lamp";
      var next = on ? "day" : "lamp";
      document.documentElement.setAttribute("data-theme", next === "lamp" ? "lamp" : "day");
      localStorage.setItem(STORAGE_THEME, next);
      applyI18n();
    });
    $("#panel-cut").addEventListener("submit", onCut);
    $("#panel-stamp").addEventListener("submit", onStamp);
    $("#qrType").addEventListener("change", showTypeFields);
    $("#copyShort").addEventListener("click", function () { copyText($("#shortOut").textContent); });
    $("#openShort").addEventListener("click", function () {
      var href = $("#shortOut").textContent;
      if (href) window.open(href, "_blank", "noopener,noreferrer");
    });
    $("#copyDesk").addEventListener("click", function () { copyText($("#deskOut").textContent); });
    $("#stampFromCut").addEventListener("click", function () {
      if ($("#shortOut").textContent) {
        $("#qrData").value = $("#shortOut").textContent;
        $("#qrType").value = "url";
        showTypeFields();
        selectTab("stamp");
        ensureQr($("#qrData").value);
      }
    });
    ["qrInk", "qrPaper", "qrSize", "qrDots", "qrEcc", "qrCaption"].forEach(function (id) {
      $( "#" + id ).addEventListener("input", function () {
        if (lastPayload) ensureQr(lastPayload);
      });
    });
    $("#qrLogo").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        logoData = reader.result;
        $("#qrEcc").value = "H";
        if (lastPayload) ensureQr(lastPayload);
        else if ($("#qrData").value) ensureQr($("#qrData").value);
      };
      reader.readAsDataURL(file);
    });
    $("#clearLogo").addEventListener("click", function () {
      logoData = "";
      $("#qrLogo").value = "";
      if (lastPayload) ensureQr(lastPayload);
    });
    $("#dlPng").addEventListener("click", function () { downloadQr("png"); });
    $("#dlSvg").addEventListener("click", function () { downloadQr("svg"); });
    $("#dlJpg").addEventListener("click", function () { downloadQr("jpeg"); });
    $("#copyImg").addEventListener("click", copyQrImage);
    $("#printQr").addEventListener("click", function () { window.print(); });
    $("#scanStart").addEventListener("click", startScan);
    $("#scanStop").addEventListener("click", stopScan);
    $("#scanPaste").addEventListener("click", pasteFromClipboardButton);
    $("#scanFile").addEventListener("change", function (e) {
      if (e.target.files[0]) ingestQrFile(e.target.files[0]);
    });
    var drop = $("#fileDrop");
    drop.addEventListener("dragover", function (e) { e.preventDefault(); });
    drop.addEventListener("drop", function (e) {
      e.preventDefault();
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) ingestQrFile(f);
    });
    document.addEventListener("paste", function (e) {
      var file = clipboardImage(e);
      if (!file) return;
      e.preventDefault();
      ingestQrFile(file, "paste");
    });
    ["utmBase", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (id) {
      $("#" + id).addEventListener("input", refreshUtm);
    });
    $("#utmApply").addEventListener("click", function () {
      var out = taggedUrl($("#utmBase").value);
      if (out) {
        $("#cutUrl").value = out;
        $("#qrData").value = out;
        selectTab("cut");
      }
    });
    $all("[data-preset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var p = btn.getAttribute("data-preset").split("|");
        $("#utm_source").value = p[0] || "";
        $("#utm_medium").value = p[1] || "";
        $("#utm_campaign").value = p[2] || "";
        refreshUtm();
      });
    });
    $("#clearLog").addEventListener("click", function () {
      saveLog([]);
      renderHistory();
    });
    $("#exportLog").addEventListener("click", function () {
      var blob = new Blob([JSON.stringify(loadLog(), null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "devistic-receipts.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $("#year").textContent = String(new Date().getFullYear());
  }

  function boot() {
    var savedLang = localStorage.getItem(STORAGE_LANG);
    if (savedLang === "hi" || savedLang === "en" || savedLang === "ur") document.documentElement.setAttribute("data-lang", savedLang);
    var savedTheme = localStorage.getItem(STORAGE_THEME);
    if (savedTheme === "lamp") document.documentElement.setAttribute("data-theme", "lamp");
    else document.documentElement.setAttribute("data-theme", "day");
    bind();
    applyI18n();
    showTypeFields();
    refreshUtm();
    renderHistory();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
