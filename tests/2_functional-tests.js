const chaiHttp = require('chai-http');
const chai = require('chai');
const assert = chai.assert;
const server = require('../server');

chai.use(chaiHttp);

suite('Functional Tests', function () {
  this.timeout(5000);
  let testThreadId;
  let testReplyId;
  const testBoard = 'fcc-test-board';

  suite('API ROUTING FOR /api/threads/:board', function () {

    test('Creating a new thread: POST request to /api/threads/{board}', function (done) {
      chai.request(server)
        .post('/api/threads/' + testBoard)
        .send({
          text: 'Functional Test Thread',
          delete_password: 'test_password'
        })
        .end(function (err, res) {
          assert.equal(res.status, 200);
          done();
        });
    });

    test('Viewing the 10 most recent threads with 3 replies each: GET request to /api/threads/{board}', function (done) {
      chai.request(server)
        .get('/api/threads/' + testBoard)
        .end(function (err, res) {
          assert.equal(res.status, 200);
          assert.isArray(res.body);
          assert.isAtMost(res.body.length, 10);
          assert.property(res.body[0], '_id');
          assert.property(res.body[0], 'text');
          assert.property(res.body[0], 'created_on');
          assert.property(res.body[0], 'bumped_on');
          assert.property(res.body[0], 'replies');
          assert.notProperty(res.body[0], 'delete_password');
          assert.notProperty(res.body[0], 'reported');
          assert.isArray(res.body[0].replies);
          assert.isAtMost(res.body[0].replies.length, 3);
          testThreadId = res.body[0]._id;
          done();
        });
    });

    test('Deleting a thread with the incorrect password: DELETE request to /api/threads/{board} with an invalid delete_password', function (done) {
      chai.request(server)
        .delete('/api/threads/' + testBoard)
        .send({
          thread_id: testThreadId,
          delete_password: 'wrong_password'
        })
        .end(function (err, res) {
          assert.equal(res.status, 200);
          assert.equal(res.text, 'incorrect password');
          done();
        });
    });

    test('Deleting a thread with the correct password: DELETE request to /api/threads/{board} with a valid delete_password', function (done) {
      chai.request(server)
        .post('/api/threads/' + testBoard)
        .send({
          text: 'Thread to be deleted',
          delete_password: 'delete_me'
        })
        .end(function (err, res) {
          chai.request(server)
            .get('/api/threads/' + testBoard)
            .end(function (err, res) {
              const threadToDelete = res.body.find(t => t.text === 'Thread to be deleted');
              assert.isDefined(threadToDelete);
              chai.request(server)
                .delete('/api/threads/' + testBoard)
                .send({
                  thread_id: threadToDelete._id,
                  delete_password: 'delete_me'
                })
                .end(function (err, res) {
                  assert.equal(res.status, 200);
                  assert.equal(res.text, 'success');
                  done();
                });
            });
        });
    });

    test('Reporting a thread: PUT request to /api/threads/{board}', function (done) {
      chai.request(server)
        .put('/api/threads/' + testBoard)
        .send({
          thread_id: testThreadId
        })
        .end(function (err, res) {
          assert.equal(res.status, 200);
          assert.equal(res.text, 'reported');
          done();
        });
    });

  });

  suite('API ROUTING FOR /api/replies/:board', function () {

    test('Creating a new reply: POST request to /api/replies/{board}', function (done) {
      chai.request(server)
        .post('/api/replies/' + testBoard)
        .send({
          thread_id: testThreadId,
          text: 'Functional Test Reply',
          delete_password: 'reply_password'
        })
        .end(function (err, res) {
          assert.equal(res.status, 200);
          done();
        });
    });

    test('Viewing a single thread with all replies: GET request to /api/replies/{board}', function (done) {
      chai.request(server)
        .get('/api/replies/' + testBoard)
        .query({ thread_id: testThreadId })
        .end(function (err, res) {
          assert.equal(res.status, 200);
          assert.property(res.body, '_id');
          assert.property(res.body, 'text');
          assert.property(res.body, 'created_on');
          assert.property(res.body, 'bumped_on');
          assert.property(res.body, 'replies');
          assert.notProperty(res.body, 'delete_password');
          assert.notProperty(res.body, 'reported');
          assert.isArray(res.body.replies);
          assert.isAtLeast(res.body.replies.length, 1);
          assert.property(res.body.replies[0], '_id');
          assert.property(res.body.replies[0], 'text');
          assert.property(res.body.replies[0], 'created_on');
          assert.notProperty(res.body.replies[0], 'delete_password');
          assert.notProperty(res.body.replies[0], 'reported');
          testReplyId = res.body.replies[0]._id;
          done();
        });
    });

    test('Deleting a reply with the incorrect password: DELETE request to /api/replies/{board} with an invalid delete_password', function (done) {
      chai.request(server)
        .delete('/api/replies/' + testBoard)
        .send({
          thread_id: testThreadId,
          reply_id: testReplyId,
          delete_password: 'wrong_password'
        })
        .end(function (err, res) {
          assert.equal(res.status, 200);
          assert.equal(res.text, 'incorrect password');
          done();
        });
    });

    test('Deleting a reply with the correct password: DELETE request to /api/replies/{board} with a valid delete_password', function (done) {
      chai.request(server)
        .post('/api/replies/' + testBoard)
        .send({
          thread_id: testThreadId,
          text: 'Reply to be deleted',
          delete_password: 'reply_delete_me'
        })
        .end(function (err, res) {
          chai.request(server)
            .get('/api/replies/' + testBoard)
            .query({ thread_id: testThreadId })
            .end(function (err, res) {
              const replyToDelete = res.body.replies.find(r => r.text === 'Reply to be deleted');
              assert.isDefined(replyToDelete);
              chai.request(server)
                .delete('/api/replies/' + testBoard)
                .send({
                  thread_id: testThreadId,
                  reply_id: replyToDelete._id,
                  delete_password: 'reply_delete_me'
                })
                .end(function (err, res) {
                  assert.equal(res.status, 200);
                  assert.equal(res.text, 'success');
                  done();
                });
            });
        });
    });

    test('Reporting a reply: PUT request to /api/replies/{board}', function (done) {
      chai.request(server)
        .put('/api/replies/' + testBoard)
        .send({
          thread_id: testThreadId,
          reply_id: testReplyId
        })
        .end(function (err, res) {
          assert.equal(res.status, 200);
          assert.equal(res.text, 'reported');
          done();
        });
    });

  });

});
