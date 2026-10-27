"use strict";
/* =====================================================================
   Live Music Player
   - Login/daftar & favorit per akun: Supabase
   - Lagu penuh: YouTube (player resmi), Audius, Internet Archive
   - Radio Indonesia aktif: direktori Radio Browser
   - Lirik (tersinkron bila ada): LRCLIB
   ===================================================================== */
const CFG = Object.assign({ SUPABASE_URL: "", SUPABASE_ANON_KEY: "", YOUTUBE_API_KEY: "" }, window.APP_CONFIG || {});
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
    else e.setAttribute(k, v === true ? "" : v);
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
  store.set("lastView", name);
  setSheet(false);
  if (name === "radio") Radio.ensure();
  window.scrollTo({ top: 0 });
}
$$("[data-tab]").forEach(b => b.onclick = () => showView(b.dataset.tab));

/* =====================================================================
   LAGU: identitas & baris daftar
   kind: yt | audius | archive | local | legacy(favorit lama, dicari ulang di YouTube) | radio
===================================================================== */
const SRC_LABEL = { yt: "YouTube", audius: "Audius", archive: "Internet Archive", local: "File lokal", legacy: "YouTube", radio: "Radio" };
const SRC_CLASS = { yt: "yt", legacy: "yt", audius: "audius", archive: "archive" };
function songKey(it) {
  if (it.kind === "yt") return "yt:" + it.vid;
  if (it.kind === "audius") return "au:" + it.auid;
  if (it.kind === "archive") return "ia:" + it.aid;
  return "t:" + norm(it.title + " " + it.artist);
}
function plainSong(it) {
  const o = {}; ["kind", "vid", "auid", "aid", "src", "title", "artist", "album", "year", "dur", "art", "raw"].forEach(k => { if (it[k] != null && it[k] !== "") o[k] = it[k]; });
  if (o.kind === "archive") delete o.src;
  return o;
}

function trackRow(it, list, i, ctx) {
  const art = it.art
    ? el("img", { class: "art", src: it.art, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onerror: e => e.target.replaceWith(el("div", { class: "art" }, icon("music"))) })
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
  row.onclick = () => Player.playList(list, i);
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
const NOISE = /\b(reaction|react|tutorial|chord|kunci gitar|karaoke|cover|remix|slowed|reverb|nightcore|8d|sped up|speed up|shorts|instrumental|drum cam|review|podcast)\b/;

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
const PIPED = ["https://pipedapi.kavin.rocks", "https://pipedapi.adminforge.de", "https://api.piped.private.coffee", "https://pipedapi.r4fo.com"];
const INVID = ["https://inv.nadeko.net", "https://invidious.nerdvpn.de", "https://yewtu.be", "https://invidious.privacyredirect.com", "https://iv.melmac.space"];
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
async function tryHosts(hosts, good, fn) {
  const order = good ? [good, ...hosts.filter(h => h !== good)] : hosts;
  let last;
  for (const h of order) { try { const r = await fn(h); return [r, h]; } catch (e) { last = e; } }
  throw last || new Error("semua server gagal");
}
async function ytKeylessSearch(q, st) {
  if (!st.ytK) st.ytK = { page: 0, piped: null, usePiped: true };
  const k = st.ytK;
  // Piped (filter "music_songs" = katalog lagu YouTube Music, sangat relevan)
  if (k.usePiped) {
    try {
      const [d, h] = await tryHosts(PIPED, goodPiped, h => getJSON(k.piped
        ? `${h}/nextpage/search?nextpage=${enc(k.piped)}&q=${enc(q)}&filter=music_songs`
        : `${h}/search?q=${enc(q)}&filter=music_songs`, { timeout: 7000 }));
      goodPiped = h; k.piped = d.nextpage || null;
      const items = (d.items || []).filter(x => x.url && x.duration >= MIN_SEC)
        .map(x => ytItem((x.url.match(/v=([\w-]{11})/) || [])[1], x.title, x.uploaderName, x.duration)).filter(x => x.vid);
      if (items.length || k.piped) return { items, more: !!k.piped };
    } catch (e) { /* lanjut ke Invidious */ }
    k.usePiped = false;
  }
  k.page++;
  const [d, h] = await tryHosts(INVID, goodInv, h => getJSON(`${h}/api/v1/search?q=${enc(q)}&type=video&page=${k.page}&region=ID`, { timeout: 7000 }));
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
async function ytFindOne(q) {
  const r = await ytSearch(q, {});
  const best = r.items.sort((a, b) => score(b, q) - score(a, q))[0];
  if (!best) throw new Error("versi lengkap tidak ditemukan");
  return best;
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
  const qq = `(title:(${q}) OR creator:(${q})) AND mediatype:(audio)`;
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

const SOURCES = { youtube: ytSearch, audius: audiusSearch, archive: archiveSearch };

function score(it, q) {
  const qt = norm(q).split(" ").filter(Boolean); if (!qt.length) return 0;
  const hay = " " + norm(`${it.title} ${it.artist} ${it.album || ""} ${it.year || ""} ${it.raw || ""}`) + " ";
  let s = qt.reduce((a, t) => a + (hay.includes(" " + t) ? 1 : 0), 0) / qt.length;
  if (NOISE.test(norm(it.title + " " + (it.raw || ""))) && !NOISE.test(norm(q))) s -= .6;
  if (it.kind === "yt") s += .1;
  return s;
}

let S = { q: "", src: "all", items: [], keys: new Set(), more: {}, st: {}, tok: 0, busy: false };
let srcSel = store.get("srcSel", "all");
$$("#srcSeg button").forEach(b => {
  b.setAttribute("aria-pressed", b.dataset.src === srcSel);
  b.onclick = () => { srcSel = b.dataset.src; store.set("srcSel", srcSel); $$("#srcSeg button").forEach(x => x.setAttribute("aria-pressed", x === b)); if ($("#q").value.trim()) runSearch(false); };
});

async function runSearch(more) {
  const q = $("#q").value.trim();
  if (q.length < 2) { if (!more) toast("Ketik minimal 2 huruf."); return; }
  if (!more) {
    const names = srcSel === "all" ? Object.keys(SOURCES) : [srcSel];
    S = { q, items: [], keys: new Set(), more: Object.fromEntries(names.map(n => [n, true])), st: {}, tok: S.tok + 1, busy: false };
    $("#results").innerHTML = ""; $("#results").append(el("div", { class: "skeleton" }), el("div", { class: "skeleton" }), el("div", { class: "skeleton" }));
    $("#searchEmpty").hidden = true; $("#more").hidden = true; $("#count").textContent = "Mencari lagu penuh…";
    $("#q").blur();
  }
  if (S.busy) return; S.busy = true;
  const tk = S.tok, names = Object.keys(S.more).filter(n => S.more[n]);
  $("#more").disabled = true;
  const res = await Promise.allSettled(names.map(n => SOURCES[n](S.q, S.st)));
  S.busy = false; $("#more").disabled = false;
  if (tk !== S.tok) return;
  if (!more) $("#results").innerHTML = "";
  const fails = [], batch = [];
  res.forEach((r, i) => {
    const n = names[i];
    if (r.status === "fulfilled") {
      S.more[n] = r.value.more;
      r.value.items.forEach(it => {
        const k = songKey(it); if (S.keys.has(k)) return;
        const sc = score(it, S.q);
        if (it.kind !== "yt" && sc < .5) return;   // buang hasil yang tidak cocok dari sumber yang kurang akurat
        S.keys.add(k); it._s = sc; batch.push(it);
      });
    } else { S.more[n] = false; fails.push(n); }
  });
  batch.sort((a, b) => b._s - a._s);
  const from = S.items.length; S.items.push(...batch);
  renderRows($("#results"), S.items, "search", from);
  const anyMore = Object.values(S.more).some(Boolean);
  $("#more").hidden = !anyMore;
  const failTxt = fails.length ? ` Sumber yang sedang tidak bisa dijangkau: ${fails.map(n => ({ youtube: "YouTube", audius: "Audius", archive: "Internet Archive" })[n]).join(", ")}.` : "";
  if (!S.items.length) {
    $("#count").textContent = "";
    $("#results").append(el("div", { class: "empty" }, el("p", { text: (fails.length === names.length ? "Semua sumber lagu sedang tidak bisa dijangkau. Coba lagi sebentar lagi." : `Tidak ada lagu penuh untuk "${S.q}". Coba ejaan lain atau tambahkan nama penyanyinya.`) + failTxt })));
  } else $("#count").textContent = `${S.items.length} lagu penuh untuk "${S.q}".${failTxt}`;
}
$("#searchForm").onsubmit = e => { e.preventDefault(); runSearch(false); };
$("#more").onclick = () => runSearch(true);

// Saran nama penyanyi/judul saat mengetik (data katalog iTunes, tanpa audio)
let sugT, lastSug = [];
$("#q").addEventListener("input", () => {
  const q = $("#q").value.trim();
  if (lastSug.includes(q)) { runSearch(false); return; } // pengguna memilih saran
  clearTimeout(sugT); if (q.length < 2) return;
  sugT = setTimeout(async () => {
    try {
      const r = (await getJSON(`https://itunes.apple.com/search?term=${enc(q)}&media=music&entity=song&limit=10&country=id`, { timeout: 5000 })).results || [];
      lastSug = [...new Set(r.flatMap(x => [x.artistName, `${x.artistName} ${x.trackName}`]))].slice(0, 8);
      const dl = $("#sug"); dl.innerHTML = ""; lastSug.forEach(v => dl.append(el("option", { value: v })));
    } catch { }
  }, 300);
});
["Dewa 19", "Sheila on 7", "Tulus", "Nadin Amizah", "Noah", "Didi Kempot", "Lagu pop 2000"].forEach(t =>
  $("#tryChips").append(el("button", { class: "chip", text: t, onclick: () => { $("#q").value = t; runSearch(false); } })));

/* =====================================================================
   PEMUTAR (YouTube iframe resmi + elemen audio)
===================================================================== */
const Player = {
  engine: null, audio: new Audio(), yt: null, ytReady: false, pendingVid: null,
  list: [], i: -1, cur: null, tok: 0, playing: false, errRun: 0,
  vol: store.get("vol", 80), muted: false, shuffle: store.get("shuffle", false), repeat: store.get("repeat", "off"), seeking: false,

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
          this.onError(M[e.data] || "Video tidak bisa diputar.");
        }
      }
    });
  },
  use(engine) {
    if (this.engine !== engine) {
      if (this.engine === "yt" && this.ytReady) try { this.yt.stopVideo(); } catch { }
      if (this.engine === "audio") { this.audio.pause(); this.audio.removeAttribute("src"); this.audio.load(); }
    }
    this.engine = engine; $("#ytWrap").classList.toggle("off", engine !== "yt"); updatePip();
  },
  playList(list, i) {
    this.list = list.slice();
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
    this.i = i; this.cur = it; const tk = ++this.tok;
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
      if (it.kind === "yt") {
        this.use("yt"); status("Memuat…");
        if (this.ytReady) this.yt.loadVideoById(it.vid); else { this.pendingVid = it.vid; this.initYT(); }
        return;
      }
      let src = it.src;
      if (it.kind === "archive" && !src) { status("Mengambil file audio…"); src = it.src = await archiveSrc(it.aid); if (tk !== this.tok) return; }
      this.use("audio"); this.audio.src = src; status("Memuat…");
      await this.audio.play();
    } catch (e) {
      if (tk !== this.tok) return;
      if (e && e.name === "NotAllowedError") { this.setPlaying(false); status("Tekan tombol putar untuk mulai.", 4000); return; }
      this.onError("Gagal memutar: " + (e && e.message ? e.message : "sumber tidak merespons"));
    }
  },
  playRadio(st) {
    this.list = []; this.i = -1; this.tok++;
    this.cur = { kind: "radio", uuid: st.uuid, title: st.name, artist: [st.city, st.genre].filter(Boolean).join(", ") || "Radio Indonesia", art: st.favicon, station: st };
    showNow(this.cur); markPlaying(); refreshHearts(); Lyrics.load(this.cur);
    this.use("audio"); this.audio.src = st.url; status("Menghubungkan ke " + st.name + "…");
    this.audio.play().catch(e => { if (e && e.name === "NotAllowedError") { this.setPlaying(false); status("Tekan tombol putar untuk mulai.", 4000); } });
  },
  onPlaying() { this.errRun = 0; this.setPlaying(true); status(""); },
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
    this.errRun++;
    if (this.list.length > 1 && this.errRun < 5) { status(msg + " Melewati ke lagu berikutnya…", 3000); setTimeout(() => this.next(true), 1600); }
    else status(msg, 6000);
  },
  nextIndex(dir, auto) {
    const n = this.list.length; if (!n) return -1;
    if (this.shuffle && n > 1 && dir > 0) { let j; do j = Math.floor(Math.random() * n); while (j === this.i); return j; }
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
    if (this.engine === "audio") return [this.audio.currentTime || 0, this.audio.duration];
    return [0, 0];
  },
  seek(t) {
    if (this.engine === "yt" && this.ytReady) this.yt.seekTo(t, true);
    else if (this.engine === "audio" && isFinite(this.audio.duration)) this.audio.currentTime = t;
  },
  resume() { if (this.engine === "yt" && this.ytReady) this.yt.playVideo(); else if (this.engine === "audio") this.audio.play().catch(() => { }); },
  pause() { if (this.engine === "yt" && this.ytReady) this.yt.pauseVideo(); else if (this.engine === "audio") this.audio.pause(); },
  toggle() {
    if (!this.cur) return toast("Pilih lagu atau stasiun radio dulu.");
    this.playing ? this.pause() : this.resume();
  },
  applyVol() {
    const v = this.muted ? 0 : this.vol;
    this.audio.volume = v / 100;
    if (this.ytReady) { this.yt.setVolume(this.vol); this.muted ? this.yt.mute() : this.yt.unMute(); }
    $("#volIco").setAttribute("href", v === 0 ? "#i-mute" : "#i-vol");
    $("#vol").value = this.vol;
  },
  stop() { this.tok++; this.pause(); this.use(null); this.cur = null; this.list = []; this.setPlaying(false); }
};
const A = Player.audio; A.preload = "none";
A.addEventListener("playing", () => Player.engine === "audio" && Player.onPlaying());
A.addEventListener("pause", () => Player.engine === "audio" && Player.setPlaying(false));
A.addEventListener("waiting", () => Player.engine === "audio" && status("Memuat…"));
A.addEventListener("ended", () => Player.engine === "audio" && Player.onEnded());
A.addEventListener("error", () => { if (Player.engine === "audio" && A.getAttribute("src")) Player.onError("Sumber audio tidak bisa diputar."); });
function stopAll() { Player.stop(); showNow(null); }

function showNow(it) {
  const t = it ? it.title : "Belum ada lagu", a = it ? (it.artist || SRC_LABEL[it.kind] || "") : "Pilih lagu atau stasiun radio";
  $("#nTitle").textContent = t; $("#nArtist").textContent = it ? [a, SRC_LABEL[it.kind]].filter(Boolean).join(", dari ") : a;
  $("#bTitle").textContent = t; $("#bArtist").textContent = it ? a : "Live Music";
  const art = it && it.art;
  const ba = $("#barArt"); ba.style.backgroundImage = art ? `url("${art}")` : ""; ba.classList.toggle("has-art", !!art);
  const cv = $("#cover"); cv.style.backgroundImage = art && it.kind !== "yt" ? `url("${art.replace("mqdefault", "hqdefault")}")` : ""; cv.classList.toggle("has-art", !!art);
  $("#liveTag").hidden = !(it && it.kind === "radio");
  $("#seek").disabled = !it || it.kind === "radio";
  document.title = it ? `${t} – ${a}` : "Live Music Player";
  if ("mediaSession" in navigator) {
    try { navigator.mediaSession.metadata = it ? new MediaMetadata({ title: t, artist: a, artwork: art ? [{ src: art, sizes: "320x180" }] : [] }) : null; } catch { }
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
  store.set("shuffle", Player.shuffle); store.set("repeat", Player.repeat);
}
$("#shuffleBtn").onclick = () => { Player.shuffle = !Player.shuffle; updateModes(); };
$("#repeatBtn").onclick = () => { Player.repeat = { off: "all", all: "one", one: "off" }[Player.repeat]; updateModes(); };
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
function updatePip() { $("#ytWrap").classList.toggle("pip", isMobile() && !sheetOpen && Player.engine === "yt"); }
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
  set("play", () => Player.resume()); set("pause", () => Player.pause());
  set("previoustrack", () => Player.prev()); set("nexttrack", () => Player.next());
  set("seekto", d => Player.seek(d.seekTime));
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
    if (it.kind === "local") { const m = title.match(/^(.+?)\s+[-–]\s+(.+)$/); if (m) { artist = m[1]; title = m[2]; } else artist = ""; }
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
   MULAI
===================================================================== */
Player.applyVol();
Player.initYT();
initAuth();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
