'use strict';

/* Filters */

angular.module('scrobbleAlong.filters', []).
	filter('formatScrobbleTimeoutTime', function () {
		return function (timestamp) {
			var difference = timestamp - new Date().getTime();
			
			if (difference < (60 * 1000)) {
				return "soon";
			}
			else {
				var hours = parseInt(difference / (60 * 60 * 1000));
				var minutes = Math.round((difference - (hours * 60 * 60 * 1000)) / (60 * 1000));
				
				if (minutes == 60) {
					minutes = 0;
					hours++;
				}
				
				return "in " + hours + " hrs and " + minutes + " mins";
			}
		};
	});