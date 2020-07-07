# NOTE
This project is archived and no longer maintained. Please instead refer to: https://github.com/nzapponi/homebridge-simplisafe3

# homebridge-simplisafe-security-system

This project is a [Homebridge](https://github.com/nfarina/homebridge) pluging that allows you to control your SimpliSafe alarm system with the iOS 10 Home app as well as through Siri. This project uses the [SimpliSafe SS3 node.js wrapper](https://github.com/chowielin/simplisafe-ss3-nodejs). To use this, you must have a working Homebridge server running in your network.

## Screenshots
![View from the home app](/screenshots/IMG_0064.jpg?raw=true "View from the Home app.")
![Controlling alarm system](/screenshots/IMG_0065.jpg?raw=true "Controlling the alarm system.")

## Notes
- The "night" toggle in the iOS 10 Home App UI sets the alarm state to "home" in SimpliSafe. This is due to SimpliSafe not having a dedicated "night" mode.
- Usage of this plugin requires the extra $10/month online monitoring plan, since that enables the required API endpoints to control the alarm remotely.

## Installation
    npm install -g git+https://github.com/chowielin/homebridge-simplisafe-security-system.git


## Configuration
    {
        "bridge": {
            "name": "Homebridge",
            "username": "CC:22:3D:E3:CE:30",
            "port": 51826,
            "pin": "031-45-154"
        },

        "accessories": [
            {
                "accessory": "Homebridge-SimpliSafe",
                "name": "Alarm System",
                "auth": {
                    "username": "your@email.com", // your SimpliSafe username
                    "password": "yourawesomepassword" // your SimpliSafe password
                }
            }
        ]
    }
