module.exports = (bucket, collection) => {
  const saveQuiz = (quiz) => {
    console.log("saving quiz");
    return collection.upsert("quiz-" + quiz.code, quiz);
  };

  const getQuizzes = async () => {
    const result = await bucket.viewQuery("quiz", "quiz");
    return result.rows;
  };

  const getQuizByKey = (key) => {
    return collection.get(key);
  };

  return {
    saveQuiz: saveQuiz,
    getQuizzes: getQuizzes,
    getQuizByKey: getQuizByKey,
  };
};
