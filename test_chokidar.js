const chokidar = require('chokidar');
const path = require('path');
const { networkDataPath } = require('./server/config/database');

const watchPath = path.join(networkDataPath, 'teamleader');

console.log('👀 Starting watcher on:', watchPath);

const watcher = chokidar.watch(watchPath, {
  persistent: true,
  ignoreInitial: true,
  usePolling: true,
  interval: 1000,
  depth: 15
});

watcher.on('add', p => console.log('✅ File added:', p));
watcher.on('unlink', p => console.log('🗑️ File deleted:', p));
watcher.on('ready', () => console.log('✅ Watcher is ready and has finished initial scan.'));

setTimeout(() => {
  console.log('Creating a dummy file...');
  const dummyFile = path.join(watchPath, 'team.leader', 'TESTING!', 'dummy_chokidar_test.txt');
  require('fs').writeFileSync(dummyFile, 'test');
  
  setTimeout(() => {
    require('fs').unlinkSync(dummyFile);
    console.log('Deleted dummy file. Exiting in 5s...');
    setTimeout(() => process.exit(0), 5000);
  }, 5000);
}, 3000);
