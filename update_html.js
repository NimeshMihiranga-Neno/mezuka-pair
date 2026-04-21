const fs = require('fs');
const path = require('path');

const mezukaDir = path.join(__dirname, 'mezuka');
const files = fs.readdirSync(mezukaDir).filter(f => f.endsWith('.html'));

const scriptInjection = `
<!-- Dynamically Load Centralized Images -->
<script src="/image.js"></script>
<script>
document.addEventListener('DOMContentLoaded', () => {
    if (window.IMAGES) {
        document.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src');
            if (!src) return;
            if (src.includes('qhrzt2.jpg')) img.src = window.IMAGES.WEB_LOGO;
            if (src.includes('aeeo1i.jpg')) img.src = window.IMAGES.AEEO1I;
            if (src.includes('eeonsq.jpg')) img.src = window.IMAGES.FB_CMD;
            if (src.includes('0cKxxZp/logo.jpg')) img.src = window.IMAGES.IBB_LOGO;
            if (src.includes('IMG-20260302-WA0025.jpg')) img.src = window.IMAGES.DEFAULT_LOGO;
            if (src.includes('45bks3.jpg')) img.src = window.IMAGES.ADMIN_CMD;
        });
    }
});
</script>
</body>`;

for (const file of files) {
    const filePath = path.join(mezukaDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove old injection if exists to avoid duplicates
    if (content.includes('<!-- Dynamically Load Centralized Images -->')) {
        content = content.replace(/<!-- Dynamically Load Centralized Images -->[\s\S]*?<\/script>\n<\/body>/g, '</body>');
    }

    // Also replace hardcoded inline JS DEFAULTS in settings.html
    if (file === 'settings.html' && content.includes('OWNER_IMG:"https://files.catbox.moe/aeeo1i.jpg"')) {
        content = content.replace(
            /(OWNER_IMG:)"[^"]+"/,
            '$1(window.IMAGES ? window.IMAGES.AEEO1I : "https://files.catbox.moe/aeeo1i.jpg")'
        );
        content = content.replace(
            /(MENU_LOGO:)"[^"]+"/,
            '$1(window.IMAGES ? window.IMAGES.DEFAULT_LOGO : "https://raw.githubusercontent.com/NimeshMihiranga/MEZUKA-MD-MINI-HELLPER-REPO/main/IMG-20260302-WA0025.jpg")'
        );
        content = content.replace(
            /(ALIVE_LOGO:)"[^"]+"/,
            '$1(window.IMAGES ? window.IMAGES.DEFAULT_LOGO : "https://raw.githubusercontent.com/NimeshMihiranga/MEZUKA-MD-MINI-HELLPER-REPO/main/IMG-20260302-WA0025.jpg")'
        );
    }

    if (content.includes('</body>')) {
        content = content.replace('</body>', scriptInjection);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${file}`);
    }
}
console.log('All HTML files updated.');
