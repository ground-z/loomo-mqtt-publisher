var C = require('../constants'),
    BTTrilat = require('../trilateration/index'),
    userDB = require('../models/user'),
    mapDB = require('../models/map'),
    tourDB = require('../models/tours'),
    beaconDB = require('../models/beacons'),
    test = require('../test/test');

var mobileMessenger = {}
mobileMessenger.run = (client, mware) => {
    client.subscribe(`${C.M2S}/#`);

    client.on('message', (topic, message, packet) => {
        if (topic.startsWith(`${C.M2S}`)) {
            mware.writeLog(new Date().toString() + " Received '" + message + "' on '" + topic + "'");
            var JSONMessage = JSON.parse(message);
        }
        switch (topic) {
            case `${C.M2S}/${C.getMapDestinations}`:
                mapDB.findOne({
                        name: JSONMessage.mapName
                    })
                    .exec()
                    .then((map) => {
                        var msg = {
                            clientID: JSONMessage.clientID,
                            destinations: map.destinations,
                            mapName: map.name,
                            beacons: map.beaconIDs
                        }
                        client.publish(`${C.S2M}/${C.getMapDestinations}`, JSON.stringify(msg), () => {});
                        mware.writeLog(new Date().toString() + " Sent '" + JSON.stringify(msg) + "' to '" + `${C.S2M}/${C.getMapDestinations}` + "'");
                    });
                break;
            case `${C.M2S}/${C.beaconSignals}`:
                userDB.findOne({
                        id: JSONMessage.clientID
                    })
                    .exec()
                    .then((user) => {
                        BTTrilat.run(JSONMessage).then((response) => {
                            //what cells you are covering, if using proximity beacon
                            //TODO
                            if (user) {
                                userDB.findOneAndUpdate({
                                        id: JSONMessage.clientID
                                    }, {
                                        currentLocation: {
                                            x_coordinate: response.x,
                                            y_coordinate: response.y,
                                            timestamp: Date.now(),
                                            mapName: response.map
                                        },
                                        destination: JSONMessage.destination,
                                        mode: JSONMessage.mode
                                    }, {
                                        new: true
                                    })
                                    .exec()
                                    .then((updatedUser) => {});
                            } else {
                                const newUser = new userDB({
                                    id: JSONMessage.clientID,
                                    entity: "client",
                                    currentLocation: {
                                        x_coordinate: response.x,
                                        y_coordinate: response.y,
                                        timestamp: Date.now(),
                                        mapName: response.map
                                    },
                                    destination: JSONMessage.destination,
                                    mode: JSONMessage.mode
                                });
                                newUser.save((err) => {
                                    if (err) console.log(err);
                                });
                            }
                            userDB.findOne({
                                    status: 'available'
                                })
                                .exec()
                                .then((loomo) => {
                                    if (loomo) {
                                        mapDB.findOne({
                                                name: JSONMessage.mapName
                                            })
                                            .exec()
                                            .then((map) => {
                                                // JSONMessage.signalsArray is an array of key-value pairs
                                                // the key is the beacon ID and the value is an array of RSSIs
                                                // const signalsArray = JSONMessage.beaconSignals
                                                //     .map((entry) => {
                                                //         entryArray = Object.entries(entry)[0];
                                                //         console.log("Entry: ", JSON.stringify(entryArray));
                                                //         const signals = JSON.parse(entryArray[1]);
                                                //         return [entryArray[0], mware.getDistance(signals)];
                                                //     });

                                                // // sorts by signal strength in ascending order
                                                // signalsArray.sort((lhs, rhs) => {
                                                //     return rhs[1] - lhs[1];
                                                // });

                                                // const [beaconId, signal] = [signalsArray[0][0], signalsArray[0][1]];

                                                const beaconID = JSONMessage.beaconID

                                                beaconDB.findOne({
                                                        id: beaconID
                                                    })
                                                    .exec()
                                                    .then((beaconObj) => {
                                                        var msg = {
                                                            clientID: JSONMessage.clientID,
                                                            loomoID: loomo.id,
                                                            // x_user: Math.round(test.convertToServerCoord(5)),
                                                            // y_user: Math.round(test.convertToServerCoord(8)),
                                                            x_user: Math.round(test.convertToServerCoord(beaconObj.x_coordinate)),
                                                            y_user: Math.round(test.convertToServerCoord(beaconObj.y_coordinate)),
                                                            mode: JSONMessage.mode
                                                        }
                                                        if (JSONMessage.mode == "guide") {
                                                            destinationObj = map.destinations.find((element) => {
                                                                if (element.name == JSONMessage.destination) {
                                                                    return element;
                                                                }
                                                            });
                                                                // msg.x_destination = 12,
                                                                // msg.y_destination = 5,
                                                                // msg.thetha_destination = 0,
                                                                msg.thetha_destination = destinationObj.thetha
                                                                msg.x_destination = destinationObj.x_coordinate
                                                                msg.y_destination = destinationObj.y_coordinate
                                                                msg.destination_name = destinationObj.name
                                                            client.publish(`${C.S2L}/${C.loomoCall}`, JSON.stringify(msg), () => {});
                                                            mware.writeLog(new Date().toString() + " Sent '" + JSON.stringify(msg) + "' to '" + `${C.S2L}/${C.loomoCall}` + "'");
                                                        } else if (JSONMessage.mode == "tour") {
                                                            tourDB.findOne({
                                                                    name: JSONMessage.tour
                                                                })
                                                                .exec()
                                                                .then((tour) => {
                                                                    msg.tourName = tour.name;
                                                                    client.publish(`${C.S2L}/${C.loomoCall}`, JSON.stringify(msg), () => {});
                                                                    mware.writeLog(new Date().toString() + " Sent '" + JSON.stringify(msg) + "' to '" + `${C.S2L}/${C.loomoCall}` + "'");
                                                                });
                                                        } else {
                                                            client.publish(`${C.S2L}/${C.loomoCall}`, JSON.stringify(msg), () => {});
                                                            mware.writeLog(new Date().toString() + " Sent '" + JSON.stringify(msg) + "' to '" + `${C.S2L}/${C.loomoCall}` + "'");
                                                        }
                                                    });
                                            });
                                    } else {
                                        var msg = {
                                            clientID: JSONMessage.clientID,
                                            status: 'unavailable'
                                        };
                                        client.publish(`${C.S2M}/${C.loomoStatus}`, JSON.stringify(msg), () => {});
                                        mware.writeLog(new Date().toString() + " Sent '" + JSON.stringify(msg) + "' to '" + `${C.S2M}/${C.loomoStatus}` + "'");
                                    }
                                });
                        }).catch((err) => {
                            console.log(err);
                        });
                    });
                break;
            case `${C.M2S}/${C.startJourney}`:
                var msg = {
                    loomoID: JSONMessage.loomoID,
                    clientID: JSONMessage.clientID
                }
                mware.writeLog(new Date().toString() + " Sent '" + JSON.stringify(msg) + "' to '" + `${C.S2L}/${C.startJourney}` + "'");
                client.publish(`${C.S2L}/${C.startJourney}`, JSON.stringify(msg), () => {});
                break;
            case `${C.M2S}/${C.getTours}`:
                tourDB.findOne({
                        mapName: JSONMessage.mapName
                    })
                    .exec()
                    .then((tour) => {
                        var msg2 = {
                            clientID: JSONMessage.clientID,
                            tour: tour,
                            mapName: JSONMessage.mapName
                        }
                        client.publish(`${C.S2M}/${C.getTours}`, JSON.stringify(msg2), () => {});
                        mware.writeLog(new Date().toString() + " Sent '" + JSON.stringify(msg2) + "' to '" + `${C.S2M}/${C.getTours}` + "'");
                    });
                break;
            case `${C.M2S}/${C.loomoDismiss}`:
                var msg = {
                    loomoID: JSONMessage.loomoID,
                    clientID: JSONMessage.clientID
                };
                userDB.findOneAndUpdate({
                        id: JSONMessage.loomoID
                    }, {
                        status: 'available'
                    }, {
                        new: true
                    })
                    .exec()
                    .then((newLoomo) => {
                        console.log(newLoomo.status);
                    }).catch((err) => {
                        console.log(err);
                    });
                mware.writeLog(new Date().toString() + " Sent '" + JSON.stringify(msg) + "' to '" + `${C.S2L}/${C.loomoDismiss}` + "'");
                client.publish(`${C.S2L}/${C.loomoDismiss}`, JSON.stringify(msg), () => {});
                break;
        }
    });
}

module.exports = mobileMessenger;