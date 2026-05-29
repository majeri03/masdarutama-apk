const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'screens');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

let totalReplaced = 0;

files.forEach(file => {
  const p = path.join(dir, file);
  let content = fs.readFileSync(p, 'utf8');
  let original = content;

  // This regex matches: Alert.alert(<quote>Title<quote>, <message>)
  // Note: we don't match if it contains a 3rd argument (buttons array), so we make sure the message part doesn't contain unclosed brackets.
  content = content.replace(/Alert\.alert\(\s*(['"`])(.*?)\1\s*,\s*([^,]+?)\s*\)/g, (match, q, title, msg) => {
    // If msg has an opening bracket for buttons array, skip
    if (msg.includes('[')) return match;
    // Heuristic for trailing options object like {cancelable: false}
    if (msg.includes('{')) return match;

    let type = 'info';
    let tLower = title.toLowerCase();
    
    // We map to AppToast.error / success / info
    if (tLower.includes('error') || tLower.includes('gagal') || tLower.includes('ditolak') || tLower.includes('tidak') || tLower.includes('peringatan') || tLower.includes('izin')) {
        type = 'error';
    } else if (tLower.includes('sukses') || tLower.includes('berhasil')) {
        type = 'success';
    }

    // Replace with AppToast
    return `AppToast.${type}('${title}', ${msg})`;
  });

  if (content !== original) {
     if (!content.includes('import { AppToast }') && !content.includes('import AppToast')) {
         // Some files might use named or default, but in our code AppToast is exported as `export const AppToast`
         content = content.replace(/(import .*?;\r?\n)(?!import)/, '$1import { AppToast } from \'../utils/toast\';\n');
     }
     fs.writeFileSync(p, content);
     totalReplaced++;
     console.log('Replaced in ' + file);
  }
});

console.log('Total files modified: ' + totalReplaced);
