'use strict';

/* Controllers */

angular.module('scrobbleAlong.controllers', []).

	controller('LoginCtrl', ['$scope', '$cookies', '$window', 'userManagement', function($scope, $cookies, $window, userManagement) {
		$scope.loggedIn = $cookies.lastfmSession ? true : false;
		$scope.userDetails = {
			isScrobbling: false,
			scrobbleTimeoutTime: new Date().getTime() + (4*60*60*1000),
			scrobbleTimeoutEnabled: false
		};
		$scope.loaded = true;

		userManagement.getLoginUrl(function(url) {
			$scope.loginUrl = url;
		});

		$scope.login = function() {
			if ($scope.loginUrl) {
				$window.location.href = $scope.loginUrl;
			}
		}

		$scope.logoutModal = function() {
			if ($scope.userDetails.isScrobbling) {
				$('#logout-modal').modal();
			}
			else {
				$window.location.href = '/logout';
			}
		};
	}]).

	controller('IndexCtrl', ['$scope', '$timeout', '$interval', '$window', '$location', 'userManagement', 'userDetails', 'stationDetails',
		function ($scope, $timeout, $interval, $window, $location, userManagement, userDetailsSvc, stationDetailsSvc) {

		var nocache = 'nocache' in $location.search();
			
		$scope.stations = [];
		$scope.newScrobbleTimeout = { hours: 4, minutes: 0, inputError: false }; // Model for "change timeout time" modal

		var updateStationsRecentTracks = function() {
			var stationNames = [];
			angular.forEach($scope.stations, function(station) {
				stationNames.push(station.lastfmUsername);
			});

			stationDetailsSvc.getStationsRecentTracks(stationNames, $scope.stations, nocache, function() {
				$timeout(function() { updateStationsRecentTracks(); }, 20 * 1000);
			});
		};

		userDetailsSvc.getUserDbInfo(function(userDetails) {
			if ($scope.loggedIn && (!userDetails || !userDetails.lastfmUsername)) {
				$window.location.href = '/logout';
				return;
			}

			setUserDetails(userDetails);
			$scope.userDetails.lastfmUsername = userDetails.lastfmUsername;
			var userListeningTo = userDetails.listeningTo;
			var userScrobbles = userDetails.userScrobbles || {};

			if ($scope.userDetails.lastfmUsername) {
				userDetailsSvc.getUserLfmInfo($scope.userDetails.lastfmUsername, nocache, function(userInfo) {
					if (userInfo && userInfo.lastfmProfileImage) {
						$scope.userDetails.lastfmProfileImage = userInfo.lastfmProfileImage;
					}
				});
			}

			stationDetailsSvc.getAllStationsDbInfo(nocache, function(stationDbInfo) {
				$scope.stations = stationDbInfo;

				var stationNames = [];
				angular.forEach($scope.stations, function(station) {
					stationNames.push(station.lastfmUsername);
					station.userScrobbles = userScrobbles[station.lastfmUsername] || 0;
					station.tasteometer = null; // Initial setting so sorting works while the page is loading
					station.currentlyScrobbling = false;
					//station.recentTracks = null;

					if (userListeningTo && station.lastfmUsername == userListeningTo) {
						station.currentlyScrobbling = true;
						$scope.userDetails.isScrobbling = true;
					}
				});

				//station profile images now come from mongo 
				//stationDetailsSvc.getStationsLfmInfo(stationNames, $scope.stations, nocache);
				
				stationDetailsSvc.getStationsTasteometer(stationNames, $scope.userDetails.lastfmUsername, $scope.stations, nocache);
				//updateStationsRecentTracks(); // Fires a timeout to re-update later
			});
		});

		// Sorting of stations
		$scope.changeStationSort = function(sort) {
			// Need to show/hide during re-sort like this since the move animation doesn't work as expected
			var stations = $scope.stations;
			var scrobblingStation = null;
			angular.forEach($scope.stations, function(curStation) {
				if (curStation.currentlyScrobbling) {
					scrobblingStation = curStation;
				}
			});
			$scope.stations = [scrobblingStation];

			$timeout(function() {
				$scope.sortStationsBy = sort;
				$scope.stations = stations;
			}, 50);
		};
		$scope.sortStationsBy = $scope.loggedIn ? 'scrobbles' : 'lastfmUsername';
		$scope.sortStations = function(station) {
			if ($scope.sortStationsBy == 'scrobbles') {
				// Secondary sort by compatibility (will always be sorted by username if not logged in)
				// Divide tasteometer by 100 since it is a percentage and should always be less than the min number of scrobbles
				return station.userScrobbles ? station.userScrobbles * -1 : (station.tasteometer * -1) / 100;
			}
			else if ($scope.sortStationsBy == 'compatibility') {
				return station.tasteometer * -1;
			}
			else {
				return station.lastfmUsername;
			}
		};

		$scope.scrobbleTimeoutCheckboxChanged = function() {
			userManagement.setScrobbleTimeoutEnabled($scope.userDetails.scrobbleTimeoutEnabled, function(err, userDetails) {
				if (err) {
					$scope.alertMessage = "Error enabling or disabling scrobble timeout, please wait a few moments and try again.";
				}
				else {
					setUserDetails(userDetails);
				}
			});
		};

		$interval(function() {
			userDetailsSvc.getUserDbInfo(function(userDetails) {
				if ($scope.loggedIn && (!userDetails || !userDetails.lastfmUsername)) {
					$window.location.href = '/logout';
					return;
				}

				setUserDetails(userDetails);
			});
		}, 30 * 1000);

		var setCurrentlyScrobbling = function(scrobblingStationName) {
			$scope.userDetails.isScrobbling = false;
			angular.forEach($scope.stations, function(curStation) {
				if (curStation.lastfmUsername == scrobblingStationName) {
					$scope.userDetails.isScrobbling = true;
					curStation.currentlyScrobbling = true;
				}
				else {
					curStation.currentlyScrobbling = false
				}
			});
		};
			
		// Set user details that can change
		var setUserDetails = function(userDetails) {
			$scope.userDetails.scrobbleTimeoutTime = userDetails.scrobbleTimeoutTime;
			$scope.userDetails.scrobbleTimeoutEnabled = userDetails.scrobbleTimeoutEnabled;
			setCurrentlyScrobbling(userDetails.listeningTo);
		};

		$scope.stopScrobbling = function(station) {
			if (station && station.lastfmUsername) {
				userManagement.stopScrobbling(station.lastfmUsername, function(err, userDetails) {
					if (userDetails) {
						setUserDetails(userDetails);
					}
					else {
						$scope.alertMessage = "Error stopping scrobble, please wait a few moments and try again.";
					}
				});
			}
		};
		$scope.scrobbleAlong = function(station) {
			if (station && station.lastfmUsername) {
				userManagement.scrobbleAlong(station.lastfmUsername, function(err, userDetails) {
					if (userDetails) {
						setUserDetails(userDetails);
					}
					else {
				        $scope.alertMessage = "Error scrobbling along, please wait a few moments and try again.";
					}
				});
			}
		};
			
		var newScrobbleTimeoutIsValid = function() {
			return angular.isNumber($scope.newScrobbleTimeout.hours) && angular.isNumber($scope.newScrobbleTimeout.minutes);
		};
		$scope.changeScrobbleTimeoutInputChanged = function() {
			$scope.newScrobbleTimeout.inputError = !newScrobbleTimeoutIsValid();
		};			
		$scope.changeScrobbleTimeout = function() {
			if (!newScrobbleTimeoutIsValid()) {
				return;
			}
			
			var minutes = ($scope.newScrobbleTimeout.hours * 60) + $scope.newScrobbleTimeout.minutes; 
			userManagement.changeScrobbleTimeout(minutes, function(err, userDetails) {
				if (userDetails) {
					setUserDetails(userDetails);
				}
				else {
					$scope.alertMessage = "Error changing the scrobble timeout time, please wait a few moments and try again.";
				}
				$('#change-timeout-modal').modal('hide');
				$scope.newScrobbleTimeout = { hours: 4, minutes: 0, inputError: false };
			});
		};
	}]).

	controller('AdminCtrl', ['$scope', 'adminInfo', function($scope, adminInfo) {
		$scope.newStation = {};
		var updates = [];
		var addUpdate = function(update) {
			updates.push(update);
			$scope.updatesText = updates.join("\n");
		}

		var loadUsers = function() {
			adminInfo.getAllUsers(function(userDetails) {
				$scope.allUserDetails = userDetails;

				$scope.numUsers = 0;
				$scope.numUsersScrobbling = 0;
				angular.forEach($scope.allUserDetails, function(user) {
					$scope.numUsers++;
					if (user.listening) {
						$scope.numUsersScrobbling++;
					}
				});
			});
		};

		var loadStations = function() {
			adminInfo.getAllStations(function(stationDetails) {
				$scope.stationDetails = stationDetails;
			});
		};

		loadUsers();
		loadStations();

		$scope.addStation = function() {
			adminInfo.addStation($scope.newStation, function(err, status) {
				if (err) {
					addUpdate("Error adding station " + $scope.newStation['_id'] + ": " + err);
				}
				else {
					addUpdate("Added station " + $scope.newStation['_id']);
				}
				$scope.newStation = {};
				loadStations();
			});
		};

		$scope.updateStation = function(station) {
			adminInfo.updateStation(station, function(err, status) {
				if (err) {
					addUpdate("Error updating station " + station['_id'] + ": " + err);
				}
				else {
					addUpdate("Updated station " + station['_id']);
				}
				loadStations();
			});
		};

		$scope.clearUserListening = function(user, reload, callback) {
			adminInfo.clearUserListening(user['_id'], function(err, status) {
				if (err) {
					addUpdate(err);
				}
				else {
					addUpdate("Cleared user " + user['_id'] + " listening");
				}

				if (reload) {
					loadUsers();
				}

				if (callback) {
					callback(err, status);
				}
			});
		};

		$scope.clearUserSession = function(user, reload, callback) {
			adminInfo.clearUserSession(user['_id'], function(err, status) {
				if (err) {
					addUpdate(err);
				}
				else {
					addUpdate("Cleared user " + user['_id'] + " session");
				}

				if (reload) {
					loadUsers();
				}

				if (callback) {
					callback(err, status);
				}
			});
		};

		var doClearAllUserListening = function(userDetails, callback) {
			if (!userDetails || userDetails.length == 0) {
				callback();
				return;
			}
			else {
				var singleUser = userDetails.splice(0, 1);
				if (singleUser[0].listening) {
					$scope.clearUserListening(singleUser[0], false, function() {
						doClearAllUserListening(userDetails, callback);
					});
				}
				else {
					doClearAllUserListening(userDetails, callback);
				}
			}
		};

		$scope.clearAllUserListening = function() {
			var userDetails = $scope.allUserDetails.slice(0);
			doClearAllUserListening(userDetails, function() {
				loadUsers();
			});
		};

		var doClearAllUserSessions = function(userDetails, callback) {
			if (!userDetails || userDetails.length == 0) {
				callback();
				return;
			}
			else {
				var singleUser = userDetails.splice(0, 1);
				if (singleUser[0].session) {
					$scope.clearUserSession(singleUser[0], false, function() {
						doClearAllUserSessions(userDetails, callback);
					});
				}
				else {
					doClearAllUserSessions(userDetails, callback);
				}
			}
		};

		$scope.clearAllUserSessions = function() {
			var userDetails = $scope.allUserDetails.slice(0);
			doClearAllUserSessions(userDetails, function() {
				loadUsers();
			});
		};

		$scope.sortStations = function(station) {
			return station['_id'];
		};

		$scope.sortUsers = function(user) {
			return user.listening;
		};

	}]);
