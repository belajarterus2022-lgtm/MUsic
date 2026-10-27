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
- **Akurasi pencarian.** Sebuah hasil hanya ditampilkan bila semua kata penting dari kata kunci (nama artis, band, grup, atau judul) ada di artis, judul, atau album lagu itu. Kata umum seperti "lagu", "official", "terbaru", genre, dan tahun tidak wajib cocok. Kata asal/genre seperti "kpop", "korea", "barat" juga tidak wajib cocok, jadi "exo kpop" mencari EXO. Bila kata kunci jelas nama artis/band/grup, hanya lagu milik artis itu yang ditampilkan (video lain yang sekadar menyebut namanya dibuang). Huruf Korea/Jepang/Mandarin ikut dicocokkan. Cover, karaoke, remix, fancam, dance practice, wawancara, dan sejenisnya dibuang kecuali kata itu ikut dicari. Salah ketik satu huruf pada kata panjang (mis. "amizha") dan nama tanpa spasi atau tanda baca (mis. "dmasiv", "sheilaon7") tetap dikenali. Bila hasil yang cocok sedikit, aplikasi otomatis mengambil hingga dua halaman tambahan.
- **YouTube** diputar lewat player resmi YouTube, jadi videonya tampil di panel "Sedang diputar". Sebagian video resmi label melarang diputar di luar YouTube; aplikasi akan memberi tahu lalu melewati ke lagu berikutnya. Dengan mode "Tanpa iklan" (bawaan), lagu YouTube tetap jalan saat layar terkunci, sama seperti Audius, Internet Archive, dan radio.
- **Radio** diambil langsung dari direktori Radio Browser setiap kali dibuka, hanya stasiun yang lolos pengecekan aktif dan memakai HTTPS (stream HTTP diblokir browser di situs HTTPS). Stasiun yang ternyata tidak merespons ditandai redup.
- **Lirik** dari LRCLIB. Jika tersedia versi tersinkron, baris yang sedang dinyanyikan disorot dan bisa diketuk untuk loncat ke bagian itu. Tidak semua lagu Indonesia punya lirik di LRCLIB; ada tautan "Cari lirik di Google".
- **Favorit lama** di browser (versi sebelumnya) bisa dipindahkan ke akun lewat tombol yang muncul di halaman Favorit. Lagu lama dari iTunes otomatis dicarikan versi lengkapnya di YouTube saat diputar.
- Proyek Supabase gratis akan dijeda bila tidak dipakai 7 hari; cukup buka dashboard Supabase dan tekan **Restore**.
- Kunci `anon` Supabase memang aman di situs publik; data tiap akun dilindungi Row Level Security. Jangan pernah menaruh kunci `service_role` di `config.js`.

## Iklan & memutar saat layar terkunci
- **Mode "Tanpa iklan" (bawaan aktif, tombol perisai di panel "Sedang diputar").** Lagu YouTube diputar sebagai *audio saja* lewat pemutar audio aplikasi: **tidak ada iklan sama sekali** dan lagu **tetap jalan saat layar HP terkunci** (bisa dijeda/dilewati dari layar kunci).
- **Cepat.** Aliran audio diambil dari server Piped/Invidious. Semua server dihubungi *bersamaan* dan yang tercepat langsung dipakai; server tercepat diingat. Daftar server yang sedang sehat diambil otomatis dari direktori resmi Piped & Invidious (diperbarui tiap 12 jam). Lagu berikutnya disiapkan saat lagu sekarang masih diputar, sehingga perpindahan lagu instan, termasuk saat layar terkunci.
- **Tidak pernah ada iklan.** Selama mode ini aktif, pemutar video YouTube (yang menayangkan iklan) tidak dimuat sama sekali. Bila sebuah lagu sedang tidak bisa diputar tanpa iklan (maks. 12 detik menunggu), lagu itu dilewati. Matikan tombol "Tanpa iklan" bila ingin memutarnya lewat pemutar YouTube (ada iklan, dan di HP berhenti saat layar terkunci).
- **Server putus di tengah lagu** → server lain dicoba otomatis dan lagu dilanjutkan dari posisi terakhir.
- **Yang perlu diketahui.** Cara ini tidak sesuai ketentuan layanan YouTube, dan server publik Piped/Invidious kadang penuh, mati, atau diblokir YouTube; saat itu terjadi, lagu YouTube dilewati. Untuk hasil paling stabil, isi `PIPED_INSTANCES` / `INVIDIOUS_INSTANCES` di `config.js` dengan server yang stabil atau milik sendiri. Cara resmi menonton YouTube tanpa iklan adalah YouTube Premium.
- **Sumber lain di latar belakang.** Audius, Internet Archive, radio, dan file lokal juga diputar oleh pemutar audio aplikasi, jadi tetap jalan saat layar terkunci. SoundCloud diputar lewat widget resmi SoundCloud; apakah widget itu tetap berbunyi saat layar terkunci ditentukan oleh SoundCloud dan browser HP.
- **Pemblokir skrip iklan.** `index.html` memasang *Content-Security-Policy*: hanya skrip dari aplikasi ini, Supabase (jsDelivr), YouTube, dan SoundCloud, serta pemutar (iframe) YouTube dan SoundCloud yang boleh dimuat. Skrip iklan, banner, atau pop-up dari domain lain ditolak browser dan dicatat di konsol dengan awalan `[Pemblokir]`. Iklan dalam siaran radio adalah bagian dari siaran itu sendiri.

## Efek suara (bass, speaker, surround)
Tombol **Efek suara** ada di bagian paling atas. Suara benar-benar diolah oleh pengolah audio browser (Web Audio) sebelum keluar ke speaker, bukan sekadar tampilan; grafik spektrum di panel bergerak mengikuti suara yang sudah diolah.
- **Preset:** Normal, Bass Boost, Bass Film, Bass Dalam, Konser, Vokal Jernih, Treble, Pop, Rock, Dangdut, Jazz, Santai.
- **Speaker:** Datar, Speaker HP (membuang dengung di bawah 100 Hz yang tidak bisa diputar speaker HP sehingga suara lebih keras dan jernih), Earphone, Speaker luar (Bluetooth/aktif).
- **Atur sendiri:** Bass dalam (60 Hz), Bass, Vokal, Treble, Surround (lebar stereo), Gema, Penguat. Pembatas otomatis mencegah suara pecah saat bass/penguat dinaikkan. Pengaturan tersimpan di perangkat.
- **Berlaku untuk:** lagu YouTube (mode Tanpa iklan), Audius, Internet Archive, file lokal, dan radio yang mengizinkan. Tidak bisa untuk pemutar resmi YouTube/SoundCloud (berjalan di dalam iframe milik mereka). Sumber yang tidak mengizinkan suaranya diolah (sebagian radio) tetap diputar normal tanpa efek; panel memberi tahu.
- **Latar belakang:** pilihan Normal + Datar memakai jalur biasa tanpa pengolahan. Bila sistem HP menghentikan pengolah suara saat layar terkunci (terutama iPhone), lagu otomatis dipindah ke jalur biasa agar tetap berbunyi, dan efek aktif kembali saat layar dibuka.

## Riwayat pencarian
Setiap pencarian yang memberi hasil disimpan di `localStorage` browser (terpisah per akun, hanya di perangkat itu), lengkap dengan sampul, judul, penyanyi, durasi, sumber, dan waktu terakhir dicari. Ketuk kartu untuk mencari lagi dengan kata kunci dan sumber yang sama, atau tombol putar untuk memutar lagu yang tercatat. Bila lagu itu ternyata sudah tidak bisa diputar, kartunya ditandai dan tombol putar disembunyikan. Buka lewat **Riwayat** di menu bawah (HP) atau menu samping (desktop); riwayat juga tampil saat kolom cari kosong.

## Pintasan keyboard
Spasi: putar/jeda. Shift + →/←: lagu berikutnya/sebelumnya.
