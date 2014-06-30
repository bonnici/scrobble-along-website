'use strict';

/* Services */


// Demonstrate how to register services
// In this case it is a simple value service.
angular.module('scrobbleAlong.services', []).

	factory('baseApi', ['$http', '$log', function($http, $log) {

		var apiServiceInstance = {
			getApiUrl: function(page, params, callback) {
				$http({ method: 'GET', url: '/api/' + page, params: params || {} }).
					success(function(data) {
						//$log.log("Success getting page " + page + ":", data);
						callback(data);
					}).
					error(function(data) {
						//$log.log("Error getting page " + page + ":", data);
						callback(null);
					});
			},

			postApiUrl: function(page, data, callback) {
				$http({ method: 'POST', url: '/api/' + page, data: data || {} }).
					success(function(response) {
						//$log.log("Success posting to page " + page + ":", data);
						callback(null, response);
					}).
					error(function(error) {
						//$log.log("Error posting to page " + page + ":", data);
						callback(error, null);
					});
			}
		};

		return apiServiceInstance;
	}]).

	factory('userDetails', ['baseApi', function(baseApi) {

		var apiServiceInstance = {

			getUserDbInfo: function(callback) {
				baseApi.getApiUrl('user-details', null, function(data) {
					if (data && data.username) {
						callback({
							lastfmUsername: data.username,
							listeningTo: data.listening,
							userScrobbles: data.scrobbles,
							scrobbleTimeoutTime: data.scrobbleTimeoutTime,
							scrobbleTimeoutEnabled: data.scrobbleTimeoutEnabled
						});
					}
					else {
						callback({
							lastfmUsername: null,
							listeningTo: null,
							userScrobbles: {},
							scrobbleTimeoutTime: null,
							scrobbleTimeoutEnabled: false
						});
					}
				});
			},

			getUserLfmInfo: function(username, callback) {
				baseApi.getApiUrl('user-lastfm-info', { user: username }, function(data) {
					if (data) {
						callback(data);
					}
					else {
						callback(null);
					}
				});
			}
		};

		return apiServiceInstance;
	}]).

	factory('stationDetails', ['baseApi', function(baseApi) {

		// Updates the stations details in batches, callback is called when everything is done
		var getApiBatch = function(batchSize, url, stationNames, username, stations, callback) {
			if (stationNames.length == 0) {
				if (callback) callback();
				return;
			}

			stationNames = stationNames.slice(0); // Clone array so we can splice it safely

			var batch = stationNames.splice(0, batchSize);
			var params = { stations: batch.join(",") };
			if (username) {
				params['user'] = username;
			}

			baseApi.getApiUrl(url, params, function(data) {
				angular.forEach(stations, function(station) {
					if (station.lastfmUsername in data) {
						angular.extend(station, data[station.lastfmUsername]);
					}
				});

				getApiBatch(batchSize, url, stationNames, username, stations, callback);
			});
		};

		var apiServiceInstance = {

			// Returns an array of station details in the callback
			getAllStationsDbInfo: function(callback) {
				baseApi.getApiUrl('stations', null, function(data) {
					if (callback) callback(data || []);
				});
			},

			// Returns a map of station name to last.fm details (profile pic) in the callback
			getStationsLfmInfo: function(stationNames, results, callback) {
				if (!stationNames || stationNames.length == 0) {
					if (callback) callback();
					return;
				}

				getApiBatch(10, 'station-lastfm-info', stationNames, null, results, callback);
			},

			// Returns a map of station name to tasteometer scores in the callback
			getStationsTasteometer: function(stationNames, username, results, callback) {
				if (!stationNames || stationNames.length == 0 || !username) {
					if (callback) callback();
					return;
				}

				getApiBatch(10, 'station-lastfm-tasteometer', stationNames, username, results, callback);
			},

			getStationsRecentTracks: function(stationNames, results, callback) {
				if (!stationNames || stationNames.length == 0) {
					if (callback) callback();
					return;
				}

				getApiBatch(5, 'station-lastfm-recenttracks', stationNames, null, results, callback);
			}
		};

		return apiServiceInstance;
	}]).

	factory('userManagement', ['baseApi', function(baseApi) {

		var apiServiceInstance = {
			getLoginUrl: function(callback) {
				baseApi.getApiUrl('login-url', null, function(data) {
					if (data && data.loginUrl) {
						callback(data.loginUrl);
					}
					else {
						callback('#');
					}
				});
			},

			stopScrobbling: function(stationUsername, callback) {
				baseApi.postApiUrl('stop-scrobbling', {}, function(error, userDetails) {
					if (error) {
						callback(error, null);
					}
					else {
						callback(null, {
							listeningTo: userDetails.listening,
							scrobbleTimeoutTime: userDetails.scrobbleTimeoutTime,
							scrobbleTimeoutEnabled: userDetails.scrobbleTimeoutEnabled
						});
					}
				});
			},

			scrobbleAlong: function(stationUsername, callback) {
				baseApi.postApiUrl('scrobble-along', { username: stationUsername }, function(error, userDetails) {
					if (error) {
						callback(error, null);
					}
					else {
						callback(null, {
							listeningTo: userDetails.listening,
							scrobbleTimeoutTime: userDetails.scrobbleTimeoutTime,
							scrobbleTimeoutEnabled: userDetails.scrobbleTimeoutEnabled
						});
					}
				});
			},

			setScrobbleTimeoutEnabled: function(enabled, callback) {
				baseApi.postApiUrl('scrobble-timeout-enable', { enabled: enabled }, function(error, userDetails) {
					if (error) {
						callback(error, null);
					}
					else {
						callback(null, {
							listeningTo: userDetails.listening,
							scrobbleTimeoutTime: userDetails.scrobbleTimeoutTime,
							scrobbleTimeoutEnabled: userDetails.scrobbleTimeoutEnabled
						});
					}
				});
			},

			changeScrobbleTimeout: function(numMinutes, callback) {
				baseApi.postApiUrl('scrobble-timeout-change', { minutes: numMinutes }, function(error, userDetails) {
					if (error) {
						callback(error, null);
					}
					else {
						callback(null, {
							listeningTo: userDetails.listening,
							scrobbleTimeoutTime: userDetails.scrobbleTimeoutTime,
							scrobbleTimeoutEnabled: userDetails.scrobbleTimeoutEnabled
						});
					}
				});
			}
		};

		return apiServiceInstance;
	}]).

	factory('adminInfo', ['baseApi', function(baseApi) {

		var apiServiceInstance = {
			getAllUsers: function(callback) {
				baseApi.getApiUrl('admin/users', {}, callback);
			},

			getAllStations: function(callback) {
				baseApi.getApiUrl('admin/stations', {}, callback);
			},

			addStation: function(station, callback) {
				baseApi.postApiUrl('admin/add-station', { station: station }, callback);
			},

			updateStation: function(station, callback) {
				baseApi.postApiUrl('admin/update-station', { station: station }, callback);
			},

			clearUserListening: function(username, callback) {
				baseApi.postApiUrl('admin/clear-listening', { username: username }, callback);
			},

			clearUserSession: function(username, callback) {
				baseApi.postApiUrl('admin/clear-session', { username: username }, callback);
			}
		};

		return apiServiceInstance;
	}]);