/*
 * Serve JSON to our AngularJS client
 */

var _ = require("underscore");
var async = require("async");
var winston = require("winston");

var lastfmDao = null;
var mongoDao = null;
var cacheClient = null;

exports.init = function(lfm, mng, cache) {
	lastfmDao = lfm;
	mongoDao = mng;
	cacheClient = cache;
};

exports.loginUrl = function (req, res) {
	res.json({
		loginUrl: 'http://www.last.fm/api/auth/?api_key=' + process.env.SA_LASTFM_API_KEY +
			'&cb=' + process.env.SA_BASE_URL + '/login'
	});
};

exports.userDetails = function (req, res) {
	var session = req.cookies['lastfmSession'];
	if (!session) {
		res.json({
			username: null,
			listening: null,
			scrobbles: null
		});
		return;
	}

	mongoDao.getUserData(session, function (err, record) {
		if (err) {
			winston.error("Error loading user:", err);
			res.status(500).send('Error loading user from database');
		}
		else if (!record) {
			res.json({
				username: null,
				listening: null,
				scrobbles: null,
				scrobbleTimeoutTime: null,
				scrobbleTimeoutEnabled: false
			});
		}
		else if (!record['_id']) {
			winston.error("Invalid user record:", record);
			res.status(500).send('Invalid record in database');
		}
		else {
			res.json({
				username: record['_id'],
				listening: record['listening'],
				scrobbles: record['scrobbles'],
				scrobbleTimeoutTime: record['scrobbleTimeoutTime'],
				scrobbleTimeoutEnabled: record['scrobbleTimeoutEnabled'],
			});
		}
	});

};

var cacheRespond = function(key, expires, nocache, res, callback) {
	if (nocache) {
		winston.info("Skipping cache", key);
		callback(function() { });
		return;
	}
	
	cacheClient.get(key, function(err, value) {
		if (value) {
			winston.info("Returning from cache", { key:key, value:value.toString() });
			res.setHeader('Content-Type', 'application/json');
			res.send(value.toString());
		}
		else {
			callback(function(data) {
				winston.info("Updating cache", { key:key, value:data, expires:expires });
				cacheClient.set(key, JSON.stringify(data), null, expires);
			});
		}
	});
};

exports.stations = function (req, res) {
	cacheRespond("all-stations", 12*60*60, 'nocache' in req.query, res, function(updateCallback) {
		mongoDao.getStations(function (err, stationArray) {
			if (err) {
				winston.error("Error loading stations:", err);
				res.status(500).send('Error loading stations from database');
			}
			else if (!stationArray) {
				winston.error("Invalid station records:", stationArray);
				res.status(500).send('Invalid result from database');
			}
			else {
				var stations = [];
				_.each(stationArray, function(record) {
					if (record && record['_id'] && record['disabled'] != "true") {
						var curStation = {
							lastfmUsername: record['_id'],
							stationUrl: record['stationUrl'],
							streamUrl: record['streamUrl'],
							lastfmProfileImage: ('profileImageUrl' in record ? record['profileImageUrl'] : null)
						};

						var recentTracks = [];
						if ('nowPlayingArtist' in record && 'nowPlayingTrack' in record) {
							recentTracks.push({ artist: record['nowPlayingArtist'], name: record['nowPlayingTrack'], nowPlaying: true });
						}
						if ('lastPlayedArtist' in record && 'lastPlayedTrack' in record) {
							recentTracks.push({ artist: record['lastPlayedArtist'], name: record['lastPlayedTrack'], nowPlaying: false });
						}

						curStation.recentTracks = recentTracks;

						stations.push(curStation);
					}
				});

				updateCallback(stations);
				res.json(stations);
			}
		});
	});
};

exports.userLastfmInfo = function(req, res) {
	if (!req.query || !req.query.user) {
		res.json({ lastfmProfileImage: null });
		return;
	}

	cacheRespond("user-lastfm-" + req.query.user, 12*60*60, 'nocache' in req.query, res, function(updateCallback) {
		lastfmDao.getUserInfo(req.query.user, function(err, details) {
			if (err || !details.lastfmProfileImage) {
				winston.error("Error getting user info for user:", err);
				res.status(500).send('Error loading user last.fm details');
			}
			else {
				var result = { lastfmProfileImage: details.lastfmProfileImage };
				updateCallback(result);
				res.json(result);
			}
		});
	});
};

exports.stationLastfmInfo = function(req, res) {
	if (!req.query || !req.query.stations) {
		res.json([]);
		return;
	}

	var stations = req.query.stations.split(",");
	if (stations.length == 0) {
		res.json([]);
		return;
	}

	cacheRespond("station-lastfm-info-v2-" + req.query.stations, 12*60*60, 'nocache' in req.query, res, function(updateCallback) {
		var stationDetails = {};
		async.map(stations, lastfmDao.getUserInfo, function(err, results) {
			if (err) {
				winston.error("Error getting station last.fm details:", err);
				res.status(500).send('Error getting station last.fm details');
				return;
			}

			if (results.length != stations.length) {
				winston.warn("Couldn't get LastFM details for all stations", { stations: stations, results: results });
			}

			for (var i=0; i < stations.length; i++) {
				stationDetails[stations[i]] = results[i];
			}

			updateCallback(stationDetails);
			res.json(stationDetails);
		});
	});
};

exports.stationLastfmTasteometer = function(req, res) {
	if (!req.query || !req.query.stations || !req.query.user) {
		res.json([]);
		return;
	}

	var stations = req.query.stations.split(",");
	if (stations.length == 0) {
		res.json([]);
		return;
	}

	cacheRespond("station-lastfm-tasteometer-v2-" + req.query.user + "-" + req.query.stations, 12*60*60, 'nocache' in req.query, res, function(updateCallback) {
		var tasteometerData = [];
		_.each(stations, function(station) {
			tasteometerData.push({ user1: req.query.user, user2: station });
		});

		var tasteometerResults = {};
		async.map(tasteometerData, lastfmDao.getTasteometer, function(err, results) {
			if (err || results.length != tasteometerData.length) {
				winston.error("Error getting tasteometer:", err);
				res.status(500).send('Error getting station last.fm tasteometer');
				return;
			}

			for (var i=0; i < tasteometerData.length; i++) {
				tasteometerResults[tasteometerData[i].user2] = { tasteometer: results[i] * 100 }; // convert to percentage
			}

			updateCallback(tasteometerResults);
			res.json(tasteometerResults);
		});
	});
};

exports.stationLastfmRecentTracks = function(req, res) {
	if (!req.query || !req.query.stations) {
		res.json({});
		return;
	}

	var stations = req.query.stations.split(",");
	if (stations.length == 0) {
		res.json({});
		return;
	}

	cacheRespond("station-lastfm-recenttracks-v2-" + req.query.stations, 20, 'nocache' in req.query, res, function(updateCallback) {
		var recentTrackResults = {};
		async.map(stations, lastfmDao.getRecentTracks, function(err, results) {
			if (err && (!results || results.length == 0)) {
				winston.error("Error getting recent tracks:", err);
				res.status(500).send('Unexpected results while getting station\'s recent tracks');
				return;
			}

			var successCount = 0;
			for (var i=0; i < stations.length; i++) {
				if (results[i]) {
					recentTrackResults[stations[i]] = { recentTracks: results[i] };
					successCount++;
				}
			}

			// Only update cache if we got all stations back
			if (successCount == stations.length) {
				updateCallback(recentTrackResults);
			}
			else {
				winston.warn("Did not get recent tracks for all stations in request, expected " + stations.length
					+ " but got " + successCount);
			}

			res.json(recentTrackResults);
		});
	});
};

var updateScrobbling = function(req, res, stationName) {
	// Load user details from cookie
	var session = req.cookies['lastfmSession'];
	if (!session) {
		winston.error("Session cookie not provided when stopping scrobble");
		res.status(500).send("Session cookie is required to stop scrobbling");
		return;
	}

	mongoDao.getUserData(session, function (err, record) {
		if (err || !record || !record['_id']) {
			winston.error("Error loading user while stopping scrobble:", err);
			res.status(500).send('Error stopping scrobble');
			return;
		}
		var username = record['_id'];
		mongoDao.setUserScrobbling(username, stationName, function(err, userDetails) {
			if (err) {
				winston.error("Error setting user as not scrobbling:", err);
				res.status(500).send('Error stopping scrobble');
			}
			else {
				res.json({
					username: userDetails['_id'],
					listening: userDetails['listening'],
					scrobbles: userDetails['scrobbles'],
					scrobbleTimeoutTime: userDetails['scrobbleTimeoutTime'],
					scrobbleTimeoutEnabled: userDetails['scrobbleTimeoutEnabled']
				});
			}
		});
	});
}

exports.stopScrobbling = function(req, res) {
	updateScrobbling(req, res, null);
};

exports.scrobbleAlong = function(req, res) {
	if (!req.body || !req.body.username) {
		winston.error("Station username was not provided in request to scrobble");
		res.status(500).send('Station username must be provided');
		return;
	}
	updateScrobbling(req, res, req.body.username);
};

exports.scrobbleTimeoutEnable = function(req, res) {
	if (!req.body || !('enabled' in req.body)) {
		winston.error("Scrobble timeout enable had invalid body");
		res.status(500).send('Invalid request body');
		return;
	}

	var session = req.cookies['lastfmSession'];
	if (!session) {
		winston.error("Session cookie not provided when enabling/disabling scrobble timeout");
		res.status(500).send("Session cookie is required to enable/disable scrobble timeout");
		return;
	}

	mongoDao.getUserData(session, function (err, record) {
		if (err || !record || !record['_id']) {
			winston.error("Error loading user while enabling/disabling scrobble timeout:", err);
			res.status(500).send('Error enabling/disabling scrobble timeout');
			return;
		}
		var username = record['_id'];
		mongoDao.setScrobbleTimeoutEnabled(username, req.body.enabled, function(err, userDetails) {
			if (err) {
				winston.error("Error enabling/disabling scrobble timeout:", err);
				res.status(500).send('Error enabling/disabling scrobble timeout');
			}
			else {
				res.json({
					username: userDetails['_id'],
					listening: userDetails['listening'],
					scrobbles: userDetails['scrobbles'],
					scrobbleTimeoutTime: userDetails['scrobbleTimeoutTime'],
					scrobbleTimeoutEnabled: userDetails['scrobbleTimeoutEnabled']
				});
			}
		});
	});
};

exports.scrobbleTimeoutChange = function(req, res) {
	if (!req.body || !('minutes' in req.body)) {
		winston.error("Scrobble timeout change had invalid body");
		res.status(500).send('Invalid request body');
		return;
	}

	var session = req.cookies['lastfmSession'];
	if (!session) {
		winston.error("Session cookie not provided when changing scrobble timeout");
		res.status(500).send("Session cookie is required to changing scrobble timeout");
		return;
	}

	mongoDao.getUserData(session, function (err, record) {
		if (err || !record || !record['_id']) {
			winston.error("Error loading user while changing scrobble timeout:", err);
			res.status(500).send('Error changing scrobble timeout');
			return;
		}
		var username = record['_id'];
		var newTime = (new Date().getTime()) + (req.body.minutes * 60 * 1000);
		mongoDao.changeScrobbleTimeout(username, newTime, function(err, userDetails) {
			if (err) {
				winston.error("Error changing scrobble timeout:", err);
				res.status(500).send('Error changing scrobble timeout');
			}
			else {
				res.json({
					username: userDetails['_id'],
					listening: userDetails['listening'],
					scrobbles: userDetails['scrobbles'],
					scrobbleTimeoutTime: userDetails['scrobbleTimeoutTime'],
					scrobbleTimeoutEnabled: userDetails['scrobbleTimeoutEnabled'],
				});
			}
		});
	});
};


var checkAdmin = function(req, callback) {
	var encryptedSession = req.cookies['lastfmSession'];
	if (!encryptedSession) {
		winston.warn("Admin check with no session");
		callback(false);
		return;
	}

	mongoDao.getUserData(encryptedSession, function(err, userData) {
		if (err || !userData || !userData['_id']) {
			winston.error("Error getting user data for admin check:", err);
			callback(false);
			return;
		}

		callback(userData['_id'] == process.env.SA_ADMIN_USERNAME);
	});
};

exports.allUsers = function(req, res) {
	checkAdmin(req, function(isAdmin) {
		if (!isAdmin) {
			res.status(404).send();
			return;
		}

		mongoDao.getAllUserData(function(err, userData) {
			if (err) {
				winston.error("Error getting all user data:", err);
				res.status(500).send('Error getting all user data');
				return;
			}

			res.json(userData);
		});
	});
};

exports.allStations = function(req, res) {
	checkAdmin(req, function(isAdmin) {
		if (!isAdmin) {
			res.status(404).send();
			return;
		}

		mongoDao.getAllStationData(function(err, stationData) {
			if (err) {
				winston.error("Error getting all station data:", err);
				res.status(500).send('Error getting all station data');
				return;
			}

			res.json(stationData);
		});
	});
};


exports.addStation = function(req, res) {
	checkAdmin(req, function(isAdmin) {
		if (!isAdmin) {
			res.status(404).send();
			return;
		}

		if (!req.body.station) {
			winston.error("No station provided");
			res.status(500).send('Station must be provided');
			return;
		}

		mongoDao.addStation(req.body.station, function(err, status) {
			if (err) {
				winston.error("Error adding station:", err);
				res.status(500).send('Error adding station');
				return;
			}

			res.status(200).send();
		});
	});
};

exports.updateStation = function(req, res) {
	checkAdmin(req, function(isAdmin) {
		if (!isAdmin) {
			res.status(404).send();
			return;
		}

		if (!req.body.station) {
			winston.error("No station provided");
			res.status(500).send('Station must be provided');
			return;
		}

		mongoDao.updateStation(req.body.station, function(err, status) {
			if (err) {
				winston.error("Error updating station:", err);
				res.status(500).send('Error updating station');
				return;
			}

			res.status(200).send();
		});
	});
};

exports.clearUserSession = function(req, res) {
	checkAdmin(req, function(isAdmin) {
		if (!isAdmin) {
			res.status(404).send();
			return;
		}

		if (!req.body.username) {
			winston.error("No username provided");
			res.status(500).send('Username must be provided');
			return;
		}

		mongoDao.clearUserSession(req.body.username, function(err, status) {
			if (err) {
				winston.error("Error clearing user " + req.body.username + " session:", err);
				res.status(500).send("'Error clearing user " + req.body.username + " session");
				return;
			}

			res.status(200).send();
		});
	});
};

exports.clearUserListening = function(req, res) {
	checkAdmin(req, function(isAdmin) {
		if (!isAdmin) {
			res.status(404).send();
			return;
		}

		if (!req.body.username) {
			winston.error("No username provided");
			res.status(500).send('Username must be provided');
			return;
		}

		mongoDao.clearUserListening(req.body.username, function(err, status) {
			if (err) {
				winston.error("Error clearing user " + req.body.username + " listening:", err);
				res.status(500).send("'Error clearing user " + req.body.username + " listening");
				return;
			}

			res.status(200).send();
		});
	});
};