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
	this.retryInSec = retryInSec || 3
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

SS3Client.prototype.initTokenIfNeeded = function() {
	var thisObj = this
	return this.authCheck()
		.then(function() {
			if (thisObj.isExpired()) {
				log('Auth check passed, but token is about to expire so acquiring new token')
				return thisObj.initToken()
			} else {
				var deferred = Q.defer()
				deferred.resolve()
				return deferred.promise
			}
		}, function() {
			log('Auth check failed so acquiring new token')
			return thisObj.initToken()
		})
}

SS3Client.prototype.invokeSSGet = function(reqOptions) {
	return this.initTokenIfNeeded()
		.then(function() {
			return request.get(reqOptions)
		})
}

SS3Client.prototype.invokeSSPost = function(reqOptions) {
	return this.initTokenIfNeeded()
		.then(function() {
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
		jar: true,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Authorization': thisObj.token_type + ' ' + thisObj.token
		}
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
		jar: true,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Authorization': thisObj.token_type + ' ' + thisObj.token
		}
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
		jar: true,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Authorization': thisObj.token_type + ' ' + thisObj.token
		}
	}
	return this.invokeSSGet(reqOptions)
}

SS3Client.prototype.getSub = function(subId) {
	var thisObj = this
	var reqOptions = {
		url: 'https://api.simplisafe.com/v1/subscriptions/' + subId + '/',
		json: true,
		jar: true,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Authorization': thisObj.token_type + ' ' + thisObj.token
		}
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
				log('get alarm state: ' + alarmState + ' so retrying getAlarmState in ' + self.retryInSec + ' seconds')
				var getAlarmStateFunc = self.getAlarmStateNoRetry.bind(self)
				var deferred = Q.defer()

				function retryGetAlarmState(retriesLeft) {
					retriesLeft--
					getAlarmStateFunc()
						.then(function(alState) {
							if (alState === 'error' && retriesLeft > 0) {
								log('get alarm state: ' + alarmState + ' so retrying getAlarmState in ' + self.retryInSec + ' seconds')
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

module.exports = SS3Client