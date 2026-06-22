const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'designs', 'bglogo.png');
const dest = path.join(__dirname, 'public', 'bglogo.png');

try {
  fs.copyFileSync(src, dest);
  console.log('Successfully copied bglogo.png to public/');
} catch (err) {
  console.error('Error copying file:', err);
}
