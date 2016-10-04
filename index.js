var Service, Characteristic;
var simplisafe = require("simplisafe");

module.exports = function(homebridge){
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-simplisafe", "Homebridge-SimpliSafe", SimpliSafeSecuritySystemAccessory);
}

function SimpliSafeSecuritySystemAccessory(log, config) {

    this.log = log;

    this.auth = {
        username: config.auth.username,
        password: config.auth.password,
    };

    this.name = config["name"];

    this.convertSimpliSafeStateToHomeKitState = function(simpliSafeState) {
        switch (simpliSafeState) {
            case "home":
                return Characteristic.SecuritySystemCurrentState.STAY_ARM;
            case "away":
                return Characteristic.SecuritySystemCurrentState.AWAY_ARM;
            case "off":
                return Characteristic.SecuritySystemCurrentState.DISARMED;
            default:
                return 3;
        };
    };

    this.getSimpliSafeSession = function() {
        simplisafe({ user: this.auth.username, password: this.auth.password }, function (er, client) {
            if (er) {
                return er;
            } else {
                return client;
            }
        });
    };

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
		simplisafe({ user: this.auth.username, password: this.auth.password }, function (er, client) {
			if (er) callback(er);
            client.setState(state, function(error) {
                if (error) {
                    callback(error);
                } else {
                    var homeKitState = this.convertSimpliSafeStateToHomeKitState(client.info.state);
                    this.service.setCharacteristic(Characteristic.SecuritySystemCurrentState, homeKitState);
                    callback(null, homeKitState);
                }
                client.logout(function(er) {}); // Log out, clean out the connection
            }); // this is really slow. Like 10-to-20 seconds slow
		}.bind(this));
    },

    getState: function(callback) {
        simplisafe({ user: this.auth.username, password: this.auth.password }, function (er, client) {
            if (er) {
                callback(er);
            } else {
                callback(null, this.convertSimpliSafeStateToHomeKitState(client.info.state));
            }
        }.bind(this));
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

        this.service = new Service.SecuritySystem(this.name);

        this.service
            .getCharacteristic(Characteristic.SecuritySystemCurrentState)
            .on('get', this.getCurrentState.bind(this));

        this.service
            .getCharacteristic(Characteristic.SecuritySystemTargetState)
            .on('get', this.getTargetState.bind(this))
            .on('set', this.setTargetState.bind(this));

        return [this.service];

    }
};

