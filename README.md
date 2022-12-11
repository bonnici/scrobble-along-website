ScrobbleAlong Website
=====================

# Deprecation note

I've decided to stop updating ScrobbleAlong since I've moved on to other projects and adding new stations is becoming a bit unmaintainable. I am planning to keep it running but will not add any more stations or fix any stations that break.

# Original readme

This is a website that shows information about what some radio stations are playing and allows people to scrobble along with them on [last.fm](http://last.fm/). There is also a backend repository [here](https://github.com/bonnici/scrobble-along-scrobbler) to get that information. The site should be up and running [here](http://scrobblealong.com).

The site requires a few environment variables:
* PORT: The port to run the website on
* NODE_ENV: 'production' or 'development'
* SA_BASE_URL: Base URL of the website
* SA_LASTFM_API_KEY: Last.fm API key (should match scrobble-along-scrobbler)
* SA_LASTFM_SECRET: Last.fm API secret (should match scrobble-along-scrobbler)
* SA_USER_CRYPTO_KEY: The key to use to decrypt user information from MongoDB (should match scrobble-along-scrobbler)
* SA_STATION_CRYPTO_KEY: The key to use to decrypt station information from MongoDB (should match scrobble-along-scrobbler)
* SA_MONGO_URI: MongoDB URL (should match scrobble-along-scrobbler)
* SA_ADMIN_USERNAME: The last.fm username of the user that should have access to the /admin page
* MEMCACHED_SERVERS: URI of the memecached servers to use
