'use strict';

/* Filters */

angular.module('scrobbleAlong.filters', []).
	filter('timeoutTime', function () {
		return function (timestamp) {
			var date = new Date(timestamp * 1000);
			return date.toISOString();
		};
	});