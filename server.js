const express = require("express");
const app = express();
const server = require("http").Server(app);
const keys = require("./config/keyconfig")();
const couchbase = require("couchbase");
const cors = require("cors");

app.use(cors());

async function main() {
  // database initialize
  const cluster = await couchbase.connect(keys.couchbaseURL, {
    username: keys.couchbaseUsername,
    password: keys.couchbasePassword,
    options: {
      operationTimeout: 90000,
    },
  });

  // bucket connet
  const bucket = cluster.bucket("quizstud");

  const collection = bucket.defaultCollection();

  const database = require("./scripts/database")(bucket, collection, cluster);
  const api = require("./scripts/api")();

  const bodyParser = require("body-parser");
  app.use(bodyParser.json());

  const io = require("socket.io")(server);

  const quizManager = require("./scripts/quizmanager")(io, database);
  const socket = require("./scripts/socket")(io, quizManager);

  quizManager.initFromDatabase();

  /*
     Routes to get a basic interaction with the outside world.
     */

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
  });

  app.post("/quiz", async (req, res) => {
    const quiz = req.body.quiz;
    const token = req.body.token;

    if (token && quiz) {
      quizManager
        .initiateQuiz(quiz, token)
        .then((response) => {
          res.json(response);
        })
        .catch((error) => {
          res.status(422);
          res.json(error);
        });
    } else {
      res.json({
        error: "socket.error.invalid.params",
      });
    }
  });

  app.get("/ping", (req, res) => {
    res.json({ connected: true });
  });

  app.post("/registerscore", (req, res) => {
    const accessToken = req.body.access_token;
    const socketToken = req.body.socket_token;

    if (accessToken && socketToken) {
      quizManager
        .getAnswersForUserWithSocketToken(accessToken, socketToken)
        .then((resultSet) => {
          res.json(resultSet);
        })
        .catch((error) => {
          //TODO SEND ERROR STATUS 422
          res.json({
            error: "socket.error.invalid.credentials",
          });
        });
    } else {
      res.json({
        error: "socket.error.invalid.params",
      });
    }
  });

  app.post("/code", (req, res) => {
    const code = req.body.code;
    const response = {};

    if (quizManager.isValidQuizCode(code)) {
      response = {
        message: "socket.success.code.valid",
      };
    } else {
      res.status(422);
      response = {
        error: "socket.error.invalidquiz",
      };
    }

    res.json(response);
  });
  app.listen(4000, () => {
    console.log("server is running and up");
  });
}

main().catch((e) => console.error(e));

exports.closeServer = () => {
  server.close();
};
