/*
  KONFIGURASI APLIKASI — isi lalu commit ke repo Anda.

  1) SUPABASE_URL & SUPABASE_ANON_KEY  (WAJIB, untuk daftar/login & favorit)
     Supabase Dashboard → Project Settings → API
     - "Project URL"        → SUPABASE_URL
     - "anon public" key    → SUPABASE_ANON_KEY
     Kunci "anon" memang aman ditaruh di website publik; data tiap akun
     dilindungi oleh aturan Row Level Security di supabase-setup.sql.
     JANGAN pernah menaruh "service_role" key di sini.

  2) YOUTUBE_API_KEY  (OPSIONAL, tapi sangat disarankan)
     Membuat pencarian YouTube lebih cepat dan stabil.
     Google Cloud Console → APIs & Services → aktifkan "YouTube Data API v3"
     → Credentials → Create API key → batasi ke "HTTP referrers" dengan
     alamat situs Anda, mis. https://namaanda.github.io/*
     Tanpa key, aplikasi tetap mencari YouTube lewat server publik
     Piped/Invidious (gratis tapi kadang lambat atau sedang mati).
*/
window.APP_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  YOUTUBE_API_KEY: ""
};
