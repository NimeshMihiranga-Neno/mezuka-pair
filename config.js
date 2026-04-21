const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}

module.exports = {
    NENO_DATA:   process.env.NENO_DATA   || '',
    BOT_NAME:    process.env.BOT_NAME    || 'Mezuka MD V4',
    OWNER_NAME:  process.env.OWNER_NAME  || 'Nimeshka Mihiran',
    OWNER_FROM:  process.env.OWNER_FROM  || 'Sri Lanka',
    OWNER_AGE:   process.env.OWNER_AGE   || '+99',
    PRIFIX:      process.env.PRIFIX      || '.',
    NENO_LAN:    process.env.NENO_LAN    || 'EN',
    ALIVE_MSG:   process.env.ALIVE_MSG   || '© Powered By Mezuka MD V4 | Black Cat Ofc',
};
