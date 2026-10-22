'use strict';

const { createApplication } = require('./src/app');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

createApplication({
  projectRoot: __dirname,
  secureCookies: process.env.NODE_ENV === 'production'
}).then(({ server }) => {
  server.listen(port, host, () => {
    process.stdout.write(`Glass Shuffle backend listening at http://${host}:${port}\n`);
  });
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
