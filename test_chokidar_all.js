const chokidar = require('chokidar');
const path = require('path');
const { networkDataPath } = require('./server/config/database');

const watchPath = path.join(networkDataPath, 'teamleader');
console.log('👀 Starting watcher on:', watchPath);

const watcher = chokidar.watch(watchPath, {
  persistent: true,
  ignoreInitial: true,
  depth: 15,
  usePolling: true,
  interval: 1000
});

watcher.on('all', (event, p) => {
  console.log(`[CHOKIDAR] Event: ${event} -> ${p}`);
});

watcher.on('ready', () => {
  console.log('✅ Watcher is ready. Creating test file in 2s...');
  setTimeout(() => {
    const dummyFile = path.join(watchPath, 'team.leader', 'TESTING!', 'dummy_chokidar_test2.txt');
    require('fs').writeFileSync(dummyFile, 'test');
    console.log('Created file. Waiting 5s for event...');
    
    setTimeout(() => {
      require('fs').unlinkSync(dummyFile);
      console.log('Deleted file. Waiting 3s to exit...');
      setTimeout(() => process.exit(0), 3000);
    }, 5000);
  }, 2000);
});
