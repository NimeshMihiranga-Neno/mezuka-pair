// ==========================================
// CENTRALIZED IMAGE MAP FOR MEZUKA MD V4 BOT
// ==========================================

const IMAGES = { 
    // === Node.js Backend & WhatsApp Commands ===
    DEFAULT_LOGO: 'https://files.catbox.moe/utbo8h.jpg',
    PAIR_IMG_ALTERNATIVE: 'https://files.catbox.moe/lt36jy.jpg',
    N8AN5Z: 'https://files.catbox.moe/e64mbj.jpg',
    IXYRRZ: 'https://files.catbox.moe/coik8f.jpg',
    AEEO1I: 'https://files.catbox.moe/aeeo1i.jpg',
    FB_CMD: 'https://files.catbox.moe/eeonsq.jpg',
    ADMIN_CMD: 'https://files.catbox.moe/45bks3.jpg',
    OWNER_CMD: 'https://files.catbox.moe/6jcxqd.jpg', 
    SCRAPPER_THUMB: 'https://files.catbox.moe/e64mbj.jpg',
    IBB_LOGO: 'https://files.catbox.moe/coik8f.jpg',
    
    // === HTML Frontend Web UI ===
    WEB_LOGO: 'https://files.catbox.moe/qhrzt2.jpg',
    WEB_BG: 'https://files.catbox.moe/hlg0kl.jpg',
    TEAM_NIMESHKA: 'https://files.catbox.moe/sfe9ad.jpg',
    TEAM_MANISH: 'https://files.catbox.moe/fw4btt.jpg',
    TEAM_THENUJA: 'https://files.catbox.moe/my5uuf.jpg',
    TEAM_VINUSHA: 'https://files.catbox.moe/nz2421.jpg',
    TEAM_NETHUSHA: 'https://files.catbox.moe/hdhwxf.jpg',
    TEAM_HARSHI: 'https://files.catbox.moe/pfw1kf.jpg'
};

// Export as CommonJS module for the Node.js backend
if (typeof module !== 'undefined' && module.exports) { 
    module.exports = IMAGES;
}

// Map globally for the static Mezuka Web UI if loaded via <script>
if (typeof window !== 'undefined') {
    window.IMAGES = IMAGES;
}
