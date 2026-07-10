const test = require('node:test');
const assert = require('node:assert/strict');

test('Canvas 3 can create and encode an image', () => {
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(16, 16);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff00ff';
    context.fillRect(0, 0, 16, 16);
    const png = canvas.toBuffer('image/png');
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
});

test('all command modules load with the current Discord.js release', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..', 'commands');
    const files = [];

    function walk(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const target = path.join(directory, entry.name);
            if (entry.isDirectory()) walk(target);
            else if (entry.name.endsWith('.js')) files.push(target);
        }
    }

    walk(root);
    assert.ok(files.length > 0);
    for (const file of files) {
        const command = require(file);
        assert.ok(command.data, `${file} should export command data`);
        assert.equal(typeof command.execute, 'function', `${file} should export execute()`);
    }
});
