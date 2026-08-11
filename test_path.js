function norm(p) {
  return (p || '').replace(/\\/g, '/').toLowerCase().trim();
}

function relPart(p) {
  const n = norm(p);
  for (const seg of ['uploads/', 'user_approvals/', 'projects/', 'teamleader/']) {
    const idx = n.indexOf(seg);
    if (idx !== -1) {
      return n.slice(idx + seg.length);
    }
  }
  return n;
}

const addedPath = '\\\\KMTI-NAS\\Shared\\data\\teamleader\\team.leader\\TESTING!\\chapt1 (1).docx';
const relAdded = relPart(addedPath);

console.log('relAdded:', relAdded);
const parts = relAdded.split(/[\\/]/);
console.log('parts:', parts);
console.log('teamLeaderUsername:', parts[0]);
console.log('folderName:', parts[parts.length - 2]);
