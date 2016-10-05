# homebridge-simplisafe

This project allows you to control your SimpliSafe alarm system with the iOS 10 Home app as well as through Siri. 

## Installation
    npm install -g homebridge-simplisafe

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
