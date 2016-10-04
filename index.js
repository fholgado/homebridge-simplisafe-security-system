var Service, Characteristic;
var simplisafe = require("simplisafe");

module.exports = function(homebridge){
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-simplisafe", "Homebridge-SimpliSafe", SimpliSafeSecuritySystemAccessory);
}

function SimpliSafeSecuritySystemAccessory(log, config) {
    this.log = log;

    this.httpMethod = config["http_method"] || "GET";
    this.auth = {
        username: config.auth.username,
        password: config.auth.password,
    },

    this.name = config["name"];
}

SimpliSafeSecuritySystemAccessory.prototype = {

    setTargetState: function(state, callback) {
        this.log("Setting state to %s", state);
        var state = null;

        switch (state) {
            case Characteristic.SecuritySystemTargetState.STAY_ARM:
            case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
                state = "home";
                break;
            case Characteristic.SecuritySystemTargetState.AWAY_ARM :
				state = "away";
                break;
            case Characteristic.SecuritySystemTargetState.DISARM:
				state = "off";
                break;
        }
        // Set state in simplisafe 'off' or 'home' or 'away'
		simplisafe({ user: this.auth.user, password: this.auth.password }, function (er, client) {
			if (er) this.log(er);
            client.setState(state, function() {
                callback(null, client.info.state);
            }); // this is really slow. Like 10-to-20 seconds slow
            client.logout(function(er) {}); // Log out, clean out the connection
		});
    },

    getState: function(callback) {
        simplisafe({ user: this.auth.user, password: this.auth.password }, function (er, client) {
            if (er) this.log(er);
            callback(null, client.info.state);
        });
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
        var securityService = new Service.SecuritySystem(this.name);

        securityService
            .getCharacteristic(Characteristic.SecuritySystemCurrentState)
            .on('get', this.getCurrentState.bind(this));

        securityService
            .getCharacteristic(Characteristic.SecuritySystemTargetState)
            .on('get', this.getTargetState.bind(this))
            .on('set', this.setTargetState.bind(this));

        return [securityService];
    }
};

