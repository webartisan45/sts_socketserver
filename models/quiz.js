const _ = require("underscore")._;
const api = require("../scripts/api")();
const Promise = require("promise");

module.exports = Quiz = (data, io, database) => {
  if (data.currentQuestion === undefined) {
    data.currentQuestion = -1;
  }

  if (data.started == undefined) {
    data.started = false;
  }

  if (data.users == undefined) {
    data.users = [];
  }

  if (data.quizAnswers == undefined) {
    data.quizAnswers = {};
  }

  let isRunning = false,
    showingMedia = false,
    timeLeft = 0,
    ticker = null;

  if (data.currentQuestion > -1) {
    timeLeft = data.currentQuestion.timer;
  }

  const setRunningState = (running) => {
    isRunning = running;
    stopQuizTicks();
    if (isRunning) {
      startQuizTricks();
    } else {
      tick();
    }
  };

  const getRunningState = () => {
    return isRunning;
  };

  //   start ticking quiz questions

  const startQuizTicks = () => {
    tick();
    ticker = setInterval(() => {
      tick();
    }, 1000);
  };

  const tick = () => {
    io.to("" + data.code).emit("tick", { quiz: getQuizData() });
    timeLeft--;
    if (timeLeft <= 0) {
      setTimeout(function () {
        endQuestion();
      }, 1000);
    }
  };
  const endQuestion = () => {
    calculateScores();
    io.to("" + data.code).emit("question_end", { quiz: getQuizData() });
    stopQuizTicks();
  };

  const calculateScores = () => {
    let currentQuestion = getCurrentQuestion(true);

    if (currentQuestion && data.quizAnswers[currentQuestion.id]) {
      getUsers(true).forEach((user) => {
        let userAnswer = _.findWhere(data.quizAnswers[currentQuestion.id], {
          socket_token: user.socket_token,
        });

        if (userAnswer) {
          user.score += userAnswer.score;
        }
      });
    }
    saveToDatabase();
  };

  const nextQuestion = () => {
    stopQuizTicks();
    data.currentQuestion++;

    timeLeft = getCurrentQuestion().timer;

    isRunning = false;
    io.to("" + data.code).emit("tick", { quiz: getQuizData() });

    saveToDatabase();
  };

  const addUser = (userData) => {
    data.users.push(userData);
    saveToDatabase();
  };

  const isNameTaken = (name) => {
    let user = _.findWhere(data.users, { name: name });

    return !!user;
  };

  //   stop ticking quiz questions

  const stopQuizTicks = () => {
    clearInterval(ticker);
  };

  const saveToDatabase = () => {
    return database.saveQuiz(data);
  };

  const getCurrentQuestion = (withCorrect) => {
    if (data.currentQuestion < 0) {
      return;
    }

    let question = data.questions[data.currentQuestion];

    if (question.showMedia == undefined) {
      if (question.media && question.media.media_type !== 0) {
        question.showMedia = true;
      } else {
        question.showMedia = false;
      }
    }

    if (withCorrect) {
      return question;
    } else {
      let cleanedAnswers = [];

      try {
        question.answers.forEach((answer) => {
          let a = _.clone(answer);
          delete a.is_correct_answer;
          cleanedAnswers.push(a);
        });
      } catch (err) {
        // is answers array empty?
      }

      q = _.clone(question);
      q.answers = cleanedAnswers;
      return q;
    }
  };

  const getUsers = (withToken) => {
    if (withToken) {
      return data.users;
    } else {
      var usersWithoutTokens = [];

      data.users.forEach((user) => {
        let u = _.clone(user);
        delete u.socket_token;
        usersWithoutTokens.push(u);
      });

      return usersWithoutTokens;
    }
  };

  const getUser = (userIdentifier) => {
    let foundUser = false;
    getUsers(true).forEach((user) => {
      if (user.socket_token === userIdentifier) {
        foundUser = user;
      }
    });

    return foundUser;
  };

  const getRatingForUser = (userIdentifier) => {
    let foundUser = false;
    getUsers(true).forEach((user) => {
      if (user.socket_token === userIdentifier) {
        foundUser = user;
      }
    });

    return foundUser.rating;
  };

  const setRatingForUser = (userIdentifier, rating) => {
    if (rating) {
      data.users.forEach((user) => {
        if (user.socket_token === userIdentifier) {
          user.rating = rating;
        }
      });
    }

    saveToDatabase();
  };

  const getRegisteredUsers = () => {
    let registeredUsers = [];
    data.users.forEach((user) => {
      if (user.answersPersisted) {
        registeredUsers.push(user.name);
      }
    });

    return registeredUsers;
  };

  const getAnswerForUser = (user) => {
    let currentQuestion = getCurrentQuestion(true);

    if (currentQuestion && data.quizAnswers[currentQuestion.id]) {
      return _.findWhere(data.quizAnswers[currentQuestion.id], {
        socket_token: user.socket_token,
      });
    }

    return false;
  };

  //Fixme delete me?
  const startQuiz = (shuffle) => {
    data.started = true;
    if (shuffle == 1 || shuffle == 3) {
      data.questions = _.shuffle(data.questions);
    }
    if (shuffle == 2 || shuffle == 3) {
      for (let property in data.questions) {
        data.questions[property].answers = _.shuffle(
          data.questions[property].answers
        );
      }
    }

    saveToDatabase();
  };

  const stopQuiz = () => {
    stopQuizTicks();
    data.hasEnded = true;

    saveToDatabase();

    return new Promise((resolve, reject) => {
      let answers = [];
      getUsers(true).forEach((user) => {
        let userData = {
          socket_name: user.name,
          socket_token: user.socket_token,
          answers: getAllAnswersForUser(user),
        };

        answers.push(userData);
      });

      //Start saving all raw data to the api
      api
        .patch("quiz-result", data.quizResultIdentifier, { users: answers })
        .then((response) => {
          console.log(
            "### PATCHED RESULTS FOR: " + data.quizResultIdentifier + " ####"
          );
          resolve(response);
        })
        .catch((error) => {
          console.log(
            "### FAILED TO PATCH RESULTS FOR: " +
              data.quizResultIdentifier +
              " ####"
          );
          reject(error);
        })
        .finally(() => {
          saveToDatabase();
        });
    });
  };

  const getAllAnswersForUser = (user) => {
    let answers = [];

    for (let property in data.quizAnswers) {
      if (data.quizAnswers.hasOwnProperty(property)) {
        let answer = _.findWhere(data.quizAnswers[property], {
          socket_token: user.socket_token,
        });

        if (answer) {
          let filteredAnswer = {
            answer_id: answer.answer_id,
            time_to_answer: answer.time_to_answer,
            time_left: answer.time_left,
            score: answer.score,
          };
          answers.push(filteredAnswer);
        }
      }
    }
    return answers;
  };

  const answerQuestion = (
    questionIdentifier,
    answerIdentifier,
    userIdentifier
  ) => {
    if (!data.started) {
      return { error: "socket.error.quiz_not_started" };
    }

    //Check if our time is up
    if (timeLeft <= 0) {
      return { error: "socket.error.question_expired" };
    }

    let currentQuestion = getCurrentQuestion(true);

    if (currentQuestion.id === questionIdentifier) {
      let user = getUser(userIdentifier);

      if (user) {
        if (!data.quizAnswers[questionIdentifier]) {
          data.quizAnswers[questionIdentifier] = [];
        }

        //TODO SHOULD I CHECK FOR VALIDITY OF ANSWER ON QUESTION? --> It would count as wrong either way?
        let switched = 0;
        let foundUser = _.findWhere(data.quizAnswers[questionIdentifier], {
          socket_token: user.socket_token,
        });
        let answerID = 0;

        if (foundUser != undefined) {
          switched = foundUser.switched;

          answerID = foundUser.answer_id;
          if (answerID !== answerIdentifier) {
            switched++;
          }

          data.quizAnswers[questionIdentifier] = _.without(
            data.quizAnswers[questionIdentifier],
            _.findWhere(data.quizAnswers[questionIdentifier], {
              socket_token: foundUser.socket_token,
            })
          );
        }

        //Determine if we answered correctly
        let answer = _.findWhere(currentQuestion.answers, {
          id: answerIdentifier,
        });

        let score = 10 - switched;

        if (score < 1) {
          score = 1;
        }

        if (!answer.is_correct_answer) {
          score = 0;
        }

        data.quizAnswers[questionIdentifier].push({
          name: user.name,
          socket_token: userIdentifier,
          answer_id: answerIdentifier,
          time_to_answer: currentQuestion.timer - timeLeft,
          time_left: timeLeft,
          score: score,
          switched: switched,
        });
        saveToDatabase();
      } else {
        return { error: "socket.error.not_joined" };
      }

      return { success: "socket.success.answered_question" };
    } else {
      return { error: "socket.error.invalid_question_answered" };
    }
  };

  const getAmountNotAnswered = () => {
    if (getCurrentQuestion()) {
      let amt = 0;
      if (data.quizAnswers[getCurrentQuestion().id]) {
        amt = data.quizAnswers[getCurrentQuestion().id].length;
      }
      return getUsers(false).length - amt;
    } else {
      return getUsers(false).length;
    }
  };

  const showMedia = (shouldShow) => {
    getCurrentQuestion(true).showMedia = shouldShow;
    showingMedia = shouldShow;
    saveToDatabase();

    if (!shouldShow) {
      isRunning = false;
      io.to("" + data.code).emit("show_questions_after_show_media", {
        quiz: getQuizData(),
      });
    }
  };

  const showAnswers = () => {
    timeLeft = 0;
    getCurrentQuestion(true).showMedia = false;
    endQuestion();
  };

  const getQuizData = () => {
    let quizData = {
      code: data.code,
      name: data.name,
      description: data.description,
      current_question_index: data.currentQuestion + 1,
      total_questions: data.questions.length,
      started: data.started,
      isRunning: isRunning,
      showingMedia: showingMedia,
      hasEnded: data.hasEnded,
      users: _.sortBy(getUsers(false), "score").reverse(),
      notAnswered: getAmountNotAnswered(),
    };

    if (quizData.started) {
      quizData.current_question = getCurrentQuestion();
      quizData.time_left = timeLeft;
    }

    //Show answers
    if (quizData.time_left !== undefined && quizData.time_left <= 0) {
      let grouped_answers = {};

      try {
        getCurrentQuestion(true).answers.forEach((answer) => {
          let ans = _.where(data.quizAnswers[getCurrentQuestion().id], {
            answer_id: answer.id,
          });
          if (ans[0] !== undefined) {
            // delete ans[0].socket_token;
          }
          grouped_answers[answer.id] = ans;
        });
      } catch (err) {
        // is answers array empty?
      }

      quizData.user_answers = grouped_answers;
      quizData.current_question = getCurrentQuestion(true);
    }

    if (
      quizData.current_question_index == quizData.total_questions &&
      quizData.time_left === 0
    ) {
      quizData.hasEnded = true;
    }

    return quizData;
  };

  return {
    code: data.code,
    nextQuestion: nextQuestion,
    startQuizTicks: startQuizTicks,
    stopQuizTicks: stopQuizTicks,
    addUser: addUser,
    isNameTaken: isNameTaken,
    setRunningState: setRunningState,
    getRunningState: getRunningState,
    getRatingForUser: getRatingForUser,
    setRatingForUser: setRatingForUser,
    saveToDatabase: saveToDatabase,
    getQuizData: getQuizData,
    startQuiz: startQuiz,
    getAnswerForUser: getAnswerForUser,
    answerQuestion: answerQuestion,
    getAllAnswersForUser: getAllAnswersForUser,
    showMedia: showMedia,
    showAnswers: showAnswers,
    stopQuiz: stopQuiz,
    getUser: getUser,
    getRegisteredUsers: getRegisteredUsers,
    getAmountNotAnswered: getAmountNotAnswered,
    id: data.id,
    resultId: data.quizResultIdentifier,
    quizmaster: data.quizmaster,
  };
};
