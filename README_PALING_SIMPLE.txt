VIZEX V38 — PALING SIMPLE (GITHUB + VERCEL, TANPA DATABASE)
================================================================

INI COCOK KALAU:
- customer masih sedikit
- lo nggak mau Supabase
- lo mau simpel
- lo masih mau bisa block akun

CARA KERJANYA:
Customer login pakai EMAIL + KODE AKSES.
Daftar customer disimpan di Vercel Environment Variable, bukan database.

--------------------------------------------------
1. UPLOAD KE GITHUB
--------------------------------------------------
Buat repo PRIVATE.
Upload semua isi folder V38 ini.

--------------------------------------------------
2. CONNECT KE VERCEL
--------------------------------------------------
Import repo GitHub ke Vercel.

Di Vercel > Project > Settings > Environment Variables,
buat 2 variable:

A. SESSION_SECRET
Isi dengan teks panjang random, contoh:
vizex-rahasia-2026-ini-jangan-dikasih-orang-9384729

B. CUSTOMERS_JSON
Isi seperti ini (SATU BARIS):

[
  {"name":"Budi","email":"budi@gmail.com","code":"BUDI123","plan":"PRO","status":"active"},
  {"name":"Andi","email":"andi@gmail.com","code":"ANDI456","plan":"PRO","status":"active"}
]

Lalu DEPLOY / REDEPLOY.

--------------------------------------------------
3. KASIH KE CUSTOMER
--------------------------------------------------
Website:
https://domain-lo.vercel.app

Email:
budi@gmail.com

Kode:
BUDI123

--------------------------------------------------
4. TAMBAH CUSTOMER BARU
--------------------------------------------------
Vercel > Settings > Environment Variables > CUSTOMERS_JSON

Tambahkan satu baris customer baru di dalam array:

{"name":"Rina","email":"rina@gmail.com","code":"RINA789","plan":"PRO","status":"active"}

Lalu Redeploy.

--------------------------------------------------
5. BLOCK CUSTOMER
--------------------------------------------------
Cari customer itu di CUSTOMERS_JSON.

Ubah:
"status":"active"

menjadi:
"status":"blocked"

Lalu Redeploy.

Customer itu nggak bisa login lagi.

--------------------------------------------------
PENTING
--------------------------------------------------
Ini memang sengaja dibuat SIMPLE.
Tidak ada database.
Tidak ada Supabase.
Tidak ada admin dashboard.

Kekurangannya:
setiap tambah/block customer, lo edit CUSTOMERS_JSON di Vercel lalu Redeploy.

Kalau customer sudah banyak, baru pindah ke database.
Untuk awal jualan, ini jauh lebih gampang.


V39 — LOGIN PAGE PROFESIONAL
----------------------------
Tambahan:
- Status Sistem Online
- Tombol Beli Akses
- Tombol Hubungi Admin
- Catatan lisensi
- Versi Vizex Studio

WAJIB:
Nomor WhatsApp sudah diset ke 6289602897243.
Format: 62xxxxxxxxxxx tanpa tanda + dan tanpa spasi.


V40 — WORKSPACE
---------------
Sidebar baru:
- Proyek Saya: simpan proyek di browser customer
- Riwayat: otomatis mencatat paket animasi yang pernah dibuat
- Pengaturan: default jumlah scene, durasi, dan gaya visual

Data Proyek/Riwayat/Pengaturan memakai localStorage browser.
Tidak membutuhkan database dan tidak mengubah CUSTOMERS_JSON.


V41 — CREAM THEME
-----------------
Seluruh tampilan login dan tools diubah ke tema cream hangat:
- background cream
- card ivory
- accent caramel
- teks coklat gelap


V42 — LOGO BRAND
----------------
Logo Vizex sudah dipasang permanen di:
- Login page
- Sidebar tools
- Header tools

File logo disimpan di:
assets/vizex-logo.png


V43 — FULL CREAM
----------------
Warna halaman tools sekarang dipaksa sama dengan login:
- background cream
- sidebar cream
- card ivory
- accent caramel
- text coklat gelap
