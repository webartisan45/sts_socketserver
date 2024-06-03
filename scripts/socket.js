const _ = require("underscore")._;

const api = require("./api")();

module.exports = (socketInstance, quizManagerInstance) => {
  const io = socketInstance;

  io.on("connection", (socket) => {
    let room = "";
    let socketToken;
    let code, quiz, user;

    /**
     * Anyone can join a quiz. this happens either with a quiz code (4 digits) or a socket token.
     *
     * When a user uses a socket token (e.g. rejoins the quiz) we have to check if that user is
     * an admin or not.
     */

    socket.on("join", (data, fn) => {
      console.log("JOIN");
      //Login with a quizcode and make a new user on an existing quix
      if (quizManagerInstance.isValidQuizCode(data.code)) {
        console.log("WITH CODE");
        code = data.code;
        quiz = quizManagerInstance.getQuiz(code);
        user = {
          name: data.name,
          socket_token: guid(),
          quizmaster: false,
          score: 0,
        };

        if (quiz.isNameTaken(data.name)) {
          fn({ error: "socket.error.nametaken" });
          return;
        }

        quizManagerInstance.addUserToQuiz(user, quiz);

        socketToken = user.socket_token;
      }

      //Login with a user id and fetch the quiz
      else if (quizManagerInstance.isValidSocketToken(data.socket_token)) {
        code = quizManagerInstance.getQuizCodeForUser(data.socket_token);
        quiz = quizManagerInstance.getQuiz(code);
        user = data;
        socketToken = data.socket_token;

        //Determine of the user is our quizmaster
        user.quizmaster = quiz.quizmaster.socket_token === data.socket_token;
        if (user.quizmaster) {
          quiz.quizmaster.clientId = socket.id;
        }
      }
      //You joined the wrong quiz / user is non-existing
      else {
        fn({ error: "socket.error.invalidquiz" });
        return;
      }

      // Leave the room if we were in a different room. Don't do this
      // by default as this will cause bugs in socket.io
      if (room != code) {
        socket.leave(room);
      }

      //Join the room and save the code in a room var for later usage.
      socket.join(code);
      room = code;
      let answer = quiz.getAnswerForUser(user);
      fn({
        message: "socket.success.joinedquiz",
        quiz: quiz.getQuizData(),
        user: user,
        answer: answer,
      });

      socket.emit("joined", user);
      let userWithoutSocketToken = _.clone(user);
      delete userWithoutSocketToken.socket_token;
      socket.broadcast.to(code).emit("joined", userWithoutSocketToken);
    });

    socket.on("answer_question", (data, fn) => {
      if (!room) {
        fn({ error: "socket.error.not_joined" });
      }

      const questionIdentifier = data.question_id;
      const answerIdentifier = data.answer_id;

      if (questionIdentifier && answerIdentifier) {
        let quiz = quizManagerInstance.getQuiz(parseInt(room));
        let answerResponse = quiz.answerQuestion(
          questionIdentifier,
          answerIdentifier,
          socketToken
        );
        let user = quiz.getUser(socketToken);

        let cleanResponse = _.clone(answerResponse);
        delete answerResponse.socket_token;
        if (socket.id == quiz.quizmaster.clientId) {
          socket.emit("answered", {
            user: user.name,
            not_answered: quiz.getAmountNotAnswered(),
          });
        }

        socket.broadcast.to(quiz.quizmaster.clientId).emit("answered", {
          user: user.name,
          not_answered: quiz.getAmountNotAnswered(),
        });
        fn(cleanResponse);
      } else {
        fn({ error: "socket.error.invalid_data" });
      }
    });

    socket.on("newrating", (data, fn) => {
      if (!room) {
        fn({ error: "socket.error.not_joined" });
      }

      let quiz = quizManagerInstance.getQuiz(parseInt(room));
      quiz.setRatingForUser(data.socket_token, data.rating);
    });

    //////////////////////////////////////////////////////////////
    // User Result Resolving                                    //
    // The following commands are for obtaining a user          //
    // And persisting their result, getting their register      //
    // Status                                                   //
    //////////////////////////////////////////////////////////////

    socket.on("fetch_user", (data, fn) => {
      api
        .fetchAll("user", { a_tok: data._token })
        .then((obtaineduser) => {
          fn(obtaineduser);
          socket.emit("userfound", {
            name: obtaineduser.name,
            avatar: obtaineduser.avatar,
            id: obtaineduser.id,
          });
        })
        .catch((error) => {
          console.log(error);
          fn({ error: error });
          reject(error);
        });
    });

    socket.on("registerplayer", (data, fn) => {
      console.log("=== SAVING UserResult ===");

      api
        .patch("quiz-result", quiz.resultId, {
          user_id: data.id,
          socket_token: data.socket_token,
        })
        .then((response) => {
          fn({ success: "socket.success.registered" });
          console.log("=== Result saved for: " + data.id + " ===");
          socket.broadcast
            .to(quiz.quizmaster.clientId)
            .emit("userregistered", user.name);
        })
        .catch((error) => {
          console.log("=== Failed to save for: " + data.id + " ===");
          fn({ error: error.detail });
        });
    });

    socket.on("whoregistered", (data, fn) => {
      let reggedusers = quiz.getRegisteredUsers();
      socket.broadcast
        .to(quiz.quizmaster.clientId)
        .emit("registereduserresult", reggedusers);
    });

    //////////////////////////////////////////////////////////////
    // Admin commands.                                          //
    // The following commands are only for quizmasters          //
    //////////////////////////////////////////////////////////////

    /**
     * Admin 'start' command to start the quiz.
     * When the user calling is an admin it will broadcast a 'quiz_started' to all
     * connected clients so the can refresh their screens.
     *
     * If a user is not an admin it will send a 'no_permission' message.
     */

    socket.on("start", (data, fn) => {
      if (!room) {
        fn({ error: "socket.error.not_joined" });
      }

      if (user.quizmaster) {
        let quiz = quizManagerInstance.getQuiz(parseInt(room));
        //console.log(data.shuffle);
        quiz.startQuiz(data.shuffle);
        //We call next question because the quiz starts by default at index -1 (Like a database cursor).
        //Calling nextQuestion sets it to 0 and starts the ticking.
        quiz.nextQuestion();

        io.to(room).emit("quiz_started", {
          quiz: quiz.getQuizData(),
          user: user,
        });
      } else {
        fn({ error: "socket.error.no_permission" });
      }
    });

    /**
     * Admin 'start question' command to start the timer on a question.
     * This is mainly used when a question has media like a video to play first. After that
     * the question will be started.
     */
    socket.on("start_question", (data, fn) => {
      if (!room) {
        fn({ error: "socket.error.not_joined" });
      }

      if (user.quizmaster) {
        if (!quizManagerInstance.getQuiz(parseInt(room)).getRunningState())
          quizManagerInstance.getQuiz(parseInt(room)).setRunningState(true);
      } else {
        fn({ error: "socket.error.no_permission" });
      }
    });

    /**
     * Admin 'pause question' command to pause the timer on a question
     */
    socket.on("pause_question", (data, fn) => {
      if (!room) {
        fn({ error: "socket.error.not_joined" });
      }

      if (user.quizmaster) {
        quizManagerInstance.getQuiz(parseInt(room)).setRunningState(false);
      } else {
        fn({ error: "socket.error.no_permission" });
      }
    });

    /**
     * Admin 'next question' command to advance the quiz to the next question.
     * When the quiz is finished (no more questions)
     * this will return 'false'
     */
    socket.on("next_question", (data, fn) => {
      if (!room) {
        fn({ error: "socket.error.not_joined" });
      }

      if (user.quizmaster) {
        quizManagerInstance.getQuiz(parseInt(room)).nextQuestion();
      } else {
        fn({ error: "socket.error.no_permission" });
      }
    });

    socket.on("show_answers", (data, fn) => {
      if (!room) {
        fn({ error: "socket.error.not_joined" });
      }

      if (user.quizmaster) {
        quizManagerInstance.getQuiz(parseInt(room)).showAnswers();
      } else {
        fn({ error: "socket.error.no_permission" });
      }
    });

    socket.on("show_question", (data, fn) => {
      if (!room) {
        fn({ error: "socket.error.not_joined" });
      }

      if (user.quizmaster) {
        quizManagerInstance.getQuiz(parseInt(room)).showMedia(false);
      } else {
        fn({ error: "socket.error.no_permission" });
      }
    });

    socket.on("stop_quiz", (data, fn) => {
      if (!room) {
        fn({ error: "socket.error.not_joined" });
      }

      if (user.quizmaster) {
        quizManagerInstance
          .getQuiz(parseInt(room))
          .stopQuiz()
          .then((response) => {
            io.to(room).emit("quiz_stopped", {
              quiz: quiz.getQuizData(),
              user: user,
            });
          })
          .catch((error) => {
            fn({ error: "socket.error.unabletostopquiz" });
          });
      } else {
        fn({ error: "socket.error.no_permission" });
      }
    });
  });

  function guid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }

    return (
      s4() +
      s4() +
      "-" +
      s4() +
      "-" +
      s4() +
      "-" +
      s4() +
      "-" +
      s4() +
      s4() +
      s4()
    );
  }

  return {};
};
