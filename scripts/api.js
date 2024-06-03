const keys = require("../config/keyconfig")();
const Promise = require("promise");
const unirest = require("unirest");

module.exports = () => {
  let token;

  function setupOauth(tokenInvalid) {
    if (tokenInvalid) {
      token = undefined;
    }

    const params = {
      grant_type: "client_credentials",
      client_id: keys.clientID,
      client_secret: keys.clientSecret,
    };

    const promise = new Promise((resolve, reject) => {
      if (!token) {
        unirest
          .post(keys.baseURL + "/oauth")
          .header("Accept", "application/json")
          .header("Content-Type", "application/json")
          .send(params)
          .end((response) => {
            console.log("auth response", response);
            if (response.statusType === 2) {
              console.log("### Authenticated ###");
              token = response.body;
              resolve(response.body);
            } else {
              console.log("### Authenticated failed ###");
              reject(response.body);
            }
          });
      } else {
        resolve(token);
      }
    });
    return promise;
  }

  function serialize(obj) {
    const str = [];
    for (let p in obj) {
      if (obj.hasOwnProperty(p)) {
        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
      }
      return str.join("&");
    }
  }

  const fetch = (resource, id) => {
    const promise = new Promise((resolve, reject) => {
      setupOauth().then(() => {
        unirest
          .get(keys.baseURL + "/" + resource + "/" + id)
          .header("Accept", "application/json")
          .header("Authorization", "Beare" + token.access_token)
          .header("Content-Type", "application/json")
          .end((response) => {
            if (response.statusType === 2) {
              resolve(response.body);
            } else if (response.statusType === 4) {
              setupOauth(true)
                .then((token) => {
                  unirest
                    .get(keys.baseURL + "/" + resource + "/" + id)
                    .header("Accept", "application/json")
                    .header("Authorization", "Bearer " + token.access_token)
                    .header("Content-Type", "application/json")
                    .end((response) => {
                      if (response.statusType === 2) {
                        resolve(response.body);
                      } else {
                        reject(response.body);
                      }
                    });
                })
                .catch((error) => {
                  reject(error);
                });
            } else {
              reject(response.body);
            }
          });
      });
    });
    return promise;
  };

  const fetchAll = (resource, params) => {
    const promise = new Promise((resolve, reject) => {
      setupOauth()
        .then(function () {
          unirest
            .get(keys.baseURL + "/" + resource + "?" + serialize(params))
            .header("Accept", "application/json")
            .header("Authorization", "Bearer " + token.access_token)
            .header("Content-Type", "application/json")
            .end((response) => {
              if (response.statusType === 2) {
                resolve(response.body);
              } else if (response.statusType == 4) {
                setupOauth(true)
                  .then((token) => {
                    unirest
                      .get(
                        keys.baseURL + "/" + resource + "?" + serialize(params)
                      )
                      .header("Accept", "application/json")
                      .header("Authorization", "Bearer " + token.access_token)
                      .header("Content-Type", "application/json")
                      .end((response) => {
                        if (response.statusType === 2) {
                          resolve(response.body);
                        } else {
                          reject(response.body);
                        }
                      });
                  })
                  .catch((error) => {
                    reject(error);
                  });
              } else {
                reject(response.body);
              }
            });
        })
        .catch(reject);
    });
    return promise;
  };

  const create = (resource, params) => {
    const promise = new Promise((resolve, reject) => {
      setupOauth().then(() => {
        unirest
          .post(keys.baseURL + "/" + response)
          .header("Accept", "application/json")
          .header("Authorization", "Bearer" + token.access_token)
          .header("Content-Type", "application/json")
          .send(params)
          .end((response) => {
            if (response.statusType === 2) {
              resolve(response.body);
            } else if (response.statusType == 4) {
              setupOauth(true)
                .then((token) => {
                  unirest
                    .post(keys.baseURL + "/" + resource)
                    .header("Accept", "application/json")
                    .header("Authorization", "Bearer " + token.access_token)
                    .header("Content-Type", "application/json")
                    .send(params)
                    .end((response) => {
                      if (response.statusType === 2) {
                        resolve(response.body);
                      } else {
                        reject(response.body);
                      }
                    });
                })
                .catch((error) => {
                  reject(error);
                });
            } else {
              reject(response.body);
            }
          });
      });
    });
    return promise;
  };

  const patch = (resource, id, params) => {
    const promise = new Promise((resolve, reject) => {
      setupOauth()
        .then(keys.baseURL + "/" + resource + "/" + id)
        .header("Accept", "application/json")
        .header("Authorization", "Bearer " + token.access_token)
        .header("Content-Type", "application/json")
        .send(params)
        .end((response) => {
          if (response.statusType === 2) {
            resolve(response.body);
          } else if (response.statusType == 4) {
            setupOauth(true)
              .then((token) => {
                unirest
                  .patch(keys.baseURL + "/" + resource + "/" + id)
                  .header("Accept", "application/json")
                  .header("Authorization", "Bearer " + token.access_token)
                  .header("Content-Type", "application/json")
                  .send(params)
                  .end((response) => {
                    if (response.statusType === 2) {
                      resolve(response.body);
                    } else {
                      reject(response.body);
                    }
                  });
              })
              .catch((error) => {
                reject(error);
              });
          } else {
            reject(response.body);
          }
        });
    });
    return promise;
  };

  return {
    fetch: fetch,
    fetchAll: fetchAll,
    create: create,
    patch: patch,
  };
};
