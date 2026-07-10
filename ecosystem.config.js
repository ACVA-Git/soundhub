const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const localNode24 = path.join(
    os.homedir(),
    '.local',
    'node24',
    'node_modules',
    'node',
    'bin',
    'node',
);

module.exports = {
    apps: [{
        name: 'soundhub-bot',
        script: 'index.js',
        cwd: __dirname,
        interpreter: process.env.SOUNDHUB_NODE || (fs.existsSync(localNode24) ? localNode24 : 'node'),
        instances: 1,
        exec_mode: 'fork',
        autorestart: true,
        max_memory_restart: '512M',
        time: true,
    }],
};
