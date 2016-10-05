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
    };

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
        };
    };

    this.convertSimpliSafeStateToHomeKitState = function(simpliSafeState) {
        switch (simpliSafeState) {
            case "home":
                return Characteristic.SecuritySystemTargetState.STAY_ARM;
                break;
            case "away":
                return Characteristic.SecuritySystemTargetState.AWAY_ARM;
                break;
            case "off":
                return Characteristic.SecuritySystemTargetState.DISARM;
                break;
        };
    };
}

SimpliSafeSecuritySystemAccessory.prototype = {

    setTargetState: function(state, callback) {
        this.log("Setting state to %s", state);

        var self = this;
        // Set state in simplisafe 'off' or 'home' or 'away'
        simplisafe({ user: this.auth.username, password: this.auth.password }, function (er, client) {
            self.log(er, client);
            self.log("Setting alarm state to:", state);
            client.setState(self.convertHomeKitStateToSimpliSafeState(state), function() {
                if (client && client.info && client.info.state) {
                    self.log("Callback for set state state to:", client.info.state);
                    // Important: after a successful server response, we update the current state of the system
                    self.securityService.setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
                    callback(null, state);
                    client.logout(function(er) {}); // Log out, clean out the connection
                }
            }); // this is really slow. Like 10-to-20 seconds slow
        });
    },

    getState: function(callback) {
        var self = this;
        simplisafe({ user: this.auth.username, password: this.auth.password }, function (er, client) {
            if (client && client.info && client.info.state) {
                self.log("getting alarm state:", client.info.state);
                callback(null, self.convertSimpliSafeStateToHomeKitState(client.info.state));
            }
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
