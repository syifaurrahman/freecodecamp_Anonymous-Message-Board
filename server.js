'use strict';
require('dotenv').config();

if (process.env.NODE_ENV !== 'test') {
  process.env.NODE_ENV = 'test';
}
const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const helmet     = require('helmet');

const apiRoutes        = require('./routes/api.js');
const fccTestingRoutes = require('./routes/fcctesting.js');
const runner           = require('./test-runner');

const app = express();

// ── Security Headers ──────────────────────────────────────────────────────────

// 2. Only allow your site to be loaded in an iFrame on your own pages
app.use(helmet.frameguard({ action: 'sameorigin' }));

// 3. Do not allow DNS prefetching
app.use(helmet.dnsPrefetchControl({ allow: false }));

// 4. Only allow your site to send the referrer for your own pages
app.use(helmet.referrerPolicy({ policy: 'same-origin' }));

// ── Static & Body Parsing ─────────────────────────────────────────────────────

app.use('/public', express.static(process.cwd() + '/public'));

app.use(cors({ origin: '*' })); // For FCC testing purposes only

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ── Front-End Routes ──────────────────────────────────────────────────────────

app.route('/b/:board/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/board.html');
  });

app.route('/b/:board/:threadid')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/thread.html');
  });

app.route('/')
  .get(function (req, res) {
    res.sendFile(process.cwd() + '/views/index.html');
  });

// ── API & Test Routes ─────────────────────────────────────────────────────────

fccTestingRoutes(app);
apiRoutes(app);

// ── 404 ───────────────────────────────────────────────────────────────────────

app.use(function (req, res) {
  res.status(404).type('text').send('Not Found');
});

// ── Start Server ──────────────────────────────────────────────────────────────

const listener = app.listen(process.env.PORT || 3000, function () {
  console.log('Your app is listening on port ' + listener.address().port);
  if (process.env.NODE_ENV === 'test') {
    console.log('Running Tests...');
    setTimeout(function () {
      try {
        runner.run();
      } catch (e) {
        console.log('Tests are not valid:');
        console.error(e);
      }
    }, 1000);
  }
});

module.exports = app; // for testing
