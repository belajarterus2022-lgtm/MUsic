# Live Music Player

Pemutar musik & radio Indonesia dengan akun. Siapa pun bisa daftar lalu memakai aplikasi ini; favorit tersimpan di akun masing-masing, jadi tetap ada di browser atau HP mana pun.

## Isi
| File | Fungsi |
|---|---|
| `index.html` | Halaman aplikasi |
| `styles.css` | Tampilan |
| `app.js` | Login, favorit, pencarian, pemutar, radio, lirik |
| `config.js` | **Isi kunci Supabase (dan YouTube / SoundCloud, opsional) di sini** |
| `supabase-setup.sql` | Struktur database, dijalankan sekali di Supabase |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Agar bisa dipasang seperti aplikasi di HP |

## Pemasangan (sekitar 10 menit)

### 1. Database & login (Supabase, gratis)
1. Daftar di https://supabase.com → **New project**.
2. Buka **SQL Editor → New query**, tempel seluruh isi `supabase-setup.sql`, tekan **Run**.
3. Buka **Project Settings → API**. Salin **Project URL** dan kunci **anon public** ke `config.js`.
4. Buka **Authentication → URL Configuration**:
   - **Site URL**: alamat GitHub Pages Anda, mis. `https://namaanda.github.io/MUsic/`
   - **Redirect URLs**: tambahkan alamat yang sama.
5. (Opsional) Agar orang bisa langsung masuk tanpa membuka email konfirmasi:
   **Authentication → Sign In / Providers → Email → matikan "Confirm email"**.
   Catatan: email bawaan Supabase dibatasi beberapa email per jam. Jika banyak orang mendaftar, matikan konfirmasi email atau pasang SMTP sendiri.

### 2. YouTube API key (opsional, disarankan)
Tanpa key, pencarian YouTube memakai server publik Piped/Invidious yang gratis tapi kadang lambat atau mati.
1. https://console.cloud.google.com → buat proyek → **APIs & Services → Library** → aktifkan **YouTube Data API v3**.
2. **Credentials → Create credentials → API key**.
3. Klik key itu → **Application restrictions: HTTP referrers** → tambahkan `https://namaanda.github.io/*`.
   **API restrictions** → pilih YouTube Data API v3.
4. Tempel ke `YOUTUBE_API_KEY` di `config.js`.
Kuota gratis: 10.000 unit/hari; satu pencarian ≈ 101 unit, jadi sekitar 99 pencarian per hari untuk semua pengguna. Bila kuota habis, aplikasi otomatis beralih ke Piped/Invidious.

### 3. SoundCloud (opsional)
- **Memutar**: tidak perlu kunci. Buka soundcloud.com, salin link lagu atau playlist, tempel di kolom **Cari lagu**, tekan Cari, lalu ketuk lagunya. Diputar lewat widget resmi SoundCloud (tampil di panel "Sedang diputar", seperti YouTube).
- **Mencari dengan mengetik judul**: perlu `SOUNDCLOUD_CLIENT_ID` di `config.js`. SoundCloud sudah lama membatasi pendaftaran API key baru, jadi bila Anda tidak punya, pakai cara tempel link. Tanpa Client ID, aplikasi menampilkan tautan "Cari ... di SoundCloud" yang membuka pencarian resmi mereka.
- Lagu SoundCloud Go+ yang hanya bisa diputar 30 detik disaring dari hasil pencarian. Lagu yang pemiliknya melarang diputar di luar SoundCloud akan dilewati. Seperti YouTube, di HP pemutar SoundCloud bisa berhenti saat layar dikunci.

### 4. Unggah ke repo
Ganti semua file lama di repo dengan file di folder ini, commit, lalu buka alamat GitHub Pages Anda. Halaman pertama adalah **Masuk / Daftar**.

## Yang perlu diketahui
- **Lagu penuh saja.** Preview iTunes 30 detik sudah dihapus. Semua hasil di bawah 1 menit (preview, Shorts) disaring. iTunes hanya dipakai untuk saran nama saat mengetik.
- **SoundCloud** ditambahkan sebagai sumber ke-4 (lihat bagian 3).
- **Akurasi pencarian.** Sebuah hasil hanya ditampilkan bila semua kata penting dari kata kunci (nama artis, band, grup, atau judul) ada di artis, judul, atau album lagu itu. Kata umum seperti "lagu", "official", "terbaru", genre, dan tahun tidak wajib cocok. Cover, karaoke, remix, wawancara, dan sejenisnya dibuang kecuali kata itu ikut dicari. Salah ketik satu huruf pada kata panjang (mis. "amizha") dan nama tanpa spasi atau tanda baca (mis. "dmasiv", "sheilaon7") tetap dikenali. Bila hasil yang cocok sedikit, aplikasi otomatis mengambil hingga dua halaman tambahan.
- **YouTube** diputar lewat player resmi YouTube, jadi videonya tampil di panel "Sedang diputar". Sebagian video resmi label melarang diputar di luar YouTube; aplikasi akan memberi tahu lalu melewati ke lagu berikutnya. Di HP, YouTube biasanya berhenti saat layar dikunci (aturan YouTube). Lagu dari Audius, Internet Archive, dan radio tetap jalan saat layar terkunci.
- **Radio** diambil langsung dari direktori Radio Browser setiap kali dibuka, hanya stasiun yang lolos pengecekan aktif dan memakai HTTPS (stream HTTP diblokir browser di situs HTTPS). Stasiun yang ternyata tidak merespons ditandai redup.
- **Lirik** dari LRCLIB. Jika tersedia versi tersinkron, baris yang sedang dinyanyikan disorot dan bisa diketuk untuk loncat ke bagian itu. Tidak semua lagu Indonesia punya lirik di LRCLIB; ada tautan "Cari lirik di Google".
- **Favorit lama** di browser (versi sebelumnya) bisa dipindahkan ke akun lewat tombol yang muncul di halaman Favorit. Lagu lama dari iTunes otomatis dicarikan versi lengkapnya di YouTube saat diputar.
- Proyek Supabase gratis akan dijeda bila tidak dipakai 7 hari; cukup buka dashboard Supabase dan tekan **Restore**.
- Kunci `anon` Supabase memang aman di situs publik; data tiap akun dilindungi Row Level Security. Jangan pernah menaruh kunci `service_role` di `config.js`.

## Iklan
Aplikasi ini sendiri tidak menampilkan iklan apa pun. Pemblokirannya bekerja seperti ini:
- **Yang diblokir aplikasi.** `index.html` memasang *Content-Security-Policy*: browser hanya mengizinkan skrip dari aplikasi ini, Supabase (jsDelivr), YouTube, dan SoundCloud, serta hanya mengizinkan pemutar (iframe) YouTube dan SoundCloud. Skrip iklan, banner, pop-up, atau pemutar dari domain lain yang mencoba masuk ke halaman ini ditolak browser. Setiap pemblokiran dicatat di konsol browser dengan awalan `[Pemblokir]`.
- **Yang tidak bisa diblokir secara sah.** Iklan di dalam pemutar resmi YouTube (dan SoundCloud bila ada) ditayangkan oleh layanan itu sendiri di dalam iframe mereka. Menghapusnya berarti memodifikasi pemutar resmi dan melanggar ketentuan layanan, jadi aplikasi tidak melakukannya. Iklan yang disiarkan stasiun radio adalah bagian dari siaran itu sendiri.
- **Alternatif tanpa iklan.** Pilih sumber **Tanpa iklan** di bawah kolom cari: hanya mencari di Audius dan Internet Archive, yang audionya diputar langsung oleh aplikasi tanpa iklan. File lokal juga selalu tanpa iklan. Untuk YouTube tanpa iklan, cara resminya adalah berlangganan YouTube Premium dan masuk ke akun YouTube di browser yang sama.

## Riwayat pencarian
Setiap pencarian yang memberi hasil disimpan di `localStorage` browser (terpisah per akun, hanya di perangkat itu), lengkap dengan sampul, judul, penyanyi, durasi, sumber, dan waktu terakhir dicari. Ketuk kartu untuk mencari lagi dengan kata kunci dan sumber yang sama, atau tombol putar untuk memutar lagu yang tercatat. Bila lagu itu ternyata sudah tidak bisa diputar, kartunya ditandai dan tombol putar disembunyikan. Riwayat tampil saat kolom cari kosong atau lewat ikon jam di samping tombol Cari.

## Pintasan keyboard
Spasi: putar/jeda. Shift + →/←: lagu berikutnya/sebelumnya.
