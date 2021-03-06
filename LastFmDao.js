var _ = require("underscore");
var winston = require("winston");

var LastFmDao = (function () {
	var lastfmNode;
	function LastFmDao(lfmNode) {
		lastfmNode = lfmNode;
	}

	LastFmDao.prototype.getSession = function (token, callback) {
		if (!token) {
			callback("Invalid token", null);
			return;
		}

		lastfmNode.session({
			token: token,
			handlers: {
				success: function(session) {
					callback(null, session);
					return;
				},
				error: function(error) {
					winston.error('getSession error', error);
					callback(error, null);
					return;
				}
			}
		});
	};

	LastFmDao.prototype.getUserInfo = function (username, callback) {
		lastfmNode.request("user.getInfo", {
			user: username,
			handlers: {
				success: function(data) {
					var lastfmProfileImage = null;
					if (data && data.user) {
						_.each(data.user.image, function(image) {
							if (image.size == 'large') {
								lastfmProfileImage = image['#text'];
								return;
							}
						});
					}
					callback(null, { lastfmProfileImage: lastfmProfileImage });
				},
				error: function(err) {
					winston.error('getUserInfo error', err);
					callback(err, null);
				}
			}
		});
	};

	var makeTrackData = function(data) {
		if (data) {
			var artist = data.artist ? data.artist['#text'] : null;
			var name = data.name;
			var url = data.url;
			var nowPlaying = data['@attr'] && data['@attr']['nowplaying'] == 'true';
			var image = null;
			_.each(data.image, function(curImage) {
				if (curImage.size == 'small') {
					image = curImage['#text'];
					return; //break
				}
			});

			if (artist && name) {
				return { artist: artist, name: name, image: image, url: url, nowPlaying: nowPlaying };
			}
		}

		return null;
	};

	// Returns 3 most recent tracks, not including duplicate now playing/last played
	LastFmDao.prototype.getRecentTracks = function (username, callback) {
		lastfmNode.request("user.getRecentTracks", {
			user: username,
			limit: "4", // 3 plus possible duplicate
			handlers: {
				success: function(data) {
					if (!data || !data.recenttracks || !data.recenttracks.track) {
						// Only log error, do not pass back error in callback so that async.map will continue with other requests
						winston.error('getRecentTracks invalid data', data);
						callback(null, null);
						return;
					}

					var tracks = [];
					_.each(data.recenttracks.track, function(track) {
						var trackData = makeTrackData(track);
						if (trackData) {
							tracks.push(trackData);
						}
					});

					// remove duplicate e.g. if now playing is the same as the last scrobble
					if (tracks.length > 1 && tracks[0].artist == tracks[1].artist && tracks[0].name == tracks[1].name) {
						tracks.splice(1, 1);
					}

					callback(null, tracks);
				},
				error: function(err) {
					// Only log error, do not pass back error in callback so that async.map will continue with other requests
					winston.error('getRecentTracks error', err);
					callback(null, null);
				}
			}
		});
	};

	LastFmDao.prototype.getTasteometer = function (users, callback) {

		lastfmNode.request("tasteometer.compare", {
			type1: 'user',
			type2: 'user',
			value1: users.user1,
			value2: users.user2,
			handlers: {
				success: function(data) {
					if (data && data.comparison && data.comparison.result) {
						callback(null, data.comparison.result.score);
					}
					else {
						callback(null, 0);
					}
				},
				error: function(err) {
					// Only log error, do not pass back error in callback so that async.map will continue with other requests
					winston.error('getTasteometer error', err);
					callback(null, 0);
				}
			}
		});
	};

	return LastFmDao;
})();
exports.LastFmDao = LastFmDao;