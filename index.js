var SS3Client = require('simplisafe-ss3')
var Service, Characteristic;

module.exports = function(homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-simplisafe", "Homebridge-SimpliSafe", SimpliSafeSecuritySystemAccessory);
}

var ss3Client

function SimpliSafeSecuritySystemAccessory(log, config) {
	this.log = log;

	ss3Client = new SS3Client(config.auth.username, config.auth.password, config.auth.retryInSec, config.auth.retries, log)

	ss3Client.login()
		.then(function() {
			log('User ID: ' + ss3Client.userId)
			log('Sub ID: ' + ss3Client.subId)
			log('Initial token: ' + ss3Client.token)
			return ss3Client.getAlarmState()
		}, function(err) {
			log('Login failed due to: ' + err.message)
			throw err
		})
		.then(function(alarmState) {
			log('Initial alarm state: ' + alarmState)
		})

	this.name = config["name"];

	this.convertHomeKitStateToSimpliSafeState = function(homeKitState) {
		switch (homeKitState) {
			case Characteristic.SecuritySystemTargetState.STAY_ARM:
			case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
				return "home";
				break;
			case Characteristic.SecuritySystemTargetState.AWAY_ARM :
				return "away";
				break;
			case Characteristic.SecuritySystemTargetState.DISARM:
				return "off";
				break;
		}
		;
	};

	this.convertSimpliSafeStateToHomeKitState = function(simpliSafeState) {
		switch (simpliSafeState) {
			case "HOME":
			case 'HOME_COUNT':
				return Characteristic.SecuritySystemTargetState.STAY_ARM;
				break;
			case "AWAY":
			case 'AWAY_COUNT':
			case 'ALARM_COUNT':
				return Characteristic.SecuritySystemTargetState.AWAY_ARM;
				break;
			case "OFF":
				return Characteristic.SecuritySystemTargetState.DISARM;
				break;
			default:
				log('Could not resolve SS state: ' + simpliSafeState + ' to Homekit security system state')
				return null
				break;
		}
		;
	};
}

SimpliSafeSecuritySystemAccessory.prototype = {

	setTargetState: function(state, callback) {
		this.log("Setting state to %s", state);

		var self = this;
		// Set state in simplisafe 'off' or 'home' or 'away'

		ss3Client.setState(self.convertHomeKitStateToSimpliSafeState(state))
			.then(function() {
				// Important: after a successful server response, we update the current state of the system
				self.securityService.setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
				callback(null, state);
			}, function() {
				callback(new Error('Failed to set target state to ' + state))
			})
	},

	getState: function(callback) {
		var self = this;
		ss3Client.getAlarmState().then(function(state) {
			self.log("got SS alarm state:", state);
			callback(null, self.convertSimpliSafeStateToHomeKitState(state));
		}, function() {
			callback(new Error('Failed to get alarm state'))
		})
	},

	getCurrentState: function(callback) {
		this.log("Getting current state");
		this.getState(callback);
	},

	getTargetState: function(callback) {
		this.log("Getting target state");
		this.getState(callback);
	},

	identify: function(callback) {
		this.log("Identify requested!");
		callback(); // success
	},

	getServices: function() {
		this.securityService = new Service.SecuritySystem(this.name);

		this.securityService
			.getCharacteristic(Characteristic.SecuritySystemCurrentState)
			.on('get', this.getCurrentState.bind(this));

		this.securityService
			.getCharacteristic(Characteristic.SecuritySystemTargetState)
			.on('get', this.getTargetState.bind(this))
			.on('set', this.setTargetState.bind(this));

		return [this.securityService];
	}
};
