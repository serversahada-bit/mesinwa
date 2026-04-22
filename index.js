/**
 * ============================================================
 * BOT WHATSAPP - dr. Rianti Maharani, M.Si
 * Konsultasi Herbal Medik via WhatsApp
 * Powered by whatsapp-web.js + Groq AI (via Flask Python)
 * ============================================================
 *
 * CARA PAKAI:
 * 1. Pastikan Python Flask (app.py) sudah berjalan di port 5000
 * 2. Jalankan: node index.js
 * 3. Scan QR Code yang muncul di terminal menggunakan WhatsApp HP Anda
 * 4. Bot siap menerima pesan!
 *
 * CATATAN:
 * - Sesi login tersimpan di folder .wwebjs_auth, jadi tidak perlu scan QR tiap saat.
 * - Untuk reset sesi, hapus folder .wwebjs_auth lalu restart.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

// ============================================================
// KONFIGURASI
// ============================================================
const FLASK_BASE_URL = process.env.FLASK_BASE_URL || 'https://y2.ptslu.id';
const FLASK_API_URL = `${FLASK_BASE_URL}/api/wa-webhook`;
const FLASK_STATUS_URL = `${FLASK_BASE_URL}/api/bot-status`;


// Helper utk sync status ke Flask
async function syncStatus(status, qrStr = '') {
    try {
        await axios.post(FLASK_STATUS_URL, { status: status, qr: qrStr });
    } catch (err) {
        // Abaikan error kalau Flask belum nyala
    }
}

// Set ke `true` agar bot HANYA merespon pesan pribadi (bukan grup)
// Set ke `false` agar bot merespon pesan dari grup juga
const PRIVATE_CHAT_ONLY = false;

// Nama bot untuk logging di terminal
const BOT_NAME = 'dr. Rianti Herbal Bot';

// ============================================================
// INISIALISASI CLIENT WHATSAPP
// ============================================================
const client = new Client({
    authStrategy: new LocalAuth({
        // Folder penyimpan sesi agar tidak perlu scan QR berulang kali
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// ============================================================
// EVENT: QR CODE MUNCUL (Scan dengan HP)
// ============================================================
client.on('qr', (qr) => {
    syncStatus('qr', qr);

    console.log('\n========================================');
    console.log(`  ${BOT_NAME}`);
    console.log('========================================');
    console.log('  Scan QR Code di bawah ini dengan');
    console.log('  WhatsApp di HP Anda:');
    console.log('  (WhatsApp > Setelan > Perangkat Tertaut > Tautkan Perangkat)');
    console.log('----------------------------------------\n');
    qrcode.generate(qr, { small: true });
    console.log('\n----------------------------------------');
    console.log('  Menunggu QR Code di-scan...');
});

// ============================================================
// EVENT: SIAP / BERHASIL LOGIN
// ============================================================
client.on('ready', () => {
    syncStatus('ready');
    console.log('\n✅ Bot WhatsApp berhasil terhubung!');
    console.log(`✅ ${BOT_NAME} siap menerima pesan.`);
    console.log(`✅ Mode: ${PRIVATE_CHAT_ONLY ? 'Hanya Chat Pribadi' : 'Pribadi + Grup'}`);
    console.log('✅ Flask API URL:', FLASK_API_URL);
    console.log('------------------------------------------\n');
});

// ============================================================
// EVENT: AUTENTIKASI BERHASIL
// ============================================================
client.on('authenticated', () => {
    syncStatus('authenticated');
    console.log('🔑 Autentikasi berhasil! Memuat bot...');
});

// ============================================================
// EVENT: AUTENTIKASI GAGAL
// ============================================================
client.on('auth_failure', (msg) => {
    syncStatus('offline');
    console.error('❌ Autentikasi GAGAL:', msg);
    console.error('   Hapus folder .wwebjs_auth lalu jalankan ulang script ini.');
});

// ============================================================
// EVENT: KONEKSI TERPUTUS
// ============================================================
client.on('disconnected', (reason) => {
    syncStatus('offline');
    console.warn('⚠️  Bot terputus dari WhatsApp. Alasan:', reason);
    console.warn('   Restart script untuk menghubungkan kembali.');
});

// ============================================================
// EVENT: PESAN MASUK (LOGIKA UTAMA)
// ============================================================
const processedMessages = new Set();

client.on('message', async (msg) => {
    // Mencegah duplikasi event pesan yang kadang terjadi di WA Web
    if (processedMessages.has(msg.id._serialized)) return;
    processedMessages.add(msg.id._serialized);
    
    // Batasi ukuran Set agar tidak memakan banyak memory
    if (processedMessages.size > 1000) processedMessages.clear();

    // Abaikan pesan dari bot itu sendiri (mencegah loop)
    if (msg.fromMe) return;

    // Filter: abaikan pesan grup jika PRIVATE_CHAT_ONLY = true
    if (PRIVATE_CHAT_ONLY && msg.from.endsWith('@g.us')) return;

    // Abaikan pesan yang bukan teks (gambar, video, stiker, dll.)
    if (msg.type !== 'chat') {
        if (!msg.from.endsWith('@g.us')) {
            // Hanya beritahu di chat pribadi
            await msg.reply(
                '🌿 Mohon maaf, saat ini dr. Rianti hanya dapat membalas pesan berupa *teks*. ' +
                'Silakan ketik pertanyaan Anda ya, Bapak/Ibu. 😊'
            );
        }
        return;
    }

    const senderNumber = msg.from; // Contoh: "628123456789@c.us"
    const messageText = msg.body.trim();

    if (!messageText) return;

    console.log(`\n📩 [PESAN MASUK]`);
    console.log(`   Dari   : ${senderNumber}`);
    console.log(`   Pesan  : ${messageText}`);

    const chat = await msg.getChat();
    
    // 1. Ubah status menjadi "Dibaca" (Centang Biru) seolah-olah manusia membuka chat
    await chat.sendSeen();

    // 2. Jeda waktu sejenak (1.5 hingga 3 detik) seolah-olah sedang membaca pesan konsumen
    const readDelay = Math.floor(Math.random() * 1500) + 1500;
    await new Promise(resolve => setTimeout(resolve, readDelay));

    // 3. Setelah selesai membaca, munculkan indikator "sedang mengetik..."
    await chat.sendStateTyping();

    try {
        // Kirim pesan ke Flask Python untuk diproses AI
        const response = await axios.post(
            FLASK_API_URL,
            {
                sender: senderNumber,
                message: messageText
            },
            {
                timeout: 60000, // Timeout 60 detik (AI bisa butuh waktu)
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        const replyText = response.data.reply;

        if (replyText) {
            console.log(`   Balasan: ${replyText.substring(0, 100)}...`);

            // Memastikan WhatsApp web terus menunjukkan status "sedang mengetik..."
            await chat.sendStateTyping();

            // Simulasi jeda ngetik manusia berdasar pada kepanjangan karakter balasan.
            // Asumsikan kira-kira baca 70 karakter per detiknya.
            const calculatedDelay = (replyText.length / 70) * 1000;
            // Kita batasi paling sedikit 2 detik (2000 ms), dan paling lama 12 detik (12000 ms) agar user tidak jenuh menunggu
            const typingDelay = Math.min(Math.max(calculatedDelay, 2000), 12000);
            
            await new Promise(resolve => setTimeout(resolve, typingDelay));

            // Kirim balasan ke WhatsApp
            await msg.reply(replyText);
        } else {
            throw new Error('Tidak ada balasan dari AI.');
        }

    } catch (error) {
        // Hentikan indikator mengetik
        await chat.clearState();

        let errorMessage = '🌿 Mohon maaf, terjadi kendala teknis saat memproses pertanyaan Anda. Silakan coba lagi sebentar ya, Bapak/Ibu.';

        if (error.code === 'ECONNREFUSED') {
            console.error('❌ [ERROR] Tidak dapat terhubung ke Flask Python!');
            console.error('   Pastikan app.py sudah berjalan di port 5000.');
            errorMessage = '🌿 Mohon maaf, server dokter sedang tidak aktif. Silakan hubungi admin ya.';
        } else if (error.code === 'ECONNABORTED') {
            console.error('❌ [ERROR] Timeout - AI terlalu lama merespons.');
            errorMessage = '🌿 Mohon maaf, server dokter sedang sibuk. Silakan coba lagi dalam beberapa saat ya, Bapak/Ibu.';
        } else {
            console.error('❌ [ERROR] Gagal memproses pesan:', error.message);
        }

        await msg.reply(errorMessage);
    }
});

// ============================================================
// INISIALISASI & MULAI
// ============================================================
console.log('🌿 Memulai', BOT_NAME, '...');
console.log('   Mohon tunggu, menghubungkan ke WhatsApp Web...\n');
syncStatus('offline');
client.initialize();
