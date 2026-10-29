"use strict";
/* =====================================================================
   Live Music Player
   - Login/daftar & favorit per akun: Supabase
   - Lagu penuh: YouTube (player resmi), SoundCloud (widget resmi), Audius, Internet Archive
   - Radio Indonesia aktif: direktori Radio Browser
   - Lirik (tersinkron bila ada): LRCLIB
   ===================================================================== */
const CFG = Object.assign({ SUPABASE_URL: "", SUPABASE_ANON_KEY: "", YOUTUBE_API_KEY: "", SOUNDCLOUD_CLIENT_ID: "", PIPED_INSTANCES: [], INVIDIOUS_INSTANCES: [] }, window.APP_CONFIG || {});
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const enc = encodeURIComponent;
const APP_URL = location.origin + location.pathname;
const fmt = x => (x == null || !isFinite(x) || x < 0) ? "" : Math.floor(x / 60) + ":" + String(Math.floor(x % 60)).padStart(2, "0");
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const isMobile = () => matchMedia("(max-width:1023px)").matches;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }
};

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k === "style") e.style.cssText = v;
    else e.setAttribute(k, v === true ? (k.startsWith("aria-") ? "true" : "") : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
  return e;
}
function icon(name, cls = "") {
  const NS = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(NS, "svg"); s.setAttribute("class", "i " + cls); s.setAttribute("aria-hidden", "true");
  const u = document.createElementNS(NS, "use"); u.setAttribute("href", "#i-" + name); s.append(u); return s;
}
async function getJSON(url, { timeout = 10000, ...opt } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opt, signal: ctl.signal });
    if (!r.ok) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(t); }
}
let toastT;
function toast(msg, ms = 3200) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), ms); }
let statusT;
function status(msg, ms = 0) { $("#status").textContent = msg || ""; clearTimeout(statusT); if (msg && ms) statusT = setTimeout(() => status(""), ms); }
const decodeHtml = s => { const t = document.createElement("textarea"); t.innerHTML = s; return t.value; };

/* ---------------------------------------------------------------------
   Tema: cerah (bawaan) atau gelap, tersimpan di perangkat ini
--------------------------------------------------------------------- */
function applyTheme(t) {
  const dark = t === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? "#100D06" : "#FBF8EE";
  const b = $("#themeBtn"); if (!b) return;
  const lbl = dark ? "Ganti ke tema cerah" : "Ganti ke tema gelap";
  b.setAttribute("aria-label", lbl); b.title = lbl;
  $("#themeIco").setAttribute("href", dark ? "#i-sun" : "#i-moon");
}
applyTheme(store.get("theme", "light"));
$("#themeBtn").onclick = () => { const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; store.set("theme", t); applyTheme(t); };

/* ---------------------------------------------------------------------
   Dialog sederhana (pengganti prompt/confirm)
--------------------------------------------------------------------- */
const Dlg = {
  open(build) {
    return new Promise(res => {
      const d = $("#dlg"), f = $("#dlgForm"); f.innerHTML = "";
      let val = null; const done = v => { val = v; d.close(); };
      build(f, done);
      d.onclose = () => res(val);
      d.showModal();
      const first = f.querySelector("input,button.primary"); if (first) setTimeout(() => first.focus(), 30);
    });
  },
  text(title, initial = "", okLabel = "Simpan") {
    return this.open((f, done) => {
      const inp = el("input", { class: "", maxlength: "60", value: initial, style: "width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:var(--surface2);font-size:16px" });
      f.append(el("h3", { text: title }), inp,
        el("div", { class: "dlg-actions" },
          el("button", { class: "btn ghost", type: "button", text: "Batal", onclick: () => done(null) }),
          el("button", { class: "btn primary", type: "submit", text: okLabel })));
      f.onsubmit = e => { e.preventDefault(); const v = inp.value.trim(); if (v) done(v); };
    });
  },
  confirm(title, text, okLabel = "Ya", danger = false) {
    return this.open((f, done) => {
      f.append(el("h3", { text: title }), text ? el("p", { text }) : null,
        el("div", { class: "dlg-actions" },
          el("button", { class: "btn ghost", type: "button", text: "Batal", onclick: () => done(false) }),
          el("button", { class: "btn " + (danger ? "danger" : "primary"), type: "button", text: okLabel, onclick: () => done(true) })));
      f.onsubmit = e => e.preventDefault();
    });
  },
  menu(title, items) {
    return this.open((f, done) => {
      f.append(el("h3", { text: title }),
        el("div", { class: "dlg-list" }, items.map(it => el("button", { type: "button", class: it.danger ? "danger" : "", onclick: () => done(it.id) }, icon(it.icon || "music"), it.label))),
        el("div", { class: "dlg-actions" }, el("button", { class: "btn ghost", type: "button", text: "Tutup", onclick: () => done(null) })));
      f.onsubmit = e => e.preventDefault();
    });
  }
};

/* =====================================================================
   AUTH (Supabase)
===================================================================== */
let sb = null, user = null, authMode = "login", recovering = false;

function gate(which) {
  $("#boot").hidden = true;
  $("#setup").hidden = which !== "setup";
  $("#auth").hidden = which !== "auth";
  $("#app").hidden = which !== "app";
}
const AUTH_TEXT = {
  login: ["Masuk", "Masuk untuk membuka musik, radio, dan favorit Anda.", "Masuk"],
  register: ["Buat akun", "Gratis. Favorit Anda tersimpan di akun dan ikut ke browser atau HP mana pun.", "Daftar"],
  forgot: ["Lupa password", "Masukkan email akun Anda. Kami kirim link untuk membuat password baru.", "Kirim link"],
  reset: ["Buat password baru", "Tulis password baru untuk akun Anda.", "Simpan password"]
};
function setAuthMode(m) {
  authMode = m; const [t, lead, btn] = AUTH_TEXT[m];
  $("#authTitle").textContent = t; $("#authLead").textContent = lead; $("#authSubmit").textContent = btn;
  $$("[data-show]", $("#auth")).forEach(e => e.hidden = !e.dataset.show.split(" ").includes(m));
  $("#auth .seg").hidden = !(m === "login" || m === "register");
  $$("#auth .seg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === m));
  $("#authForm [name=password]").autocomplete = m === "login" ? "current-password" : "new-password";
  authMsg("");
}
function authMsg(t, ok = false) { const m = $("#authMsg"); m.textContent = t; m.classList.toggle("ok", ok); }
function trErr(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  const map = [
    [/invalid login credentials/i, "Email atau password salah."],
    [/already registered|already exists/i, "Email ini sudah terdaftar. Silakan masuk."],
    [/email not confirmed/i, "Email belum dikonfirmasi. Buka link konfirmasi di email Anda, lalu masuk lagi."],
    [/password should be at least|at least 6/i, "Password minimal 6 karakter."],
    [/unable to validate email|invalid email|email address .* is invalid/i, "Format email tidak valid."],
    [/rate limit|too many/i, "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi."],
    [/signups not allowed|signup is disabled/i, "Pendaftaran sedang dimatikan di pengaturan Supabase."],
    [/failed to fetch|network/i, "Tidak bisa terhubung ke server. Periksa koneksi internet."],
    [/same as the old|different from the old/i, "Password baru harus berbeda dari password lama."]
  ];
  for (const [re, t] of map) if (re.test(m)) return t;
  return m;
}

function initAuth() {
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) {
    $("#setupUrl").textContent = "Alamat situs ini: " + APP_URL; return gate("setup");
  }
  if (!window.supabase) { gate("setup"); $("#setupUrl").textContent = "Pustaka login gagal dimuat. Periksa koneksi internet lalu muat ulang."; return; }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  sb.auth.onAuthStateChange((ev, session) => {
    // Jangan panggil Supabase langsung di callback ini (bisa macet); tunda sebentar.
    setTimeout(() => {
      if (ev === "PASSWORD_RECOVERY") { recovering = true; gate("auth"); setAuthMode("reset"); return; }
      setUser(session ? session.user : null);
    }, 0);
  });
}
async function setUser(u) {
  if (recovering) return;
  if (!u) {
    if (user) stopAll();
    user = null; Fav.reset(); gate("auth");
    if (authMode === "reset") setAuthMode("login"); else setAuthMode(authMode);
    return;
  }
  if (user && user.id === u.id) { user = u; return; }
  user = u;
  const name = (u.user_metadata && u.user_metadata.name) || u.email.split("@")[0];
  $("#acctName").textContent = name; $("#avatar").textContent = (name[0] || "?").toUpperCase();
  gate("app");
  showView(store.get("lastView", "search"));
  History.render();
  Fav.load();
}

$$("#auth .seg button").forEach(b => b.onclick = () => setAuthMode(b.dataset.mode));
$("#forgotLink").onclick = () => setAuthMode("forgot");
$("#backLogin").onclick = () => { recovering = false; setAuthMode("login"); };
$("#authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const email = String(f.get("email") || "").trim(), password = String(f.get("password") || ""), name = String(f.get("name") || "").trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const btn = $("#authSubmit");
  if (authMode !== "reset" && !emailOk) return authMsg("Isi email yang valid.");
  if ((authMode === "login" || authMode === "register" || authMode === "reset") && password.length < 6) return authMsg("Password minimal 6 karakter.");
  if (authMode === "register" && !name) return authMsg("Isi nama Anda.");
  btn.disabled = true; authMsg("");
  try {
    if (authMode === "login") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else if (authMode === "register") {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: APP_URL } });
      if (error) throw error;
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error("already registered");
      if (!data.session) { setAuthMode("login"); $("#authForm [name=email]").value = email; authMsg("Akun dibuat. Buka email Anda dan klik link konfirmasi, lalu masuk di sini.", true); }
    } else if (authMode === "forgot") {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
      if (error) throw error;
      authMsg("Link sudah dikirim. Buka email Anda untuk membuat password baru.", true);
    } else if (authMode === "reset") {
      const { data, error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      recovering = false; history.replaceState(null, "", APP_URL);
      toast("Password diperbarui.");
      if (user && user.id === data.user.id) gate("app"); else setUser(data.user);
    }
  } catch (err) { authMsg(trErr(err)); }
  finally { btn.disabled = false; }
});

$("#acctBtn").onclick = async () => {
  const id = await Dlg.menu(user ? user.email : "Akun", [{ id: "out", label: "Keluar", icon: "logout", danger: true }]);
  if (id === "out") { await sb.auth.signOut(); toast("Anda sudah keluar."); }
};

/* =====================================================================
   NAVIGASI
===================================================================== */
function showView(name) {
  if (!$(`.view[data-view="${name}"]`)) name = "search";
  $$(".view").forEach(v => v.hidden = v.dataset.view !== name);
  $$("[data-tab]").forEach(b => b.setAttribute("aria-current", b.dataset.tab === name ? "page" : "false"));
  $$("[data-hist]").forEach(b => b.setAttribute("aria-current", "false"));
  store.set("lastView", name);
  setSheet(false);
  if (name === "radio") Radio.ensure();
  if (name === "browse") Browse.ensure();
  window.scrollTo({ top: 0 });
}
$$("[data-tab]").forEach(b => b.onclick = () => { showView(b.dataset.tab); if (b.dataset.tab === "search") Quick.open(); });

/* Kolom cari kecil di header: ikon → kolom ketik */
const Quick = {
  get el() { return $("#quick"); },
  isOpen() { return this.el.classList.contains("open"); },
  open(focus = true) {
    this.el.classList.add("open"); $("#qOpen").setAttribute("aria-expanded", "true");
    if (focus) setTimeout(() => $("#q").focus(), 0);
  },
  close() { this.el.classList.remove("open"); $("#qOpen").setAttribute("aria-expanded", "false"); $("#q").blur(); }
};
$("#qOpen").onclick = () => Quick.isOpen() ? $("#q").focus() : Quick.open();
$("#qClose").onclick = () => Quick.close();
$("#q").addEventListener("keydown", e => { if (e.key === "Escape") Quick.close(); });
// Pencarian bisa dimulai dari menu mana pun: pindah ke halaman Cari & tampilkan kata kuncinya
// Di HP kolom ditutup lagi setelah mencari agar hasil terlihat penuh dan menu cepat muncul kembali.
function toSearchView() { if (isMobile()) Quick.close(); else Quick.open(false); if ($('.view[data-view="search"]').hidden) showView("search"); }

/* =====================================================================
   LAGU: identitas & baris daftar
   kind: yt | sc | audius | archive | local | legacy(favorit lama, dicari ulang di YouTube) | radio
===================================================================== */
const SRC_LABEL = { yt: "YouTube", sc: "SoundCloud", audius: "Audius", archive: "Internet Archive", local: "File lokal", legacy: "YouTube", radio: "Radio" };
const SRC_CLASS = { yt: "yt", legacy: "yt", sc: "sc", audius: "audius", archive: "archive" };
function songKey(it) {
  if (it.kind === "yt") return "yt:" + it.vid;
  if (it.kind === "sc") return "sc:" + (it.scid || it.scurl);
  if (it.kind === "audius") return "au:" + it.auid;
  if (it.kind === "archive") return "ia:" + it.aid;
  return "t:" + norm(it.title + " " + it.artist);
}
function plainSong(it) {
  const o = {}; ["kind", "vid", "scid", "scurl", "auid", "aid", "src", "title", "artist", "album", "year", "dur", "art", "raw"].forEach(k => { if (it[k] != null && it[k] !== "") o[k] = it[k]; });
  if (o.kind === "archive") delete o.src;
  return o;
}

function trackRow(it, list, i, ctx) {
  const art = it.art
    ? el("img", { class: "art", src: it.art, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer", onerror: e => e.target.replaceWith(el("div", { class: "art" }, icon("music"))) })
    : el("div", { class: "art" }, icon("music"));
  const sub = el("span", { class: "row-sub" }, el("span", { class: "a", text: [it.artist, it.year].filter(Boolean).join(", ") || " " }));
  if (it.kind !== "local") sub.prepend(el("span", { class: "src " + (SRC_CLASS[it.kind] || ""), text: SRC_LABEL[it.kind] || "" }));
  const end = el("div", { class: "row-end" }, el("span", { class: "eq", "aria-hidden": "true" }, el("i"), el("i"), el("i")), el("span", { class: "dur", text: fmt(it.dur) }));
  if (it.kind !== "local") {
    const h = el("button", { class: "icon-btn plain heart", "aria-label": "Simpan ke favorit", title: "Simpan ke favorit" }, icon("heart"));
    h._it = it; h.classList.toggle("on", Fav.has(it));
    h.onclick = e => { e.stopPropagation(); Fav.toggle(it); };
    end.append(h);
  }
  const more = el("button", { class: "icon-btn plain", "aria-label": "Pilihan lain" }, icon("more"));
  more.onclick = e => { e.stopPropagation(); rowMenu(it, ctx); };
  end.append(more);
  const row = el("div", { class: "row", role: "button", tabindex: "0", "data-key": songKey(it) }, art, el("div", { class: "row-meta" }, el("span", { class: "row-title", text: it.title }), sub), end);
  row.onclick = () => { if (ctx === "search") History.pick(S.q, it); Player.playList(list, i); };
  row.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.click(); } };
  return row;
}
function renderRows(box, list, ctx, from = 0) {
  if (!from) box.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (let i = from; i < list.length; i++) frag.append(trackRow(list[i], list, i, ctx));
  box.append(frag); markPlaying();
}
function markPlaying() {
  const k = Player.cur ? (Player.cur.kind === "radio" ? "radio:" + Player.cur.uuid : songKey(Player.cur)) : null;
  $$(".row").forEach(r => {
    const on = !!k && r.dataset.key === k;
    r.classList.toggle("playing", on);
    r.classList.toggle("live-on", on && Player.playing);
  });
}
function refreshHearts() {
  $$(".row .heart").forEach(h => h._it && h.classList.toggle("on", Fav.has(h._it)));
  const c = Player.cur, show = !!c && c.kind !== "local" && c.kind !== "radio";
  ["#nHeart", "#bHeart"].forEach(s => { $(s).hidden = !show; if (show) $(s).classList.toggle("on", Fav.has(c)); });
}
async function rowMenu(it, ctx) {
  const items = [{ id: "next", label: "Putar setelah lagu ini", icon: "queue" }, { id: "queue", label: "Tambah ke antrean", icon: "plus" }];
  if (it.kind !== "local") items.push({ id: "save", label: "Simpan ke folder…", icon: "folder" });
  if (ctx === "fav") { items.push({ id: "move", label: "Pindahkan ke folder lain…", icon: "move" }, { id: "del", label: "Hapus dari folder ini", icon: "trash", danger: true }); }
  const id = await Dlg.menu(it.title, items);
  if (id === "next") Player.enqueue(it, true);
  else if (id === "queue") Player.enqueue(it, false);
  else if (id === "save") { const f = await pickFolder("Simpan ke folder"); if (f) Fav.addTo(f, it); }
  else if (id === "move") { const f = await pickFolder("Pindahkan ke", Fav.active); if (f) Fav.move(it, f); }
  else if (id === "del") Fav.removeFrom(Fav.active, it);
}
async function pickFolder(title, exclude) {
  const opts = Fav.folders.filter(f => f.id !== exclude).map(f => ({ id: f.id, label: f.name, icon: "folder" }));
  opts.push({ id: "__new", label: "Folder baru…", icon: "plus" });
  let id = await Dlg.menu(title, opts);
  if (id === "__new") { const n = await Dlg.text("Nama folder baru", "", "Buat folder"); if (!n) return null; const f = await Fav.createFolder(n); id = f && f.id; }
  return id;
}

/* =====================================================================
   FAVORIT (database, terikat akun)
===================================================================== */
const Fav = {
  folders: [], rows: [], active: null, loaded: false,
  reset() { this.folders = []; this.rows = []; this.active = null; this.loaded = false; },
  cur() { return this.folders.find(f => f.id === this.active) || this.folders[0]; },
  rowsOf(fid) { return this.rows.filter(r => r.folder_id === fid); },
  has(it) { if (!this.loaded) return false; const k = songKey(it); return this.rows.some(r => r.folder_id === this.active && r.song_key === k); },
  dbErr(e) {
    const m = (e && e.message) || "";
    if (/does not exist|could not find the table|schema cache/i.test(m) || (e && (e.code === "42P01" || e.code === "PGRST205")))
      return "Tabel database belum dibuat. Jalankan supabase-setup.sql di Supabase SQL Editor.";
    if (/jwt|auth/i.test(m)) return "Sesi login berakhir. Silakan masuk lagi.";
    if (/failed to fetch|network/i.test(m)) return "Tidak bisa terhubung ke database. Periksa koneksi internet.";
    return "Database: " + m;
  },
  async load() {
    const box = $("#favs"); box.innerHTML = ""; box.append(el("div", { class: "skeleton" }), el("div", { class: "skeleton" }));
    try {
      let { data: folders, error } = await sb.from("folders").select("id,name,created_at").order("created_at");
      if (error) throw error;
      if (!folders.length) {
        const r = await sb.from("folders").insert({ name: "Lagu Favorit" }).select("id,name,created_at").single();
        if (r.error) throw r.error; folders = [r.data];
      }
      const rows = []; let from = 0;
      for (; ;) {
        const { data, error: e2 } = await sb.from("favorites").select("id,folder_id,song_key,song,created_at").order("created_at", { ascending: true }).range(from, from + 999);
        if (e2) throw e2; rows.push(...data); if (data.length < 1000) break; from += 1000;
      }
      this.folders = folders; this.rows = rows; this.loaded = true;
      const saved = store.get("activeFolder:" + user.id, null);
      this.active = folders.some(f => f.id === saved) ? saved : folders[0].id;
      this.render(); refreshHearts(); this.offerImport();
    } catch (e) {
      box.innerHTML = ""; box.append(el("div", { class: "empty" }, el("p", { text: this.dbErr(e) }), el("button", { class: "btn ghost", text: "Coba lagi", onclick: () => this.load() })));
    }
  },
  setActive(id) { this.active = id; store.set("activeFolder:" + user.id, id); this.render(); refreshHearts(); },
  render() {
    const chips = $("#folderChips"); chips.innerHTML = "";
    this.folders.forEach(f => chips.append(el("button", { class: "chip", "aria-pressed": f.id === this.active, text: `${f.name} (${this.rowsOf(f.id).length})`, onclick: () => this.setActive(f.id) })));
    const f = this.cur(); if (!f) return;
    const list = this.rowsOf(f.id).map(r => Object.assign({}, r.song, { _rowId: r.id }));
    this._list = list;
    $("#fName").textContent = f.name;
    $("#fCount").textContent = list.length ? `${list.length} lagu, tersimpan di akun Anda` : "";
    $("#fPlay").disabled = $("#fShuffle").disabled = !list.length;
    const box = $("#favs");
    if (!list.length) { box.innerHTML = ""; box.append(el("div", { class: "empty" }, el("p", { text: "Folder ini masih kosong. Tekan ikon hati di lagu mana pun untuk menyimpannya di sini." }))); return; }
    renderRows(box, list, "fav");
  },
  async addTo(fid, it) {
    const k = songKey(it);
    if (this.rows.some(r => r.folder_id === fid && r.song_key === k)) { toast("Lagu sudah ada di folder itu."); return; }
    const { data, error } = await sb.from("favorites").insert({ folder_id: fid, song_key: k, song: plainSong(it) }).select("id,folder_id,song_key,song,created_at").single();
    if (error) { if (error.code === "23505") return toast("Lagu sudah ada di folder itu."); return toast(this.dbErr(error)); }
    this.rows.push(data); this.render(); refreshHearts();
    toast(`Disimpan ke "${(this.folders.find(f => f.id === fid) || {}).name}".`);
  },
  async removeFrom(fid, it) {
    const k = songKey(it), r = this.rows.find(x => x.folder_id === fid && x.song_key === k); if (!r) return;
    const { error } = await sb.from("favorites").delete().eq("id", r.id);
    if (error) return toast(this.dbErr(error));
    this.rows = this.rows.filter(x => x !== r); this.render(); refreshHearts(); toast("Dihapus dari folder.");
  },
  toggle(it) {
    if (!this.loaded) return toast("Favorit masih dimuat…");
    return this.has(it) ? this.removeFrom(this.active, it) : this.addTo(this.active, it);
  },
  async move(it, fid) {
    const k = songKey(it), r = this.rows.find(x => x.folder_id === this.active && x.song_key === k); if (!r) return;
    if (this.rows.some(x => x.folder_id === fid && x.song_key === k)) { await this.removeFrom(this.active, it); return; }
    const { error } = await sb.from("favorites").update({ folder_id: fid }).eq("id", r.id);
    if (error) return toast(this.dbErr(error));
    r.folder_id = fid; this.render(); refreshHearts(); toast("Dipindahkan.");
  },
  async upgrade(it, oldKey) { // favorit lama dicocokkan ke YouTube: simpan versi barunya
    const rows = this.rows.filter(r => r.song_key === oldKey); if (!rows.length) return;
    for (const r of rows) {
      const k = songKey(it); if (this.rows.some(x => x.folder_id === r.folder_id && x.song_key === k)) continue;
      const { error } = await sb.from("favorites").update({ song_key: k, song: plainSong(it) }).eq("id", r.id);
      if (!error) { r.song_key = k; r.song = plainSong(it); }
    }
    if (!$("[data-view=favs]").hidden) this.render(); refreshHearts();
  },
  async createFolder(name) {
    if (this.folders.some(f => f.name.toLowerCase() === name.toLowerCase())) { toast("Nama folder sudah dipakai."); return null; }
    const { data, error } = await sb.from("folders").insert({ name }).select("id,name,created_at").single();
    if (error) { toast(this.dbErr(error)); return null; }
    this.folders.push(data); this.render(); return data;
  },
  async rename() {
    const f = this.cur(); const n = await Dlg.text("Ubah nama folder", f.name); if (!n || n === f.name) return;
    if (this.folders.some(x => x !== f && x.name.toLowerCase() === n.toLowerCase())) return toast("Nama folder sudah dipakai.");
    const { error } = await sb.from("folders").update({ name: n }).eq("id", f.id);
    if (error) return toast(this.dbErr(error)); f.name = n; this.render();
  },
  async remove() {
    const f = this.cur(); if (this.folders.length < 2) return toast("Minimal harus ada satu folder.");
    if (!await Dlg.confirm(`Hapus folder "${f.name}"?`, `${this.rowsOf(f.id).length} lagu di dalamnya ikut terhapus.`, "Hapus folder", true)) return;
    const { error } = await sb.from("folders").delete().eq("id", f.id);
    if (error) return toast(this.dbErr(error));
    this.folders = this.folders.filter(x => x !== f); this.rows = this.rows.filter(r => r.folder_id !== f.id);
    this.setActive(this.folders[0].id); toast("Folder dihapus.");
  },
  /* Impor favorit lama dari versi sebelumnya (localStorage) ke akun */
  legacy() {
    let d = store.get("music_favs_v2", null), out = [];
    if (d && Array.isArray(d.folders)) d.folders.forEach(f => (f.songs || []).forEach(s => out.push([f.name, s])));
    else (store.get("music_favs_v1", []) || []).forEach(s => out.push(["Lagu Favorit", s]));
    return out.filter(([, s]) => s && s.title);
  },
  offerImport() {
    const box = $("#importBox"), items = this.legacy();
    if (!items.length || store.get("imported:" + user.id, false)) { box.hidden = true; return; }
    box.innerHTML = ""; box.hidden = false;
    box.append(el("p", { text: `Ada ${items.length} lagu favorit lama yang tersimpan di browser ini. Pindahkan ke akun agar bisa dibuka di perangkat lain?` }),
      el("button", { class: "btn primary", text: "Pindahkan ke akun", onclick: () => this.importLegacy(items) }),
      el("button", { class: "btn ghost", text: "Abaikan", onclick: () => { store.set("imported:" + user.id, true); box.hidden = true; } }));
  },
  async importLegacy(items) {
    const box = $("#importBox"); box.querySelectorAll("button").forEach(b => b.disabled = true);
    try {
      const byName = {};
      for (const [fname] of items) {
        if (byName[fname]) continue;
        let f = this.folders.find(x => x.name.toLowerCase() === fname.toLowerCase());
        if (!f) f = await this.createFolder(fname);
        byName[fname] = f;
      }
      const recs = [], seen = new Set();
      for (const [fname, s] of items) {
        const f = byName[fname]; if (!f) continue;
        let it;
        if (s.aid) it = { kind: "archive", aid: s.aid, title: s.title, artist: s.artist, year: s.year, art: s.art };
        else if (/audius/i.test(s.source || "") && s.src) it = { kind: "audius", auid: (s.src.match(/tracks\/([^/]+)\/stream/) || [])[1] || norm(s.title), src: s.src, title: s.title, artist: s.artist, dur: s.dur, art: s.art };
        else it = { kind: "legacy", title: s.title, artist: s.artist, album: s.album, year: s.year, art: s.art };
        const k = songKey(it), uk = f.id + "|" + k;
        if (seen.has(uk) || this.rows.some(r => r.folder_id === f.id && r.song_key === k)) continue;
        seen.add(uk); recs.push({ folder_id: f.id, song_key: k, song: plainSong(it) });
      }
      if (recs.length) {
        const { data, error } = await sb.from("favorites").upsert(recs, { onConflict: "folder_id,song_key", ignoreDuplicates: true }).select("id,folder_id,song_key,song,created_at");
        if (error) throw error; this.rows.push(...(data || []));
      }
      store.set("imported:" + user.id, true); box.hidden = true; this.render(); refreshHearts();
      toast(`${recs.length} lagu dipindahkan ke akun Anda.`);
    } catch (e) { toast(this.dbErr(e)); box.querySelectorAll("button").forEach(b => b.disabled = false); }
  }
};
$("#fNew").onclick = async () => { const n = await Dlg.text("Nama folder baru", "", "Buat folder"); if (!n) return; const f = await Fav.createFolder(n); if (f) Fav.setActive(f.id); };
$("#fMenu").onclick = async () => {
  const id = await Dlg.menu(Fav.cur() ? Fav.cur().name : "Folder", [{ id: "ren", label: "Ubah nama folder", icon: "edit" }, { id: "del", label: "Hapus folder", icon: "trash", danger: true }]);
  if (id === "ren") Fav.rename(); else if (id === "del") Fav.remove();
};
$("#fPlay").onclick = () => Fav._list && Fav._list.length && Player.playList(Fav._list, 0);
$("#fShuffle").onclick = () => { if (!Fav._list || !Fav._list.length) return; Player.shuffle = true; updateModes(); Player.playList(Fav._list, Math.floor(Math.random() * Fav._list.length)); };

/* =====================================================================
   PENCARIAN — hanya lagu penuh (tanpa preview 30 detik)
===================================================================== */
const MIN_SEC = 60; // apa pun di bawah 1 menit (preview, Shorts) tidak ditampilkan
const NOISE = /\b(reaction|react|tutorial|chord|kunci gitar|karaoke|cover|covered|remix|slowed|reverb|nightcore|8d|sped up|speed up|shorts|instrumental|drum cam|review|podcast|tribute|parodi|parody|mashup|interview|wawancara|vlog|trailer|teaser|unboxing|talkshow|talk show|fancam|dance practice|random dance|relay dance|dance challenge|asmr|music box|lullaby)\b/;

function splitTitle(raw, channel) {
  let t = decodeHtml(raw || "");
  const clean = s => s
    .replace(/[\(\[【][^\)\]】]*(official|video|audio|lyric|lirik|mv|clip|klip|hd|4k|visuali[sz]er|music|live|full|version|versi)[^\)\]】]*[\)\]】]/gi, " ")
    .replace(/\b(official (music )?video|official audio|official lyric video|lyric video|video lirik|lirik lagu|video klip|music video)\b/gi, " ")
    .replace(/\s*\|.*$/, " ").replace(/\s{2,}/g, " ").replace(/[\s\-–|]+$/, "").trim();
  let artist = (channel || "").replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").replace(/\b(official|channel|music|tv)\b/gi, "").replace(/\s{2,}/g, " ").trim();
  const m = t.match(/^(.{1,60}?)\s+[-–—]\s+(.+)$/);
  let title = t;
  if (m) { artist = m[1].trim(); title = m[2]; }
  return { title: clean(title) || t, artist: artist || channel || "" };
}
function isoDur(s) { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(s || ""); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : null; }
function ytItem(vid, rawTitle, channel, dur) {
  const { title, artist } = splitTitle(rawTitle, channel);
  return { kind: "yt", vid, title, artist, raw: decodeHtml(rawTitle), dur: dur || null, art: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` };
}

/* --- YouTube: API resmi (bila ada key) atau server publik Piped / Invidious --- */
// Server sendiri (config.js) dicoba lebih dulu, lalu server publik.
const ownHosts = v => (Array.isArray(v) ? v : []).map(h => String(h).trim().replace(/\/+$/, "")).filter(h => /^https:\/\//.test(h));
const PIPED = [...new Set([...ownHosts(CFG.PIPED_INSTANCES), "https://pipedapi.kavin.rocks", "https://pipedapi.adminforge.de", "https://api.piped.private.coffee", "https://pipedapi.r4fo.com"])];
const INVID = [...new Set([...ownHosts(CFG.INVIDIOUS_INSTANCES), "https://inv.nadeko.net", "https://invidious.nerdvpn.de", "https://yewtu.be", "https://invidious.privacyredirect.com", "https://iv.melmac.space"])];
let ytKeyDead = false, goodPiped = null, goodInv = null;

async function ytApiSearch(q, st) {
  const key = CFG.YOUTUBE_API_KEY;
  const d = await getJSON(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&videoSyndicated=true&maxResults=25&regionCode=ID&q=${enc(q)}&key=${key}` + (st.ytPage ? `&pageToken=${st.ytPage}` : ""));
  st.ytPage = d.nextPageToken || null;
  const ids = (d.items || []).map(x => x.id && x.id.videoId).filter(Boolean);
  const durs = {};
  if (ids.length) {
    const v = await getJSON(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids.join(",")}&key=${key}`);
    (v.items || []).forEach(x => durs[x.id] = isoDur(x.contentDetails.duration));
  }
  const items = (d.items || []).filter(x => x.id && x.id.videoId && x.snippet.liveBroadcastContent === "none")
    .map(x => ytItem(x.id.videoId, x.snippet.title, x.snippet.channelTitle, durs[x.id.videoId]))
    .filter(it => it.dur && it.dur >= MIN_SEC);
  return { items, more: !!st.ytPage };
}
// Coba server satu per satu, TAPI tidak menunggu yang lambat: bila server pertama belum menjawab dalam `stagger` ms,
// server berikutnya ikut dicoba bersamaan. Yang menjawab lebih dulu dipakai. Jauh lebih cepat bila ada server publik yang mati/lambat.
function tryHosts(hosts, good, fn, { stagger = 1200 } = {}) {
  const order = good ? [good, ...hosts.filter(h => h !== good)] : hosts.slice();
  return new Promise((resolve, reject) => {
    let started = 0, failed = 0, done = false, timer, last;
    const launch = () => {
      if (done || started >= order.length) return;
      const h = order[started++];
      clearTimeout(timer);
      if (started < order.length) timer = setTimeout(launch, stagger);
      Promise.resolve().then(() => fn(h)).then(
        r => { if (!done) { done = true; clearTimeout(timer); resolve([r, h]); } },
        e => {
          last = e; if (done) return;
          if (++failed >= order.length) { done = true; clearTimeout(timer); reject(last || new Error("semua server gagal")); }
          else launch();
        });
    };
    if (!order.length) return reject(new Error("tidak ada server"));
    launch();
  });
}
const hostDown = { piped: 0, inv: 0 };   // bila semua server satu kelompok gagal, lewati dulu 2 menit agar pencarian berikutnya tidak menunggu lagi
async function ytKeylessSearch(q, st) {
  if (!st.ytK) st.ytK = { page: 0, piped: null, usePiped: true };
  const k = st.ytK;
  // Piped (filter "music_songs" = katalog lagu YouTube Music, sangat relevan)
  if (k.usePiped && Date.now() < hostDown.piped) k.usePiped = false;
  if (k.usePiped) {
    try {
      const [d, h] = await tryHosts(PIPED, goodPiped, h => getJSON(k.piped
        ? `${h}/nextpage/search?nextpage=${enc(k.piped)}&q=${enc(q)}&filter=music_songs`
        : `${h}/search?q=${enc(q)}&filter=music_songs`, { timeout: 5500 }));
      goodPiped = h; k.piped = d.nextpage || null;
      const items = (d.items || []).filter(x => x.url && x.duration >= MIN_SEC)
        .map(x => ytItem((x.url.match(/v=([\w-]{11})/) || [])[1], x.title, x.uploaderName, x.duration)).filter(x => x.vid);
      if (items.length || k.piped) return { items, more: !!k.piped };
    } catch (e) { hostDown.piped = Date.now() + 120000; /* lanjut ke Invidious */ }
    k.usePiped = false;
  }
  k.page++;
  let d, h;
  try { [d, h] = await tryHosts(INVID, goodInv, h => getJSON(`${h}/api/v1/search?q=${enc(q)}&type=video&page=${k.page}&region=ID`, { timeout: 5500 })); }
  catch (e) { hostDown.inv = Date.now() + 120000; throw e; }
  goodInv = h;
  const items = (d || []).filter(x => x.type === "video" && !x.liveNow && x.lengthSeconds >= MIN_SEC)
    .map(x => ytItem(x.videoId, x.title, x.author, x.lengthSeconds));
  return { items, more: (d || []).length >= 15 };
}
async function ytSearch(q, st) {
  if (CFG.YOUTUBE_API_KEY && !ytKeyDead) {
    try { return await ytApiSearch(q, st); }
    catch (e) { if (e.status === 403 || e.status === 400) { ytKeyDead = true; st.ytPage = null; } else throw e; }
  }
  return ytKeylessSearch(q, st);
}
/* --- YouTube tanpa iklan: ambil aliran AUDIO lagunya (lewat Piped / Invidious), diputar oleh elemen <audio>.
   Tidak ada pemutar video YouTube = tidak ada iklan, dan audio tetap jalan saat layar HP terkunci.
   Semua server dihubungi BERSAMAAN; server yang menjawab paling cepat langsung dipakai. --- */
const YtAudio = {
  cache: new Map(), bad: new Set(),
  discovered: store.get("ytHosts:v2", null),
  good: store.get("ytGood", {}),
  canPlay(m) { return !m || !!Player.audio.canPlayType(String(m).split(";")[0]); },
  m4aFirst(a, b, k) { return (/mp4|m4a/.test(b[k] || "") - /mp4|m4a/.test(a[k] || "")) || ((b.bitrate || 0) - (a.bitrate || 0)); },
  // Daftar server yang sedang sehat, dari direktori resmi Piped & Invidious (disimpan 12 jam)
  async discover() {
    const d = this.discovered; if (d && Date.now() - d.t < 12 * 3600e3) return;
    const [p, i] = await Promise.allSettled([
      getJSON("https://piped-instances.kavin.rocks/", { timeout: 6000 }),
      getJSON("https://api.invidious.io/instances.json?sort_by=health", { timeout: 6000 })]);
    const piped = p.status === "fulfilled" && Array.isArray(p.value) ? p.value.map(x => x && x.api_url).filter(u => /^https:\/\//.test(u || "")) : [];
    const inv = i.status === "fulfilled" && Array.isArray(i.value) ? i.value.map(x => x && x[1]).filter(x => x && x.type === "https" && x.api === true && x.cors !== false && x.uri).map(x => x.uri) : [];
    if (piped.length || inv.length) { this.discovered = { t: Date.now(), piped: piped.slice(0, 12), inv: inv.slice(0, 12) }; store.set("ytHosts:v2", this.discovered); }
  },
  hosts(kind) {
    const base = kind === "piped" ? PIPED : INVID, disc = (this.discovered && this.discovered[kind]) || [];
    // urutan: server sendiri (config.js) → server yang terakhir berhasil → direktori → bawaan
    const own = base.slice(0, ownHosts(kind === "piped" ? CFG.PIPED_INSTANCES : CFG.INVIDIOUS_INSTANCES).length);
    return [...new Set([...own, this.good[kind], ...disc, ...base].filter(Boolean).map(h => String(h).replace(/\/+$/, "")))].slice(0, 8);
  },
  setGood(kind, h) { if (kind && h && this.good[kind] !== h) { this.good[kind] = h; store.set("ytGood", this.good); } },
  get(vid) {
    const c = this.cache.get(vid);
    const usable = c && Date.now() - c.t < 45 * 60e3 && (c.pending > 0 || c.found.some(u => !this.bad.has(u)));
    if (usable) return c;
    const r = this.resolve(vid); this.cache.set(vid, r);
    if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value);
    return r;
  },
  drop(vid) { this.cache.delete(vid); },
  resolve(vid) {
    const r = { t: Date.now(), found: [], from: {}, pending: 0, waiters: [] };
    const wake = () => r.waiters.splice(0).forEach(f => f());
    const add = (urls, kind, h) => { urls.forEach(u => { if (u && !r.found.includes(u)) { r.found.push(u); r.from[u] = [kind, h]; } }); wake(); };
    const job = p => { r.pending++; p.catch(() => { }).finally(() => { r.pending--; wake(); }); };
    const ph = this.hosts("piped"), ih = this.hosts("inv");
    // cadangan terakhir: alamat audio langsung Invidious (tanpa API) — dicoba begitu semua API menjawab gagal
    let jp = 0;
    const fallback = () => { if (r.fb) return; r.fb = true; if (!r.found.length) add([this.good.inv, ...ih].filter(Boolean).filter((h, k, a) => a.indexOf(h) === k).slice(0, 2).map(h => `${h}/latest_version?id=${enc(vid)}&itag=140&local=true`), "inv", null); };
    const apiJob = p => { jp++; job(p.finally(() => { if (--jp === 0) fallback(); })); };
    ph.forEach(h => apiJob(getJSON(`${h}/streams/${enc(vid)}`, { timeout: 7000 }).then(d => {
      const a = (d.audioStreams || []).filter(x => x.url && !x.videoOnly && this.canPlay(x.mimeType)).sort((x, y) => this.m4aFirst(x, y, "mimeType"));
      if (a.length) add(a.slice(0, 2).map(x => x.url), "piped", h);
    })));
    ih.forEach(h => apiJob(getJSON(`${h}/api/v1/videos/${enc(vid)}?local=true&fields=adaptiveFormats`, { timeout: 7000 }).then(d => {
      const a = (d.adaptiveFormats || []).filter(x => x.url && /^audio\//.test(x.type || "") && this.canPlay(x.type))
        .map(x => Object.assign({}, x, { url: x.url.startsWith("/") ? h + x.url : x.url }))
        .filter(x => !/googlevideo\.com/.test(x.url)) // alamat langsung Google terkunci ke server: tidak bisa dipakai browser
        .sort((x, y) => this.m4aFirst(x, y, "type"));
      if (a.length) add(a.slice(0, 2).map(x => x.url), "inv", h);
    })));
    job(new Promise(f => setTimeout(f, 7500)).then(fallback)); // pengaman bila ada server yang tidak menjawab sama sekali
    return r;
  },
  // sumber berikutnya yang belum dicoba; menunggu bila server masih menjawab
  async next(r, tried) {
    for (; ;) {
      const u = r.found.find(x => !tried.has(x) && !this.bad.has(x));
      if (u) return u;
      if (r.pending === 0) return null;
      await new Promise(f => r.waiters.push(f));
    }
  }
};
/* --- Sumber alternatif: dipakai HANYA bila sumber utama sebuah lagu gagal total (lihat Player.tryAlt). ---
   Mencari unggahan YouTube lain dari lagu yang sama, lalu versi Audius. Hasil harus lolos saringan relevansi yang sama
   dengan pencarian (artis + judul cocok) dan durasinya mirip, supaya yang diputar memang lagu yang sama. */
async function findAlternatives(it) {
  const q = `${it.artist || ""} ${it.title || ""}`.replace(/\s+/g, " ").trim();
  if (q.length < 2) return [];
  const seen = new Set([it.vid]), out = [];
  const durOk = d => !it.dur || !d || Math.abs(d - it.dur) <= Math.max(20, it.dur * .2);
  const [yt, au] = await Promise.allSettled([ytSearch(engineQuery(q), {}), audiusSearch(q, {})]);
  if (yt.status === "fulfilled") {
    yt.value.items.map(x => ({ x, r: relevance(x, q) })).filter(o => o.r.ok && o.x.vid && !seen.has(o.x.vid) && durOk(o.x.dur))
      .sort((a, b) => b.r.score - a.r.score).slice(0, 3).forEach(o => { seen.add(o.x.vid); out.push({ kind: "yt", vid: o.x.vid }); });
  }
  if (au.status === "fulfilled") au.value.items.filter(x => relevance(x, q).ok && durOk(x.dur)).slice(0, 1).forEach(x => out.push({ kind: "audius", src: x.src }));
  return out;
}
async function ytFindOne(q) {
  const r = await ytSearch(q, {});
  const best = r.items.sort((a, b) => score(b, q) - score(a, q))[0];
  if (!best) throw new Error("versi lengkap tidak ditemukan");
  return best;
}

/* --- SoundCloud: pencarian (butuh Client ID, opsional) + tempel link (tanpa kunci) --- */
let scApiP = null;
function loadSCApi() {
  if (window.SC && SC.Widget) return Promise.resolve();
  return scApiP || (scApiP = new Promise((res, rej) => {
    const s = el("script", { src: "https://w.soundcloud.com/player/api.js" });
    s.onload = () => res();
    s.onerror = () => { scApiP = null; s.remove(); rej(new Error("SoundCloud tidak bisa dimuat")); };
    document.head.append(s);
  }));
}
const SC_URL = /^https?:\/\/(?:www\.|m\.|on\.)?soundcloud\.com\/\S+$/i;
function scItem(x) {
  return {
    kind: "sc", scid: x.id, scurl: x.permalink_url, title: x.title,
    artist: (x.user && x.user.username) || (x.publisher_metadata && x.publisher_metadata.artist) || "SoundCloud",
    dur: Math.round((x.full_duration || x.duration || 0) / 1000),
    year: (x.release_date || x.created_at || "").slice(0, 4) || null,
    art: x.artwork_url ? x.artwork_url.replace("-large", "-t300x300") : (x.user && x.user.avatar_url) || null
  };
}
async function scSearch(q, st) {
  const cid = CFG.SOUNDCLOUD_CLIENT_ID;
  if (!cid) return { more: false, items: [] };
  st.scPage = (st.scPage ?? -1) + 1;
  const d = (await getJSON(`https://api-v2.soundcloud.com/search/tracks?q=${enc(q)}&client_id=${enc(cid)}&limit=25&offset=${st.scPage * 25}`)).collection || [];
  return {
    more: d.length >= 25,
    items: d.filter(x => x.permalink_url && x.streamable !== false && x.policy !== "BLOCK" && x.policy !== "SNIP" && (x.full_duration || x.duration) >= MIN_SEC * 1000).map(scItem)
  };
}
// Baca info lagu/playlist dari link SoundCloud lewat widget tersembunyi (tanpa kunci API)
async function scFromUrl(url) {
  await loadSCApi();
  return new Promise((resolve, reject) => {
    const f = el("iframe", { src: "https://w.soundcloud.com/player/?auto_play=false&url=" + enc(url), allow: "autoplay", "aria-hidden": "true", tabindex: "-1", style: "position:fixed;left:-9999px;top:0;width:300px;height:166px;border:0" });
    document.body.append(f);
    let done = false;
    const end = (fn, v) => { if (done) return; done = true; clearTimeout(t); try { f.remove(); } catch { } fn(v); };
    const t = setTimeout(() => end(reject, new Error("Link SoundCloud tidak merespons.")), 15000);
    const w = SC.Widget(f);
    w.bind(SC.Widget.Events.READY, () => {
      w.getSounds(list => {
        if (Array.isArray(list) && list.length) return end(resolve, list.map(scItem).filter(x => x.scurl));
        w.getCurrentSound(s => s && s.permalink_url ? end(resolve, [scItem(s)]) : end(reject, new Error("Lagu tidak ditemukan atau tidak boleh diputar di luar SoundCloud.")));
      });
    });
    w.bind(SC.Widget.Events.ERROR, () => end(reject, new Error("Link SoundCloud tidak bisa dibuka.")));
  });
}
async function runScUrl(url) {
  S = { q: url, items: [], keys: new Set(), more: {}, st: {}, tok: S.tok + 1, busy: false };
  const tk = S.tok;
  $("#results").innerHTML = ""; $("#results").append(el("div", { class: "skeleton" }), el("div", { class: "skeleton" }));
  setSearchHome(false); $("#more").hidden = true; $("#count").textContent = "Membuka link SoundCloud…"; $("#q").blur();
  try {
    const items = await scFromUrl(url);
    if (tk !== S.tok) return;
    items.forEach(it => { const k = songKey(it); if (!S.keys.has(k)) { S.keys.add(k); S.items.push(it); } });
    $("#results").innerHTML = "";
    renderRows($("#results"), S.items, "search", 0);
    $("#count").textContent = S.items.length > 1 ? `${S.items.length} lagu dari link SoundCloud. Ketuk untuk memutar.` : "Lagu dari link SoundCloud. Ketuk untuk memutar.";
    if (S.items.length) History.add(url, srcSel, S.items[0], S.items.length);
  } catch (e) {
    if (tk !== S.tok) return;
    $("#results").innerHTML = ""; $("#count").textContent = "";
    $("#results").append(el("div", { class: "empty" }, el("p", { text: e.message || "Link SoundCloud tidak bisa dibuka." })));
  }
}
function updateScHint() {
  const h = $("#scHint"); if (!h) return;
  const show = !CFG.SOUNDCLOUD_CLIENT_ID && (srcSel === "soundcloud" || srcSel === "all") && $("#q").value.trim().length >= 2 && !SC_URL.test($("#q").value.trim());
  h.hidden = !show; if (!show) return;
  h.textContent = "SoundCloud: untuk memutar, tempel link lagunya di kolom cari. ";
  h.append(el("a", { href: "https://soundcloud.com/search/sounds?q=" + enc($("#q").value.trim()), target: "_blank", rel: "noopener", text: "Cari “" + $("#q").value.trim() + "” di SoundCloud" }));
}

/* --- Audius --- */
async function audiusSearch(q, st) {
  st.auPage = (st.auPage ?? -1) + 1;
  const d = (await getJSON(`https://api.audius.co/v1/tracks/search?query=${enc(q)}&app_name=LiveMusicPlayer&limit=25&offset=${st.auPage * 25}`)).data || [];
  return {
    more: d.length >= 25, items: d.filter(x => x.is_streamable !== false && x.duration >= MIN_SEC).map(x => ({
      kind: "audius", auid: x.id, title: x.title, artist: x.user && x.user.name, dur: x.duration,
      year: (x.release_date || "").slice(0, 4) || null, art: x.artwork && (x.artwork["150x150"] || x.artwork["480x480"]),
      src: `https://api.audius.co/v1/tracks/${x.id}/stream?app_name=LiveMusicPlayer`
    }))
  };
}
/* --- Internet Archive --- */
async function archiveSearch(q, st) {
  st.iaPage = (st.iaPage || 0) + 1;
  const w = String(q).replace(/[+\-&|!(){}\[\]^"~*?:\\\/]/g, " ").split(/\s+/).filter(Boolean).slice(0, 6), qs = w.join(" AND ") || "music";
  const qq = `(title:(${qs}) OR creator:(${qs})) AND mediatype:(audio)`;
  const d = (await getJSON(`https://archive.org/advancedsearch.php?q=${enc(qq)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&rows=15&page=${st.iaPage}&output=json`)).response.docs || [];
  return {
    more: d.length >= 15, items: d.map(x => ({
      kind: "archive", aid: x.identifier, title: [].concat(x.title || x.identifier)[0], artist: [].concat(x.creator || "Internet Archive")[0],
      year: x.year ? String(x.year).slice(0, 4) : null, art: `https://archive.org/services/img/${x.identifier}`
    }))
  };
}
async function archiveSrc(aid) {
  const m = await getJSON(`https://archive.org/metadata/${aid}`);
  const files = (m.files || []).filter(f => /\.mp3$/i.test(f.name));
  const f = files.find(f => !f.length || parseFloat(f.length) >= MIN_SEC || /:/.test(f.length)) || files[0];
  if (!f) throw new Error("item ini tidak punya file MP3");
  return `https://archive.org/download/${aid}/${f.name.split("/").map(enc).join("/")}`;
}

const SOURCES = { youtube: ytSearch, soundcloud: scSearch, audius: audiusSearch, archive: archiveSearch };
// "Tanpa iklan": sumber yang audionya diputar langsung oleh aplikasi, tanpa pemutar pihak ketiga yang bisa menyisipkan iklan.
const SRC_GROUP = { noads: ["audius", "archive"] };

/* ---------------------------------------------------------------------
   AKURASI PENCARIAN
   Sebuah hasil hanya ditampilkan bila SEMUA kata penting dari kata kunci
   (nama artis/band/grup dan/atau judul) ada di artis, judul, album, atau
   judul asli videonya. Kata umum seperti "lagu", "official", "terbaru",
   genre, atau tahun tidak wajib ada. Cover/karaoke/remix oleh orang lain
   dibuang kecuali kata itu memang dicari.
--------------------------------------------------------------------- */
const OPTIONAL_WORDS = new Set(("lagu lagunya song songs musik music official audio video mv clip klip lirik lyric lyrics full album " +
  "terbaru terbaik terpopuler populer hits hit playlist kumpulan best top new baru the dari by oleh feat ft featuring band grup group " +
  "penyanyi artis pop rock dangdut koplo jazz indie religi nostalgia kenangan galau romantis santai viral tiktok era tahun an " +
  // kata asal/genre: "exo kpop" = cari EXO, bukan lagu yang judulnya memuat kata "kpop"
  "kpop k j jpop cpop thai tpop korea korean jepang japan japanese mandarin china chinese barat luar negeri indo indonesia " +
  "boyband girlband boy girl idol ost drama kdrama").split(" "));
// Pencocokan relevansi memakai semua huruf (termasuk Korea/Jepang/Mandarin), bukan hanya a-z
const normR = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const isOptional = t => OPTIONAL_WORDS.has(t) || /^(19[5-9]\d|20[0-4]\d)$/.test(t) || /^\d{2,4}an$/.test(t);
let qMemo = { q: null };
function qTokens(q) {
  if (qMemo.q === q) return qMemo;
  const all = normR(q).split(" ").filter(Boolean);
  return (qMemo = { q, all, req: all.filter(t => !isOptional(t)), noisy: NOISE.test(norm(q)), comp: COMPILATION.test(norm(q)) });
}
// Video kumpulan (album penuh, nonstop, playlist berjam-jam) bukan "satu lagu"; dibuang kecuali memang dicari.
const COMPILATION = /\b(full album|nonstop|non stop|jukebox|kumpulan lagu|compilation|kompilasi|medley|greatest hits|best of|playlist|\d+ (jam|hours?|hour|lagu|songs?)|top \d+)\b/;
// Kata pengisi dibuang dari kata kunci yang DIKIRIM ke mesin pencari ("lagu tulus terbaru" -> "tulus") agar hasil mesin
// lebih tepat. Hanya bila masih ada kata inti lain; kata kunci asli tetap dipakai untuk menyaring dan untuk riwayat.
const FILLER = new Set(("lagu lagunya song songs musik music official audio video mv clip klip lirik lyric lyrics full terbaru terbaik terpopuler " +
  "populer hits hit playlist kumpulan best top new baru kpop jpop cpop korea korean jepang japan japanese mandarin china chinese barat indo indonesia").split(" "));
function engineQuery(q) {
  const raw = String(q).trim().split(/\s+/);
  const kept = raw.filter(w => !FILLER.has(normR(w)));
  return kept.some(w => !isOptional(normR(w))) && kept.length ? kept.join(" ") : String(q).trim();
}
// Cocok per KATA, bukan potongan huruf: "dewa" tidak lagi cocok dengan "dewasa", "7" tidak cocok dengan "17".
// Awalan hanya diterima untuk imbuhan pendek ("kangen" ~ "kangenku") atau kata kunci panjang; huruf CJK tetap cocok sebagian.
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
function tokHit(w, t) {
  if (w === t) return true;
  if (CJK.test(t)) return w.includes(t);
  return w.startsWith(t) && (t.length >= 5 || w.length - t.length <= 1);
}
function lev1(a, b) { // salah ketik maksimal 1: satu huruf salah, kurang/lebih satu huruf, atau dua huruf bersebelahan tertukar
  if (a === b) return true;
  if (a.length === b.length) {
    const diff = []; for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) diff.push(k);
    if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return true;
  }
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}
function relevance(it, q) {
  const Q = qTokens(q);
  const noisy = NOISE.test(norm(it.title + " " + (it.raw || ""))) && !Q.noisy;
  if (noisy) return { ok: false, score: -1 };
  if (!Q.comp && (COMPILATION.test(norm(it.title + " " + (it.raw || ""))) || (it.dur || 0) > 1200)) return { ok: false, score: -1 };
  // Kata kunci hanya berisi kata umum (mis. "lagu pop 2000"): tidak bisa disaring per artis.
  if (!Q.req.length) {
    const hay = " " + norm(`${it.title} ${it.artist} ${it.album || ""} ${it.year || ""} ${it.raw || ""}`) + " ";
    const s = Q.all.length ? Q.all.reduce((a, t) => a + (hay.includes(" " + t + " ") ? 1 : 0), 0) / Q.all.length : 0;
    return { ok: it.kind === "yt" || s >= .5, score: s + (it.kind === "yt" ? .1 : 0) };
  }
  // Judul asli video: buang tagar dan bagian setelah "|" (sering berisi nama artis lain atau kata promosi).
  const noTag = x => String(x || "").replace(/#\S+/g, " ");
  const rawMain = noTag(it.raw).split(/\s+[|•]\s*/)[0];
  const A = normR(noTag(it.artist)), T = normR(noTag(it.title)), AL = normR(it.album), R = it.kind === "yt" ? normR(rawMain) : "";
  const fields = [A, T, R, AL].filter(Boolean), words = fields.map(f => f.split(" "));
  const phrase = Q.req.join(" "), compact = Q.req.join("");
  const hasPhrase = f => !!f && (" " + f + " ").includes(" " + phrase + " ");
  // "dmasiv" = "D'Masiv", "sheilaon7" = "Sheila on 7": cocokkan gabungan kata yang berurutan
  const compactHit = compact.length >= 4 && words.some(w => {
    for (let i = 0; i < w.length; i++) { let acc = ""; for (let j = i; j < w.length && acc.length < compact.length; j++) { acc += w[j]; if (acc === compact) return true; } }
    return false;
  });
  let fuzzy = 0;
  const covered = Q.req.every(t => {
    if (words.some(w => w.some(x => tokHit(x, t)))) return true;
    if (t.length >= 6 && !/\d/.test(t) && words.some(w => w.some(x => x.length >= 6 && lev1(t, x)))) { fuzzy++; return true; }
    return false;
  });
  if (!covered && !compactHit) return { ok: false, score: -1 };
  // Apakah hasil ini memang MILIK artis/grup yang dicari (bukan sekadar menyebut namanya di tengah judul)?
  const starts = f => !!f && (f + " ").startsWith(phrase + " ");
  const feat = f => { const i = (" " + (f || "") + " ").indexOf(" " + phrase + " "); return i > 0 && /(^| )(feat|ft|featuring|with|x)( |$)/.test(f.slice(0, i)); };
  const compactA = compact.length >= 3 && (() => { const w = A.split(" "); for (let i = 0; i < w.length; i++) { let acc = ""; for (let j = i; j < w.length && acc.length < compact.length; j++) { acc += w[j]; if (acc === compact) return true; } } return false; })();
  const artistHit = hasPhrase(A) || compactA || starts(T) || starts(R) || T === phrase || feat(T) || feat(R);
  const aw = A.split(" "), tw = T.split(" ");
  let sc = 1;
  if (A === phrase) sc += 3; else if (hasPhrase(A)) sc += 2;
  if (T === phrase) sc += 2; else if (hasPhrase(T)) sc += 1.5; else if (hasPhrase(R)) sc += 1;
  if (!covered && compactHit) sc += 1.5;
  // "artis + judul": sebagian kata cocok di artis, sisanya di judul
  const inA = Q.req.filter(t => aw.includes(t)).length, inT = Q.req.filter(t => tw.includes(t)).length;
  if (inA && inT && inA < Q.req.length && inT < Q.req.length && Q.req.every(t => aw.includes(t) || tw.includes(t))) sc += 2;
  if (!hasPhrase(A)) sc += (inA + inT) / Q.req.length * .5; // bila kata kunci = nama artis, kata di judul tidak menambah nilai
  sc -= fuzzy * .4;
  if (artistHit) sc += .5;
  if (it.kind === "yt") sc += .1;
  // Pengurutan: rilis resmi dan durasi lagu yang wajar lebih atas; versi live/akustik dan video sangat panjang lebih bawah
  const rawAll = norm(`${it.raw || ""} ${it.title}`);
  if (/\b(official|resmi)\b/.test(rawAll)) sc += .25;
  if (!/\b(live|konser|concert|akustik|acoustic|session|performance)\b/.test(norm(q)) && /\b(live|konser|concert|akustik|acoustic|session|performance)\b/.test(rawAll)) sc -= .6;
  if (it.dur) { if (it.dur >= 120 && it.dur <= 480) sc += .2; else if (it.dur > 600) sc -= .5; }
  return { ok: true, score: sc, artist: artistHit };
}
function score(it, q) { return relevance(it, q).score; }

let S = { q: "", src: "all", items: [], keys: new Set(), more: {}, st: {}, tok: 0, busy: false };
let srcSel = store.get("srcSel", "all");
if (srcSel !== "all" && !SOURCES[srcSel] && !SRC_GROUP[srcSel]) srcSel = "all";
$$("#srcSeg button").forEach(b => {
  b.setAttribute("aria-pressed", b.dataset.src === srcSel);
  b.onclick = () => { srcSel = b.dataset.src; store.set("srcSel", srcSel); $$("#srcSeg button").forEach(x => x.setAttribute("aria-pressed", x === b)); if ($("#q").value.trim()) runSearch(false); updateScHint(); };
});

const PAGE = 15;   // jumlah lagu yang tampil dulu; sisanya dibuka lewat tombol panah
function updateMore() { $("#more").hidden = !Object.values(S.more).some(Boolean) || (S.items.length > PAGE && !S.open); }
function syncToggle(cur) {
  const t = $("#listToggle"), n = cur.items.length;
  if (n <= PAGE) { t.hidden = true; return; }
  t.hidden = false; t.classList.toggle("up", !!cur.open); t.setAttribute("aria-expanded", !!cur.open);
  $("#listToggleTxt").textContent = cur.open ? `Tampilkan lebih sedikit (${PAGE} dari ${n} lagu)` : `Tampilkan semua ${n} lagu`;
}
function paintResults(cur) {
  const box = $("#results"), items = cur.items, n = cur.open ? items.length : Math.min(PAGE, items.length);
  box.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) frag.append(trackRow(items[i], items, i, "search"));
  box.append(frag); markPlaying(); syncToggle(cur);
}
$("#listToggle").onclick = () => {
  S.open = !S.open; paintResults(S); updateMore();
  if (!S.open) $("#results").scrollIntoView({ block: "start", behavior: "smooth" });
};
async function runSearch(more) {
  const q = $("#q").value.trim();
  syncClear();
  if (!more && SC_URL.test(q)) { toSearchView(); updateScHint(); return runScUrl(q); }
  if (q.length < 2) { if (!more) { Quick.open(); toast("Ketik minimal 2 huruf."); } return; }
  if (!more) toSearchView();
  if (!more) {
    updateScHint();
    const names = srcSel === "all" ? Object.keys(SOURCES) : (SRC_GROUP[srcSel] || [srcSel]);
    S = { q, eq: engineQuery(q), items: [], keys: new Set(), more: Object.fromEntries(names.map(n => [n, true])), st: {}, tok: S.tok + 1, busy: false, skel: true, open: false };
    $("#results").innerHTML = ""; $("#results").append(el("div", { class: "skeleton" }), el("div", { class: "skeleton" }), el("div", { class: "skeleton" }));
    setSearchHome(false); $("#more").hidden = true; $("#listToggle").hidden = true; $("#count").textContent = "Mencari lagu penuh…";
    $("#q").blur();
  }
  if (S.busy) return;
  const cur = S; cur.busy = true;
  const tk = cur.tok, names = Object.keys(cur.more).filter(n => cur.more[n]);
  $("#more").disabled = true;
  const fails = [];
  let pending = names.length;
  const clearSkel = () => { if (cur.skel) { $("#results").innerHTML = ""; cur.skel = false; } };
  // Setiap sumber ditampilkan begitu ia selesai (tidak menunggu sumber paling lambat).
  const onSource = (n, r) => {
    pending--;
    if (!r.ok) { cur.more[n] = false; fails.push(n); return; }
    cur.more[n] = r.v.more;
    const batch = [];
    r.v.items.forEach(it => {
      const k = songKey(it); if (cur.keys.has(k)) return;
      const rel = relevance(it, cur.q);
      if (!rel.ok) return;   // buang hasil yang tidak cocok dengan artis/band/judul yang dicari (semua sumber)
      cur.keys.add(k); it._s = rel.score; it._a = !!rel.artist; batch.push(it);
    });
    /* Kunci artis: bila kata kunci jelas nama artis/band/grup (cukup banyak hasil milik artis itu),
       tampilkan HANYA lagu milik artis itu. Video lain yang sekadar menyebut namanya dibuang. */
    let relock = false;
    if (!cur.lock) {
      const cand = cur.items.concat(batch), hits = cand.filter(x => x._a).length;
      if (hits >= 3 && hits >= cand.length * .3) { cur.lock = true; relock = cur.items.some(x => !x._a); }
    }
    if (cur.lock) { for (let j = batch.length - 1; j >= 0; j--) if (!batch[j]._a) batch.splice(j, 1); if (relock) cur.items = cur.items.filter(x => x._a); }
    batch.sort((x, y) => y._s - x._s);
    if (!batch.length && !relock) return;
    clearSkel();
    if (!more || cur.autoRun || relock) { cur.items.push(...batch); cur.items.sort((x, y) => y._s - x._s); paintResults(cur); }
    else if (cur.open) { const from = cur.items.length; cur.items.push(...batch); renderRows($("#results"), cur.items, "search", from); syncToggle(cur); }
    else { cur.items.push(...batch); paintResults(cur); }
    if (pending > 0) $("#count").textContent = `${cur.items.length} lagu cocok untuk "${cur.q}", masih mencari di sumber lain…`;
  };
  await Promise.all(names.map(n => SOURCES[n](cur.eq || cur.q, cur.st).then(v => ({ ok: true, v }), e => ({ ok: false, e })).then(r => { if (tk === S.tok) onSource(n, r); })));
  cur.busy = false; $("#more").disabled = false;
  if (tk !== S.tok) return;
  if (!more) clearSkel();
  const anyMore = Object.values(cur.more).some(Boolean);
  updateMore();
  if (cur.items.length && !cur.logged) { cur.logged = true; History.add(cur.q, srcSel, cur.items[0], cur.items.length); }
  // Karena hasil yang tidak cocok dibuang, ambil halaman berikutnya otomatis (maks. 2 kali) bila hasilnya masih sedikit.
  if (anyMore && cur.items.length < 8 && (cur.auto || 0) < 2) {
    cur.auto = (cur.auto || 0) + 1; cur.autoRun = true; $("#count").textContent = cur.items.length ? `${cur.items.length} lagu cocok untuk "${cur.q}", mencari lagi…` : "Mencari lagu yang cocok…";
    return runSearch(true);
  }
  const failTxt = fails.length ? ` Sumber yang sedang tidak bisa dijangkau: ${fails.map(n => ({ youtube: "YouTube", soundcloud: "SoundCloud", audius: "Audius", archive: "Internet Archive" })[n]).join(", ")}.` : "";
  if (!cur.items.length) {
    if (fails.length < names.length && Voice.fallback(cur.q)) return;   // pencarian suara: coba kemungkinan ucapan lain
    $("#count").textContent = "";
    $("#results").append(el("div", { class: "empty" }, el("p", { text: (fails.length === names.length ? "Semua sumber lagu sedang tidak bisa dijangkau. Coba lagi sebentar lagi." : `Tidak ada lagu penuh yang cocok dengan "${cur.q}". Periksa ejaan nama artis, band, atau judul lagunya.`) + failTxt })));
  } else $("#count").textContent = `${cur.items.length} lagu penuh yang cocok dengan "${cur.q}".${failTxt}`;
}
$("#searchForm").onsubmit = e => { e.preventDefault(); runSearch(false); };
$("#more").onclick = () => { S.autoRun = false; runSearch(true); };

/* ---------------------------------------------------------------------
   RIWAYAT PENCARIAN (localStorage, per akun di perangkat ini)
   Setiap entri: kata kunci, sumber, waktu, jumlah pencarian, hasil teratas,
   dan lagu yang benar-benar diputar dari pencarian itu (bila ada).
--------------------------------------------------------------------- */
const PLAYABLE = new Set(["yt", "sc", "audius", "archive"]);
function relTime(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return "baru saja";
  if (d < 3600) return Math.floor(d / 60) + " menit lalu";
  if (d < 86400) return Math.floor(d / 3600) + " jam lalu";
  if (d < 172800) return "kemarin";
  if (d < 604800) return Math.floor(d / 86400) + " hari lalu";
  const t = new Date(ts);
  return t.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: t.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
const History = {
  key() { return "searchHistory:" + (user ? user.id : "anon"); },
  all() { const v = store.get(this.key(), []); return Array.isArray(v) ? v.filter(e => e && e.q && e.k) : []; },
  save(list) {
    // Simpan semua; hanya bila memori browser penuh, entri paling lama dibuang sedikit demi sedikit.
    for (let l = list; ;) {
      try { localStorage.setItem(this.key(), JSON.stringify(l)); return true; }
      catch { if (l.length <= 1) return false; l = l.slice(0, Math.max(1, Math.floor(l.length * .9))); }
    }
  },
  keyOf(q) { return norm(q) || String(q).trim().toLowerCase(); },
  add(q, src, top, total) {
    const k = this.keyOf(q); if (!k) return;
    const list = this.all(), i = list.findIndex(e => e.k === k), prev = i >= 0 ? list.splice(i, 1)[0] : null, now = Date.now();
    list.unshift({
      id: prev ? prev.id : now.toString(36) + Math.random().toString(36).slice(2, 7),
      k, q, src, at: now, first: prev ? prev.first : now, n: (prev ? prev.n || 1 : 0) + 1, total,
      top: top ? plainSong(top) : (prev ? prev.top : null),
      song: prev ? prev.song || null : null, failed: prev ? !!prev.failed : false
    });
    this.save(list); this.render();
  },
  update(id, fn) { const list = this.all(), e = list.find(x => x.id === id); if (!e) return; if (fn(e) === false) return; this.save(list); this.render(); },
  pick(q, it) {
    if (!it || !PLAYABLE.has(it.kind)) return;
    const k = this.keyOf(q), list = this.all(), e = list.find(x => x.k === k); if (!e) return;
    e.song = plainSong(it); e.failed = false; this.save(list); this.render();
  },
  markFailed(id) { this.update(id, e => { if (e.failed) return false; e.failed = true; }); },
  markOk(id) { this.update(id, e => { if (!e.failed) return false; e.failed = false; }); },
  remove(id) { this.save(this.all().filter(e => e.id !== id)); this.render(); toast("Dihapus dari riwayat."); },
  async clear() {
    const n = this.all().length; if (!n) return;
    if (!await Dlg.confirm("Hapus semua riwayat?", `${n} pencarian di perangkat ini akan dihapus. Favorit dan playlist tidak terpengaruh.`, "Hapus semua", true)) return;
    try { localStorage.removeItem(this.key()); } catch { }
    this.render(); toast("Riwayat pencarian dihapus.");
  },
  research(e) {
    if (e.src && (e.src === "all" || SOURCES[e.src] || SRC_GROUP[e.src]) && e.src !== srcSel) {
      srcSel = e.src; store.set("srcSel", srcSel);
      $$("#srcSeg button").forEach(x => x.setAttribute("aria-pressed", x.dataset.src === srcSel));
    }
    $("#q").value = e.q; window.scrollTo({ top: 0 }); runSearch(false);
  },
  play(e) {
    const s = e.song || e.top; if (!s || !PLAYABLE.has(s.kind) || e.failed) return;
    Player.playList([Object.assign({}, s, { _hid: e.id })], 0);
  },
  art(s) {
    const ph = () => el("div", { class: "h-art" }, icon("music"));
    if (!s || !s.art) return ph();
    return el("img", { class: "h-art", src: s.art, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onerror: ev => ev.target.replaceWith(ph()) });
  },
  card(e) {
    const s = e.song || e.top || {};
    const info = el("span", { class: "h-info" });
    if (s.kind && SRC_LABEL[s.kind]) info.append(el("span", { class: "src " + (SRC_CLASS[s.kind] || ""), text: SRC_LABEL[s.kind] }));
    if (s.dur) info.append(el("span", { text: fmt(s.dur) }));
    if (e.total) info.append(el("span", { text: `${e.total} hasil` }));
    const when = el("time", { datetime: new Date(e.at).toISOString(), title: new Date(e.at).toLocaleString("id-ID"), text: relTime(e.at) });
    const qLine = el("span", { class: "h-q" }, "Dicari ", el("b", { text: `“${e.q}”` }), ", ", when, e.n > 1 ? `, ${e.n} kali` : "");
    const main = el("button", { type: "button", class: "h-main", "aria-label": `Cari lagi “${e.q}”. ${[s.title, s.artist].filter(Boolean).join(", ")}`, title: "Cari lagi", onclick: () => this.research(e) },
      this.art(s),
      el("span", { class: "h-meta" },
        el("span", { class: "h-tag" + (e.song ? "" : " alt"), text: e.song ? "Lagu yang Anda putar" : "Hasil teratas" }),
        el("span", { class: "h-title", text: s.title || e.q }),
        (s.artist || s.album) ? el("span", { class: "h-artist", text: [s.artist, s.album].filter(Boolean).join(", ") }) : null,
        info.childNodes.length ? info : null,
        qLine,
        e.failed ? el("span", { class: "h-warn", text: "Terakhir gagal diputar. Ketuk untuk mencari lagi." }) : null));
    const acts = el("div", { class: "h-actions" },
      el("button", { type: "button", class: "icon-btn plain", "aria-label": `Hapus “${e.q}” dari riwayat`, title: "Hapus dari riwayat", onclick: () => this.remove(e.id) }, icon("x", "sm")));
    if (s.kind && PLAYABLE.has(s.kind) && !e.failed)
      acts.append(el("button", { type: "button", class: "h-play", "aria-label": `Putar ${s.title || ""}`, title: "Putar", onclick: () => this.play(e) }, icon("play")));
    return el("article", { class: "h-card", "data-hid": e.id }, main, acts);
  },
  render() {
    const box = $("#hList"); if (!box) return;
    const list = this.all();
    box.innerHTML = "";
    $("#hEmpty").hidden = !!list.length; $("#hClear").hidden = !list.length;
    $("#hCount").textContent = list.length ? `${list.length} pencarian tersimpan di perangkat ini` : "";
    const frag = document.createDocumentFragment();
    list.forEach(e => frag.append(this.card(e)));
    box.append(frag);
  }
};
// Mode "beranda" pencarian (saran + riwayat) vs mode hasil
function setSearchHome(on) {
  if (!on && !$('.view[data-view="search"]').hidden && $$("[data-hist]").some(b => b.getAttribute("aria-current") === "page")) { markHist(false); $$('[data-tab="search"]').forEach(b => b.setAttribute("aria-current", "page")); }
  $("#searchEmpty").hidden = !on; $("#history").hidden = !on;
  $("#results").hidden = on; $("#count").hidden = on;
  if (on) { $("#more").hidden = true; $("#listToggle").hidden = true; $("#scHint").hidden = true; History.render(); }
}
$("#hClear").onclick = () => History.clear();
function markHist(on) {
  $$("[data-hist]").forEach(b => b.setAttribute("aria-current", on ? "page" : "false"));
  if (on) $$('[data-tab="search"]').forEach(b => b.setAttribute("aria-current", "false"));
}
$$("[data-hist]").forEach(b => b.onclick = () => {
  showView("search"); setSearchHome(true); markHist(true);
  requestAnimationFrame(() => $("#history").scrollIntoView({ block: "start" }));
});
$("#q").addEventListener("input", () => { if (!$("#q").value.trim() && $("#history").hidden) setSearchHome(true); });

// Saran nama penyanyi/judul saat mengetik (data katalog iTunes, tanpa audio). Cepat: jeda singkat, hasil disimpan, jawaban basi diabaikan.
let sugT, lastSug = [], sugSeq = 0;
const sugCache = new Map();
function showSug(list) { lastSug = list; const dl = $("#sug"); dl.innerHTML = ""; list.forEach(v => dl.append(el("option", { value: v }))); }
$("#q").addEventListener("input", () => {
  const q = $("#q").value.trim();
  if (lastSug.includes(q)) { runSearch(false); return; } // pengguna memilih saran
  clearTimeout(sugT); const my = ++sugSeq;
  if (q.length < 2) { if (!q) showSug([]); return; }
  const key = q.toLowerCase();
  if (sugCache.has(key)) { showSug(sugCache.get(key)); return; }
  sugT = setTimeout(async () => {
    try {
      const r = (await getJSON(`https://itunes.apple.com/search?term=${enc(q)}&media=music&entity=song&limit=10&country=id`, { timeout: 4000 })).results || [];
      const list = [...new Set(r.flatMap(x => [x.artistName, `${x.artistName} ${x.trackName}`]))].slice(0, 8);
      if (sugCache.size > 60) sugCache.delete(sugCache.keys().next().value);
      sugCache.set(key, list);
      if (my === sugSeq) showSug(list);
    } catch { }
  }, 140);
});

/* ---------------------------------------------------------------------
   TOMBOL X (hapus kata kunci)
--------------------------------------------------------------------- */
function syncClear() { $("#searchForm").classList.toggle("has-text", !!$("#q").value); }
$("#q").addEventListener("input", syncClear);
$("#qClear").onclick = () => {
  const inp = $("#q");
  inp.value = ""; syncClear(); showSug([]); clearTimeout(sugT); sugSeq++;
  S.tok++;                                   // batalkan pencarian yang masih berjalan agar hasil lamanya tidak muncul
  inp.dispatchEvent(new Event("input"));     // kembali ke beranda pencarian (saran + riwayat)
  inp.focus();
};

/* ---------------------------------------------------------------------
   PENCARIAN SUARA (Web Speech API bawaan browser: Chrome, Edge, Safari)
   Ucapan dibersihkan dari kata perintah ("cari", "putar", "mainkan"…) lalu dicari seperti ketikan biasa.
   Bila tidak ada hasil, kemungkinan ucapan lain dari pengenal suara dicoba otomatis.
--------------------------------------------------------------------- */
function cleanVoice(t) {
  let s = String(t || "").replace(/[“”"‘’]/g, "").replace(/\s+/g, " ").trim();
  const lead = /^(?:tolong\s+|coba\s+|bisa\s+|ayo\s+|dong\s+)?(?:cari(?:kan|in)?|putar(?:kan|in)?|mainkan|setel(?:kan)?|dengar(?:kan|in)?|dengerin|play|search(?:\s+for)?|find(?:\s+me)?|look\s+up)\s+(?:(?:lagu|lagunya|musik|song|songs|music|band|grup|group|penyanyi|artis|artist)\s+)?(?:(?:dari|oleh|by|nya)\s+)?/i;
  for (let i = 0; i < 2; i++) { const r = s.replace(lead, ""); if (r === s || !r) break; s = r; }
  s = s.replace(/\s+(?:dong|ya|deh|please|tolong|sekarang|nya)$/i, "").replace(/[.,!?;:…]+$/g, "").trim();
  return s || String(t || "").replace(/[.,!?;:…]+$/g, "").trim();
}
const Voice = {
  SR: window.SpeechRecognition || window.webkitSpeechRecognition,
  rec: null, alts: [], altsFor: "", paused: false, final: "", err: "", gotAny: false, safeT: 0, run: 0,
  lang: store.get("voiceLang", "id-ID"),
  ui(state, title, text, hint) {
    const v = $("#voice"); v.classList.toggle("listening", state === "listening");
    $("#vTitle").textContent = title;
    const t = $("#vText"); t.textContent = text || ""; t.classList.toggle("dim", !text || state !== "listening" || !this.gotAny);
    $("#vHint").textContent = hint || "";
    $("#vOrb").setAttribute("aria-label", state === "listening" ? "Berhenti bicara" : "Bicara lagi");
    $("#qMic").classList.toggle("on", state === "listening"); $("#qMic").setAttribute("aria-pressed", state === "listening");
  },
  open() {
    if (!this.SR) { toast("Browser ini belum mendukung pencarian suara. Gunakan Chrome, Edge, atau Safari terbaru.", 5000); return; }
    if (!window.isSecureContext) { toast("Pencarian suara hanya jalan lewat alamat https:// atau localhost.", 5000); return; }
    $("#voice").hidden = false;
    $$("#vLang button").forEach(b => b.setAttribute("aria-pressed", b.dataset.lang === this.lang));
    // Jeda lagu yang sedang diputar supaya mikrofon tidak merekam musiknya sendiri; dilanjutkan lagi setelah selesai.
    if (typeof Player !== "undefined" && Player.playing) { this.paused = true; try { Player.pause(); } catch { } }
    this.start();
  },
  start() {
    this.stopRec(); this.final = ""; this.err = ""; this.gotAny = false; this.alts = []; const my = ++this.run;
    let r;
    try { r = new this.SR(); } catch { this.fail("Pencarian suara tidak bisa dimulai di browser ini."); return; }
    this.rec = r; r.lang = this.lang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 4;
    this.ui("listening", "Mendengarkan…", "Sebutkan judul lagu, penyanyi, band, atau grup musik", "");
    r.onresult = e => {
      if (my !== this.run) return;
      let interim = "", fin = null;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin = res; else interim += res[0].transcript;
      }
      if (fin) {
        const list = [...fin].map(x => cleanVoice(x.transcript)).filter(Boolean);
        const uniq = [...new Set(list.map(x => x.toLowerCase()))].map(k => list.find(x => x.toLowerCase() === k));
        if (uniq.length) { this.final = uniq[0]; this.alts = uniq.slice(1, 3); this.gotAny = true; this.ui("listening", "Mendengarkan…", this.final, ""); try { r.stop(); } catch { } }
      } else if (interim) { this.gotAny = true; this.ui("listening", "Mendengarkan…", cleanVoice(interim) || interim, ""); }
    };
    r.onerror = e => { if (my === this.run) this.err = e.error || "error"; };
    r.onend = () => {
      if (my !== this.run) return;
      clearTimeout(this.safeT); this.rec = null;
      if (this.final) return this.done(this.final);
      const msg = {
        "not-allowed": "Izin mikrofon ditolak. Izinkan mikrofon untuk situs ini di pengaturan browser, lalu coba lagi.",
        "service-not-allowed": "Pencarian suara tidak diizinkan di sini. Di iPhone mode aplikasi layar utama, gunakan tombol mikrofon pada keyboard.",
        "audio-capture": "Mikrofon tidak ditemukan atau sedang dipakai aplikasi lain.",
        "network": "Pengenalan suara butuh internet. Periksa koneksi lalu coba lagi.",
        "language-not-supported": "Bahasa ini belum didukung di perangkat Anda. Coba bahasa lain.",
        "no-speech": "Suara tidak terdengar. Dekatkan mikrofon lalu ketuk lingkaran untuk bicara lagi.",
        "aborted": ""
      }[this.err];
      if (this.err === "aborted") return;
      this.fail(msg || "Tidak ada ucapan yang dikenali. Ketuk lingkaran untuk mencoba lagi.");
    };
    try { r.start(); } catch { this.fail("Pencarian suara tidak bisa dimulai. Coba lagi."); return; }
    clearTimeout(this.safeT); this.safeT = setTimeout(() => { try { r.stop(); } catch { } }, 15000);
  },
  fail(msg) { this.ui("idle", "Belum terdengar", "", msg); },
  stopRec() { clearTimeout(this.safeT); const r = this.rec; this.rec = null; this.run++; if (r) { r.onresult = r.onerror = r.onend = null; try { r.abort(); } catch { } } },
  close() {
    this.stopRec(); $("#voice").hidden = true; this.ui("idle", "", "", ""); $("#qMic").classList.remove("on");
    if (this.paused) { this.paused = false; try { Player.resume(); } catch { } }
  },
  done(text) {
    this.stopRec(); $("#voice").hidden = true; $("#qMic").classList.remove("on");
    $("#q").value = text; syncClear(); showSug([]);
    this.altsFor = text;
    if (this.paused) { this.paused = false; try { Player.resume(); } catch { } }
    toast(`Dikenali: “${text}”`, 2600);
    if (!isMobile()) Quick.open(false);
    runSearch(false);
  },
  // Dipanggil saat pencarian tidak menemukan apa pun: coba kemungkinan ucapan berikutnya.
  fallback(q) {
    if (this.altsFor !== q || !this.alts.length) return false;
    const n = this.alts.shift(); this.altsFor = n;
    $("#q").value = n; syncClear();
    toast(`Tidak ada hasil untuk “${q}”. Mencoba: “${n}”`, 3200);
    runSearch(false); return true;
  }
};
$("#qMic").onclick = () => Voice.open();
$("#voiceStart").onclick = () => { if (!isMobile()) Quick.open(false); Voice.open(); };
$("#vClose").onclick = () => Voice.close();
$("#voice").addEventListener("click", e => { if (e.target.id === "voice") Voice.close(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#voice").hidden) Voice.close(); });
$("#vOrb").onclick = () => { if (Voice.rec) { try { Voice.rec.stop(); } catch { } } else Voice.start(); };
$$("#vLang button").forEach(b => b.onclick = () => {
  Voice.lang = b.dataset.lang; store.set("voiceLang", Voice.lang);
  $$("#vLang button").forEach(x => x.setAttribute("aria-pressed", x === b)); Voice.start();
});
["Dewa 19", "Sheila on 7", "Tulus", "Nadin Amizah", "Noah", "Didi Kempot", "Lagu pop 2000"].forEach(t =>
  $("#tryChips").append(el("button", { class: "chip", text: t, onclick: () => { $("#q").value = t; runSearch(false); } })));

/* =====================================================================
   JELAJAH: album, band, K-Pop, dangdut, pop, rock, indie
   Gambar kartu diambil dari katalog iTunes (tanpa kunci), dibatasi 3 permintaan sekaligus dan disimpan di perangkat.
   Ketuk kartu artis = cari lagunya (hasil tetap lewat saringan akurasi); ketuk album = daftar lagu album.
===================================================================== */
const BROWSE_CATS = [
  { id: "album", label: "Album", sub: "Album populer. Ketuk untuk melihat daftar lagunya.", albums: [
    ["Dewa 19", "Pandawa Lima"], ["Sheila on 7", "Kisah Klasik untuk Masa Depan"], ["Tulus", "Monokrom"], ["Raisa", "Handmade"],
    ["Noah", "Seperti Seharusnya"], ["Slank", "Generasi Biru"], ["Padi", "Save My Soul"], ["Peterpan", "Bintang di Surga"],
    ["Fourtwnty", "Ruang Tunggu"], ["Hindia", "Menari dengan Bayangan"], ["Nadin Amizah", "Selamat Ulang Tahun"], ["Isyana Sarasvati", "Paradox"],
    ["Payung Teduh", "Dunia Batas"], ["Pamungkas", "Walk the Talk"], ["BTS", "Map of the Soul: 7"], ["BLACKPINK", "Born Pink"],
    ["NewJeans", "Get Up"], ["TWICE", "Formula of Love"] ] },
  { id: "band", label: "Band", sub: "Band Indonesia", artists: ["Dewa 19", "Sheila on 7", "Noah", "Slank", "Padi", "Gigi", "Ungu", "Peterpan", "Kahitna", "Naff", "ST12", "d'Masiv", "Kotak", "Wali", "Armada", "Hijau Daun", "Jikustik", "Letto", "Nidji", "Radja"] },
  { id: "kpop", label: "K-Pop", sub: "K-Pop", artists: ["BTS", "BLACKPINK", "NewJeans", "TWICE", "EXO", "Stray Kids", "SEVENTEEN", "aespa", "IVE", "Red Velvet", "ITZY", "TXT", "ENHYPEN", "LE SSERAFIM", "Girls' Generation", "BIGBANG", "IU", "NCT 127"] },
  { id: "dangdut", label: "Dangdut", sub: "Dangdut", artists: ["Rhoma Irama", "Elvy Sukaesih", "Rita Sugiarto", "Evie Tamala", "Inul Daratista", "Ayu Ting Ting", "Via Vallen", "Nella Kharisma", "Happy Asmara", "Denny Caknan", "Lesti Kejora", "Didi Kempot", "Dewi Persik", "Cita Citata"] },
  { id: "pop", label: "Pop", sub: "Pop", artists: ["Tulus", "Raisa", "Isyana Sarasvati", "Afgan", "Rossa", "Yura Yunita", "Mahalini", "Nadin Amizah", "Andmesh", "Judika", "Agnez Mo", "Rizky Febian", "Lyodra", "Tiara Andini", "Ardhito Pramono", "Anji"] },
  { id: "rock", label: "Rock", sub: "Rock", artists: ["Slank", "Dewa 19", "God Bless", "Jamrud", "Boomerang", "Gigi", "Padi", "Seringai", "Superman Is Dead", "Burgerkill", "Netral", "/rif", "Andra and The Backbone", "Edane", "Kapten", "The Rock"] },
  { id: "indie", label: "Indie", sub: "Indie", artists: ["Fourtwnty", "Hindia", "Pamungkas", "Reality Club", "Efek Rumah Kaca", "Payung Teduh", "Banda Neira", "Sore", "Mocca", "The Panturas", "Lomba Sihir", "Kunto Aji", "Barasuara", "Juicy Luicy", "Feby Putri", "Dere"] }
];
const ArtQ = {
  cache: store.get("catArt", {}), q: [], run: 0, dirty: 0, saveT: 0,
  save() { clearTimeout(this.saveT); this.saveT = setTimeout(() => { const ks = Object.keys(this.cache); if (ks.length > 400) ks.slice(0, ks.length - 400).forEach(k => delete this.cache[k]); store.set("catArt", this.cache); }, 600); },
  get(key) { const c = this.cache[key]; return c && Date.now() - c.t < 30 * 864e5 ? c : null; },
  add(key, term, cb) {
    const c = this.get(key); if (c) { cb(c); return; }
    this.q.push({ key, term, cb, tries: 0 }); this.pump();
  },
  pump() {
    while (this.run < 3 && this.q.length) {
      const j = this.q.shift(); this.run++;
      getJSON(`https://itunes.apple.com/search?term=${enc(j.term)}&media=music&entity=album&limit=3&country=id`, { timeout: 8000 })
        .then(d => {
          const r = (d.results || []).find(x => x.artworkUrl100);
          const c = r ? { t: Date.now(), img: r.artworkUrl100.replace(/\d+x\d+bb/, "400x400bb"), id: r.collectionId, name: r.collectionName, artist: r.artistName } : { t: Date.now() - 25 * 864e5, img: "" };
          this.cache[j.key] = c; this.save(); j.cb(c);
        })
        .catch(() => { if (++j.tries < 3) setTimeout(() => { this.q.push(j); this.pump(); }, 4000 * j.tries); })
        .finally(() => { this.run--; setTimeout(() => this.pump(), 150); });
    }
  }
};
const Browse = {
  cat: store.get("cat", "album"), io: null,
  ensure() { if (!this.built) { this.built = true; this.tabs(); } this.render(); },
  tabs() {
    const box = $("#catTabs"); box.innerHTML = "";
    BROWSE_CATS.forEach(c => box.append(el("button", { type: "button", class: "chip", "data-c": c.id, text: c.label, onclick: () => this.pick(c.id) })));
  },
  pick(id) { this.cat = id; store.set("cat", id); this.render(); },
  render() {
    const c = BROWSE_CATS.find(x => x.id === this.cat) || BROWSE_CATS[0];
    $$("#catTabs .chip").forEach(b => b.setAttribute("aria-pressed", b.dataset.c === c.id));
    const items = c.albums ? c.albums.map(([ar, al]) => ({ name: al, artist: ar, term: `${ar} ${al}`, album: true })) : c.artists.map(ar => ({ name: ar, artist: ar, term: ar }));
    $("#catCount").textContent = `${items.length} ${c.id === "album" ? "album" : "artis"} · ${c.sub}`;
    const box = $("#catGrid"); box.innerHTML = "";
    if (this.io) this.io.disconnect();
    this.io = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { this.io.unobserve(e.target); e.target._load && e.target._load(); } }), { rootMargin: "300px" }) : null;
    const frag = document.createDocumentFragment();
    items.forEach(it => frag.append(this.card(it, c)));
    box.append(frag);
  },
  card(it, c) {
    const img = el("span", { class: "cat-img", "aria-hidden": "true", text: (it.artist || it.name).replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1).toUpperCase() });
    const b = el("button", { type: "button", class: "cat-card", title: it.album ? `${it.name} — ${it.artist}` : it.name }, img,
      el("span", { class: "cat-name", text: it.name }), el("span", { class: "cat-sub", text: it.album ? it.artist : c.sub }));
    const key = (it.album ? "al:" : "ar:") + norm(it.term);
    let info = null;
    b._load = () => ArtQ.add(key, it.term, r => {
      info = r;
      if (!r.img) return;
      const im = el("img", { src: r.img, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
      im.onload = () => im.classList.add("on"); im.onerror = () => im.remove();
      img.append(im);
    });
    b.onclick = () => it.album ? this.openAlbum(it, info) : this.search(it.artist);
    if (this.io) this.io.observe(b); else b._load();
    return b;
  },
  search(q) { $("#q").value = q; runSearch(false); },
  async openAlbum(it, info) {
    const sh = $("#albumSheet"); sh.hidden = false;
    $("#alTitle").textContent = it.name; $("#alSub").textContent = it.artist;
    const im = $("#alImg"); im.innerHTML = ""; im.textContent = it.artist.slice(0, 1).toUpperCase();
    if (info && info.img) im.append(el("img", { src: info.img, alt: "", referrerpolicy: "no-referrer", class: "on", style: "opacity:1" }));
    const list = $("#alList"); list.innerHTML = ""; list.append(el("p", { class: "sheet-msg", text: "Memuat daftar lagu…" }));
    const fallback = msg => { list.innerHTML = ""; list.append(el("p", { class: "sheet-msg", text: msg }), el("button", { type: "button", class: "btn primary", style: "margin:0 16px 16px", onclick: () => { sh.hidden = true; this.search(`${it.artist} ${it.name}`); } }, "Cari lagu dengan nama album ini")); };
    try {
      let id = info && info.id;
      if (!id) { const r = await new Promise(res => ArtQ.add("al:" + norm(it.term), it.term, res)); id = r.id; if (r.img && !im.querySelector("img")) im.append(el("img", { src: r.img, alt: "", referrerpolicy: "no-referrer", class: "on", style: "opacity:1" })); }
      if (!id) return fallback("Daftar lagu album ini belum ditemukan.");
      const d = (await getJSON(`https://itunes.apple.com/lookup?id=${id}&entity=song&country=id`, { timeout: 8000 })).results || [];
      const tr = d.filter(x => x.wrapperType === "track" && x.trackName).sort((x, y) => (x.discNumber || 1) - (y.discNumber || 1) || (x.trackNumber || 0) - (y.trackNumber || 0));
      if (!tr.length) return fallback("Daftar lagu album ini belum ditemukan.");
      list.innerHTML = "";
      tr.forEach((t, i) => list.append(el("button", { type: "button", title: "Cari lagu ini", onclick: () => { sh.hidden = true; this.search(`${t.artistName || it.artist} ${t.trackName}`); } },
        el("span", { class: "n", text: String(i + 1) }), el("span", { class: "t", text: t.trackName }), el("span", { class: "d", text: fmt((t.trackTimeMillis || 0) / 1000) }))));
    } catch { fallback("Daftar lagu tidak bisa dimuat sekarang (butuh internet)."); }
  }
};
$("#alClose").onclick = () => { $("#albumSheet").hidden = true; };
$("#albumSheet").addEventListener("click", e => { if (e.target.id === "albumSheet") e.target.hidden = true; });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#albumSheet").hidden) $("#albumSheet").hidden = true; });
BROWSE_CATS.forEach(c => $("#catShort").append(el("button", { type: "button", class: "chip", text: c.label, onclick: () => { Browse.cat = c.id; store.set("cat", c.id); showView("browse"); } })));

/* Ikon di tab browser berputar seperti piringan hitam emas */
(function favSpin() {
  const link = document.querySelector('link[rel="icon"]'); if (!link || matchMedia("(hover:none)").matches) return;
  const N = 24, frames = []; let k = 0;
  const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d"); if (!g) return;
  function draw(ang) {
    g.clearRect(0, 0, 64, 64); g.save(); g.translate(32, 32); g.rotate(ang);
    g.fillStyle = "#1F1A0C"; g.beginPath(); g.arc(0, 0, 31, 0, 7); g.fill();
    g.strokeStyle = "#4A3E18"; g.lineWidth = 1.2; [26, 21, 16].forEach(r => { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); });
    g.strokeStyle = "#E3C259"; g.lineWidth = 3.2; g.lineCap = "round"; g.beginPath(); g.arc(0, 0, 25, -.5, .5); g.stroke();
    g.strokeStyle = "#8A6A0B"; g.beginPath(); g.arc(0, 0, 25, Math.PI - .5, Math.PI + .5); g.stroke();
    g.fillStyle = "#D9B547"; g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fill();
    g.fillStyle = "#1F1A0C"; g.beginPath(); g.arc(6.5, 0, 2, 0, 7); g.fill(); g.beginPath(); g.arc(0, 0, 2.4, 0, 7); g.fill();
    g.restore(); return cv.toDataURL("image/png");
  }
  const set = i => { if (!frames[i]) frames[i] = draw(i * 2 * Math.PI / N); link.type = "image/png"; link.removeAttribute("sizes"); link.href = frames[i]; };
  set(0);
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  setInterval(() => { k = (k + 1) % N; set(k); }, 110);
})();

/* =====================================================================
   PEMUTAR (YouTube iframe resmi + SoundCloud widget resmi + elemen audio)
===================================================================== */
const Player = {
  engine: null, audio: new Audio(), yt: null, ytReady: false, pendingVid: null, sc: null, scPos: 0, scDur: 0, scT: 0,
  list: [], i: -1, cur: null, tok: 0, playing: false, errRun: 0,
  vol: store.get("vol", 80), muted: false, shuffle: store.get("shuffle", false), repeat: store.get("repeat", "off"), seeking: false,
  adFree: store.get("ytAdFree", true), ytRes: null, ytTried: new Set(), ytCur: "", ytT: 0, ytStarted: false, resumeAt: 0, shufNext: null,

  initYT() {
    if (window.YT && YT.Player) return this.makeYT();
    window.onYouTubeIframeAPIReady = () => this.makeYT();
    document.head.append(el("script", { src: "https://www.youtube.com/iframe_api" }));
  },
  makeYT() {
    if (this.yt) return;
    this.yt = new YT.Player("yt", {
      width: "100%", height: "100%",
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, origin: location.origin },
      events: {
        onReady: () => { this.ytReady = true; this.applyVol(); if (this.pendingVid) { this.yt.loadVideoById(this.pendingVid); this.pendingVid = null; } },
        onStateChange: e => {
          if (this.engine !== "yt") return;
          if (e.data === 1) this.onPlaying(); else if (e.data === 2) this.setPlaying(false);
          else if (e.data === 0) this.onEnded(); else if (e.data === 3) status("Memuat…");
        },
        onError: e => {
          if (this.engine !== "yt") return;
          const M = { 2: "Alamat video tidak valid.", 5: "Video tidak bisa diputar di browser ini.", 100: "Video sudah dihapus atau dibuat privat.", 101: "Pemilik video tidak mengizinkan diputar di luar YouTube.", 150: "Pemilik video tidak mengizinkan diputar di luar YouTube." };
          const msg = M[e.data] || "Video tidak bisa diputar.", tk = this.tok;
          this.tryAlt(tk).then(done => { if (!done && tk === this.tok) this.onError(msg); });
        }
      }
    });
  },
  use(engine) {
    if (this.engine !== engine) {
      if (this.engine === "yt" && this.ytReady) try { this.yt.stopVideo(); } catch { }
      if (this.engine === "audio") { this.audio.pause(); this.audio.removeAttribute("src"); this.audio.load(); }
      if (this.engine === "sc") this.killSc();
    }
    this.engine = engine;
    $("#ytWrap").dataset.eng = engine || "";
    $("#ytWrap").classList.toggle("off", engine !== "yt" && engine !== "sc"); updatePip();
  },
  killSc() {
    clearTimeout(this.scT);
    try { if (this.sc) this.sc.pause(); } catch { }
    this.sc = null; this.scPos = 0; this.scDur = 0;
    const box = $("#sc"); if (box) box.innerHTML = "";
  },
  async playSc(it, tk) {
    this.killSc();
    try { await loadSCApi(); } catch (e) { if (tk === this.tok) this.onError(e.message); return; }
    if (tk !== this.tok) return;
    this.scDur = it.dur || 0;
    const p = new URLSearchParams({ url: it.scurl, auto_play: "true", visual: "true", hide_related: "true", show_comments: "false", show_user: "true", show_reposts: "false", buying: "false", liking: "false", sharing: "false", download: "false" });
    const f = el("iframe", { src: "https://w.soundcloud.com/player/?" + p, allow: "autoplay" });
    $("#sc").append(f);
    const w = this.sc = SC.Widget(f), E = SC.Widget.Events, live = () => this.engine === "sc" && this.sc === w && tk === this.tok;
    w.bind(E.READY, () => {
      if (!live()) return;
      w.setVolume(this.muted ? 0 : this.vol);
      w.getDuration(d => { if (live() && d) this.scDur = d / 1000; });
      w.bind(E.PLAY, () => { if (live()) { clearTimeout(this.scT); this.onPlaying(); } });
      w.bind(E.PAUSE, () => { if (live()) this.setPlaying(false); });
      w.bind(E.FINISH, () => { if (live()) this.onEnded(); });
      w.bind(E.ERROR, () => { if (live()) this.onError("Lagu SoundCloud ini tidak bisa diputar."); });
      w.bind(E.PLAY_PROGRESS, e => { if (live()) this.scPos = (e.currentPosition || 0) / 1000; });
    });
    clearTimeout(this.scT);
    this.scT = setTimeout(() => { if (live() && !this.playing) status("Jika belum terdengar, tekan tombol putar di pemutar SoundCloud.", 6000); }, 12000);
  },
  playList(list, i) {
    this.list = list.slice(); this.shufNext = null;
    this.order = null;
    this.playAt(i);
  },
  enqueue(it, nextUp) {
    if (!this.cur || this.cur.kind === "radio") { this.playList([it], 0); return; }
    if (nextUp) this.list.splice(this.i + 1, 0, it); else this.list.push(it);
    toast(nextUp ? "Diputar setelah lagu ini." : `Ditambahkan ke antrean (${this.list.length} lagu).`);
  },
  async playAt(i) {
    const it = this.list[i]; if (!it) return;
    this.i = i; this.cur = it; const tk = ++this.tok; this._altFor = null; this._alts = null; this._altNote = false;
    clearTimeout(this.ytT); if (!this._keepResume) this.resumeAt = 0; this._keepResume = false; FX.warm();
    showNow(it); markPlaying(); refreshHearts(); Lyrics.load(it);
    try {
      if (it.kind === "legacy") {
        status("Mencari versi lengkap lagu ini…");
        const oldKey = songKey(it);
        const r = await ytFindOne(`${it.artist} ${it.title}`);
        if (tk !== this.tok) return;
        Object.assign(it, { kind: "yt", vid: r.vid, raw: r.raw, dur: r.dur, art: it.art || r.art });
        Fav.upgrade(it, oldKey); showNow(it); markPlaying();
      }
      if (it.kind === "sc") {
        this.use("sc"); status("Memuat dari SoundCloud…");
        await this.playSc(it, tk);
        return;
      }
      if (it.kind === "yt") {
        if (this.adFree) {
          // Tanpa iklan: HANYA audio. Tidak pernah jatuh ke pemutar YouTube yang menayangkan iklan.
          this.ytRes = YtAudio.get(it.vid); this.ytTried = new Set(); this.ytCur = ""; this.ytStarted = false;
          this.ytEver = false; this.ytDeadline = Date.now() + 12000; // maks. 12 detik menunggu suara pertama
          this.use("audio"); this.ytNextSrc(tk);
          return;
        }
        this.playYtOfficial(it);
        return;
      }
      let src = it.src;
      if (it.kind === "archive" && !src) { status("Mengambil file audio…"); src = it.src = await archiveSrc(it.aid); if (tk !== this.tok) return; }
      this.use("audio"); this.load(src); status("Memuat…");
      await this.audio.play();
    } catch (e) {
      if (tk !== this.tok) return;
      if (e && e.name === "NotAllowedError") { this.setPlaying(false); status("Tekan tombol putar untuk mulai.", 4000); return; }
      this.onError("Gagal memutar: " + (e && e.message ? e.message : "sumber tidak merespons"));
    }
  },
  // Sumber utama gagal total: coba sumber alternatif untuk lagu yang sama. true = sudah ditangani (alternatif dimulai, atau
  // lagu sudah berganti sehingga tidak perlu diapa-apakan); false = tidak ada alternatif, pemanggil melaporkan kegagalan seperti biasa.
  async tryAlt(tk, pos = 0) {
    const it = this.cur;
    if (tk !== this.tok) return true;
    if (!it || it.kind !== "yt") return false;
    if (this._altFor !== it) { this._altFor = it; this._alts = null; }
    if (!this._alts) {
      status("Mencari sumber lain untuk lagu ini…");
      try { this._alts = await findAlternatives(it); } catch { this._alts = []; }
      if (tk !== this.tok) return true;
    }
    const alt = this._alts.shift();
    if (!alt) return false;
    this.ytRes = alt.kind === "yt" ? YtAudio.get(alt.vid) : { t: Date.now(), found: [alt.src], from: { [alt.src]: [alt.kind, null] }, pending: 0, waiters: [] };
    this.ytTried = new Set(); this.ytCur = ""; this.ytStarted = false; this.ytEver = false; this.ytDeadline = Date.now() + 12000;
    this.resumeAt = pos; this._altNote = true;
    this.use("audio"); this.ytNextSrc(tk);
    return true;
  },
  // Putar sumber audio YouTube berikutnya yang tersedia (server tercepat lebih dulu).
  async ytNextSrc(tk = this.tok) {
    if (tk !== this.tok || !this.cur || this.cur.kind !== "yt" || !this.ytRes) return;
    clearTimeout(this.ytT);
    const pos = this.ytStarted ? (this.audio.currentTime || 0) : this.resumeAt;
    this.ytStarted = false; // sumber berikutnya belum berjalan: posisi disimpan di resumeAt sampai berhasil
    if (this.ytCur) { YtAudio.bad.add(this.ytCur); this.ytTried.add(this.ytCur); }
    const ready = this.ytRes.found.some(u => !this.ytTried.has(u) && !YtAudio.bad.has(u));
    if (!ready) { if (!this.audio.paused) this.audio.pause(); status("Menyiapkan audio tanpa iklan…"); }
    const late = () => !this.ytEver && Date.now() > this.ytDeadline;
    const vid = this.cur.vid, url = late() ? null : await YtAudio.next(this.ytRes, this.ytTried);
    if (tk !== this.tok) return;
    if (!url || late()) {
      YtAudio.drop(vid); this.ytCur = "";
      if (await this.tryAlt(tk, this.ytEver && pos > 1 ? pos : 0)) return;
      return this.onError(this.list.length > 1 ? "Lagu ini sedang tidak bisa diputar tanpa iklan."
        : "Lagu ini sedang tidak bisa diputar tanpa iklan. Matikan “Tanpa iklan” bila ingin memutarnya lewat YouTube (ada iklan).");
    }
    this.ytCur = url; this.ytTried.add(url);
    this.resumeAt = pos > 1 ? pos : 0;
    this.load(url);
    this.audio.play().catch(e => { if (e && e.name === "NotAllowedError" && tk === this.tok) { this.setPlaying(false); status("Tekan tombol putar untuk mulai.", 4000); } });
    // sumber yang tidak mulai berbunyi dalam 8 detik dilewati
    this.ytT = setTimeout(() => { if (tk === this.tok && this.engine === "audio" && !this.ytStarted && !this.audio.paused) this.ytNextSrc(tk); }, 8000);
  },
  // Siapkan lagu berikutnya lebih dulu agar perpindahan lagu instan (juga saat layar terkunci)
  peekNext() {
    const n = this.list.length; if (n < 2) return -1;
    if (this.shuffle) {
      if (this.shufNext == null || this.shufNext === this.i || this.shufNext >= n) { let j; do j = Math.floor(Math.random() * n); while (j === this.i); this.shufNext = j; }
      return this.shufNext;
    }
    const j = this.i + 1; return j < n ? j : (this.repeat === "off" ? -1 : 0);
  },
  prefetchNext() {
    const it = this.list[this.peekNext()];
    if (!it || it === this.cur) return;
    if (it.kind === "yt" && this.adFree) YtAudio.get(it.vid);
    // Internet Archive: alamat file diambil lewat jaringan; siapkan sekarang agar saat layar terkunci lagu berikutnya
    // bisa dimulai seketika, tanpa jeda yang membuat HP menidurkan halaman.
    else if (it.kind === "archive" && !it.src && !it._pf) { it._pf = 1; archiveSrc(it.aid).then(u => { if (!it.src) it.src = u; }).catch(() => { it._pf = 0; }); }
  },
  playYtOfficial(it) {
    const start = this.resumeAt || 0; this.resumeAt = 0;
    this.use("yt"); status("Memuat…"); showNow(it);
    if (this.ytReady) this.yt.loadVideoById(start ? { videoId: it.vid, startSeconds: start } : it.vid); else { this.pendingVid = it.vid; this.initYT(); }
  },
  setAdFree(on) {
    this.adFree = on; store.set("ytAdFree", on); updateModes();
    toast(on ? "Tanpa iklan aktif: lagu YouTube diputar sebagai audio saja." : "Tanpa iklan dimatikan: lagu YouTube diputar lewat pemutar YouTube.");
    if (this.cur && this.cur.kind === "yt" && this.i >= 0) { const [c] = this.time(); this.resumeAt = c > 1 ? c : 0; this._keepResume = true; this.playAt(this.i); }
  },
  playRadio(st) {
    this.list = []; this.i = -1; this.tok++; FX.warm();
    this.cur = { kind: "radio", uuid: st.uuid, title: st.name, artist: [st.city, st.genre].filter(Boolean).join(", ") || "Radio Indonesia", art: st.favicon, station: st };
    showNow(this.cur); markPlaying(); refreshHearts(); Lyrics.load(this.cur);
    this.use("audio"); this.load(st.url); status("Menghubungkan ke " + st.name + "…");
    this.audio.play().catch(e => { if (e && e.name === "NotAllowedError") { this.setPlaying(false); status("Tekan tombol putar untuk mulai.", 4000); } });
  },
  onPlaying() {
    this.errRun = 0; this.setPlaying(true); status(""); FX.render();
    if (this.engine === "audio" && this.cur && this.cur.kind === "yt") {
      this.ytStarted = true; this.ytEver = true; clearTimeout(this.ytT);
      const f = this.ytRes && this.ytRes.from[this.ytCur]; if (f) YtAudio.setGood(f[0], f[1]); // ingat server tercepat
    }
    if (this._altNote) { this._altNote = false; toast("Lagu ini diputar dari sumber alternatif.", 3500); }
    this.prefetchNext(); if (this.cur && this.cur._hid) History.markOk(this.cur._hid); },
  setPlaying(on) {
    this.playing = on;
    $("#playIco").setAttribute("href", on ? "#i-pause" : "#i-play");
    $("#play").setAttribute("aria-label", on ? "Jeda" : "Putar");
    markPlaying();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = on ? "playing" : "paused";
  },
  onEnded() {
    if (!this.cur || this.cur.kind === "radio") return;
    if (this.repeat === "one") { this.seek(0); this.resume(); return; }
    this.next(true);
  },
  onError(msg) {
    this.setPlaying(false);
    if (this.cur && this.cur.kind === "radio") { Radio.markFailed(this.cur.uuid); status("Stasiun ini sedang tidak merespons. Coba stasiun lain.", 6000); return; }
    if (this.cur && this.cur._hid) History.markFailed(this.cur._hid);
    this.errRun++;
    if (this.list.length > 1 && this.errRun < 5) { status(msg + " Melewati ke lagu berikutnya…", 3000); setTimeout(() => this.next(true), 1600); }
    else status(msg, 6000);
  },
  nextIndex(dir, auto) {
    const n = this.list.length; if (!n) return -1;
    if (this.shuffle && n > 1 && dir > 0) {
      if (this.shufNext != null && this.shufNext !== this.i && this.shufNext < n) { const j = this.shufNext; this.shufNext = null; return j; } // yang sudah disiapkan
      let j; do j = Math.floor(Math.random() * n); while (j === this.i); return j;
    }
    let j = this.i + dir;
    if (j >= n) { if (auto && this.repeat === "off") return -1; j = 0; }
    if (j < 0) j = n - 1;
    return j;
  },
  next(auto = false) {
    if (!this.cur || this.cur.kind === "radio") return Radio.step(1);
    const j = this.nextIndex(1, auto);
    if (j < 0) { this.setPlaying(false); status("Antrean selesai.", 4000); return; }
    this.playAt(j);
  },
  prev() {
    if (!this.cur || this.cur.kind === "radio") return Radio.step(-1);
    if (this.time()[0] > 3) return this.seek(0);
    const j = this.nextIndex(-1, false); if (j >= 0) this.playAt(j);
  },
  time() {
    if (this.engine === "yt" && this.ytReady && this.yt.getCurrentTime) return [this.yt.getCurrentTime() || 0, this.yt.getDuration() || 0];
    if (this.engine === "sc") return [this.scPos || 0, this.scDur || 0];
    if (this.engine === "audio") return [this.audio.currentTime || 0, this.audio.duration];
    return [0, 0];
  },
  seek(t) {
    if (this.engine === "yt" && this.ytReady) this.yt.seekTo(t, true);
    else if (this.engine === "sc" && this.sc) { try { this.sc.seekTo(t * 1000); this.scPos = t; } catch { } }
    else if (this.engine === "audio" && isFinite(this.audio.duration)) this.audio.currentTime = t;
  },
  resume() { if (this.engine === "yt" && this.ytReady) this.yt.playVideo(); else if (this.engine === "sc" && this.sc) { try { this.sc.play(); } catch { } } else if (this.engine === "audio") this.audio.play().catch(() => { }); },
  pause() { if (this.engine === "yt" && this.ytReady) this.yt.pauseVideo(); else if (this.engine === "sc" && this.sc) { try { this.sc.pause(); } catch { } } else if (this.engine === "audio") this.audio.pause(); },
  toggle() {
    if (!this.cur) return toast("Pilih lagu atau stasiun radio dulu.");
    FX.warm(); this.playing ? this.pause() : this.resume();
  },
  // Pasang sumber audio pada elemen yang tepat: jalur efek suara (bila aktif & sumber mengizinkan) atau jalur biasa.
  load(url) {
    const el = FX.pick(url);
    if (el !== this.audio) { const old = this.audio; this.audio = el; try { old.pause(); old.removeAttribute("src"); old.load(); } catch { } }
    el.src = url; FX.warm();
    if (el !== FX.el) FX.maybeUpgrade(); else FX.render();
    return el;
  },
  // Pindahkan lagu yang sedang berjalan ke elemen lain (mengaktifkan/mematikan efek) tanpa mengulang dari awal.
  swap(to) {
    const from = this.audio; if (!to || from === to) return;
    const url = from.getAttribute("src"); if (!url) { this.audio = to; return; }
    const t = from.currentTime || 0, live = !isFinite(from.duration), wasPlaying = !from.paused;
    this.audio = to; this.resumeAt = !live && t > 1 ? t : 0;
    to.src = url;
    try { from.pause(); from.removeAttribute("src"); from.load(); } catch { }
    if (wasPlaying) to.play().catch(() => { });
    this.applyVol(); FX.render();
  },
  applyVol() {
    const v = this.muted ? 0 : this.vol;
    [this.plain, FX.el].forEach(e => { if (e) e.volume = v / 100; });
    if (this.sc) { try { this.sc.setVolume(v); } catch { } }
    if (this.ytReady) { this.yt.setVolume(this.vol); this.muted ? this.yt.mute() : this.yt.unMute(); }
    $("#volIco").setAttribute("href", v === 0 ? "#i-mute" : "#i-vol");
    $("#vol").value = this.vol;
  },
  stop() { this.tok++; this.pause(); this.use(null); this.cur = null; this.list = []; this.setPlaying(false); }
};
const A = Player.audio; Player.plain = A;
try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch { }
// Kedua elemen audio (jalur biasa & jalur efek) memakai pengendali yang sama; hanya elemen aktif yang dihitung.
function wireAudio(el) {
  el.preload = "none";
  // dipasang di halaman (beberapa browser HP lebih andal memutar di latar belakang)
  el.setAttribute("playsinline", ""); el.hidden = true; document.body.append(el);
  const on = () => Player.engine === "audio" && Player.audio === el;
  el.addEventListener("playing", () => on() && Player.onPlaying());
  // saat lagu habis, "pause" ikut terpicu; jangan tandai berhenti agar sesi media (notifikasi/layar kunci) tetap hidup menuju lagu berikutnya
  el.addEventListener("pause", () => on() && !el.ended && Player.setPlaying(false));
  el.addEventListener("waiting", () => on() && status("Memuat…"));
  el.addEventListener("ended", () => on() && Player.onEnded());
  el.addEventListener("error", () => {
    if (!on() || !el.getAttribute("src")) return;
    // jalur efek gagal: kemungkinan sumber tidak mengizinkan pengolahan suara → putar lewat jalur biasa
    if (el === FX.el) { FX.markCors(el.getAttribute("src"), false); return Player.swap(Player.plain); }
    if (Player.cur && Player.cur.kind === "yt") return Player.ytNextSrc(); // server audio YouTube gagal: coba server lain
    Player.onError("Sumber audio tidak bisa diputar.");
  });
  // lanjutkan dari posisi terakhir saat berpindah server / jalur / mode
  el.addEventListener("loadedmetadata", () => { if (on() && Player.resumeAt > 0) { try { el.currentTime = Player.resumeAt; } catch { } Player.resumeAt = 0; } });
}
wireAudio(A);

/* =====================================================================
   EFEK SUARA (Web Audio): bass, bass dalam, vokal, treble, surround, gema,
   penguat, dan koreksi speaker. Suara benar-benar diolah sebelum keluar.
   Berlaku untuk lagu yang diputar pemutar audio aplikasi: YouTube (mode
   Tanpa iklan), Audius, Internet Archive, file lokal, dan radio yang
   mengizinkan. Pemutar resmi YouTube/SoundCloud (iframe) tidak bisa diolah.
===================================================================== */
const FX_PRESETS = {
  normal:  { label: "Normal",       sub: 0,  bass: 0,  vocal: 0,  treble: 0,  width: 50, room: 0,  boost: 0 },
  bass:    { label: "Bass Boost",   sub: 6,  bass: 6,  vocal: 0,  treble: 1,  width: 50, room: 0,  boost: 0 },
  film:    { label: "Bass Film",    sub: 9,  bass: 5,  vocal: 1,  treble: 2,  width: 82, room: 18, boost: 2 },
  deep:    { label: "Bass Dalam",   sub: 11, bass: 3,  vocal: -1, treble: 0,  width: 55, room: 0,  boost: 1 },
  konser:  { label: "Konser",       sub: 3,  bass: 2,  vocal: 1,  treble: 2,  width: 78, room: 42, boost: 1 },
  vokal:   { label: "Vokal Jernih", sub: -2, bass: -1, vocal: 5,  treble: 2,  width: 50, room: 0,  boost: 1 },
  treble:  { label: "Treble",       sub: 0,  bass: -2, vocal: 2,  treble: 8,  width: 55, room: 0,  boost: 0 },
  pop:     { label: "Pop",          sub: 2,  bass: 2,  vocal: 2,  treble: 3,  width: 60, room: 8,  boost: 0 },
  rock:    { label: "Rock",         sub: 4,  bass: 3,  vocal: -1, treble: 4,  width: 62, room: 6,  boost: 1 },
  dangdut: { label: "Dangdut",      sub: 5,  bass: 4,  vocal: 3,  treble: 1,  width: 56, room: 10, boost: 1 },
  jazz:    { label: "Jazz",         sub: 2,  bass: 2,  vocal: 1,  treble: 2,  width: 62, room: 16, boost: 0 },
  santai:  { label: "Santai",       sub: 2,  bass: 1,  vocal: -1, treble: -3, width: 52, room: 6,  boost: 0 }
};
// Koreksi menurut perangkat keluaran suara
const FX_SPEAKERS = {
  datar:    { label: "Datar",        hp: 20,  low: 0, high: 0,  comp: 0 },
  hp:       { label: "Speaker HP",   hp: 110, low: 4, high: 3,  comp: 1 }, // speaker HP tak bisa memutar <100 Hz: dibuang agar lebih keras & jernih
  earphone: { label: "Earphone",     hp: 20,  low: 1, high: -1, comp: 0 },
  luar:     { label: "Speaker luar", hp: 35,  low: 2, high: 1,  comp: 0 }  // Bluetooth/aktif: lindungi speaker dari frekuensi sangat rendah
};
const FX_SLIDERS = [
  { k: "sub", label: "Bass dalam", min: 0, max: 12, unit: " dB" },
  { k: "bass", label: "Bass", min: -12, max: 12, unit: " dB" },
  { k: "vocal", label: "Vokal", min: -12, max: 12, unit: " dB" },
  { k: "treble", label: "Treble", min: -12, max: 12, unit: " dB" },
  { k: "width", label: "Surround", min: 0, max: 100, unit: "%" },
  { k: "room", label: "Gema", min: 0, max: 100, unit: "%" },
  { k: "boost", label: "Penguat", min: 0, max: 9, unit: " dB" }
];
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const FX = {
  ctx: null, el: null, n: null, bgSwap: false, probing: new Map(),
  cors: Object.assign({}, store.get("fxCors:v1", {})),
  set: Object.assign({ on: true, preset: "normal", speaker: "datar" }, FX_PRESETS.normal, store.get("fx:v1", {})),
  values() { return this.set; },
  // Efek benar-benar dipakai? (Normal + Datar = jalur biasa, 100% sama seperti tanpa efek)
  active() {
    const s = this.set, z = FX_PRESETS.normal;
    return !!s.on && (s.speaker !== "datar" || FX_SLIDERS.some(d => +s[d.k] !== z[d.k]));
  },
  save() { store.set("fx:v1", this.set); },
  origin(url) { try { return new URL(url, location.href).origin; } catch { return ""; } },
  sameOrigin(url) { return /^blob:/.test(url) || this.origin(url) === location.origin; },
  corsOk(url) { return this.sameOrigin(url) ? true : this.cors[this.origin(url)]; },
  markCors(url, ok) { const o = this.origin(url); if (!o) return; this.cors[o] = ok; store.set("fxCors:v1", this.cors); this.render(); },
  // Cek apakah sumber mengizinkan suaranya diolah (CORS). Hasil disimpan per server.
  async probe(url) {
    const known = this.corsOk(url); if (known !== undefined) return known;
    const o = this.origin(url); if (this.probing.has(o)) return this.probing.get(o);
    const p = (async () => {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
      try { await fetch(url, { mode: "cors", cache: "no-store", signal: ctl.signal }); ctl.abort(); this.markCors(url, true); return true; }
      catch (e) { if (e && e.name === "AbortError" && this.cors[o] === undefined) return false; this.markCors(url, false); return false; }
      finally { clearTimeout(t); this.probing.delete(o); }
    })();
    this.probing.set(o, p); return p;
  },
  // Siapkan pengolah suara (dipanggil dari tindakan pengguna agar browser mengizinkan)
  ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    try { this.ctx = new AC({ latencyHint: "playback" }); } catch { try { this.ctx = new AC(); } catch { return false; } }
    const c = this.ctx, el = this.el = new Audio(); el.crossOrigin = "anonymous"; wireAudio(el);
    const n = this.n = {};
    n.src = c.createMediaElementSource(el);
    n.pre = c.createGain();
    n.stereo = c.createGain(); n.stereo.channelCount = 2; n.stereo.channelCountMode = "explicit"; n.stereo.channelInterpretation = "speakers"; // mono → stereo
    const bq = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
    n.hp = bq("highpass", 20, .707); n.hp2 = bq("highpass", 20, .707); // dua tingkat: potongan frekuensi rendah lebih bersih
    n.sub = bq("peaking", 55, 1.1);
    n.bass = bq("lowshelf", 150);
    n.spkLow = bq("peaking", 220, 1);
    n.vocal = bq("peaking", 2500, .9);
    n.spkHigh = bq("peaking", 3800, 1);
    n.treble = bq("highshelf", 8500);
    // surround: pelebaran stereo (mid/side)
    n.split = c.createChannelSplitter(2); n.merge = c.createChannelMerger(2);
    n.ll = c.createGain(); n.lr = c.createGain(); n.rl = c.createGain(); n.rr = c.createGain();
    // gema: ruang buatan (impuls disintesis)
    n.dry = c.createGain(); n.wet = c.createGain(); n.verb = c.createConvolver(); n.verb.buffer = this.impulse(c, 2.2);
    n.sum = c.createGain();
    n.comp = c.createDynamicsCompressor(); // pembatas: mencegah suara pecah saat bass/penguat dinaikkan
    n.an = c.createAnalyser(); n.an.fftSize = 2048; n.an.smoothingTimeConstant = .75;
    n.src.connect(n.pre).connect(n.stereo).connect(n.hp).connect(n.hp2).connect(n.sub).connect(n.bass).connect(n.spkLow).connect(n.vocal).connect(n.spkHigh).connect(n.treble).connect(n.split);
    n.split.connect(n.ll, 0); n.split.connect(n.lr, 0); n.split.connect(n.rl, 1); n.split.connect(n.rr, 1);
    n.ll.connect(n.merge, 0, 0); n.rl.connect(n.merge, 0, 0); n.lr.connect(n.merge, 0, 1); n.rr.connect(n.merge, 0, 1);
    n.merge.connect(n.dry).connect(n.sum); n.merge.connect(n.verb).connect(n.wet).connect(n.sum);
    n.sum.connect(n.comp).connect(n.an).connect(c.destination);
    c.onstatechange = () => this.guardBackground();
    this.apply(true); Player.applyVol();
    return true;
  },
  impulse(c, sec) {
    const len = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    return b;
  },
  warm() { if (this.active() && this.ensure() && this.ctx.state !== "running") this.ctx.resume().catch(() => { }); },
  apply(now) {
    if (!this.n) return;
    const s = this.set, sp = FX_SPEAKERS[s.speaker] || FX_SPEAKERS.datar, n = this.n, t = this.ctx.currentTime;
    const to = (p, v) => now ? p.setValueAtTime(v, t) : p.setTargetAtTime(v, t, .04);
    const db = v => Math.pow(10, v / 20);
    to(n.pre.gain, db(+s.boost));
    to(n.hp.frequency, sp.hp); to(n.hp2.frequency, sp.hp);
    to(n.sub.gain, +s.sub); to(n.bass.gain, +s.bass); to(n.vocal.gain, +s.vocal); to(n.treble.gain, +s.treble);
    to(n.spkLow.gain, sp.low); to(n.spkHigh.gain, sp.high);
    const w = .2 + (+s.width / 100) * 1.6; // 0% → 0.2 (hampir mono), 50% → 1.0 (asli), 100% → 1.8 (lebar)
    to(n.ll.gain, (1 + w) / 2); to(n.rr.gain, (1 + w) / 2); to(n.lr.gain, (1 - w) / 2); to(n.rl.gain, (1 - w) / 2);
    const r = +s.room / 100; to(n.wet.gain, r * .55); to(n.dry.gain, 1 - r * .25);
    const hard = sp.comp || +s.boost > 0;
    to(n.comp.threshold, hard ? -14 : -3); to(n.comp.ratio, hard ? 6 : 20); to(n.comp.knee, hard ? 8 : 2);
    n.comp.attack.value = .003; n.comp.release.value = .25;
  },
  // Pindahkan lagu yang sedang diputar ke jalur efek bila efek aktif & sumber mengizinkan
  async maybeUpgrade() {
    if (!this.active() || Player.engine !== "audio" || Player.audio === this.el || document.hidden) return this.render();
    const url = Player.audio.getAttribute("src"); if (!url) return;
    if (!this.ensure()) return this.render();
    if (this.ctx.state !== "running") { try { await this.ctx.resume(); } catch { } }
    this.render("Menyiapkan efek…");
    const ok = await this.probe(url);
    if (!ok || this.ctx.state !== "running" || !this.active() || Player.audio.getAttribute("src") !== url || Player.audio === this.el) return this.render();
    Player.swap(this.el);
  },
  maybeDowngrade() { if (!this.active() && Player.audio === this.el) Player.swap(Player.plain); },
  pick(url) {
    if (this.active() && this.ctx && this.ctx.state === "running" && this.corsOk(url) === true && !document.hidden) return this.el;
    return Player.plain;
  },
  // Latar belakang: bila pengolah suara dihentikan sistem (mis. iPhone terkunci), lagu dipindah ke jalur biasa agar tetap berbunyi.
  guardBackground() {
    if (Player.audio !== this.el || !Player.playing) return;
    if (document.hidden && (isIOS || (this.ctx && this.ctx.state !== "running"))) { this.bgSwap = true; Player.swap(Player.plain); }
  },
  update(patch) {
    Object.assign(this.set, patch); this.save(); this.apply();
    if (this.active()) this.maybeUpgrade(); else this.maybeDowngrade();
    this.renderPanel();
  },
  status() {
    const c = Player.cur;
    if (!this.set.on) return ["Efek suara dimatikan.", ""];
    if (!this.active()) return ["Pilih preset atau geser pengaturan untuk mengubah suara.", ""];
    if (!c) return ["Efek akan diterapkan pada lagu yang Anda putar.", ""];
    if (Player.engine === "yt") return ["Lagu ini diputar lewat pemutar YouTube resmi, jadi efek tidak bisa diterapkan. Nyalakan “Tanpa iklan” agar efek bekerja.", "warn"];
    if (Player.engine === "sc") return ["Lagu SoundCloud diputar lewat widget resmi SoundCloud, jadi efek tidak bisa diterapkan.", "warn"];
    if (Player.audio === this.el) return ["Efek aktif pada lagu ini.", "ok"];
    const url = Player.audio.getAttribute("src");
    if (url && this.corsOk(url) === false) return ["Sumber lagu ini tidak mengizinkan suaranya diolah, jadi lagu diputar tanpa efek.", "warn"];
    return [this._msg || "Menyiapkan efek…", ""];
  },
  render(msg) { this._msg = msg || ""; const [t, cls] = this.status(); const e = $("#fxStatus"); if (e) { e.textContent = t; e.className = "fx-status " + cls; } updateFxChip(); }
};
/* ---------------------------------------------------------------------
   LATAR BELAKANG (layar redup / terkunci)
   - Penjaga macet: bila aliran audio berhenti maju (mis. sinyal berpindah menara saat layar terkunci), sumber dicoba
     lagi dari posisi terakhir (YouTube tanpa iklan: pindah ke server lain) agar lagu tidak diam selamanya.
   - Pemutar resmi YouTube/SoundCloud (iframe) dihentikan sistem HP saat layar terkunci; itu batasan dari mereka.
     Aplikasi memberi tahu cara agar lagu tetap jalan.
--------------------------------------------------------------------- */
const Stall = { last: -1, since: 0 };
setInterval(() => {
  const P = Player, a = P.audio;
  if (P.engine !== "audio" || !P.playing || !a || a.paused || a.ended || !a.getAttribute("src")) { Stall.since = 0; Stall.last = -1; return; }
  const t = a.currentTime;
  if (t !== Stall.last || !Stall.since) { Stall.last = t; Stall.since = Date.now(); return; }
  if (Date.now() - Stall.since < 15000) return;
  Stall.since = Date.now();
  if (P.cur && P.cur.kind === "yt") return P.ytNextSrc();
  const url = a.getAttribute("src"), live = !isFinite(a.duration);
  P.resumeAt = !live && t > 1 ? t : 0;
  P.load(url); P.audio.play().catch(() => { });
}, 5000);
let hiddenIframe = false;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) hiddenIframe = Player.playing && (Player.engine === "yt" || Player.engine === "sc");
  else if (hiddenIframe) {
    hiddenIframe = false;
    setTimeout(() => {
      if (Player.playing || (Player.engine !== "yt" && Player.engine !== "sc")) return;
      toast(Player.engine === "yt" ? "Pemutar YouTube berhenti saat layar terkunci. Nyalakan “Tanpa iklan” agar lagu tetap jalan." : "SoundCloud berhenti saat layar terkunci (dibatasi SoundCloud dan browser HP).", 6000);
    }, 900);
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) FX.guardBackground();
  else { if (FX.ctx && FX.ctx.state !== "running" && FX.active()) FX.ctx.resume().catch(() => { }); if (FX.bgSwap) { FX.bgSwap = false; FX.maybeUpgrade(); } }
});

function stopAll() { Player.stop(); showNow(null); }

function showNow(it) {
  const t = it ? it.title : "Belum ada lagu", a = it ? (it.artist || SRC_LABEL[it.kind] || "") : "Pilih lagu atau stasiun radio";
  $("#nTitle").textContent = t; $("#nArtist").textContent = it ? [a, SRC_LABEL[it.kind]].filter(Boolean).join(", dari ") : a;
  $("#bTitle").textContent = t; $("#bArtist").textContent = it ? a : "Live Music";
  const art = it && it.art;
  const ba = $("#barArt"); ba.style.backgroundImage = art ? `url("${art}")` : ""; ba.classList.toggle("has-art", !!art);
  const cv = $("#cover"); cv.style.backgroundImage = art && (it.kind !== "yt" || Player.adFree) ? `url("${art.replace("mqdefault", "hqdefault")}")` : ""; cv.classList.toggle("has-art", !!art);
  $("#liveTag").hidden = !(it && it.kind === "radio");
  $("#seek").disabled = !it || it.kind === "radio";
  document.title = it ? `${t} – ${a}` : "Live Music Player";
  if ("mediaSession" in navigator) {
    try { navigator.mediaSession.metadata = it ? new MediaMetadata({ title: t, artist: a, artwork: art ? [{ src: art, sizes: "320x180" }, { src: art.replace("mqdefault", "hqdefault"), sizes: "480x360" }] : [] }) : null; } catch { }
  }
}

// Kontrol
$("#play").onclick = () => Player.toggle();
$("#next").onclick = () => Player.next();
$("#prev").onclick = () => Player.prev();
$("#vol").oninput = e => { Player.vol = +e.target.value; Player.muted = false; store.set("vol", Player.vol); Player.applyVol(); };
$("#mute").onclick = () => { Player.muted = !Player.muted; Player.applyVol(); };
const seekEl = $("#seek");
seekEl.addEventListener("input", () => { Player.seeking = true; const [, d] = Player.time(); seekEl.style.setProperty("--p", seekEl.value / 10 + "%"); if (isFinite(d) && d) $("#time").textContent = fmt(d * seekEl.value / 1000) + " / " + fmt(d); });
seekEl.addEventListener("change", () => { const [, d] = Player.time(); if (isFinite(d) && d) Player.seek(d * seekEl.value / 1000); Player.seeking = false; });
[$("#nHeart"), $("#bHeart")].forEach(b => b.onclick = () => Player.cur && Fav.toggle(Player.cur));
function updateModes() {
  $("#shuffleBtn").setAttribute("aria-pressed", Player.shuffle);
  $("#repeatBtn").setAttribute("aria-pressed", Player.repeat !== "off");
  $("#repeatLbl").textContent = { off: "Ulangi: mati", all: "Ulangi semua", one: "Ulangi lagu ini" }[Player.repeat];
  $("#adFreeBtn").setAttribute("aria-pressed", Player.adFree);
  store.set("shuffle", Player.shuffle); store.set("repeat", Player.repeat);
}
$("#shuffleBtn").onclick = () => { Player.shuffle = !Player.shuffle; updateModes(); };
$("#repeatBtn").onclick = () => { Player.repeat = { off: "all", all: "one", one: "off" }[Player.repeat]; updateModes(); };
$("#adFreeBtn").onclick = () => Player.setAdFree(!Player.adFree);
updateModes();

document.addEventListener("keydown", e => {
  if (e.target.closest("input,textarea,select,[contenteditable]") || $("#app").hidden || $("#dlg").open) return;
  if (e.code === "Space") { e.preventDefault(); Player.toggle(); }
  else if (e.key === "ArrowRight" && e.shiftKey) Player.next();
  else if (e.key === "ArrowLeft" && e.shiftKey) Player.prev();
});

// Lembar "sedang diputar" di HP + video mengambang
let sheetOpen = false;
function setSheet(on) { sheetOpen = on && isMobile(); document.body.classList.toggle("sheet-open", sheetOpen); updatePip(); if (sheetOpen) Lyrics.scrollTo(true); }
function updatePip() { $("#ytWrap").classList.toggle("pip", isMobile() && !sheetOpen && (Player.engine === "yt" || Player.engine === "sc")); }
$("#barTrack").onclick = () => { if (isMobile()) setSheet(!sheetOpen); };
$("#lyBtn").onclick = () => setSheet(!sheetOpen);
$("#nowClose").onclick = () => setSheet(false);
$("#pipOpen").onclick = () => setSheet(true);
matchMedia("(max-width:1023px)").addEventListener("change", () => setSheet(false));

// Detak: progress, waktu, lirik
setInterval(() => {
  if (!Player.cur) { $("#time").textContent = ""; seekEl.value = 0; seekEl.style.setProperty("--p", "0%"); return; }
  const [c, d] = Player.time();
  if (Player.cur.kind === "radio") { $("#time").textContent = Player.playing ? "Siaran langsung" : ""; seekEl.value = 0; seekEl.style.setProperty("--p", "0%"); return; }
  if (!Player.seeking && isFinite(d) && d > 0) {
    seekEl.value = Math.round(c / d * 1000); seekEl.style.setProperty("--p", (c / d * 100) + "%");
    $("#time").textContent = fmt(c) + " / " + fmt(d);
  }
  Lyrics.tick(c);
}, 250);
setInterval(() => {
  if (!("mediaSession" in navigator) || !Player.cur || Player.cur.kind === "radio") return;
  const [c, d] = Player.time();
  if (isFinite(d) && d > 0) try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(c, d), playbackRate: 1 }); } catch { }
}, 1000);
if ("mediaSession" in navigator) {
  const set = (n, f) => { try { navigator.mediaSession.setActionHandler(n, f); } catch { } };
  set("play", () => Player.resume()); set("pause", () => Player.pause()); set("stop", () => Player.pause());
  set("previoustrack", () => Player.prev()); set("nexttrack", () => Player.next());
  set("seekto", d => Player.seek(d.seekTime));
  set("seekbackward", d => { const [c] = Player.time(); Player.seek(Math.max(0, c - ((d && d.seekOffset) || 10))); });
  set("seekforward", d => { const [c, du] = Player.time(); Player.seek(Math.min(du || c + 10, c + ((d && d.seekOffset) || 10))); });
}

/* =====================================================================
   LIRIK (LRCLIB) — tersinkron bila tersedia
===================================================================== */
const Lyrics = {
  lines: [], synced: false, idx: -1, tok: 0, userScroll: 0,
  msg(text, link) {
    const b = $("#lyBody"); b.innerHTML = ""; this.lines = []; this.idx = -1;
    const p = el("p", { class: "ly-msg", text });
    if (link) p.append(" ", el("a", { href: link.href, target: "_blank", rel: "noopener", text: link.label }));
    b.append(p); $("#lySrc").textContent = "";
  },
  query(it) {
    let title = it.title || "", artist = it.artist || "";
    title = title.replace(/[\(\[][^\)\]]*[\)\]]/g, " ").replace(/\b(feat|ft)\.?\s.*$/i, "").replace(/\s{2,}/g, " ").trim();
    artist = artist.replace(/\s*(,|&| x | feat\.?| ft\.?).*$/i, "").trim();
    if (it.kind === "local" || it.kind === "sc") { const m = title.match(/^(.+?)\s+[-–]\s+(.+)$/); if (m) { artist = m[1]; title = m[2]; } else if (it.kind === "local") artist = ""; }
    return { title, artist };
  },
  async load(it) {
    const tk = ++this.tok;
    if (!it) return this.msg("Lirik muncul di sini saat lagu diputar.");
    if (it.kind === "radio") return this.msg("Lirik tidak tersedia untuk siaran radio langsung.");
    this.msg("Mencari lirik…");
    const { title, artist } = this.query(it);
    const g = { href: `https://www.google.com/search?q=${enc("lirik " + artist + " " + title)}`, label: "Cari lirik di Google" };
    try {
      const api = p => getJSON("https://lrclib.net/api/search?" + new URLSearchParams(p), { timeout: 8000 });
      let r = artist ? await api({ track_name: title, artist_name: artist }) : [];
      if (!r.length) r = await api({ q: `${artist} ${title}`.trim() });
      if (!r.length && it.raw) r = await api({ q: norm(it.raw.replace(/[\(\[][^\)\]]*[\)\]]/g, " ")) });
      if (tk !== this.tok) return;
      const best = this.pick(r, it.dur);
      if (!best) return this.msg("Lirik untuk lagu ini belum tersedia.", g);
      if (best.instrumental) return this.msg("Lagu instrumental, tanpa lirik.");
      this.render(best);
    } catch { if (tk === this.tok) this.msg("Lirik tidak bisa dimuat saat ini.", g); }
  },
  pick(list, dur) {
    const c = (list || []).filter(x => x.syncedLyrics || x.plainLyrics || x.instrumental);
    if (!c.length) return null;
    const near = x => !dur || !x.duration ? 0 : Math.abs(x.duration - dur);
    const ok = dur ? c.filter(x => !x.duration || near(x) <= 10) : c;
    const pool = ok.length ? ok : c;
    pool.sort((a, b) => (!!b.syncedLyrics - !!a.syncedLyrics) || (near(a) - near(b)));
    return pool[0];
  },
  render(r) {
    const b = $("#lyBody"); b.innerHTML = ""; this.lines = []; this.idx = -1;
    $("#lySrc").textContent = "Lirik dari LRCLIB";
    if (r.syncedLyrics) {
      this.synced = true;
      r.syncedLyrics.split("\n").forEach(line => {
        const tags = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]; if (!tags.length) return;
        const text = line.replace(/\[[^\]]*\]/g, "").trim();
        tags.forEach(m => this.lines.push({ t: +m[1] * 60 + +m[2], text: text || "♪" }));
      });
      this.lines.sort((a, b) => a.t - b.t);
      this.lines.forEach(l => { l.el = el("p", { class: "ly-line", text: l.text, onclick: () => Player.seek(Math.max(0, l.t - .2)) }); b.append(l.el); });
    } else {
      this.synced = false;
      b.append(el("p", { class: "ly-plain", text: r.plainLyrics }));
    }
    b.scrollTop = 0;
  },
  tick(t) {
    if (!this.synced || !this.lines.length) return;
    let i = -1; for (let k = 0; k < this.lines.length; k++) { if (this.lines[k].t <= t + .25) i = k; else break; }
    if (i === this.idx) return;
    this.lines.forEach((l, k) => { l.el.classList.toggle("on", k === i); l.el.classList.toggle("past", k < i); });
    this.idx = i; this.scrollTo(false);
  },
  scrollTo(force) {
    const l = this.lines[this.idx]; if (!l) return;
    if (!force && Date.now() - this.userScroll < 4000) return;
    const b = $("#lyBody");
    b.scrollTo({ top: l.el.offsetTop - b.clientHeight * .35, behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth" });
  }
};
["wheel", "touchmove"].forEach(ev => $("#lyBody").addEventListener(ev, () => Lyrics.userScroll = Date.now(), { passive: true }));

/* =====================================================================
   RADIO INDONESIA (hanya stasiun yang terdeteksi aktif)
===================================================================== */
const RB = ["https://de1.api.radio-browser.info", "https://de2.api.radio-browser.info", "https://nl1.api.radio-browser.info", "https://at1.api.radio-browser.info", "https://fi1.api.radio-browser.info"];
const FEATURED = /\b(rri|prambors|gen ?fm|gen 98|hard ?rock|delta|i ?radio|elshinta|sonora|trax|trijaya|mnc|smart ?fm|kis ?fm|global ?radio|female|mustang|bahana|jak ?fm|motion|cosmopolitan|oz radio|suara surabaya|swaragama|geronimo|ardan|unisi|ms tri|bens|mersi|md ?fm|radio dangdut|dangdut indonesia|el ?john|nostalgia|pas ?fm|sindo|v radio|pr fm|kiss|rdi)\b/;
const CATS = [
  { id: "pilihan", label: "Stasiun populer" },
  { id: "semua", label: "Semua" },
  { id: "berita", label: "Berita & talk", re: /news|berita|talk|informa|politik/ },
  { id: "pop", label: "Pop & hits", re: /pop|top ?40|hits|chr|indie/ },
  { id: "dangdut", label: "Dangdut", re: /dangdut|koplo/ },
  { id: "religi", label: "Religi", re: /islam|religi|quran|dakwah|christian|kristen|rohani|gospel|muslim|katolik|sholawat/ },
  { id: "jazz", label: "Jazz & santai", re: /jazz|smooth|easy|lounge|chill/ },
  { id: "rock", label: "Rock", re: /rock|metal|alternative/ },
  { id: "nostalgia", label: "Nostalgia", re: /oldies|80s|90s|70s|classic|nostalgia|retro|tembang|kenangan/ },
  { id: "daerah", label: "Musik daerah", re: /jawa|sunda|bali|minang|campursari|daerah|keroncong|batak|melayu|tradisional/ }
];
const titleCase = s => s.toLowerCase().replace(/(^|\s|-)\S/g, m => m.toUpperCase());
const Radio = {
  all: [], view: [], loaded: false, loading: false, host: null, cat: "pilihan", failed: new Set(),
  async ensure() { if (!this.loaded && !this.loading) this.load(); },
  async load() {
    this.loading = true;
    const box = $("#rList"); box.innerHTML = ""; box.append(el("div", { class: "skeleton" }), el("div", { class: "skeleton" }), el("div", { class: "skeleton" }));
    $("#rCount").textContent = "Memuat daftar stasiun aktif…";
    try {
      const [d, h] = await tryHosts(RB, null, h => getJSON(`${h}/json/stations/bycountrycodeexact/ID?hidebroken=true&order=clickcount&reverse=true&limit=800`, { timeout: 10000 }));
      this.host = h;
      const seen = new Set();
      this.all = d.filter(x => x.lastcheckok === 1 && /^https:\/\//i.test(x.url_resolved || "") && x.name && x.name.trim())
        .map(x => {
          const name = x.name.replace(/\s{2,}/g, " ").trim(), tags = (x.tags || "").toLowerCase();
          const first = tags.split(",").map(s => s.trim()).find(Boolean);
          return {
            uuid: x.stationuuid, name, url: x.url_resolved, city: x.state ? (x.state.trim() === x.state.trim().toLowerCase() ? titleCase(x.state.trim()) : x.state.trim()) : "", tags,
            genre: first ? titleCase(first) : "", bitrate: x.bitrate || 0, codec: x.codec || "",
            favicon: /^https:\/\//i.test(x.favicon || "") ? x.favicon : null, clicks: x.clickcount || 0,
            featured: FEATURED.test(norm(name))
          };
        })
        .filter(x => { const k = norm(x.name); if (seen.has(k)) return false; seen.add(k); return true; });
      this.loaded = true;
      const provs = [...new Set(this.all.map(x => x.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
      const sel = $("#rProv"); sel.length = 1; provs.forEach(p => sel.append(el("option", { value: p, text: p })));
      this.render();
    } catch (e) {
      box.innerHTML = ""; $("#rCount").textContent = "";
      box.append(el("div", { class: "empty" }, el("p", { text: "Daftar radio tidak bisa dimuat. Direktori radio sedang tidak bisa dijangkau." }), el("button", { class: "btn ghost", text: "Coba lagi", onclick: () => this.load() })));
    } finally { this.loading = false; }
  },
  render() {
    const q = norm($("#rq").value), prov = $("#rProv").value, cat = CATS.find(c => c.id === this.cat);
    let v = this.all.filter(x => (!prov || x.city === prov) && (!q || norm(x.name + " " + x.city + " " + x.tags).includes(q)));
    if (cat.id === "pilihan" && !q && !prov) v = v.filter(x => x.featured).concat(v.filter(x => !x.featured).slice(0, 20));
    else if (cat.re) v = v.filter(x => cat.re.test(x.tags + " " + norm(x.name)));
    this.view = v;
    const box = $("#rList"); box.innerHTML = "";
    $("#rCount").textContent = v.length ? `${v.length} stasiun aktif` + (prov ? ` di ${prov}` : "") + ". Daftar diperbarui otomatis dari direktori Radio Browser." : "";
    if (!v.length) { box.append(el("div", { class: "empty" }, el("p", { text: "Tidak ada stasiun yang cocok. Coba kata kunci lain atau pilih Semua daerah." }))); return; }
    const frag = document.createDocumentFragment();
    v.forEach(st => {
      const art = st.favicon ? el("img", { class: "art", src: st.favicon, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onerror: e => e.target.replaceWith(this.initial(st)) }) : this.initial(st);
      const sub = el("span", { class: "row-sub" }, el("span", { class: "a", text: [st.city || "Indonesia", st.genre, st.bitrate ? st.bitrate + " kbps" : ""].filter(Boolean).join(", ") }));
      const row = el("div", { class: "row" + (this.failed.has(st.uuid) ? " failed" : ""), role: "button", tabindex: "0", "data-key": "radio:" + st.uuid },
        art, el("div", { class: "row-meta" }, el("span", { class: "row-title", text: st.name }), sub),
        el("div", { class: "row-end" }, el("span", { class: "eq", "aria-hidden": "true" }, el("i"), el("i"), el("i")), el("span", { class: "icon-btn plain", "aria-hidden": "true" }, icon("play"))));
      row.onclick = () => this.play(st);
      row.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.click(); } };
      frag.append(row);
    });
    box.append(frag); markPlaying();
  },
  initial(st) { return el("div", { class: "art", text: (st.name.replace(/^radio\s+/i, "")[0] || "R").toUpperCase() }); },
  play(st) {
    Player.playRadio(st);
    if (this.host) fetch(`${this.host}/json/url/${st.uuid}`).catch(() => { }); // hitung klik di direktori
  },
  step(d) {
    const v = this.view; if (!v.length || !Player.cur || Player.cur.kind !== "radio") return;
    const i = v.findIndex(x => x.uuid === Player.cur.uuid);
    this.play(v[(i + d + v.length) % v.length]);
  },
  markFailed(uuid) { this.failed.add(uuid); const r = $(`.row[data-key="radio:${uuid}"]`); if (r) r.classList.add("failed"); }
};
CATS.forEach(c => $("#rCats").append(el("button", { class: "chip", "aria-pressed": c.id === "pilihan", text: c.label, onclick: e => { Radio.cat = c.id; $$("#rCats .chip").forEach(x => x.setAttribute("aria-pressed", x === e.target)); Radio.render(); } })));
let rT; $("#rq").oninput = () => { clearTimeout(rT); rT = setTimeout(() => Radio.loaded && Radio.render(), 200); };
$("#rProv").onchange = () => Radio.loaded && Radio.render();
$("#urlForm").onsubmit = e => {
  e.preventDefault(); const u = $("#url").value.trim();
  if (!/^https?:\/\//i.test(u)) return toast("Masukkan alamat yang diawali https://");
  if (/^http:\/\//i.test(u) && location.protocol === "https:") toast("Alamat http biasanya diblokir browser di situs https. Gunakan alamat https bila ada.", 5000);
  Player.playRadio({ uuid: "custom", name: "Stream pilihan Anda", url: u, city: "", genre: "" });
};

/* =====================================================================
   FILE LOKAL
===================================================================== */
const local = [];
$("#pick").onclick = () => $("#files").click();
$("#files").onchange = e => {
  const start = local.length;
  [...e.target.files].forEach(f => local.push({ kind: "local", title: f.name.replace(/\.[^.]+$/, ""), artist: "File lokal", src: URL.createObjectURL(f) }));
  e.target.value = "";
  renderRows($("#tracks"), local, "local");
  if (local.length > start) Player.playList(local, start);
};

/* =====================================================================
   PEMBLOKIR IKLAN — Content-Security-Policy di index.html memblokir skrip
   & iframe dari domain selain layanan yang dipakai aplikasi. Di sini hanya
   dicatat ke konsol agar mudah diperiksa.
===================================================================== */
document.addEventListener("securitypolicyviolation", e => {
  console.info("[Pemblokir] Diblokir:", e.blockedURI || "(inline)", "aturan:", e.effectiveDirective);
});

/* ---------------------------------------------------------------------
   Panel pengaturan efek suara
--------------------------------------------------------------------- */
function updateFxChip() {
  const b = $("#fxBtn"); if (!b) return;
  const s = FX.set, on = FX.active();
  const name = !s.on ? "" : (FX_PRESETS[s.preset] ? FX_PRESETS[s.preset].label : "Kustom");
  $("#fxChipVal").textContent = on ? ": " + (s.preset === "normal" ? FX_SPEAKERS[s.speaker].label : name) : "";
  b.classList.toggle("on", on);
}
FX.renderPanel = function () {
  const s = this.set;
  $("#fxOn").checked = !!s.on; $("#fxOnLbl").textContent = s.on ? "Aktif" : "Mati";
  $("#fxPanel").classList.toggle("off", !s.on);
  $$("#fxPresets button").forEach(b => b.setAttribute("aria-pressed", b.dataset.p === s.preset));
  $$("#fxSpk button").forEach(b => b.setAttribute("aria-pressed", b.dataset.s === s.speaker));
  FX_SLIDERS.forEach(d => {
    const r = $(`#fx_${d.k}`); if (!r) return;
    if (+r.value !== +s[d.k]) r.value = s[d.k];
    const v = +s[d.k]; $(`#fxv_${d.k}`).textContent = (d.unit === " dB" && v > 0 ? "+" : "") + v + d.unit;
    r.style.setProperty("--p", ((v - d.min) / (d.max - d.min) * 100) + "%");
  });
  this.render(this._msg);
};
Object.entries(FX_PRESETS).forEach(([k, p]) => $("#fxPresets").append(el("button", { type: "button", "data-p": k, text: p.label, onclick: () => { FX.ensure(); FX.update(Object.assign({ preset: k, on: true }, { sub: p.sub, bass: p.bass, vocal: p.vocal, treble: p.treble, width: p.width, room: p.room, boost: p.boost })); } })));
$("#fxPresets").append(el("button", { type: "button", "data-p": "custom", text: "Kustom", disabled: true, title: "Muncul otomatis saat Anda menggeser pengaturan" }));
Object.entries(FX_SPEAKERS).forEach(([k, p]) => $("#fxSpk").append(el("button", { type: "button", "data-s": k, text: p.label, onclick: () => { FX.ensure(); FX.update({ speaker: k, on: true }); } })));
FX_SLIDERS.forEach(d => {
  const r = el("input", { type: "range", id: `fx_${d.k}`, min: d.min, max: d.max, step: 1, value: FX.set[d.k], "aria-label": d.label });
  r.oninput = () => { FX.ensure(); FX.update({ [d.k]: +r.value, preset: "custom", on: true }); };
  $("#fxSliders").append(el("label", { class: "fx-row", for: `fx_${d.k}` }, el("span", { class: "fx-lbl", text: d.label }), r, el("span", { class: "fx-val", id: `fxv_${d.k}` })));
});
$("#fxOn").onchange = e => { FX.ensure(); FX.update({ on: e.target.checked }); };
$("#fxReset").onclick = () => { FX.ensure(); FX.update(Object.assign({ preset: "normal", speaker: "datar", on: true }, (({ label, ...v }) => v)(FX_PRESETS.normal))); };
let fxRaf = 0;
function fxDraw() {
  const cv = $("#fxViz"), g = cv.getContext("2d"), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const live = FX.n && Player.audio === FX.el && Player.playing;
  const bars = 40, gap = 4, bw = (W - gap * (bars - 1)) / bars;
  let data = null;
  if (live) { data = new Uint8Array(FX.n.an.frequencyBinCount); FX.n.an.getByteFrequencyData(data); }
  const grad = g.createLinearGradient(0, H, 0, 0); grad.addColorStop(0, "#C9A227"); grad.addColorStop(1, "#EBD283");
  for (let i = 0; i < bars; i++) {
    let v = .04;
    if (data) { // skala logaritmik: 30 Hz … 16 kHz
      const ny = FX.ctx.sampleRate / 2, f0 = 30 * Math.pow(16000 / 30, i / bars), f1 = 30 * Math.pow(16000 / 30, (i + 1) / bars);
      const a = Math.floor(f0 / ny * data.length), b = Math.max(a + 1, Math.floor(f1 / ny * data.length));
      let m = 0; for (let k = a; k < b && k < data.length; k++) m = Math.max(m, data[k]); v = Math.max(.04, m / 255);
    }
    g.fillStyle = live ? grad : "#A39A7855";
    const h = v * H; g.beginPath(); g.roundRect ? g.roundRect(i * (bw + gap), H - h, bw, h, 3) : g.rect(i * (bw + gap), H - h, bw, h); g.fill();
  }
  fxRaf = !$("#fxPanel").hidden ? requestAnimationFrame(fxDraw) : 0;
}
function openFx(on) {
  const p = $("#fxPanel"); p.hidden = !on; $("#fxBtn").setAttribute("aria-expanded", on);
  if (on) { FX.renderPanel(); if (!fxRaf) fxRaf = requestAnimationFrame(fxDraw); }
}
$("#fxBtn").onclick = e => { e.stopPropagation(); openFx($("#fxPanel").hidden); };
$("#fxClose").onclick = () => openFx(false);
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#fxPanel").hidden) openFx(false); });
document.addEventListener("pointerdown", e => { const p = $("#fxPanel"); if (!p.hidden && !p.contains(e.target) && !e.target.closest("#fxBtn")) openFx(false); });
updateFxChip();

/* =====================================================================
   MULAI
===================================================================== */
Player.applyVol();
if (!Player.adFree) Player.initYT(); // pemutar resmi YouTube hanya dimuat bila "Tanpa iklan" dimatikan
YtAudio.discover().catch(() => { });
initAuth();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
