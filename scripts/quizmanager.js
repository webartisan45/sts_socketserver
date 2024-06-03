module.exports = (io, database) => {
  const quizzes = {};
  const users = {};
  const api = require("./api")();
  const async = require("async");

  const Quiz = require("../models/quiz");
  const Promise = require("promise");

  /**
   * @param quiz
   * @param token
   * @returns {*}
   */

  const initiateQuiz = (quiz, token) => {
    console.log("Initiating quiz");
    return new Promise((resolve, reject) => {
      console.log("Initial");
      const quizCode = generateCode();
      const quizmasterID = "t" + generateQuizmasterString();

      api
        .fetchAll("user", { a_tok: token })
        .then((quizmaster) => {
          console.log("Found user");
          api
            .fetchAll("quiz", { quiz_id: quiz, user_id: quizmaster.id })
            .then((response) => {
              console.log("Found quiz");
              api
                .create("quiz-result", { quiz_id: parseInt(quiz) })
                .then((quizResult) => {
                  console.log("Create quiz result", quizResult);
                  var quizData = response[0];
                  quizmaster.socket_token = quizmasterID;
                  quizmaster.score = 0;
                  quizmaster.quizmaster = true;
                  quizData.quizmaster = quizmaster;
                  quizData.quizResultIdentifier = quizResult.id;

                  console.log("initQuizFromData");
                  initQuizFromData(quizCode, quizData).catch((e) =>
                    console.error(e)
                  );

                  console.log("addUserToQuiz");
                  addUserToQuiz(quizmaster, quizzes[quizCode]);

                  console.log("done");
                  resolve({
                    code: quizCode,
                    socket_token: quizmaster.socket_token,
                    name: quizmaster.name,
                  });
                });
            })
            .catch((error) => {
              console.log("Error - initiateQuiz - fetchAll(quiz): " + error);
              reject(error);
            });
        })
        .catch((error) => {
          console.log("Error - initiateQuiz - findUser: " + error);
          reject(error);
        });
    });
  };

  const initQuizFromData = (code, quizData) => {
    quizData.code = code;

    if (quizData.users && quizData.users.length > 0) {
      quizData.users.forEach((user) => {
        users[user.socket_token] = quizData.code;
      });
    }

    quizzes[code] = new Quiz(quizData, io, database);
    return quizzes[code].saveToDatabase();
  };

  const generateCode = () => {
    var code = Math.floor(Math.random() * 9000) + 1000;

    // TODO: This causes an endless loop!
    //Check for uniqueness
    // while (quizzes.hasOwnProperty(code)) {
    //     code = generateCode();
    // }

    return code;
  };

  const addUserToQuiz = (user, quiz) => {
    if (!users.hasOwnProperty(user.socket_token)) {
      quiz.addUser(user);
      users[user.socket_token] = quiz.code;
      return true;
    }

    return false;
  };

  const isValidQuizCode = (quizCode) => {
    return quizzes.hasOwnProperty(quizCode);
  };

  const isValidSocketToken = (socket_token) => {
    return users.hasOwnProperty(socket_token);
  };

  const joinQuiz = (quizCode) => {
    if (!isValidQuizCode(quizCode)) {
      return false;
    }
  };

  const getQuiz = (quizCode) => {
    return quizzes[quizCode];
  };

  const getQuizCodeForUser = (socketToken) => {
    return users[socketToken];
  };

  const initFromDatabase = () => {
    console.log("Initializing quizes from database");
    database
      .getQuizzes()
      .then((quizzes) => {
        console.log("Received quizzes");

        if (quizzes.length > 0) {
          console.log("Trying to recover " + quizzes.length + " quizzes");

          let getFunctions = [];

          quizzes.forEach((quiz) => {
            getFunctions.push((callback) => {
              database
                .getQuizByKey(quiz.key)
                .then((quizResult) => {
                  return initQuizFromData(
                    quizResult.value.code,
                    quizResult.value
                  );
                })
                .then(() => {
                  callback();
                })
                .catch((error) => {
                  console.log(
                    "Error - initFromDatabase - getQuizByKey: " + error
                  );
                  callback();
                });
            });
          });

          return async.series(getFunctions);
        } else {
          console.log("Error - initFromDatabase: No quizzes to recover");
        }
      })
      .catch((error) => {
        console.log("Error - initFromDatabase - getQuizzes: " + error);
      });
  };

  const persistQuiz = (socketToken) => {
    return new Promise((resolve, reject) => {
      const code = getQuizCodeForUser(socketToken);
      const quiz = getQuiz(code);
      const resultIdentifier = quiz.resultId;

      api
        .patch("quiz-result", resultIdentifier, { persist_result: true })
        .then((result) => {
          console.log("persisted");
          console.log(result);
          resolve(result);
        })
        .catch((error) => {
          //console.log('Error:' + error);
          console.log(error);
          reject(error);
        });
    });
  };

  const getAnswersForUserWithoutAccessToken = (socketToken) => {
    return new Promise(function (resolve, reject) {
      const code = getQuizCodeForUser(socketToken);
      const quiz = getQuiz(code);
      const user = quiz.getUser(socketToken);
      const answers = quiz.getAllAnswersForUser(user);

      if (!user.answersPersisted) {
        api
          .create("user", { name: user.name })
          .then((apiUser) => {
            //Patch with this value
            const resultIdentifier = quiz.resultId;
            let resultSet = {
              users: [
                {
                  user_id: apiUser.id,
                  answers: answers,
                  rating: rating,
                },
              ],
            };

            api
              .patch("quiz-result", resultIdentifier, resultSet)
              .then((result) => {
                answers.persisted = true;
                resolve(result);
              })
              .catch((error) => {
                console.log(error);
                reject(error);
              });
          })
          .catch((error) => {
            console.log(error);
            reject(error);
          });
      }
    });
  };

  const getAnswersForUserWithSocketToken = (accessToken, socketToken) => {
    return new Promise((resolve, reject) => {
      api
        .fetchAll("user", { a_tok: accessToken })
        .then((apiUser) => {
          const code = getQuizCodeForUser(socketToken);
          const quiz = getQuiz(code);
          const user = quiz.getUser(socketToken);
          const answers = quiz.getAllAnswersForUser(user);
          const rating = quiz.getRatingForUser(socketToken);

          if (!user.answersPersisted) {
            //Patch with this value
            let resultIdentifier = quiz.resultId;
            let resultSet = {
              users: [
                {
                  user_id: apiUser.id,
                  answers: answers,
                  rating: rating,
                },
              ],
            };

            api
              .patch("quiz-result", resultIdentifier, resultSet)
              .then((result) => {
                user.answersPersisted = true;
                resolve(result);
              })
              .catch((error) => {
                console.log(error);
                reject(error);
              });
          } else {
            resolve({});
            console.log("Already persisted this set");
          }
        })
        .catch((error) => {
          reject(error);
        });
    });
  };

  const randomString = (length, chars) => {
    let result = "";
    for (let i = length; i > 0; --i)
      result += chars[Math.round(Math.random() * (chars.length - 1))];
    return result;
  };

  const generateQuizmasterString = () => {
    return randomString(
      100,
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    );
  };

  return {
    initiateQuiz: initiateQuiz,
    joinQuiz: joinQuiz,
    isValidQuizCode: isValidQuizCode,
    getQuiz: getQuiz,
    persistQuiz: persistQuiz,
    initFromDatabase: initFromDatabase,
    isValidSocketToken: isValidSocketToken,
    addUserToQuiz: addUserToQuiz,
    getQuizCodeForUser: getQuizCodeForUser,
    getAnswersForUserWithSocketToken: getAnswersForUserWithSocketToken,
    getAnswersForUserWithoutAccessToken: getAnswersForUserWithoutAccessToken,
  };
};
