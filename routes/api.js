'use strict';

const {
  createThread,
  getThreads,
  deleteThread,
  reportThread,
  createReply,
  getReplies,
  deleteReply,
  reportReply
} = require('../controllers/threadController');

module.exports = function (app) {

  app.route('/api/threads/:board')
    .post(createThread)
    .get(getThreads)
    .delete(deleteThread)
    .put(reportThread);

  app.route('/api/replies/:board')
    .post(createReply)
    .get(getReplies)
    .delete(deleteReply)
    .put(reportReply);

};
