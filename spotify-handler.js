var spotifyHandler = {
	scopes: ["user-read-private", "user-read-currently-playing", "user-read-playback-state", "user-modify-playback-state", "user-read-recently-played", "user-library-read", "user-library-modify", "playlist-read-private", "playlist-read-collaborative", "streaming"],
	accessToken: null,
	expires: -1,
	api: new SpotifyWebApi(),
	dom: {},
	progress: 0,
	duration: 0,
	lastTrackId: "null2",
	lastQueueId: "null2",
	lastPlaybackStatus: {},
	likeCheckDisabled: false,
	webPlayer: null,
	webPlayerDeviceId: null,
	webPlayerActivated: false,

	clientId: "958af218b7f249d38baf29604b851d57",

	generateCodeVerifier: function() {
		var array = new Uint8Array(64);
		window.crypto.getRandomValues(array);
		return btoa(String.fromCharCode.apply(null, array))
			.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	},

	generateCodeChallenge: function(verifier) {
		var encoder = new TextEncoder();
		var data = encoder.encode(verifier);
		return window.crypto.subtle.digest('SHA-256', data).then(function(digest) {
			return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
				.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		});
	},

	signIn: function() {
		var codeVerifier = spotifyHandler.generateCodeVerifier();
		sessionStorage.setItem("spotify_code_verifier", codeVerifier);
		var redirectUri = window.location.origin + window.location.pathname;
		spotifyHandler.generateCodeChallenge(codeVerifier).then(function(codeChallenge) {
			window.location.href = "https://accounts.spotify.com/authorize?client_id="+spotifyHandler.clientId+"&response_type=code&redirect_uri="+encodeURIComponent(redirectUri)+"&scope="+spotifyHandler.scopes.join("%20")+"&show_dialog=false&state="+state+"&code_challenge_method=S256&code_challenge="+codeChallenge;
		});
	},

	exchangeCodeForToken: function(code, callback) {
		var codeVerifier = sessionStorage.getItem("spotify_code_verifier");
		if (!codeVerifier) {
			callback("No code verifier found", null);
			return;
		}
		var body = new URLSearchParams({
			grant_type: "authorization_code",
			code: code,
			redirect_uri: window.location.origin + window.location.pathname,
			client_id: spotifyHandler.clientId,
			code_verifier: codeVerifier
		});
		fetch("https://accounts.spotify.com/api/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: body.toString()
		}).then(function(response) {
			return response.json();
		}).then(function(data) {
			if (data.access_token) {
				sessionStorage.removeItem("spotify_code_verifier");
				callback(null, data);
			} else {
				callback(data.error || "Token exchange failed", null);
			}
		}).catch(function(err) {
			callback(err, null);
		});
	},

	refreshAccessToken: function() {
		var refreshToken = getCookie("sprt");
		if (!refreshToken) {
			console.warn("No refresh token available, redirecting to sign in...");
			window.location.href = window.location.origin + window.location.pathname;
			return;
		}
		var body = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: spotifyHandler.clientId
		});
		fetch("https://accounts.spotify.com/api/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: body.toString()
		}).then(function(response) {
			return response.json();
		}).then(function(data) {
			if (data.access_token) {
				setCookie("spat", data.access_token);
				spotifyHandler.expires = new Date().getTime() + (parseInt(data.expires_in) * 1000);
				setCookie("spex", spotifyHandler.expires);
				spotifyHandler.api.setAccessToken(data.access_token);
				if (data.refresh_token) {
					setCookie("sprt", data.refresh_token);
				}
			} else {
				console.error("Failed to refresh token", data);
				deleteCookie("spat");
				deleteCookie("spex");
				deleteCookie("sprt");
				window.location.href = window.location.origin + window.location.pathname;
			}
		}).catch(function(err) {
			console.error("Error refreshing token", err);
		});
	},

	checkAccessToken: function() {
		if ((new Date().getTime() + 25000) >= spotifyHandler.expires) {
			console.warn("Spotify Access Token is about to expire! Refreshing...");
			spotifyHandler.refreshAccessToken();
		}
	},

	setCurrentlyPlaying: function() {
		if (!document.hidden) {
			spotifyHandler.api.getMyCurrentPlaybackState({}, function(err, data) {
				if (err) {
					console.error(err);
				}
				else if (data != undefined && typeof data != "string" && data.item != null) {
					// console.log(data);
					spotifyHandler.lastPlaybackStatus = data;
					if (pageHandler.shown == "discoverpage") {
						pageHandler.showPage("playerpage");
					}
					if (data.item.id == null) {
						data.item.id = data.item.uri.split(":").pop();
					}
					if (data.item.id != spotifyHandler.lastTrackId) {
						spotifyHandler.lastTrackId = data.item.id;
						if (data.item.album.images.length > 0) {
							spotifyHandler.dom.artwork.src = data.item.album.images[0].url;
						}
						else {
							spotifyHandler.dom.artwork.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
						}
						spotifyHandler.dom.title.innerHTML = stripTags(data.item.name);
						var tempArtists = "";
						for (var i = 0; i < data.item.artists.length; i++) {
							tempArtists += data.item.artists[i].name;
							if (i != data.item.artists.length - 1) {
								tempArtists += ", ";
							}
						}
						spotifyHandler.dom.artist.innerHTML = stripTags(tempArtists);
						if (data.context != null) {
							switch (data.context.type) {
								case "playlist": {
									spotifyHandler.api.getPlaylist(data.context.uri.split(":").pop(), {fields: "name,id"}, function(err, data) {
										if (!err && data) {
											spotifyHandler.dom.playingFrom.innerHTML = "Playing from playlist";
											spotifyHandler.dom.playingFromName.innerHTML = stripTags(data.name);
											spotifyHandler.dom.contextName.innerHTML = stripTags(data.name);
											spotifyHandler.fillQueue("playlist", data.id);
										}
									});
									break;
								}
								case "album": {
									spotifyHandler.api.getAlbum(data.context.uri.split(":").pop(), {}, function(err, data) {
										if (!err && data) {
											spotifyHandler.dom.playingFrom.innerHTML = "Playing from album";
											spotifyHandler.dom.playingFromName.innerHTML = stripTags(data.name);
											spotifyHandler.dom.contextName.innerHTML = stripTags(data.name);
											spotifyHandler.fillQueue("album", data.id);
										}
									});
									break;
								}
								case "artist": {
									spotifyHandler.api.getArtist(data.context.uri.split(":").pop(), {}, function(err, data) {
										if (!err && data) {
											spotifyHandler.dom.playingFrom.innerHTML = "Playing from artist";
											spotifyHandler.dom.playingFromName.innerHTML = stripTags(data.name);
											spotifyHandler.dom.contextName.innerHTML = stripTags(data.name);
											spotifyHandler.fillQueue("artist", data.id);
										}
									});
									break;
								}
								default: {
									spotifyHandler.dom.playingFrom.innerHTML = "";
									spotifyHandler.dom.playingFromName.innerHTML = "";
									spotifyHandler.dom.contextName.innerHTML = "";
									spotifyHandler.fillQueue(null, null);
									break;
								}
							}
						}
						else {
							spotifyHandler.dom.playingFrom.innerHTML = "Playing from Your Library";
							spotifyHandler.dom.playingFromName.innerHTML = "Liked Songs";
							spotifyHandler.dom.contextName.innerHTML = "Liked Songs";
							spotifyHandler.fillQueue("library", "library");
							console.log("No context for currently playing track, assuming library is being played");
						}
						if ('mediaSession' in navigator)
						{
							navigator.mediaSession.playbackState = "playing";
							var tempArtwork = [];
							for (var i = 0; i < data.item.album.images.length; i++) {
								tempArtwork[i] = {
									sizes: data.item.album.images[i].width+"x"+data.item.album.images[i].height,
									src: data.item.album.images[i].url,
									type: "image/jpeg"
								};
							}
							navigator.mediaSession.metadata = new MediaMetadata({
								title: data.item.name,
								artist: tempArtists,
								artwork: tempArtwork
							});
						}
						spotifyHandler.duration = Math.floor(data.item.duration_ms / 1000);
					}
					spotifyHandler.progress = Math.floor(data.progress_ms / 1000);
					if (!progressBar.hovering) {
						progressBar.setValue((data.progress_ms / data.item.duration_ms) * 100);
						spotifyHandler.updateTimes(spotifyHandler.progress, spotifyHandler.duration);
					}

					if (data.device.volume_percent != null) {
						spotifyHandler.dom.volumebar.disabled = false;
						spotifyHandler.setVolume(data.device.volume_percent, true);
					}
					else {
						spotifyHandler.dom.volumebar.disabled = true;
					}
					
					if (data.is_playing) {
						spotifyHandler.dom.playPauseButton.title = "Pause";
						spotifyHandler.dom.playPauseButton.innerHTML = "&#xe035;";
					}
					else {
						spotifyHandler.dom.playPauseButton.title = "Play";
						spotifyHandler.dom.playPauseButton.innerHTML = "&#xe038;";
					}

					if (!data.item.is_local && !spotifyHandler.likeCheckDisabled) {
						spotifyHandler.dom.likeButton.disabled = false;
						spotifyHandler.dom.likeButton.style.display = "inline-block";
						spotifyHandler.api.containsMySavedTracks([data.item.id], {}, function(err, data) {
							if (err) {
								// Disable future checks and hide the like button
								spotifyHandler.likeCheckDisabled = true;
								spotifyHandler.dom.likeButton.disabled = true;
								spotifyHandler.dom.likeButton.style.display = "none";
							}
							else if (data[0]) {
								spotifyHandler.dom.likeButton.innerHTML = "&#xe87d;";
								spotifyHandler.dom.likeButton.style.color = "#1DB954";
								spotifyHandler.dom.likeButton.title = "Remove from liked songs";
								spotifyHandler.dom.likeButton.setAttribute("data-liked", "true");
							}
							else {
								spotifyHandler.dom.likeButton.innerHTML = "&#xe87e;";
								spotifyHandler.dom.likeButton.style.color = null;
								spotifyHandler.dom.likeButton.title = "Add to liked songs";
								spotifyHandler.dom.likeButton.setAttribute("data-liked", "false");
							}
						});
					}
					else {
						spotifyHandler.dom.likeButton.disabled = true;
						spotifyHandler.dom.likeButton.style.display = "none";
					}

					if (data.shuffle_state) {
						spotifyHandler.dom.shuffleButton.style.color = "#1DB954";
						spotifyHandler.dom.shuffleButton.className = "material-icons side-button dotted";
					}
					else {
						spotifyHandler.dom.shuffleButton.style.color = null;
						spotifyHandler.dom.shuffleButton.className = "material-icons side-button";
					}

					switch (data.repeat_state) {
						case "context":
							spotifyHandler.dom.repeatButton.style.color = "#1DB954";
							spotifyHandler.dom.repeatButton.innerHTML = "&#xe040;";
							spotifyHandler.dom.repeatButton.className = "material-icons side-button dotted";
							break;
						case "track":
							spotifyHandler.dom.repeatButton.style.color = "#1DB954";
							spotifyHandler.dom.repeatButton.innerHTML = "&#xe041;";
							spotifyHandler.dom.repeatButton.className = "material-icons side-button dotted";
							break;
						default:
						case "off":
							spotifyHandler.dom.repeatButton.style.color = null;
							spotifyHandler.dom.repeatButton.innerHTML = "&#xe040;";
							spotifyHandler.dom.repeatButton.className = "material-icons side-button";
							break;
					}
				}
				else {
					if (spotifyHandler.lastTrackId != "null2") {
						setTimeout(function() {
							spotifyHandler.refreshDevices();
						}, 500);
					}
					// If web player is ready, transfer playback to it
					if (spotifyHandler.webPlayerDeviceId && !spotifyHandler.webPlayerActivated) {
						spotifyHandler.webPlayerActivated = true;
						spotifyHandler.transferPlayback(spotifyHandler.webPlayerDeviceId);
					} else if (spotifyHandler.webPlayerActivated && pageHandler.shown != "playerpage") {
						// Only show discover page if web player already tried and we still have no playback
						pageHandler.showPage("discoverpage");
					}
					// Otherwise stay on current page while waiting for SDK
				}
			});
		}
	},

	fixArtSize: function() {
		var maxHeight = document.getElementById("below-art-holder").offsetTop - 42 - 48;
		var maxWidth = window.innerWidth - 48;
		if (maxHeight < maxWidth) {
			spotifyHandler.dom.artwork.style.width = maxHeight + "px";
		}
		else {
			spotifyHandler.dom.artwork.style.width = maxWidth + "px";
		}
	},

	updateTimes: function(prog, dur) {
		spotifyHandler.dom.playbackTime.innerHTML = formatSeconds(prog);
		spotifyHandler.dom.durationTime.innerHTML = formatSeconds(dur);
	},

	refreshDevices: function() {
		if (!document.hidden) {
			spotifyHandler.api.getMyDevices(function(err, data) {
				if (err) {
					console.error(err);
					spotifyHandler.dom.deviceList.innerHTML = "";
				}
				else {
					var tempList = "";
					var tempListDis = "";
					for (var i = 0; i < data.devices.length; i++) {
						if (data.devices[i].is_active) {
							spotifyHandler.dom.listeningOn.innerHTML = stripTags(data.devices[i].name);
							spotifyHandler.dom.listeningOnIcon.innerHTML = getDeviceIcon(data.devices[i].type.toLowerCase());
							if (data.devices.length > 1) {
								spotifyHandler.dom.devicesButton.setAttribute("data-curdevice", stripTags(data.devices[i].name));
							}
							else {
								spotifyHandler.dom.devicesButton.setAttribute("data-curdevice", "");
							}
						}
						else {
							tempList += '<li class="devicelist-item" onclick="spotifyHandler.transferPlayback(\''+data.devices[i].id+'\')"><span class="devicelist-icon material-icons">'+getDeviceIcon(data.devices[i].type.toLowerCase())+'</span><span class="devicelist-name">'+data.devices[i].name+'</span></li>';
						}
						tempListDis += '<li class="devicelist-item" onclick="spotifyHandler.startPlaySession(\''+data.devices[i].id+'\')"><span class="devicelist-icon material-icons">'+getDeviceIcon(data.devices[i].type.toLowerCase())+'</span><span class="devicelist-name">'+data.devices[i].name+'</span></li>';
					}
					spotifyHandler.dom.deviceList.innerHTML = tempList;
					spotifyHandler.dom.discoverList.innerHTML = tempListDis;
					if (data.devices.length > 1) {
						spotifyHandler.dom.deviceListHolder.style.display = "block";
						spotifyHandler.dom.devicesButton.className = "material-icons bar-button dotted";
					}
					else {
						spotifyHandler.dom.deviceListHolder.style.display = "none";
						spotifyHandler.dom.devicesButton.className = "material-icons bar-button";
					}
					if (data.devices.length > 0) {
						spotifyHandler.dom.discoverSpinner.style.display = "none";
						spotifyHandler.dom.discoverListHolder.style.display = null;
					}
					else {
						spotifyHandler.dom.discoverSpinner.style.display = null;
						spotifyHandler.dom.discoverListHolder.style.display = "none";
					}
				}
			});
		}
	},

	setVolume: function(newVolume, volumebarOnly) {
		spotifyHandler.dom.volumebar.style.background = 'linear-gradient(to right, #1DB954 0%, #1DB954 '+newVolume+'%, #353942 '+newVolume+'%, #353942 100%)';
		if (spotifyHandler.dom.volumebar.value != newVolume && !changingVolume) {
			spotifyHandler.dom.volumebar.value = newVolume;
		}
		if (!volumebarOnly) {
			spotifyHandler.api.setVolume(newVolume, {});
		}
	},

	transferringPlayback: false,
	transferPlayback: function(deviceId) {
		if (!spotifyHandler.transferringPlayback) {
			spotifyHandler.transferringPlayback = true;
			spotifyHandler.api.transferMyPlayback([deviceId], {}, function(err, data) {
				if (err) {
					console.error(err);
					spotifyHandler.transferringPlayback = false;
				}
				else {
					console.log("Moved playback");
					setTimeout(function() {
						spotifyHandler.refreshDevices();
						spotifyHandler.transferringPlayback = false;
					}, 500);
				}
			});
		}
	},

	fetchingQueue: false,
	queueTotal: undefined,
	queueOffset: 0,
	fillQueue: function(type, id) {
		if (id != null)
		{
			if (spotifyHandler.lastQueueId != id) {
				spotifyHandler.dom.queueButton.disabled = true;
				spotifyHandler.lastQueueId = id;
				spotifyHandler.lastQueueType = type;
				spotifyHandler.queueOffset = 0;
				spotifyHandler.queueTotal = undefined;
				spotifyHandler.dom.queue.innerHTML = "";
				spotifyHandler.fetchQueueTracks(type, id, 0);
			}
			else {
				console.log("Queue already loaded for id " + id);
			}
		}
		else {
			spotifyHandler.lastQueueId = null;
			spotifyHandler.lastQueueType = null;
			spotifyHandler.dom.queue.innerHTML = "";
			spotifyHandler.fetchQueueTracks(type, id, 0);
		}
	},

	fetchQueueTracks: function(type, id, offset) {
		if (spotifyHandler.fetchingQueue != true) {
			if (type == "album") {
				spotifyHandler.fetchingQueue = true;
				spotifyHandler.api.getAlbumTracks(id, {offset: offset}, spotifyHandler.handleFetchedTracks);
			}
			else if (type == "playlist") {
				spotifyHandler.fetchingQueue = true;
				spotifyHandler.api.getPlaylistTracks(id, {offset: offset}, spotifyHandler.handleFetchedTracks);
			}
			else if (type == "artist") {
				spotifyHandler.fetchingQueue = true;
				spotifyHandler.api.getArtistTopTracks(id, "US", {}, spotifyHandler.handleFetchedTracks);
			}
			else if (type == "library" && id == "library") {
				spotifyHandler.fetchingQueue = true;
				spotifyHandler.api.getMySavedTracks({offset: offset, limit: 50}, spotifyHandler.handleFetchedTracks);
			}
			else {
				spotifyHandler.dom.queueButton.disabled = true;
				if (type != null) {
					console.log("Queue cannot be retrieved for type " + type);
				}
			}
		}
		else {
			console.warn("Already fetching queue!");
		}
	},

	handleFetchedTracks: function(err, data) {
		spotifyHandler.fetchingQueue = false;
		spotifyHandler.dom.queueButton.disabled = false;
		if (err) {
			// Silently handle - queue just won't be available
		}
		else {
			console.log("Queue retrieved", data);
			if (data.items) {
				spotifyHandler.addQueueTracks(data.items, false);
				spotifyHandler.queueOffset += data.items.length;
			}
			else if (data.tracks) {
				spotifyHandler.addQueueTracks(data.tracks, true);
				spotifyHandler.queueOffset += data.tracks.length;
			}
			spotifyHandler.queueTotal = data.total;
		}
	},

	createTrackItem: function(tempTrack, doCover, inCurrentContext) {
		var trackElem = document.createElement("li");
		var tempArtists = [];
		trackElem.className = "queue-item";
		trackElem.setAttribute("data-uri", tempTrack.uri);
		if (inCurrentContext) {
			trackElem.setAttribute("data-context", "spotify:"+spotifyHandler.lastQueueType+":"+spotifyHandler.lastQueueId);
		}
		else {
			trackElem.setAttribute("data-context", tempTrack.album.uri);
		}
		trackElem.setAttribute("onclick", "spotifyHandler.playContext(this.getAttribute('data-context'), this.getAttribute('data-uri'));");
		tempArtists = [];
		for (var j = 0; j < tempTrack.artists.length; j++) {
			tempArtists.push(stripTags(tempTrack.artists[j].name));
		}
		trackElem.innerHTML = (doCover ? '<div class="queue-item-cover"><img src="'+(tempTrack.album.images.length > 0 ? tempTrack.album.images.pop().url : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')+'"></div>': '<div class="queue-item-cover"><span>'+(tempTrack.disc_number > 1 ? tempTrack.disc_number+'-' : '')+tempTrack.track_number+'</span></div>')+'<div class="queue-item-metadata"><div class="queue-item-name">'+stripTags(tempTrack.name)+'</div><div class="queue-item-artist">'+tempArtists.join(', ')+'</div></div>';
		spotifyHandler.dom.queue.appendChild(trackElem);
		return (trackElem);
	},

	addQueueTracks: function(tracks, doCover) {
		var tempTrack = {};
		for (var i = 0; i < tracks.length; i++) {
			
			tempTrack = tracks[i];
			if ("track" in tempTrack) {
				tempTrack = tempTrack.track;
				doCover = true;
			}
			if (tempTrack.uri != null && tempTrack.uri.indexOf(":local:") == -1) {
				spotifyHandler.dom.queue.appendChild(spotifyHandler.createTrackItem(tempTrack, doCover, true));
			}
		}
	},

	playContext: function(contextUri, trackUri) {
		if (trackUri == null) {
			spotifyHandler.api.play({
				context_uri: contextUri
			});
		}
		else if (contextUri != null && contextUri != "spotify:library:library") {
			spotifyHandler.api.play({
				context_uri: contextUri,
				offset: {
					uri: trackUri
				}
			});
		}
		else {
			// workaround for missing context for user's library
			// only plays tracks fetched so far... but it's better than nothing
			var tempUris = [];
			for (var i = 0; i < spotifyHandler.dom.queue.children.length; i++) {
				tempUris.push(spotifyHandler.dom.queue.children[i].getAttribute("data-uri"));
			}
			spotifyHandler.api.play({
				uris: tempUris,
				offset: {
					uri: trackUri
				}
			});
		}
		if (pageHandler.shown == "searchpage") {
			pageHandler.showPage("playerpage");
		}
	},

	startPlaySession: function(deviceId) {
		spotifyHandler.api.play({
			device_id: deviceId
		}, function(err, data) {
			if (err) {
				console.error(err);
				alert("Could not start playback due to an error ("+err.status+"). You'll have to start it yourself, on the device you clicked on.");
			}
		});
	},

	fetchingPlaylists: false,
	playlistsTotal: undefined,
	playlistsOffset: 0,
	firstAlbumFetched: false,
	loadLibrary: function() {
		spotifyHandler.dom.library.innerHTML = "";
		spotifyHandler.dom.library.appendChild(spotifyHandler.createDividerItem("Playlists"));
		spotifyHandler.playlistsOffset = 0;
		spotifyHandler.playlistsTotal = undefined;
		spotifyHandler.fetchPlaylists(0);
	},

	fetchPlaylists: function(offset) {
		if (spotifyHandler.fetchingPlaylists != true) {
			spotifyHandler.fetchingPlaylists = true;
			if (offset < spotifyHandler.playlistsTotal || (offset == 0 && spotifyHandler.playlistsTotal == undefined)) {
				spotifyHandler.api.getUserPlaylists({offset: offset, limit: 50}, spotifyHandler.handleFetchedPlaylists);
			}
			else {
				if (!spotifyHandler.firstAlbumFetched) {
					spotifyHandler.dom.library.appendChild(spotifyHandler.createDividerItem("Albums"));
					spotifyHandler.firstAlbumFetched = true;
				}
				offset = offset - spotifyHandler.playlistsTotal;
				if (offset >= 0) {
					spotifyHandler.api.getMySavedAlbums({offset: offset, limit: 50}, spotifyHandler.handleFetchedPlaylists);
				}
			}
		}
		else {
			console.warn("Already fetching playlists!");
		}
	},

	handleFetchedPlaylists: function(err, data) {
		spotifyHandler.fetchingPlaylists = false;
		if (err) {
			console.error(err);
		}
		else {
			console.log("Playlists or albums fetched", data);
			spotifyHandler.addPlaylists(data.items);
			spotifyHandler.playlistsOffset += data.items.length;
			if (data.href.indexOf("me/albums") == -1) {
				spotifyHandler.playlistsTotal = data.total;
			}
			else if (data.offset == data.total) {
				// workaround to stop fetching albums from library once all have been fetched
				spotifyHandler.fetchingPlaylists = true;
			}
		}
	},

	createPlaylistOrAlbumItem: function(tempData) {
		var playlistElem = document.createElement("li");
		playlistElem.className = "queue-item";
		playlistElem.setAttribute("data-uri", tempData.uri);
		var tempArtists = [];
		if ("artists" in tempData) {
			for (var j = 0; j < tempData.artists.length; j++) {
				tempArtists.push(stripTags(tempData.artists[j].name));
			}
		}
		playlistElem.setAttribute("onclick", "spotifyHandler.playContext(this.getAttribute('data-uri'), null); pageHandler.showPage('playerpage');");
		playlistElem.innerHTML = '<div class="queue-item-cover"><img src="'+(tempData.images.length > 0 ? tempData.images.pop().url : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')+'"></div><div class="queue-item-metadata"><div class="queue-item-name">'+stripTags(tempData.name)+'</div><div class="queue-item-artist">'+("artists" in tempData ? tempArtists.join(", ") : 'by '+stripTags(tempData.owner.display_name))+'</div></div>';
		return (playlistElem);
	},

	createArtistItem: function(artist) {
		var artistElem = document.createElement("li");
		artistElem.className = "queue-item";
		artistElem.setAttribute("data-uri", artist.uri);
		artistElem.setAttribute("onclick", "spotifyHandler.playContext(this.getAttribute('data-uri'), null);");
		var imgSrc = (artist.images && artist.images.length > 0) ? artist.images[artist.images.length - 1].url : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
		artistElem.innerHTML = '<div class="queue-item-cover"><img src="'+imgSrc+'"></div><div class="queue-item-metadata"><div class="queue-item-name">'+stripTags(artist.name)+'</div><div class="queue-item-artist">Artist</div></div>';
		return artistElem;
	},

	addPlaylists: function(data) {
		for (var i = 0; i < data.length; i++) {
			var tempData = data[i];
			if ("album" in tempData) {
				tempData = tempData.album;
			}
			spotifyHandler.dom.library.appendChild(spotifyHandler.createPlaylistOrAlbumItem(tempData));
		}
	},

	createDividerItem: function(content) {
		var divider = document.createElement("li");
		divider.className = "queue-item divider";
		divider.innerHTML = content;
		return (divider);
	},

	searchReq: null,
	searchDebounce: null,
	search: function(q) {
		if (spotifyHandler.searchReq != null) {
			spotifyHandler.searchReq.abort();
		}
		if (q.trim() != "")
		{
			spotifyHandler.searchReq = spotifyHandler.api.search(q.trim(), ["track", "artist", "album", "playlist"], {offset: 0, limit: 10});
			spotifyHandler.searchReq.then(function(data) {
				console.log("Search results are in", data);
				spotifyHandler.dom.search.innerHTML = "";
				var anyResults = false;
				if (data.tracks.items.length > 0) {
					spotifyHandler.dom.search.appendChild(spotifyHandler.createDividerItem("Tracks"));
					for (var i = 0; i < data.tracks.items.length; i++) {
						if (data.tracks.items[i]) {
							spotifyHandler.dom.search.appendChild(spotifyHandler.createTrackItem(data.tracks.items[i], true, false));
						}
					}
					anyResults = true;
				}
				if (data.artists.items.length > 0) {
					spotifyHandler.dom.search.appendChild(spotifyHandler.createDividerItem("Artists"));
					for (var i = 0; i < data.artists.items.length; i++) {
						if (data.artists.items[i]) {
							spotifyHandler.dom.search.appendChild(spotifyHandler.createArtistItem(data.artists.items[i]));
						}
					}
					anyResults = true;
				}
				if (data.albums.items.length > 0) {
					spotifyHandler.dom.search.appendChild(spotifyHandler.createDividerItem("Albums"));
					for (var i = 0; i < data.albums.items.length; i++) {
						if (data.albums.items[i]) {
							spotifyHandler.dom.search.appendChild(spotifyHandler.createPlaylistOrAlbumItem(data.albums.items[i], true));
						}
					}
					anyResults = true;
				}
				if (data.playlists.items.length > 0) {
					spotifyHandler.dom.search.appendChild(spotifyHandler.createDividerItem("Playlists"));
					for (var i = 0; i < data.playlists.items.length; i++) {
						if (data.playlists.items[i]) {
							spotifyHandler.dom.search.appendChild(spotifyHandler.createPlaylistOrAlbumItem(data.playlists.items[i], true));
						}
					}
					anyResults = true;
				}
				if (!anyResults) {
					spotifyHandler.dom.search.appendChild(spotifyHandler.createDividerItem("No results found for \""+stripTags(q.trim())+"\""));
				}
			}, function(err) {
				// console.error(err);
			});
		}
		else {
			spotifyHandler.dom.search.innerHTML = "";
		}
	},

	init: function() {
		document.getElementById("signinbtn").addEventListener("click", spotifyHandler.signIn);

		spotifyHandler.dom.playerPage = document.getElementById("playerpage");
		spotifyHandler.dom.playingFrom = document.getElementById("playing-from");
		spotifyHandler.dom.playingFromName = document.getElementById("playing-from-name");
		spotifyHandler.dom.artwork = document.getElementById("artwork");
		spotifyHandler.dom.title = document.getElementById("title");
		spotifyHandler.dom.artist = document.getElementById("artist");
		spotifyHandler.dom.likeButton = document.getElementById("like-button");
		spotifyHandler.dom.playbackTime = document.getElementById("playback-time");
		spotifyHandler.dom.durationTime = document.getElementById("duration-time");
		spotifyHandler.dom.shuffleButton = document.getElementById("shuffle-button");
		spotifyHandler.dom.previousButton = document.getElementById("previous-button");
		spotifyHandler.dom.playPauseButton = document.getElementById("play-pause-button");
		spotifyHandler.dom.nextButton = document.getElementById("next-button");
		spotifyHandler.dom.repeatButton = document.getElementById("repeat-button");
		spotifyHandler.dom.devicesButton = document.getElementById("devices-button");
		spotifyHandler.dom.queuePage = document.getElementById("queuepage");
		spotifyHandler.dom.queueButton = document.getElementById("queue-button");
		spotifyHandler.dom.queue = document.getElementById("queue");
		spotifyHandler.dom.contextName = document.getElementById("contextname");
		spotifyHandler.dom.deviceListHolder = document.getElementById("devicelist-holder");
		spotifyHandler.dom.deviceList = document.getElementById("devicelist");
		spotifyHandler.dom.discoverSpinner = document.getElementById("discoverspinner");
		spotifyHandler.dom.discoverListHolder = document.getElementById("discoverlist-holder");
		spotifyHandler.dom.discoverList = document.getElementById("discoverlist");
		spotifyHandler.dom.volumebar = document.getElementById("volumebar");
		spotifyHandler.dom.listeningOn = document.getElementById("listeningon");
		spotifyHandler.dom.listeningOnIcon = document.getElementById("listeningon-icon");
		spotifyHandler.dom.themeColor = document.querySelector("meta[name=theme-color]");
		spotifyHandler.dom.library = document.getElementById("library");
		spotifyHandler.dom.libraryPage = document.getElementById("librarypage");
		spotifyHandler.dom.search = document.getElementById("search");
		spotifyHandler.dom.searchPage = document.getElementById("searchpage");
		spotifyHandler.dom.searchBar = document.getElementById("searchbar");
		window.addEventListener("resize", spotifyHandler.fixArtSize);
		spotifyHandler.dom.artwork.addEventListener("loadstart", function(event) {
			spotifyHandler.dom.playerPage.style.background = null;
			spotifyHandler.dom.themeColor.setAttribute("content", "#1DB954");
		});
		spotifyHandler.dom.artwork.addEventListener("load", function(event) {
			spotifyHandler.fixArtSize();
			if (event.target.src.indexOf("data:image/gif;base64") != 0) {
				var vibrant = new Vibrant(event.target);
				var swatches = vibrant.swatches();
				if (swatches.Vibrant != undefined) {
					spotifyHandler.dom.playerPage.style.background = "linear-gradient(rgba("+swatches.Vibrant.rgb.join(",")+",0.7), #15161A 75%)";
					spotifyHandler.dom.themeColor.setAttribute("content", swatches.Vibrant.getHex());
				}
				else if (swatches.Muted != undefined) {
					spotifyHandler.dom.playerPage.style.background = "linear-gradient(rgba("+swatches.Muted.rgb.join(",")+",0.7), #15161A 75%)";
					spotifyHandler.dom.themeColor.setAttribute("content", swatches.Muted.getHex());
				}
				else {
					console.log(swatches);
					spotifyHandler.dom.playerPage.style.background = null;
					spotifyHandler.dom.themeColor.setAttribute("content", "#1DB954");
				}
			}
			else {
				spotifyHandler.dom.playerPage.style.background = null;
				spotifyHandler.dom.themeColor.setAttribute("content", "#1DB954");
			}
		});
		spotifyHandler.dom.playPauseButton.addEventListener("click", function(event) {
			spotifyHandler.dom.playPauseButton.disabled = true;
			if (spotifyHandler.dom.playPauseButton.title == "Pause") {
				spotifyHandler.api.pause({}, function() {
					spotifyHandler.dom.playPauseButton.disabled = false;
					spotifyHandler.dom.playPauseButton.innerHTML = "&#xe038;";
					spotifyHandler.dom.playPauseButton.title = "Play";
					setTimeout(function() {
						spotifyHandler.setCurrentlyPlaying();
					}, 250);
				});
			}
			else {
				spotifyHandler.api.play({}, function() {
					spotifyHandler.dom.playPauseButton.disabled = false;
					spotifyHandler.dom.playPauseButton.innerHTML = "&#xe035;";
					spotifyHandler.dom.playPauseButton.title = "Pause";
					setTimeout(function() {
						spotifyHandler.setCurrentlyPlaying();
					}, 250);
				});
			}
		});
		spotifyHandler.dom.nextButton.addEventListener("click", function(event) {
			spotifyHandler.dom.nextButton.disabled = true;
			spotifyHandler.api.skipToNext({}, function() {
				spotifyHandler.dom.nextButton.disabled = false;
				setTimeout(function() {
					spotifyHandler.setCurrentlyPlaying();
				}, 250);
			});
		});
		spotifyHandler.dom.previousButton.addEventListener("click", function(event) {
			spotifyHandler.dom.previousButton.disabled = true;
			spotifyHandler.api.skipToPrevious({}, function() {
				spotifyHandler.dom.previousButton.disabled = false;
				setTimeout(function() {
					spotifyHandler.setCurrentlyPlaying();
				}, 250);
			});
		});
		spotifyHandler.dom.likeButton.addEventListener("click", function(event) {
			spotifyHandler.dom.likeButton.disabled = true;
			if (spotifyHandler.dom.likeButton.getAttribute("data-liked") == "false") {
				spotifyHandler.api.addToMySavedTracks([spotifyHandler.lastTrackId], {}, function(err, data) {
					if (err) {
						console.error(err);
					}
					else {
						spotifyHandler.dom.likeButton.disabled = false;
						spotifyHandler.dom.likeButton.innerHTML = "&#xe87d;";
						spotifyHandler.dom.likeButton.style.color = "#1DB954";
						spotifyHandler.dom.likeButton.title = "Remove from liked songs";
						spotifyHandler.dom.likeButton.setAttribute("data-liked", "true");
					}
				});
			}
			else {
				spotifyHandler.api.removeFromMySavedTracks([spotifyHandler.lastTrackId], {}, function(err, data) {
					if (err) {
						console.error(err);
					}
					else {
						spotifyHandler.dom.likeButton.disabled = false;
						spotifyHandler.dom.likeButton.innerHTML = "&#xe87e;";
						spotifyHandler.dom.likeButton.style.color = null;
						spotifyHandler.dom.likeButton.title = "Add to liked songs";
						spotifyHandler.dom.likeButton.setAttribute("data-liked", "false");
					}
				});
			}
		});
		spotifyHandler.dom.devicesButton.addEventListener("click", function(event) {
			pageHandler.showPage("devicespage");
		});
		spotifyHandler.dom.queueButton.addEventListener("click", function(event) {
			pageHandler.showPage("queuepage");
		});
		spotifyHandler.dom.shuffleButton.addEventListener("click", function(event) {
			spotifyHandler.dom.shuffleButton.disabled = true;
			spotifyHandler.api.setShuffle(!spotifyHandler.lastPlaybackStatus.shuffle_state, {}, function(err, data) {
				spotifyHandler.dom.shuffleButton.disabled = false;
				if (err) {
					console.error(err);
				}
				else {
					setTimeout(function() {
						spotifyHandler.setCurrentlyPlaying();
					}, 250);
				}
			});
		});
		spotifyHandler.dom.repeatButton.addEventListener("click", function(event) {
			spotifyHandler.dom.repeatButton.disabled = true;
			var newState = {
				off: "context",
				context: "track",
				track: "off"
			};
			spotifyHandler.api.setRepeat(newState[spotifyHandler.lastPlaybackStatus.repeat_state], {}, function(err, data) {
				spotifyHandler.dom.repeatButton.disabled = false;
				if (err) {
					console.error(err);
				}
				else {
					setTimeout(function() {
						spotifyHandler.setCurrentlyPlaying();
					}, 250);
				}
			});
		});

		spotifyHandler.dom.queuePage.addEventListener("scroll", function(event) {
			if (event.target.offsetHeight + event.target.scrollTop + 1280 >= event.target.scrollHeight && spotifyHandler.fetchingQueue != true && spotifyHandler.queueOffset < spotifyHandler.queueTotal) {
				console.log("Scrolled near the end of queue, fetching more tracks");
				spotifyHandler.fetchQueueTracks(spotifyHandler.lastQueueType, spotifyHandler.lastQueueId, spotifyHandler.queueOffset);
			}
		});

		spotifyHandler.dom.libraryPage.addEventListener("scroll", function(event) {
			if (event.target.offsetHeight + event.target.scrollTop + 1280 >= event.target.scrollHeight && spotifyHandler.fetchingPlaylists != true) {
				console.log("Scrolled near the end of library, fetching more playlists");
				spotifyHandler.fetchPlaylists(spotifyHandler.playlistsOffset);
			}
		});

		spotifyHandler.dom.searchBar.addEventListener("input", function(event) {
			var value = event.target.value;
			clearTimeout(spotifyHandler.searchDebounce);
			spotifyHandler.searchDebounce = setTimeout(function() {
				spotifyHandler.search(value);
			}, 300);
		});

		if ('mediaSession' in navigator)
		{
			navigator.mediaSession.metadata = new MediaMetadata({});
			navigator.mediaSession.setActionHandler('play', spotifyHandler.api.play);
			navigator.mediaSession.setActionHandler('pause', spotifyHandler.api.pause);
			navigator.mediaSession.setActionHandler('nexttrack', spotifyHandler.api.skipToNext);
			navigator.mediaSession.setActionHandler('previoustrack', spotifyHandler.api.skipToPrevious);
			navigator.mediaSession.playbackState = "none";
		}

		var urlParams = new URLSearchParams(window.location.search);
		var code = urlParams.get("code");
		var urlState = urlParams.get("state");
		var urlError = urlParams.get("error");

		if (code && urlState === state) {
			// Clean the URL
			window.history.replaceState({}, document.title, window.location.pathname);
			// Exchange authorization code for access token
			spotifyHandler.exchangeCodeForToken(code, function(err, data) {
				if (err) {
					alert("An error occurred exchanging the authorization code: " + err);
					pageHandler.showPage("signinpage");
					return;
				}
				setCookie("spat", data.access_token);
				spotifyHandler.expires = new Date().getTime() + (parseInt(data.expires_in) * 1000);
				setCookie("spex", spotifyHandler.expires);
				if (data.refresh_token) {
					setCookie("sprt", data.refresh_token);
				}
				spotifyHandler.api.setAccessToken(data.access_token);
				spotifyHandler.startPlayback();
			});
		}
		else if (urlError && urlState === state) {
			if (urlError != "access_denied") {
				alert("An error occurred connecting to your Spotify account: " + urlError);
			}
			pageHandler.showPage("signinpage");
		}
		else if (getCookie("spat") != null && getCookie("spex") != null) {
			spotifyHandler.expires = parseInt(getCookie("spex"));
			if (new Date().getTime() < spotifyHandler.expires) {
				spotifyHandler.api.setAccessToken(getCookie("spat"));
				spotifyHandler.startPlayback();
			} else if (getCookie("sprt") != null) {
				// Token expired but we have a refresh token
				spotifyHandler.refreshAccessToken();
				setTimeout(function() {
					if (getCookie("spat")) {
						spotifyHandler.api.setAccessToken(getCookie("spat"));
						spotifyHandler.startPlayback();
					} else {
						pageHandler.showPage("signinpage");
					}
				}, 1500);
			} else {
				pageHandler.showPage("signinpage");
			}
		}
		else {
			pageHandler.showPage('signinpage');
		}
	},

	startPlayback: function() {
		setInterval(spotifyHandler.checkAccessToken, 30000);
		setInterval(spotifyHandler.refreshDevices, 10000);
		setInterval(spotifyHandler.setCurrentlyPlaying, 5000);
		setTimeout(function() {
			setInterval(function() {
				if (spotifyHandler.lastPlaybackStatus.is_playing && !progressBar.hovering) {
					spotifyHandler.progress += 1;
					var progressPerc = (spotifyHandler.progress / spotifyHandler.duration) * 100;
					progressBar.setValue(progressPerc);
					spotifyHandler.updateTimes(spotifyHandler.progress, spotifyHandler.duration);
				}
			}, 1000);
		}, 500);
		// If web player hasn't connected after 5 seconds, show discover page as fallback
		setTimeout(function() {
			if (!spotifyHandler.webPlayerDeviceId && !spotifyHandler.webPlayerActivated) {
				spotifyHandler.webPlayerActivated = true; // prevent further attempts
				if (pageHandler.shown == "loadingpage") {
					pageHandler.showPage("discoverpage");
				}
			}
		}, 5000);
		pageHandler.showPage("playerpage");
		spotifyHandler.setCurrentlyPlaying();
		spotifyHandler.refreshDevices();
		spotifyHandler.loadLibrary();
		spotifyHandler.initWebPlayer();
	},

	initWebPlayer: function() {
		if (window.Spotify && window.Spotify.Player) {
			spotifyHandler.createWebPlayer();
		} else {
			// SDK hasn't loaded yet or hasn't initialized Player
			window.onSpotifyWebPlaybackSDKReady = function() {
				spotifyHandler.createWebPlayer();
			};
		}
	},

	createWebPlayer: function() {
		var player = new Spotify.Player({
			name: 'Spotify Web Controller',
			getOAuthToken: function(cb) {
				// If token is still valid, use it; otherwise refresh first
				if (new Date().getTime() < spotifyHandler.expires) {
					cb(getCookie("spat"));
				} else {
					spotifyHandler.refreshAccessToken();
					setTimeout(function() {
						cb(getCookie("spat"));
					}, 1500);
				}
			},
			volume: 0.5
		});

		player.addListener('ready', function(data) {
			console.log('Web Playback SDK ready, device ID:', data.device_id);
			spotifyHandler.webPlayerDeviceId = data.device_id;
			// If nothing is currently playing, activate the web player
			if (!spotifyHandler.lastPlaybackStatus.is_playing && !spotifyHandler.webPlayerActivated) {
				spotifyHandler.webPlayerActivated = true;
				spotifyHandler.api.transferMyPlayback([data.device_id], {play: false}, function(err) {
					if (!err) {
						console.log("Activated web player as default device");
						pageHandler.showPage("playerpage");
					}
				});
			}
			// Refresh device list so the web player shows up
			setTimeout(function() {
				spotifyHandler.refreshDevices();
			}, 1000);
		});

		player.addListener('not_ready', function(data) {
			console.log('Web Playback SDK device has gone offline:', data.device_id);
			spotifyHandler.webPlayerDeviceId = null;
		});

		player.addListener('player_state_changed', function(state) {
			if (state) {
				spotifyHandler.setCurrentlyPlaying();
			}
		});

		player.addListener('initialization_error', function(e) {
			console.error('Web Playback SDK initialization error:', e.message);
		});

		player.addListener('authentication_error', function(e) {
			console.error('Web Playback SDK authentication error:', e.message);
		});

		player.addListener('account_error', function(e) {
			console.error('Web Playback SDK account error (Premium required):', e.message);
		});

		player.connect();
		spotifyHandler.webPlayer = player;
	}
};