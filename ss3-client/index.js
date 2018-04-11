require('any-promise/register/q')

var request = require('request-promise-any')
var Q = require('q')

var logFunc

function log(msg) {
	if (logFunc) {
		logFunc(msg)
	}
}

function logErr(msg, err) {
	var fullMsg = msg + (err ? (' ' + err.message) : '')
	log(fullMsg)
}

function SS3Client(username, password, retryInSec, retries, loggerFunc) {
	this.username = username
	this.password = password
	this.retryInSec = retryInSec || 1
	this.retries = retries || 3
	logFunc = loggerFunc
}

SS3Client.prototype.login = function() {
	var thisObj = this
	return this.initToken()
		.then(function() {
			return thisObj.initUserId()
		}, function(err) {
			logErr('SS3Client: Failed to login', err)
			throw err
		})
		.then(function() {
			return thisObj.initSubId()
		})
}

SS3Client.prototype.initToken = function() {
	var thisObj = this
	return request.post({
		url: 'https://api.simplisafe.com/v1/api/token',
		json: true,
		jar: true,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Authorization': 'Basic NGRmNTU2MjctNDZiMi00ZTJjLTg2NmItMTUyMWIzOTVkZWQyLjEtMC0wLldlYkFwcC5zaW1wbGlzYWZlLmNvbTo='
		},
		body:
			{
				"grant_type": "password",
				"device_id": "WebApp",
				"username": thisObj.username,
				"password": thisObj.password
			}

	}).then(function(parsedBody) {
		var token = parsedBody.access_token
		log('SS3Client new token: ' + token)
		thisObj.token = token
		thisObj.expires_in = parsedBody.expires_in
		thisObj.token_type = parsedBody.token_type
		var expireDate = new Date()
		expireDate.setSeconds(expireDate.getSeconds() + Math.round(thisObj.expires_in * 0.9));
		thisObj.expireDate = expireDate
	}, function(err) {
		logErr('SS3Client: Failed to initToken:', err)
		throw err
	})
}

SS3Client.prototype.isExpired = function() {
	var currDate = new Date()
	return currDate > this.expireDate
}

var initTokenQueue = []
var initTokenInProgress = false

function resolveTokenQueue() {
	while (initTokenQueue.length) {
		var deferred = initTokenQueue.pop()
		deferred.resolve()
	}
	initTokenInProgress = false
}

SS3Client.prototype.initTokenIfNeeded = function() {
	if (initTokenInProgress) {
		// create deferred and add to queue
		var deferred = Q.defer()
		initTokenQueue.push(deferred)
		return deferred.promise
	}

	initTokenInProgress = true

	// check if queue is
	var thisObj = this
	return this.authCheck()
		.then(function() {
			if (thisObj.isExpired()) {
				log('SS3Client Auth check passed, but token is about to expire so acquiring new token. old token: ' + thisObj.token)
				return thisObj.initToken()
			} else {
				var deferred = Q.defer()
				deferred.resolve()
				return deferred.promise
			}
		}, function() {
			log('SS3Client Auth check failed so acquiring new token. old token: ' + thisObj.token)
			return thisObj.initToken()
		})
		.finally(resolveTokenQueue)
}

SS3Client.prototype.invokeSSGet = function(reqOptions) {
	var thisObj = this
	return this.initTokenIfNeeded()
		.then(function() {
			reqOptions.headers = {
				'Content-Type': 'application/json; charset=utf-8',
				'Authorization': thisObj.token_type + ' ' + thisObj.token
			}
			return request.get(reqOptions)
		})
}

SS3Client.prototype.invokeSSPost = function(reqOptions) {
	var thisObj = this
	return this.initTokenIfNeeded()
		.then(function() {
			reqOptions.headers = {
				'Content-Type': 'application/json; charset=utf-8',
				'Authorization': thisObj.token_type + ' ' + thisObj.token
			}
			return request.post(reqOptions)
		})
}

SS3Client.prototype.initUserId = function() {
	var thisObj = this
	return this.getUserId()
		.then(function(parsedBody) {
			var userId = parsedBody.userId
			thisObj.userId = userId
		})
}

SS3Client.prototype.initSubId = function() {
	var thisObj = this
	var reqOptions = {
		url: 'https://api.simplisafe.com/v1/users/' + thisObj.userId + '/subscriptions?activeOnly=false',
		json: true,
		jar: true
	}
	return this.invokeSSGet(reqOptions)
		.then(function(parsedBody) {
				var subId = parsedBody.subscriptions[0].sid
				thisObj.subId = subId
			}
		)
}

/**
 * Set the alarm state
 *
 * @param state One of 'off', 'home', 'away'
 * @returns {*|PromiseLike<T>|Promise<T>}
 */
SS3Client.prototype.setState = function(state) {
	var thisObj = this
	var reqOptions = {
		url: 'https://api.simplisafe.com/v1/ss3/subscriptions/' + thisObj.subId + '/state/' + state,
		json: true,
		jar: true
	}
	return this.invokeSSPost(reqOptions)
}

SS3Client.prototype.authCheck = function() {
	var thisObj = this
	var reqOptions = {
		url: 'https://api.simplisafe.com/v1/api/authCheck',
		json: true,
		jar: true,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Authorization': thisObj.token_type + ' ' + thisObj.token
		}
	}
	return request.get(reqOptions)
}

SS3Client.prototype.getUserId = function() {
	var thisObj = this
	var reqOptions = {
		url: 'https://api.simplisafe.com/v1/api/authCheck',
		json: true,
		jar: true
	}
	return this.invokeSSGet(reqOptions)
}

SS3Client.prototype.getSub = function(subId) {
	var thisObj = this
	var reqOptions = {
		url: 'https://api.simplisafe.com/v1/subscriptions/' + subId + '/',
		json: true,
		jar: true
	}
	return this.invokeSSGet(reqOptions)
}

/**
 *
 * @returns {PromiseLike<T> | Promise<T>} Can be one of OFF, HOME, AWAY, AWAY_COUNT, HOME_COUNT
 */
SS3Client.prototype.getAlarmState = function() {
	var retriesLeft = this.retries
	var self = this
	return this.getAlarmStateNoRetry()
		.then(function(alarmState) {
			if (alarmState === 'error') {
				log('SS3Client got alarm state: ' + alarmState + ' so retrying getAlarmState in ' + self.retryInSec + ' seconds')
				var getAlarmStateFunc = self.getAlarmStateNoRetry.bind(self)
				var deferred = Q.defer()

				function retryGetAlarmState(retriesLeft) {
					retriesLeft--
					log('SS3Client retrying getAlarmState, retriesLeft: ' + retriesLeft)
					getAlarmStateFunc()
						.then(function(alState) {
							if (alState === 'error' && retriesLeft > 0) {
								log('SS3Client got alarm state: ' + alarmState + ' so retrying getAlarmState in ' + self.retryInSec + ' seconds')
								setTimeout(retryGetAlarmState, self.retryInSec * 1000, retriesLeft)
							} else {
								deferred.resolve(alState)
							}
						})
				}

				setTimeout(retryGetAlarmState, self.retryInSec * 1000, retriesLeft)
				return deferred.promise
			} else {
				return alarmState
			}
		})
}

SS3Client.prototype.getAlarmStateNoRetry = function() {
	return this.getSub(this.subId)
		.then(function(parsedBody) {
			var alarmState = parsedBody.subscription.location.system.alarmState
			return alarmState
		})
}

/*
{
  "account": "xxx",
  "success": true,
  "sensors": [
    {
      "status": {

      },
      "setting": {
        "alarm": 1
      },
      "name": "Master BR",
      "serial": "xxx",
      "type": 3,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {

      },
      "setting": {
        "instantTrigger": false,
        "away2": 1,
        "away": 1,
        "home2": 0,
        "home": 0,
        "off": 0
      },
      "name": "Family Room",
      "serial": "xxx",
      "type": 4,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {

      },
      "setting": {
        "instantTrigger": false,
        "away2": 1,
        "away": 1,
        "home2": 0,
        "home": 0,
        "off": 0
      },
      "name": "Dining Room",
      "serial": "xxx",
      "type": 4,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {

      },
      "setting": {
        "instantTrigger": false,
        "away2": 1,
        "away": 1,
        "home2": 0,
        "home": 0,
        "off": 0
      },
      "name": "Upstairs",
      "serial": "xxx",
      "type": 4,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {
        "triggered": false
      },
      "setting": {
        "alarm": 1
      },
      "name": "Powder Room",
      "serial": "xxx",
      "type": 9,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {
        "triggered": false
      },
      "setting": {
        "alarm": 1
      },
      "name": "Bathroom",
      "serial": "xxx",
      "type": 9,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {
        "triggered": false
      },
      "setting": {
        "alarm": 1
      },
      "name": "Master Bath",
      "serial": "xxx",
      "type": 9,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {
        "triggered": false
      },
      "setting": {
        "alarm": 1
      },
      "name": "Waterheater",
      "serial": "xxx",
      "type": 9,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {
        "test": false,
        "tamper": false,
        "malfunction": false,
        "triggered": false
      },
      "setting": {

      },
      "name": "Bedroom",
      "serial": "xxx",
      "type": 8,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {
        "test": false,
        "tamper": false,
        "malfunction": false,
        "triggered": false
      },
      "setting": {

      },
      "name": "Office",
      "serial": "xxx",
      "type": 8,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {

      },
      "setting": {
        "alarmVolume": 3,
        "doorChime": 0,
        "exitBeeps": 2,
        "entryBeeps": 2
      },
      "name": "Front Door",
      "serial": "xxx",
      "type": 13,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {
        "triggered": false
      },
      "setting": {
        "instantTrigger": false,
        "away2": 1,
        "away": 1,
        "home2": 1,
        "home": 1,
        "off": 0
      },
      "name": "Patio Door",
      "serial": "xxx",
      "type": 5,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {
        "triggered": false
      },
      "setting": {
        "instantTrigger": false,
        "away2": 1,
        "away": 1,
        "home2": 1,
        "home": 1,
        "off": 0
      },
      "name": "Back Door",
      "serial": "xxx",
      "type": 5,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {
        "triggered": false
      },
      "setting": {
        "instantTrigger": false,
        "away2": 1,
        "away": 1,
        "home2": 1,
        "home": 1,
        "off": 0
      },
      "name": "Front Door",
      "serial": "xxx",
      "type": 5,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {
        "triggered": false
      },
      "setting": {
        "instantTrigger": false,
        "away2": 1,
        "away": 1,
        "home2": 1,
        "home": 1,
        "off": 0
      },
      "name": "Garage",
      "serial": "xxx",
      "type": 5,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    },
    {
      "status": {

      },
      "setting": {
        "lowPowerMode": false,
        "alarm": 1
      },
      "name": "Front Door",
      "serial": "xxx",
      "type": 1,
      "flags": {
        "swingerShutdown": false,
        "lowBattery": false,
        "offline": false
      }
    }
  ],
  "lastUpdated": 1523220141,
  "lastSynced": 1523220141,
  "lastStatusUpdate": 1523220138
}
 */
SS3Client.prototype.getSensors = function() {
	var thisObj = this
	var reqOptions = {
		url: 'https://api.simplisafe.com/v1/ss3/subscriptions/' + thisObj.subId + '/sensors?forceUpdate=false',
		json: true,
		jar: true
	}
	return this.invokeSSGet(reqOptions)
}

module.exports = SS3Client